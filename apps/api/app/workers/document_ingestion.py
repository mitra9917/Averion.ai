import logging
import os
import socket
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from uuid import uuid4

from app.core.config import settings
from app.db.ingestion_jobs import claim_next_ingestion_job
from app.services.document_ingestion import process_ingestion_job


logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
logger = logging.getLogger(__name__)


class WorkerHealthHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path != "/health":
            self.send_response(404)
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ok","service":"document-worker"}')

    def log_message(self, format: str, *args: object) -> None:
        return


def start_health_server() -> None:
    port = int(os.getenv("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), WorkerHealthHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logger.info("Worker health server listening on port %s", port)


def build_worker_id() -> str:
    return f"{socket.gethostname()}:{os.getpid()}:{uuid4().hex[:8]}"


def run_worker() -> None:
    worker_id = build_worker_id()
    logger.info("Starting document ingestion worker %s", worker_id)

    while True:
        try:
            job = claim_next_ingestion_job(worker_id)
        except Exception:
            logger.exception(
                "Could not claim a document ingestion job; retrying"
            )
            time.sleep(settings.document_worker_poll_seconds)
            continue

        if job is None:
            time.sleep(settings.document_worker_poll_seconds)
            continue

        logger.info(
            "Processing document %s attempt %s/%s",
            job.document_id,
            job.attempts,
            job.max_attempts
        )
        process_ingestion_job(job)


if __name__ == "__main__":
    start_health_server()
    run_worker()
