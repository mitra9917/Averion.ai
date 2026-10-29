from dataclasses import dataclass

import psycopg

from app.core.config import settings
from app.db.connection import is_database_configured, open_connection


@dataclass(frozen=True)
class DocumentMetadataCreate:
    document_id: str
    organization_id: str
    uploaded_by_user_id: str | None
    filename: str
    file_type: str
    storage_path: str
    status: str


@dataclass(frozen=True)
class DocumentChunkCreate:
    document_id: str
    chunk_index: int
    page_number: int | None
    text: str
    token_count: int | None = None
    embedding_id: str | None = None


@dataclass(frozen=True)
class DocumentListRecord:
    document_id: str
    filename: str
    file_type: str
    status: str
    storage_path: str
    chunks_count: int
    error_message: str | None
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class DeletedDocumentRecord:
    document_id: str
    filename: str
    storage_path: str


class DatabaseNotConfiguredError(RuntimeError):
    pass


def create_document_metadata(metadata: DocumentMetadataCreate) -> None:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with open_connection() as connection:
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
                values (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s)
                """,
                (
                    metadata.document_id,
                    metadata.organization_id,
                    metadata.uploaded_by_user_id,
                    metadata.filename,
                    metadata.file_type,
                    metadata.storage_path,
                    metadata.status
                )
            )


def create_document_chunks(chunks: list[DocumentChunkCreate]) -> int:
    if not chunks:
        return 0

    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with open_connection() as connection:
        with connection.cursor() as cursor:
            cursor.executemany(
                """
                insert into document_chunks (
                    document_id,
                    chunk_index,
                    page_number,
                    text,
                    token_count,
                    embedding_id
                )
                values (%s::uuid, %s, %s, %s, %s, %s)
                on conflict (document_id, chunk_index) do update set
                    page_number = excluded.page_number,
                    text = excluded.text,
                    token_count = excluded.token_count,
                    embedding_id = excluded.embedding_id
                """,
                [
                    (
                        chunk.document_id,
                        chunk.chunk_index,
                        chunk.page_number,
                        chunk.text,
                        chunk.token_count,
                        chunk.embedding_id
                    )
                    for chunk in chunks
                ]
            )

    return len(chunks)


def update_document_status(document_id: str, status: str, error_message: str | None = None) -> None:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with open_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update documents
                set status = %s,
                    error_message = %s,
                    updated_at = now()
                where id = %s::uuid
                """,
                (status, error_message, document_id)
            )


def list_documents(organization_id: str) -> list[DocumentListRecord]:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with open_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                    documents.id::text,
                    documents.filename,
                    documents.file_type,
                    documents.status,
                    documents.storage_path,
                    count(document_chunks.id)::int as chunks_count,
                    documents.error_message,
                    documents.created_at::text,
                    documents.updated_at::text
                from documents
                left join document_chunks
                    on document_chunks.document_id = documents.id
                where documents.organization_id = %s::uuid
                group by documents.id
                order by documents.created_at desc
                """,
                (organization_id,)
            )

            return [
                DocumentListRecord(
                    document_id=row[0],
                    filename=row[1],
                    file_type=row[2],
                    status=row[3],
                    storage_path=row[4],
                    chunks_count=row[5],
                    error_message=row[6],
                    created_at=row[7],
                    updated_at=row[8]
                )
                for row in cursor.fetchall()
            ]


def get_document_for_organization(
    document_id: str,
    organization_id: str
) -> DeletedDocumentRecord | None:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with open_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select id::text, filename, storage_path
                from documents
                where id = %s::uuid
                    and organization_id = %s::uuid
                """,
                (document_id, organization_id)
            )
            row = cursor.fetchone()

    if row is None:
        return None

    return DeletedDocumentRecord(
        document_id=row[0],
        filename=row[1],
        storage_path=row[2]
    )


def delete_document(document_id: str, organization_id: str) -> DeletedDocumentRecord | None:
    if not is_database_configured():
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured.")

    with open_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                delete from documents
                where id = %s::uuid
                    and organization_id = %s::uuid
                returning id::text, filename, storage_path
                """,
                (document_id, organization_id)
            )
            row = cursor.fetchone()

    if row is None:
        return None

    return DeletedDocumentRecord(
        document_id=row[0],
        filename=row[1],
        storage_path=row[2]
    )
