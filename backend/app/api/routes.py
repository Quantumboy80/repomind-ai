from uuid import uuid4
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.db.session import get_db
from app.db.models import User, Repository, RepositoryFile, CodeSymbol, AnalysisJob, Conversation, Message
from app.api.schemas import RepositoryCreate, RepositoryOut, QuestionIn, ConversationCreate, ImpactIn
from app.services.github import validate_github_url, GitHubError
from app.services.ingestion import ingest_repository
from app.services.graph import build_graph, analyze_impact
from app.services.workflow import answer_repository_question

router = APIRouter(prefix="/api")


def _repo_or_404(db: Session, repository_id: str) -> Repository:
    repo = db.query(Repository).filter_by(id=repository_id).first()
    if not repo:
        raise HTTPException(404, detail={"code": "not_found", "message": "Repository not found."})
    return repo


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/meta")
def meta():
    settings = get_settings()
    return {"ai_ready": settings.ai_ready, "chat_model": settings.llm_chat_model if settings.ai_ready else None, "embedding_model": settings.llm_embedding_model if settings.ai_ready else None, "demo_mode": not settings.ai_ready, "database_mode": "postgresql+pgvector" if settings.database_url.startswith("postgresql") else "local-preview"}


@router.post("/repositories", response_model=RepositoryOut, status_code=201)
def register_repository(payload: RepositoryCreate, background: BackgroundTasks, db: Session = Depends(get_db)):
    try:
        owner_name, repo_name, full_name = validate_github_url(payload.github_url)
    except GitHubError as exc:
        raise HTTPException(exc.status_code, detail={"code": "invalid_github_url", "message": exc.message}) from exc
    user = db.query(User).first()
    if not user:
        user = User(display_name="Local developer")
        db.add(user)
        db.flush()
    repository = db.query(Repository).filter_by(owner_id=user.id, github_full_name=full_name).first()
    if repository:
        repository.status = "queued"
    else:
        repository = Repository(owner_id=user.id, github_full_name=full_name, github_url=f"https://github.com/{owner_name}/{repo_name}", status="queued")
        db.add(repository)
    db.flush()
    job = AnalysisJob(repository_id=repository.id, status="queued", progress=0, stage="Waiting to start")
    db.add(job)
    db.commit()
    db.refresh(repository)
    background.add_task(ingest_repository, repository.id, job.id)
    return repository


@router.post("/repositories/{repository_id}/ingest", response_model=RepositoryOut, status_code=202)
def retry_ingestion(repository_id: str, background: BackgroundTasks, db: Session = Depends(get_db)):
    repository = _repo_or_404(db, repository_id)
    job = AnalysisJob(repository_id=repository.id, status="queued", progress=0, stage="Waiting to start")
    repository.status = "queued"
    db.add(job)
    db.commit()
    background.add_task(ingest_repository, repository.id, job.id)
    return repository


@router.get("/repositories", response_model=list[RepositoryOut])
def list_repositories(db: Session = Depends(get_db)):
    return db.query(Repository).order_by(Repository.updated_at.desc()).limit(100).all()


@router.get("/repositories/{repository_id}", response_model=RepositoryOut)
def get_repository(repository_id: str, db: Session = Depends(get_db)):
    return _repo_or_404(db, repository_id)


@router.get("/repositories/{repository_id}/status")
def repository_status(repository_id: str, db: Session = Depends(get_db)):
    repo = _repo_or_404(db, repository_id)
    job = db.query(AnalysisJob).filter_by(repository_id=repo.id).order_by(AnalysisJob.created_at.desc()).first()
    return {"repository_id": repo.id, "status": repo.status, "progress": job.progress if job else 0, "stage": job.stage if job else "No analysis job", "error": job.error if job else None, "updated_at": job.updated_at if job else repo.updated_at}


@router.get("/repositories/{repository_id}/files")
def list_files(repository_id: str, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=100), q: str | None = Query(None, max_length=200), db: Session = Depends(get_db)):
    _repo_or_404(db, repository_id)
    query = db.query(RepositoryFile).filter_by(repository_id=repository_id)
    if q:
        query = query.filter(RepositoryFile.path.ilike(f"%{q.replace('%', '')}%"))
    total = query.count()
    rows = query.order_by(RepositoryFile.path.asc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [{"id": row.id, "path": row.path, "language": row.language, "size_bytes": row.size_bytes, "sha": row.sha} for row in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/repositories/{repository_id}/files/{file_id}")
def file_detail(repository_id: str, file_id: str, db: Session = Depends(get_db)):
    _repo_or_404(db, repository_id)
    row = db.query(RepositoryFile).filter_by(repository_id=repository_id, id=file_id).first()
    if not row:
        raise HTTPException(404, detail={"code": "not_found", "message": "File not found."})
    symbols = db.query(CodeSymbol).filter_by(file_id=row.id).order_by(CodeSymbol.start_line).all()
    return {"id": row.id, "path": row.path, "language": row.language, "size_bytes": row.size_bytes, "content": row.content, "symbols": [{"id": symbol.id, "kind": symbol.kind, "name": symbol.name, "signature": symbol.signature, "start_line": symbol.start_line, "end_line": symbol.end_line} for symbol in symbols]}


@router.get("/repositories/{repository_id}/symbols")
def list_symbols(repository_id: str, q: str | None = Query(None, max_length=200), page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=200), db: Session = Depends(get_db)):
    _repo_or_404(db, repository_id)
    query = db.query(CodeSymbol, RepositoryFile).join(RepositoryFile, CodeSymbol.file_id == RepositoryFile.id).filter(RepositoryFile.repository_id == repository_id)
    if q:
        query = query.filter(CodeSymbol.name.ilike(f"%{q.replace('%', '')}%"))
    total = query.count()
    rows = query.order_by(RepositoryFile.path, CodeSymbol.start_line).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [{"id": symbol.id, "file_id": file.id, "path": file.path, "kind": symbol.kind, "name": symbol.name, "signature": symbol.signature, "start_line": symbol.start_line, "end_line": symbol.end_line} for symbol, file in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/repositories/{repository_id}/graph")
def repository_graph(repository_id: str, db: Session = Depends(get_db)):
    _repo_or_404(db, repository_id)
    return build_graph(db, repository_id)


@router.post("/repositories/{repository_id}/impact")
def impact(repository_id: str, payload: ImpactIn, db: Session = Depends(get_db)):
    _repo_or_404(db, repository_id)
    result = analyze_impact(db, repository_id, payload.file_id)
    if "error" in result:
        raise HTTPException(404, detail={"code": "not_found", "message": result["error"]})
    return result


@router.get("/repositories/{repository_id}/conversations")
def list_conversations(repository_id: str, db: Session = Depends(get_db)):
    _repo_or_404(db, repository_id)
    rows = db.query(Conversation).filter_by(repository_id=repository_id).order_by(Conversation.updated_at.desc()).all()
    return [{"id": row.id, "title": row.title, "updated_at": row.updated_at} for row in rows]


@router.post("/repositories/{repository_id}/conversations", status_code=201)
def create_conversation(repository_id: str, payload: ConversationCreate, db: Session = Depends(get_db)):
    _repo_or_404(db, repository_id)
    row = Conversation(repository_id=repository_id, title=payload.title)
    db.add(row)
    db.commit()
    return {"id": row.id, "title": row.title, "created_at": row.created_at}


@router.get("/conversations/{conversation_id}/messages")
def conversation_messages(conversation_id: str, db: Session = Depends(get_db)):
    conversation = db.query(Conversation).filter_by(id=conversation_id).first()
    if not conversation:
        raise HTTPException(404, detail={"code": "not_found", "message": "Conversation not found."})
    return [{"id": row.id, "role": row.role, "content": row.content, "citations": row.citations or [], "is_grounded": row.is_grounded, "created_at": row.created_at} for row in conversation.messages]


@router.post("/conversations/{conversation_id}/messages", status_code=201)
def post_message(conversation_id: str, payload: QuestionIn, db: Session = Depends(get_db)):
    conversation = db.query(Conversation).filter_by(id=conversation_id).first()
    if not conversation:
        raise HTTPException(404, detail={"code": "not_found", "message": "Conversation not found."})
    question = payload.question.strip()
    workflow_result = answer_repository_question(db, conversation.repository_id, question)
    context = workflow_result.get("context", [])
    user_msg = Message(conversation_id=conversation.id, role="user", content=question)
    db.add(user_msg)
    answer = workflow_result.get("answer", "No answer was produced.")
    grounded = bool(workflow_result.get("grounded", False))
    citations = [{"path": row["path"], "start_line": row["start_line"], "end_line": row["end_line"], "score": row["score"]} for row in context]
    assistant_msg = Message(conversation_id=conversation.id, role="assistant", content=answer, citations=citations, is_grounded=grounded)
    db.add(assistant_msg)
    conversation.updated_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    db.commit()
    db.refresh(assistant_msg)
    return {"id": assistant_msg.id, "role": "assistant", "content": assistant_msg.content, "citations": citations, "is_grounded": grounded, "created_at": assistant_msg.created_at, "evidence": context}
