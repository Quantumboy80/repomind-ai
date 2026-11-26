from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, Uuid, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator
from pgvector.sqlalchemy import Vector
from app.core.config import get_settings
from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EmbeddingVector(TypeDecorator):
    """Native pgvector in PostgreSQL; JSON list fallback for non-Postgres preview mode."""
    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(Vector(get_settings().embedding_dimensions))
        return dialect.type_descriptor(JSON())


class Timestamped:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class User(Timestamped, Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    display_name: Mapped[str] = mapped_column(String(120), default="Local developer")
    repositories: Mapped[list["Repository"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Repository(Timestamped, Base):
    __tablename__ = "repositories"
    __table_args__ = (UniqueConstraint("owner_id", "github_full_name", name="uq_repo_owner_full_name"),)
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    github_full_name: Mapped[str] = mapped_column(String(250), index=True)
    github_url: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_branch: Mapped[str] = mapped_column(String(250), default="main")
    stars: Mapped[int] = mapped_column(Integer, default=0)
    language: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    last_analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    file_count: Mapped[int] = mapped_column(Integer, default=0)
    symbol_count: Mapped[int] = mapped_column(Integer, default=0)
    owner: Mapped[User] = relationship(back_populates="repositories")
    files: Mapped[list["RepositoryFile"]] = relationship(back_populates="repository", cascade="all, delete-orphan")
    jobs: Mapped[list["AnalysisJob"]] = relationship(back_populates="repository", cascade="all, delete-orphan")
    conversations: Mapped[list["Conversation"]] = relationship(back_populates="repository", cascade="all, delete-orphan")


class RepositoryFile(Timestamped, Base):
    __tablename__ = "repository_files"
    __table_args__ = (UniqueConstraint("repository_id", "path", name="uq_repository_file_path"), Index("ix_file_repo_language", "repository_id", "language"))
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    repository_id: Mapped[str] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    path: Mapped[str] = mapped_column(String(1000))
    language: Mapped[str] = mapped_column(String(40), index=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    content: Mapped[str] = mapped_column(Text)
    repository: Mapped[Repository] = relationship(back_populates="files")
    symbols: Mapped[list["CodeSymbol"]] = relationship(back_populates="file", cascade="all, delete-orphan")
    chunks: Mapped[list["CodeChunk"]] = relationship(back_populates="file", cascade="all, delete-orphan")
    outgoing: Mapped[list["Dependency"]] = relationship(foreign_keys="Dependency.source_file_id", cascade="all, delete-orphan")
    incoming: Mapped[list["Dependency"]] = relationship(foreign_keys="Dependency.target_file_id")


class CodeSymbol(Timestamped, Base):
    __tablename__ = "code_symbols"
    __table_args__ = (Index("ix_symbol_file_name", "file_id", "name"),)
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    file_id: Mapped[str] = mapped_column(ForeignKey("repository_files.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(300), index=True)
    signature: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_line: Mapped[int] = mapped_column(Integer)
    end_line: Mapped[int] = mapped_column(Integer)
    file: Mapped[RepositoryFile] = relationship(back_populates="symbols")


class CodeChunk(Timestamped, Base):
    __tablename__ = "code_chunks"
    __table_args__ = (Index("ix_chunk_repo", "repository_id"),)
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    repository_id: Mapped[str] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    file_id: Mapped[str] = mapped_column(ForeignKey("repository_files.id", ondelete="CASCADE"), index=True)
    start_line: Mapped[int] = mapped_column(Integer)
    end_line: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    file: Mapped[RepositoryFile] = relationship(back_populates="chunks")
    embedding: Mapped["Embedding | None"] = relationship(back_populates="chunk", cascade="all, delete-orphan", uselist=False)


class Embedding(Timestamped, Base):
    __tablename__ = "embeddings"
    __table_args__ = (UniqueConstraint("chunk_id", name="uq_embedding_chunk"),)
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    chunk_id: Mapped[str] = mapped_column(ForeignKey("code_chunks.id", ondelete="CASCADE"), index=True)
    vector: Mapped[list[float]] = mapped_column(EmbeddingVector(), nullable=False)
    model: Mapped[str] = mapped_column(String(200))
    chunk: Mapped[CodeChunk] = relationship(back_populates="embedding")


class Dependency(Timestamped, Base):
    __tablename__ = "dependencies"
    __table_args__ = (Index("ix_dependency_source", "source_file_id"), Index("ix_dependency_target", "target_file_id"))
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    source_file_id: Mapped[str] = mapped_column(ForeignKey("repository_files.id", ondelete="CASCADE"), index=True)
    target_file_id: Mapped[str | None] = mapped_column(ForeignKey("repository_files.id", ondelete="SET NULL"), nullable=True)
    import_text: Mapped[str] = mapped_column(String(1000))
    line: Mapped[int] = mapped_column(Integer)
    resolved: Mapped[bool] = mapped_column(default=False)


class AnalysisJob(Timestamped, Base):
    __tablename__ = "analysis_jobs"
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    repository_id: Mapped[str] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    stage: Mapped[str] = mapped_column(String(120), default="queued")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    repository: Mapped[Repository] = relationship(back_populates="jobs")


class Conversation(Timestamped, Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    repository_id: Mapped[str] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(300), default="Repository questions")
    repository: Mapped[Repository] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")


class Message(Timestamped, Base):
    __tablename__ = "messages"
    __table_args__ = (Index("ix_message_conversation_created", "conversation_id", "created_at"),)
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    citations: Mapped[list] = mapped_column(JSON, default=list)
    is_grounded: Mapped[bool] = mapped_column(default=False)
    conversation: Mapped[Conversation] = relationship(back_populates="messages")
