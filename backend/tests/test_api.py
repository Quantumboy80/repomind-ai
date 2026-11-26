from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.api.routes import router
from app.db.base import Base
from app.db.session import get_db
import app.api.routes as routes


engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
Base.metadata.create_all(bind=engine)

def override_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()

app = FastAPI()
app.include_router(router)
app.dependency_overrides[get_db] = override_db
client = TestClient(app)


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_register_repository_and_list_without_github_network(monkeypatch):
    monkeypatch.setattr(routes, "ingest_repository", lambda *_args: None)
    response = client.post("/api/repositories", json={"github_url": "https://github.com/pallets/itsdangerous"})
    assert response.status_code == 201
    assert response.json()["github_full_name"] == "pallets/itsdangerous"
    assert client.get("/api/repositories").json()[0]["id"] == response.json()["id"]


def test_invalid_repository_url_returns_structured_error():
    response = client.post("/api/repositories", json={"github_url": "https://example.com/not/github"})
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_github_url"


def test_missing_repository_returns_not_found():
    response = client.get("/api/repositories/not-a-uuid")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "not_found"
