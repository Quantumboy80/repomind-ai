from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class RepositoryCreate(BaseModel):
    github_url: str = Field(min_length=12, max_length=500)


class RepositoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    github_full_name: str
    github_url: str
    description: str | None
    default_branch: str
    stars: int
    language: str | None
    status: str
    file_count: int
    symbol_count: int
    last_analyzed_at: datetime | None
    created_at: datetime


class QuestionIn(BaseModel):
    question: str = Field(min_length=3, max_length=2000)


class ConversationCreate(BaseModel):
    title: str = Field(default="Repository questions", max_length=300)


class ImpactIn(BaseModel):
    file_id: str
