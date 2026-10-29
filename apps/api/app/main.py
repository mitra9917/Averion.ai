import logging
import os
import signal
import sys
from contextlib import asynccontextmanager
from threading import Thread

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.chat import router as chat_router
from app.api.conversations import router as conversations_router
from app.api.documents import router as documents_router
from app.api.feedback import router as feedback_router
from app.api.health import router as health_router
from app.api.transcription import router as transcription_router
from app.api.users import router as users_router
from app.ai.embeddings import preload_embedding_model
from app.core.config import settings
from app.core.middleware import RequestSecurityMiddleware

logger = logging.getLogger(__name__)


def handle_shutdown_signal(signum, frame):
    """Handle shutdown signals gracefully."""
    logger.info(f"Received signal {signum}, initiating graceful shutdown...")
    sys.exit(0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting up Averion.ai API...")
    
    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGTERM, handle_shutdown_signal)
    signal.signal(signal.SIGINT, handle_shutdown_signal)
    
    if settings.embedding_model_preload:
        logger.info("Preloading embedding model...")
        preload_embedding_model()

    if (
        settings.enable_document_ingestion_daemon
        and settings.inline_document_ingestion
        and os.getenv("AVERION_PROCESS", "api") != "worker"
    ):
        from app.workers.document_ingestion import run_worker

        Thread(
            target=run_worker,
            name="document-ingestion-daemon",
            daemon=True
        ).start()
        logger.info("Background document ingestion daemon started")
    
    logger.info("API startup complete")
    yield
    
    # Shutdown
    logger.info("Shutting down Averion.ai API...")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Backend API and AI service for Averion.ai.",
        lifespan=lifespan
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"]
    )
    app.add_middleware(RequestSecurityMiddleware)

    app.include_router(health_router)
    app.include_router(documents_router)
    app.include_router(chat_router)
    app.include_router(conversations_router)
    app.include_router(feedback_router)
    app.include_router(transcription_router)
    app.include_router(users_router)

    @app.get("/", tags=["root"])
    @app.head("/", include_in_schema=False)
    def read_root() -> dict[str, str]:
        return {
            "message": "Averion.ai API",
            "docs_url": "/docs",
            "health_url": "/health"
        }

    return app


app = create_app()
