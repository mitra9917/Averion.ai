from dataclasses import dataclass

import psycopg

from app.core.config import settings
from app.db.connection import is_database_configured
from app.db.documents import (
    DatabaseNotConfiguredError,
    DocumentMetadataCreate
)


@dataclass(frozen=True)
class DocumentIngestionJob:
    job_id: str
    document_id: str
    organization_id: str
    filename: str
    file_type: str
    storage_path: str
    attempts: int
    max_attempts: int


def create_document_and_job(metadata: DocumentMetadataCreate) -> str:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            if metadata.organization_id == settings.default_organization_id:
                cursor.execute(
                    """
                    insert into organizations (id, name)
                    values (%s::uuid, %s)
                    on conflict (id) do nothing
                    """,
                    (
                        settings.default_organization_id,
                        "Development Organization"
                    )
                )

            cursor.execute(
                """
                insert into documents (
                    id,
                    organization_id,
                    uploaded_by_user_id,
                    filename,
                    file_type,
                    storage_path,
                    status
                )
                values (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, 'uploaded')
                """,
                (
                    metadata.document_id,
                    metadata.organization_id,
                    metadata.uploaded_by_user_id,
                    metadata.filename,
                    metadata.file_type,
                    metadata.storage_path
                )
            )
            cursor.execute(
                """
                insert into document_ingestion_jobs (
                    document_id,
                    organization_id,
                    max_attempts
                )
                values (%s::uuid, %s::uuid, %s)
                returning id::text
                """,
                (
                    metadata.document_id,
                    metadata.organization_id,
                    settings.document_job_max_attempts
                )
            )
            row = cursor.fetchone()

    return row[0]


def claim_next_ingestion_job(worker_id: str) -> DocumentIngestionJob | None:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                with exhausted as (
                  update document_ingestion_jobs
                  set status = 'failed',
                      locked_at = null,
                      locked_by = null,
                      last_error = %s,
                      updated_at = now()
                  where status = 'processing'
                    and attempts >= max_attempts
                    and locked_at <
                      now() - make_interval(secs => %s)
                  returning document_id, organization_id
                )
                update documents
                set status = 'failed',
                    error_message = %s,
                    updated_at = now()
                from exhausted
                where documents.id = exhausted.document_id
                  and documents.organization_id = exhausted.organization_id
                """,
                (
                    "Document processing stopped before completion.",
                    settings.document_job_lease_seconds,
                    "Document processing stopped before completion."
                )
            )
            cursor.execute(
                """
                with candidate as (
                  select jobs.id
                  from document_ingestion_jobs jobs
                  where jobs.attempts < jobs.max_attempts
                    and (
                      (
                        jobs.status = 'queued'
                        and jobs.available_at <= now()
                      )
                      or (
                        jobs.status = 'processing'
                        and jobs.locked_at <
                          now() - make_interval(secs => %s)
                      )
                    )
                  order by jobs.available_at, jobs.created_at
                  for update skip locked
                  limit 1
                )
                update document_ingestion_jobs jobs
                set status = 'processing',
                    attempts = jobs.attempts + 1,
                    locked_at = now(),
                    locked_by = %s,
                    last_error = null,
                    updated_at = now()
                from candidate, documents
                where jobs.id = candidate.id
                  and documents.id = jobs.document_id
                returning
                  jobs.id::text,
                  jobs.document_id::text,
                  jobs.organization_id::text,
                  documents.filename,
                  documents.file_type,
                  documents.storage_path,
                  jobs.attempts,
                  jobs.max_attempts
                """,
                (settings.document_job_lease_seconds, worker_id)
            )
            row = cursor.fetchone()

            if row is None:
                return None

            cursor.execute(
                """
                update documents
                set status = 'processing',
                    error_message = null,
                    updated_at = now()
                where id = %s::uuid
                  and organization_id = %s::uuid
                """,
                (row[1], row[2])
            )

    return DocumentIngestionJob(
        job_id=row[0],
        document_id=row[1],
        organization_id=row[2],
        filename=row[3],
        file_type=row[4],
        storage_path=row[5],
        attempts=row[6],
        max_attempts=row[7]
    )


def claim_ingestion_job(
    document_id: str,
    organization_id: str,
    worker_id: str
) -> DocumentIngestionJob | None:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update document_ingestion_jobs jobs
                set status = 'processing',
                    attempts = jobs.attempts + 1,
                    locked_at = now(),
                    locked_by = %s,
                    last_error = null,
                    updated_at = now()
                from documents
                where jobs.document_id = %s::uuid
                  and jobs.organization_id = %s::uuid
                  and jobs.status = 'queued'
                  and jobs.attempts < jobs.max_attempts
                  and jobs.available_at <= now()
                  and documents.id = jobs.document_id
                returning
                  jobs.id::text,
                  jobs.document_id::text,
                  jobs.organization_id::text,
                  documents.filename,
                  documents.file_type,
                  documents.storage_path,
                  jobs.attempts,
                  jobs.max_attempts
                """,
                (worker_id, document_id, organization_id)
            )
            row = cursor.fetchone()

            if row is None:
                return None

            cursor.execute(
                """
                update documents
                set status = 'processing',
                    error_message = null,
                    updated_at = now()
                where id = %s::uuid
                  and organization_id = %s::uuid
                """,
                (document_id, organization_id)
            )

    return DocumentIngestionJob(
        job_id=row[0],
        document_id=row[1],
        organization_id=row[2],
        filename=row[3],
        file_type=row[4],
        storage_path=row[5],
        attempts=row[6],
        max_attempts=row[7]
    )


def clear_document_processing_outputs(document_id: str) -> None:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "delete from document_embeddings where document_id = %s::uuid",
                (document_id,)
            )
            cursor.execute(
                "delete from document_chunks where document_id = %s::uuid",
                (document_id,)
            )


def complete_ingestion_job(job: DocumentIngestionJob) -> None:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update document_ingestion_jobs
                set status = 'completed',
                    locked_at = null,
                    locked_by = null,
                    last_error = null,
                    completed_at = now(),
                    updated_at = now()
                where id = %s::uuid
                  and status = 'processing'
                """,
                (job.job_id,)
            )
            cursor.execute(
                """
                update documents
                set status = 'ready',
                    error_message = null,
                    updated_at = now()
                where id = %s::uuid
                  and organization_id = %s::uuid
                """,
                (job.document_id, job.organization_id)
            )


def fail_ingestion_job(job: DocumentIngestionJob, error_message: str) -> bool:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    terminal_failure = job.attempts >= job.max_attempts
    job_status = "failed" if terminal_failure else "queued"
    document_status = "failed" if terminal_failure else "uploaded"

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update document_ingestion_jobs
                set status = %s,
                    available_at = case
                      when %s then available_at
                      else now() + make_interval(secs => %s)
                    end,
                    locked_at = null,
                    locked_by = null,
                    last_error = %s,
                    updated_at = now()
                where id = %s::uuid
                """,
                (
                    job_status,
                    terminal_failure,
                    settings.document_job_retry_delay_seconds,
                    error_message,
                    job.job_id
                )
            )
            cursor.execute(
                """
                update documents
                set status = %s,
                    error_message = %s,
                    updated_at = now()
                where id = %s::uuid
                  and organization_id = %s::uuid
                """,
                (
                    document_status,
                    error_message,
                    job.document_id,
                    job.organization_id
                )
            )

    return terminal_failure


def retry_failed_ingestion_job(
    document_id: str,
    organization_id: str
) -> bool:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update document_ingestion_jobs
                set status = 'queued',
                    attempts = 0,
                    available_at = now(),
                    locked_at = null,
                    locked_by = null,
                    last_error = null,
                    completed_at = null,
                    updated_at = now()
                where document_id = %s::uuid
                  and organization_id = %s::uuid
                  and status = 'failed'
                returning id
                """,
                (document_id, organization_id)
            )
            retried = cursor.fetchone() is not None

            if retried:
                cursor.execute(
                    """
                    update documents
                    set status = 'uploaded',
                        error_message = null,
                        updated_at = now()
                    where id = %s::uuid
                      and organization_id = %s::uuid
                    """,
                    (document_id, organization_id)
                )

    return retried
