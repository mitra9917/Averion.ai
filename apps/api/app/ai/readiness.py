from app.ai.embeddings import get_embedding_model_status
from app.core.config import settings

OPENAI_COMPATIBLE_PROVIDERS = {"openai", "groq"}


def _openai_client_available() -> bool:
    try:
        import openai  # noqa: F401
    except ImportError:
        return False
    return True


def _provider_status(
    *,
    name: str,
    provider: str,
    api_key: str,
    model: str,
    disabled_allowed: bool = False
) -> dict[str, str | bool | None]:
    normalized_provider = provider.lower()
    if disabled_allowed and normalized_provider == "disabled":
        return {
            "name": name,
            "status": "disabled",
            "provider": normalized_provider,
            "model": None,
            "ready": True,
            "error": None
        }

    if normalized_provider not in OPENAI_COMPATIBLE_PROVIDERS and normalized_provider != "mock":
        return {
            "name": name,
            "status": "degraded",
            "provider": normalized_provider,
            "model": model,
            "ready": False,
            "error": "unsupported_provider"
        }

    if normalized_provider == "mock":
        return {
            "name": name,
            "status": "ok",
            "provider": normalized_provider,
            "model": model,
            "ready": True,
            "error": None
        }

    if not api_key:
        return {
            "name": name,
            "status": "degraded",
            "provider": normalized_provider,
            "model": model,
            "ready": False,
            "error": "missing_api_key"
        }

    if not _openai_client_available():
        return {
            "name": name,
            "status": "degraded",
            "provider": normalized_provider,
            "model": model,
            "ready": False,
            "error": "missing_openai_client"
        }

    return {
        "name": name,
        "status": "ok",
        "provider": normalized_provider,
        "model": model,
        "ready": True,
        "error": None
    }


def get_ai_readiness() -> dict[str, object]:
    chat = _provider_status(
        name="chat",
        provider=settings.llm_provider,
        api_key=settings.llm_provider_api_key,
        model=settings.llm_model_name
    )
    transcription = _provider_status(
        name="transcription",
        provider=settings.transcription_provider,
        api_key=settings.transcription_provider_api_key,
        model=settings.transcription_model_name,
        disabled_allowed=True
    )
    embedding_status = get_embedding_model_status()
    embeddings_ready = not bool(embedding_status["error"])
    embeddings = {
        "name": "embeddings",
        "status": "ok" if embeddings_ready else "degraded",
        "provider": "aws_lambda" if settings.embedding_provider == "aws_lambda" else "sentence-transformers",
        "model": embedding_status["model"],
        "ready": embeddings_ready,
        "loaded": embedding_status["loaded"],
        "preload_enabled": settings.embedding_model_preload,
        "error": embedding_status["error"]
    }

    components = [chat, transcription, embeddings]
    overall_ok = all(bool(component["ready"]) for component in components)

    return {
        "status": "ok" if overall_ok else "degraded",
        "components": components
    }
