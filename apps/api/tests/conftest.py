"""Pytest collection rules for the automated API test suite."""

import os

# Set before test modules import Settings. Never load live storage/DB credentials.
os.environ.update({
    "DATABASE_URL": "",
    "AUTH_REQUIRED": "false",
    "DOCUMENT_STORAGE_BACKEND": "local",
    "SUPABASE_SERVICE_ROLE_KEY": "",
    "LLM_PROVIDER": "mock",
    "LLM_PROVIDER_API_KEY": "",
    "TRANSCRIPTION_PROVIDER": "disabled",
    "TRANSCRIPTION_PROVIDER_API_KEY": "",
    "EMBEDDING_PROVIDER": "local",
    "EMBEDDING_AWS_FUNCTION_NAME": "",
    "DOCUMENT_WORKER_AWS_FUNCTION_NAME": "",
    "INLINE_DOCUMENT_INGESTION": "false",
    "ENABLE_DOCUMENT_INGESTION_DAEMON": "false",
})

collect_ignore_glob = ["test_*_manual.py"]
