from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db.connection import DatabaseConnectionCheck
from app.main import app


client = TestClient(app)


def test_health_check_returns_ok() -> None:
  response = client.get("/health")

  assert response.status_code == 200
  assert response.json() == {
    "status": "ok",
    "service": "averion-api",
    "version": "0.1.0"
  }


def test_root_returns_service_links() -> None:
  response = client.get("/")

  assert response.status_code == 200
  assert response.json()["message"] == "Averion.ai API"
  assert response.json()["docs_url"] == "/docs"
  assert response.json()["health_url"] == "/health"


def test_database_health_check_returns_ok_when_connected(monkeypatch) -> None:
  def fake_check_database_connection() -> DatabaseConnectionCheck:
    return DatabaseConnectionCheck(connected=True)

  monkeypatch.setattr(
    "app.api.health.check_database_connection",
    fake_check_database_connection
  )

  response = client.get("/health/database")

  assert response.status_code == 200
  assert response.json() == {
    "status": "ok",
    "database": "postgres",
    "connected": True,
    "error": None
  }


def test_database_health_check_returns_degraded_when_disconnected(monkeypatch) -> None:
  def fake_check_database_connection() -> DatabaseConnectionCheck:
    return DatabaseConnectionCheck(
      connected=False,
      error="DATABASE_URL is not configured."
    )

  monkeypatch.setattr(
    "app.api.health.check_database_connection",
    fake_check_database_connection
  )

  response = client.get("/health/database")

  assert response.status_code == 200
  assert response.json() == {
    "status": "degraded",
    "database": "postgres",
    "connected": False,
    "error": "DATABASE_URL is not configured."
  }


def test_ai_health_check_returns_ok_for_local_defaults() -> None:
  response = client.get("/health/ai")

  assert response.status_code == 200
  payload = response.json()
  assert payload["status"] == "ok"
  assert {component["name"] for component in payload["components"]} == {
    "chat",
    "transcription",
    "embeddings"
  }
  transcription = next(
    component
    for component in payload["components"]
    if component["name"] == "transcription"
  )
  assert transcription["status"] == "disabled"
  assert transcription["ready"] is True


def test_ai_health_check_detects_missing_external_chat_key(monkeypatch) -> None:
  monkeypatch.setattr("app.ai.readiness.settings.llm_provider", "openai")
  monkeypatch.setattr("app.ai.readiness.settings.llm_provider_api_key", "")

  response = client.get("/health/ai")

  assert response.status_code == 200
  payload = response.json()
  chat = next(
    component
    for component in payload["components"]
    if component["name"] == "chat"
  )
  assert payload["status"] == "degraded"
  assert chat["status"] == "degraded"
  assert chat["ready"] is False
  assert chat["error"] == "missing_api_key"


def test_settings_strip_wrapping_quotes_from_dashboard_env_values() -> None:
  settings = Settings(
    llm_provider='"groq"',
    llm_provider_api_key='"gsk_test_secret"',
    llm_model_name='"llama-3.1-8b-instant"',
    supabase_storage_bucket='"documents"',
    cors_origins='"https://averion-ai.vercel.app,http://localhost:3000"'
  )

  assert settings.llm_provider == "groq"
  assert settings.llm_provider_api_key == "gsk_test_secret"
  assert settings.llm_model_name == "llama-3.1-8b-instant"
  assert settings.supabase_storage_bucket == "documents"
  assert settings.allowed_cors_origins == [
    "https://averion-ai.vercel.app",
    "http://localhost:3000"
  ]
