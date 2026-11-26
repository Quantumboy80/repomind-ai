"""Create the RepoMind normalized schema and PostgreSQL pgvector types.

Revision ID: 0001_initial_schema
Revises:
"""
from alembic import op
from app.db.base import Base
import app.db.models  # noqa: F401

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
