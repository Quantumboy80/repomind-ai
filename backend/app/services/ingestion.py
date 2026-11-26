from datetime import datetime, timezone
from collections import Counter
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.db.models import User, Repository, RepositoryFile, CodeSymbol, CodeChunk, Embedding, Dependency, AnalysisJob
from app.services.github import fetch_public_repository
from app.services.parser import parse_source, chunk_source
from app.services.graph import _resolve
from app.services.llm import embed_texts, ProviderUnavailable


def _progress(db: Session, job: AnalysisJob, repo: Repository, stage: str, progress: int) -> None:
    job.stage = stage
    job.progress = min(progress, 99)
    repo.status = "processing"
    db.commit()


def ingest_repository(repository_id: str, job_id: str) -> None:
    db = SessionLocal()
    try:
        repo = db.query(Repository).filter_by(id=repository_id).first()
        job = db.query(AnalysisJob).filter_by(id=job_id).first()
        if not repo or not job:
            return
        _progress(db, job, repo, "Fetching repository tree", 8)
        owner, name = repo.github_full_name.split("/", 1)
        metadata, source_files = fetch_public_repository(owner, name)
        repo.default_branch = metadata.get("default_branch") or repo.default_branch
        repo.description = metadata.get("description")
        repo.stars = int(metadata.get("stargazers_count") or 0)
        repo.language = metadata.get("language")
        for old in list(repo.files):
            db.delete(old)
        db.flush()
        stored = []
        for index, item in enumerate(source_files):
            file = RepositoryFile(repository_id=repo.id, path=item["path"], language=item["language"], size_bytes=item["size_bytes"], sha=item["sha"], content=item["content"])
            db.add(file)
            parsed = parse_source(item["content"], item["language"])
            stored.append((file, parsed, item["content"]))
            if index % 20 == 0:
                _progress(db, job, repo, f"Parsing source files ({index + 1}/{len(source_files)})", 15 + int(35 * (index + 1) / max(len(source_files), 1)))
        db.flush()
        by_path = {file.path: file for file, _, _ in stored}
        path_set = set(by_path)
        chunks_to_embed = []
        for file, parsed, content in stored:
            for symbol in parsed.symbols:
                db.add(CodeSymbol(file_id=file.id, kind=symbol.kind, name=symbol.name, signature=symbol.signature, start_line=symbol.start_line, end_line=symbol.end_line))
            for start_line, end_line, body in chunk_source(content):
                chunk = CodeChunk(repository_id=repo.id, file_id=file.id, start_line=start_line, end_line=end_line, content=body)
                db.add(chunk)
                chunks_to_embed.append((chunk, f"{file.path}:{start_line}-{end_line}\n{body}"))
            for imported in parsed.imports:
                target_path = _resolve(file.path, imported.module, path_set)
                target = by_path.get(target_path) if target_path else None
                db.add(Dependency(source_file_id=file.id, target_file_id=target.id if target else None, import_text=imported.module[:1000], line=imported.line, resolved=target is not None))
        db.flush()
        _progress(db, job, repo, "Creating embeddings", 64)
        embeddings_saved = 0
        try:
            for start in range(0, len(chunks_to_embed), 64):
                group = chunks_to_embed[start:start + 64]
                vectors = embed_texts([text for _, text in group])
                for (chunk, _), vector in zip(group, vectors):
                    db.add(Embedding(chunk_id=chunk.id, vector=vector, model=get_settings().llm_embedding_model))
                    embeddings_saved += 1
                db.commit()
                _progress(db, job, repo, f"Embedded {embeddings_saved} code passages", 64 + int(25 * embeddings_saved / max(len(chunks_to_embed), 1)))
        except ProviderUnavailable:
            # Honest demo mode: parsing and lexical evidence work; no fake vector is stored.
            pass
        except Exception as exc:
            # Keep real parsed data available even if the external embedding service is unavailable.
            job.error = f"Embedding provider unavailable; source indexing completed without vectors ({type(exc).__name__})."
            db.commit()
        repo.file_count = len(stored)
        repo.symbol_count = sum(len(parsed.symbols) for _, parsed, _ in stored)
        repo.status = "ready" if stored else "empty"
        repo.last_analyzed_at = datetime.now(timezone.utc)
        job.status = "completed"
        job.progress = 100
        job.stage = f"Indexed {len(stored)} files and {repo.symbol_count} symbols"
        db.commit()
    except Exception as exc:
        db.rollback()
        job = db.query(AnalysisJob).filter_by(id=job_id).first()
        repo = db.query(Repository).filter_by(id=repository_id).first()
        if job:
            job.status = "failed"
            job.stage = "Ingestion failed"
            job.error = str(exc)[:1000]
        if repo:
            repo.status = "error"
        db.commit()
    finally:
        db.close()
