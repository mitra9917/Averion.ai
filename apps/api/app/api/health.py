from fastapi import APIRouter

from app.ai.readiness import get_ai_readiness
from app.core.config import settings
from app.db.connection import check_database_connection
from app.schemas.health import AIHealthResponse, DatabaseHealthResponse, HealthResponse

router = APIRouter(tags=["health"])


@router.api_route("/health", methods=["GET", "HEAD"], response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=settings.service_name,
        version=settings.app_version
    )


@router.get("/health/database", response_model=DatabaseHealthResponse)
def database_health_check() -> DatabaseHealthResponse:
    connection_check = check_database_connection()

    return DatabaseHealthResponse(
        status="ok" if connection_check.connected else "degraded",
        database="postgres",
        connected=connection_check.connected,
        error=connection_check.error
    )


@router.get("/health/ai", response_model=AIHealthResponse)
def ai_health_check() -> AIHealthResponse:
    return AIHealthResponse(**get_ai_readiness())
