from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.services.retrieval import retrieve
from app.services.llm import answer_question


class QAState(TypedDict, total=False):
    db: Session
    repository_id: str
    question: str
    context: list[dict]
    answer: str
    grounded: bool


def _retrieve_node(state: QAState) -> dict:
    db = state.get("db")
    repository_id = state.get("repository_id", "")
    question = state.get("question", "")
    if db is None or not repository_id or not question:
        return {"context": []}
    context, _vector_query_used = retrieve(db, repository_id, question)
    return {"context": context}


def _answer_node(state: QAState) -> dict:
    context = state.get("context", [])
    if not context:
        return {"answer": "I could not find indexed source passages relevant to that question. Try a symbol name or run repository ingestion first.", "grounded": False}
    if not get_settings().ai_ready:
        return {"answer": "AI provider is not configured. This is demo retrieval evidence, not an AI-generated explanation. Review the cited source passages below or configure an LLM provider to enable grounded answers.", "grounded": False}
    try:
        answer = answer_question(state.get("question", ""), context)
        return {"answer": answer, "grounded": True}
    except Exception:
        return {"answer": "The configured AI provider could not complete this request. No answer was fabricated; the retrieved source excerpts are shown for review.", "grounded": False}


def _build_workflow():
    graph = StateGraph(QAState)
    graph.add_node("retrieve_code", _retrieve_node)
    graph.add_node("answer_from_evidence", _answer_node)
    graph.add_edge(START, "retrieve_code")
    graph.add_edge("retrieve_code", "answer_from_evidence")
    graph.add_edge("answer_from_evidence", END)
    return graph.compile()


qa_workflow = _build_workflow()


def answer_repository_question(db: Session, repository_id: str, question: str) -> dict:
    return qa_workflow.invoke({"db": db, "repository_id": repository_id, "question": question})
