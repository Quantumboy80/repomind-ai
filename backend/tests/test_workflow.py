import app.services.workflow as workflow


def test_qa_graph_retrieves_before_returning_explicit_demo_evidence(monkeypatch):
    source = [{"path": "src/core.py", "start_line": 4, "end_line": 8, "content": "def boot(): pass", "score": 0.8}]
    monkeypatch.setattr(workflow, "retrieve", lambda _db, _repo, _question: (source, False))
    result = workflow.answer_repository_question(object(), "repo-id", "Where is boot?")
    assert result["context"] == source
    assert result["grounded"] is False
    assert "not an AI-generated explanation" in result["answer"]
