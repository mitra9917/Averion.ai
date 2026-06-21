from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Averion.ai API"
    app_version: str = "0.1.0"
    service_name: str = "averion-api"
    database_url: str | None = None
    default_organization_id: str = "00000000-0000-0000-0000-000000000001"
    supabase_url: str | None = None
    supabase_jwt_secret: str | None = None
    allowed_email_domains: str = ""
    auth_required: bool = False
    upload_dir: str = "./uploads"
    document_storage_backend: str = "local"
    supabase_service_role_key: str | None = None
    supabase_storage_bucket: str = "documents"
    max_document_size_bytes: int = 104_857_600
    document_job_max_attempts: int = 3
    document_job_retry_delay_seconds: int = 30
    document_job_lease_seconds: int = 900
    document_worker_poll_seconds: float = 2.0
    document_max_chunks: int = 2_000
    embedding_batch_size: int = 32
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    security_headers_enabled: bool = True
    request_logging_enabled: bool = True
    vector_db_path: str | None = None
    embedding_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    retrieval_top_k: int = 5
    # Cosine distance threshold: 0.0 (identical) to 2.0 (opposite).
    # Lower scores = more similar. Threshold = max acceptable distance.
    # Evaluation tests keep this default strict enough to reject unrelated text.
    retrieval_min_score: float = 0.8
    llm_provider: str = "mock"
    llm_provider_api_key: str = ""
    llm_provider_base_url: str | None = None
    llm_provider_timeout_seconds: float = 30.0
    llm_provider_max_retries: int = 2
    llm_model_name: str = "gpt-4o-mini"
    llm_temperature: float = 0.2
    llm_max_tokens: int = 1000
    rag_prompt_max_context_chars: int = 4_500
    rag_prompt_max_chunk_chars: int = 850
    transcription_provider: str = "disabled"
    transcription_provider_api_key: str = ""
    transcription_provider_base_url: str | None = None
    transcription_model_name: str = "whisper-large-v3"
    transcription_timeout_seconds: float = 60.0
    transcription_max_retries: int = 2
    embedding_model_preload: bool = False

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @field_validator("*", mode="before")
    @classmethod
    def strip_wrapping_quotes(cls, value: Any) -> Any:
        if not isinstance(value, str):
            return value

        stripped = value.strip()
        if len(stripped) >= 2 and stripped[0] == stripped[-1] and stripped[0] in {"'", '"'}:
            return stripped[1:-1]
        return stripped

    @property
    def allowed_cors_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]

    @property
    def allowed_email_domain_list(self) -> list[str]:
        return [
            domain.strip().lower()
            for domain in self.allowed_email_domains.split(",")
            if domain.strip()
        ]


settings = Settings()
