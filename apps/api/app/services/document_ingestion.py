from contextlib import contextmanager
import logging
from pathlib import Path
import re
from tempfile import NamedTemporaryFile
import time
from typing import Iterator

from app.ai.embeddings import generate_embeddings
from app.ai.ingestion_pipeline import run_ingestion_pipeline
from app.ai.security import sanitize_output
from app.ai.vector_store import build_chunk_id, store_embeddings
from app.core.config import settings
from app.db.documents import DocumentChunkCreate, create_document_chunks
from app.db.ingestion_jobs import (
    DocumentIngestionJob,
    clear_document_processing_outputs,
    complete_ingestion_job,
    fail_ingestion_job
)
from app.services.document_storage import DocumentStorage, get_document_storage


logger = logging.getLogger(__name__)


class DocumentChunkLimitError(RuntimeError):
    pass


@contextmanager
def temporary_document_file(
    storage: DocumentStorage,
    object_key: str,
    suffix: str
) -> Iterator[str]:
    contents = storage.download(object_key)
    temporary_path: Path | None = None

    try:
        with NamedTemporaryFile(delete=False, suffix=suffix) as temporary_file:
            temporary_file.write(contents)
            temporary_path = Path(temporary_file.name)

        yield str(temporary_path)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def sanitize_processing_error(exc: Exception) -> str:
    message = re.sub(
        r"\b(api[_-]?key|secret|token|password|database[_-]?url)"
        r"\s*[:=]\s*[^\s,;]+",
        r"\1=[REDACTED]",
        str(exc),
        flags=re.IGNORECASE
    )
    message = sanitize_output(message).replace("\n", " ").strip()
    message = re.sub(r"(/[^ ]+)+", "[PATH]", message)

    if not message:
        message = type(exc).__name__

    return message[:500]


def _build_chunk_records(
    chunks: list[dict],
    document_id: str
) -> list[DocumentChunkCreate]:
    records: list[DocumentChunkCreate] = []

    for fallback_index, chunk in enumerate(chunks):
        text = str(chunk.get("text", "")).strip()
        if not text:
            continue

        records.append(
            DocumentChunkCreate(
                document_id=document_id,
                chunk_index=int(chunk.get("chunk_index", fallback_index)),
                page_number=chunk.get("page_number"),
                text=text,
                token_count=len(text.split()),
                embedding_id=chunk.get("embedding_id")
            )
        )

    return records


def process_ingestion_job(
    job: DocumentIngestionJob,
    storage: DocumentStorage | None = None
) -> None:
    document_storage = storage or get_document_storage()

    started_at = time.perf_counter()
    try:
        clear_document_processing_outputs(job.document_id)

        with temporary_document_file(
            document_storage,
            job.storage_path,
            Path(job.filename).suffix.lower()
        ) as temporary_path:
            chunks = run_ingestion_pipeline(
                file_path=temporary_path,
                file_type=job.file_type,
                document_id=job.document_id
            )
        extraction_and_chunking_ms = (time.perf_counter() - started_at) * 1000

        if not chunks:
            raise RuntimeError(
                "No readable chunks were produced from this document."
            )

        if len(chunks) > settings.document_max_chunks:
            raise DocumentChunkLimitError(
                f"Document produced {len(chunks)} chunks; "
                f"the limit is {settings.document_max_chunks}."
            )

        for chunk in chunks:
            chunk["organization_id"] = job.organization_id
            chunk["chunk_id"] = build_chunk_id(
                job.document_id,
                chunk.get("chunk_index", 0)
            )
            chunk["embedding_id"] = chunk["chunk_id"]

        chunk_records = _build_chunk_records(chunks, job.document_id)
        database_chunks_started_at = time.perf_counter()
        create_document_chunks(chunk_records)
        database_chunks_ms = (time.perf_counter() - database_chunks_started_at) * 1000
        embedding_started_at = time.perf_counter()
        embedded_chunks = generate_embeddings(
            chunks,
            batch_size=settings.embedding_batch_size
        )
        embedding_ms = (time.perf_counter() - embedding_started_at) * 1000

        if any("embedding" not in chunk for chunk in embedded_chunks):
            raise RuntimeError("One or more chunks could not be embedded.")

        vector_storage_started_at = time.perf_counter()
        store_embeddings(embedded_chunks)
        vector_storage_ms = (time.perf_counter() - vector_storage_started_at) * 1000
        complete_ingestion_job(job)
        logger.info(
            "Document ingestion latency: document_id=%s chunks=%s extraction_and_chunking_ms=%.1f database_chunks_ms=%.1f embedding_ms=%.1f vector_storage_ms=%.1f total_ms=%.1f",
            job.document_id,
            len(chunks),
            extraction_and_chunking_ms,
            database_chunks_ms,
            embedding_ms,
            vector_storage_ms,
            (time.perf_counter() - started_at) * 1000
        )
    except Exception as exc:
        error_message = sanitize_processing_error(exc)
        terminal = fail_ingestion_job(job, error_message)
        logger.exception(
            "Document ingestion failed for %s on attempt %s/%s; terminal=%s",
            job.document_id,
            job.attempts,
            job.max_attempts,
            terminal
        )
