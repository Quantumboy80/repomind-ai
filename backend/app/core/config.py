from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)
    app_name: str = "RepoMind AI API"
    database_url: str = "sqlite:///./repomind-preview.db"
    github_token: str | None = None
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_chat_model: str = "gpt-4o-mini"
    llm_embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536
    max_repo_files: int = 250
    max_file_bytes: int = 512_000
    max_total_bytes: int = 20_000_000
    github_timeout_seconds: float = 12.0
    cors_origins: str = "http://localhost:3000"

    @property
    def ai_ready(self) -> bool:
        return bool(self.llm_base_url and self.llm_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
