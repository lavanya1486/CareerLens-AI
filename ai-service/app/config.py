"""Centralised, environment-driven configuration for the NLP service."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DATA_DIR = Path(__file__).resolve().parent / "data"


class Settings(BaseSettings):
    """All settings can be overridden with environment variables prefixed ``AI_``."""

    model_config = SettingsConfigDict(env_prefix="AI_", env_file=".env", extra="ignore")

    service_name: str = "careerlens-ai-service"
    environment: str = "development"
    log_level: str = "INFO"

    # Shared secret the Java backend sends in the X-Internal-Api-Key header.
    # When empty the check is disabled (only acceptable for local development).
    internal_api_key: str = ""

    # Embedding model (ONNX, executed locally through fastembed - no paid API).
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    model_cache_dir: str = ".model-cache"
    model_threads: int = Field(default=1, ge=1, le=16)
    # Load the model at startup (recommended). Disabled in unit tests.
    preload_model: bool = True
    # Fail requests instead of downloading if the model is not already cached.
    model_offline: bool = False

    # Resource limits
    max_upload_bytes: int = Field(default=5 * 1024 * 1024, ge=1024)
    max_pdf_pages: int = Field(default=12, ge=1)
    max_resume_chars: int = Field(default=40_000, ge=1000)
    max_job_description_chars: int = Field(default=20_000, ge=1000)
    min_job_description_words: int = Field(default=25, ge=1)
    max_embedding_units: int = Field(default=400, ge=10)
    # CPU embedding can take longer for long resumes and job descriptions.
    # Keep this aligned with the backend read timeout so valid analyses are
    # not cancelled before the backend can return the result.
    inference_timeout_seconds: float = Field(default=60.0, gt=0)
    max_concurrent_inferences: int = Field(default=2, ge=1)

    taxonomy_path: str = str(DATA_DIR / "skills_taxonomy.json")


@lru_cache
def get_settings() -> Settings:
    return Settings()
