import math
import re
from sqlalchemy.orm import Session
from app.db.models import CodeChunk, Embedding, RepositoryFile
from app.services.llm import embed_texts, ProviderUnavailable


def _tokens(text: str) -> set[str]:
    return {token.lower() for token in re.findall(r"[A-Za-z_][A-Za-z0-9_]{1,}", text)}


def _cosine(left: list[float], right: list[float]) -> float:
    if len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    denom = math.sqrt(sum(a * a for a in left) * sum(b * b for b in right))
    return dot / denom if denom else 0.0


def retrieve(db: Session, repository_id: str, question: str, limit: int = 6) -> tuple[list[dict], bool]:
    rows = db.query(CodeChunk, RepositoryFile).join(RepositoryFile, CodeChunk.file_id == RepositoryFile.id).filter(CodeChunk.repository_id == repository_id).limit(1500).all()
    qtokens = _tokens(question)
    query_vector = None
    vector_scores: dict[str, float] = {}
    try:
        query_vector = embed_texts([question])[0]
    except Exception:
        # Lexical retrieval remains usable in explicitly identified demo mode.
        query_vector = None

    if query_vector is not None:
        dialect = db.get_bind().dialect.name
        if dialect == "postgresql":
            distance = Embedding.vector.cosine_distance(query_vector)
            nearest = db.query(CodeChunk.id, distance.label("distance")).join(Embedding, Embedding.chunk_id == CodeChunk.id).filter(CodeChunk.repository_id == repository_id).order_by(distance).limit(1500).all()
            vector_scores = {chunk_id: max(0.0, 1.0 - float(distance_value)) for chunk_id, distance_value in nearest}
        else:
            for chunk, _file in rows:
                if chunk.embedding is not None:
                    vector_scores[chunk.id] = max(0.0, _cosine(query_vector, list(chunk.embedding.vector)))

    scored = []
    for chunk, file in rows:
        words = _tokens(chunk.content)
        lexical = len(qtokens & words) / max(len(qtokens), 1)
        if query_vector is not None:
            vector = vector_scores.get(chunk.id, 0.0)
            score = 0.55 * lexical + 0.45 * vector
        else:
            score = lexical
        if score > 0:
            scored.append((score, chunk, file))
    scored.sort(key=lambda row: row[0], reverse=True)
    result = [{"path": file.path, "start_line": chunk.start_line, "end_line": chunk.end_line, "content": chunk.content, "score": round(score, 4)} for score, chunk, file in scored[:limit]]
    return result, query_vector is not None
