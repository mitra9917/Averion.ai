from math import sqrt
from typing import Any

import psycopg

from app.core.config import settings
from app.db.connection import is_database_configured

_memory_vectors: dict[str, dict[str, Any]] = {}


def build_chunk_id(document_id: str, chunk_index: int | str) -> str:
    return f"{document_id}:{chunk_index}"


def _vector_literal(embedding: list[float]) -> str:
    return "[" + ",".join(str(float(value)) for value in embedding) + "]"


def _cosine_distance(left: list[float], right: list[float]) -> float:
    dot_product = sum(a * b for a, b in zip(left, right))
    left_norm = sqrt(sum(value * value for value in left))
    right_norm = sqrt(sum(value * value for value in right))

    if left_norm == 0 or right_norm == 0:
        return 1.0

    return 1.0 - (dot_product / (left_norm * right_norm))


def _normalize_chunk(chunk: dict) -> dict[str, Any] | None:
    embedding = chunk.get("embedding")
    if not embedding or not isinstance(embedding, list):
        return None

    text = str(chunk.get("text", "")).strip()
    if not text:
        return None

    document_id = str(chunk["document_id"])
    organization_id = str(
        chunk.get("organization_id") or settings.default_organization_id
    )
    chunk_index = int(chunk["chunk_index"])
    chunk_id = str(chunk.get("chunk_id") or build_chunk_id(document_id, chunk_index))
    page_number = chunk.get("page_number")

    return {
        "chunk_id": chunk_id,
        "organization_id": organization_id,
        "document_id": document_id,
        "chunk_index": chunk_index,
        "page_number": page_number,
        "text": text,
        "embedding": [float(value) for value in embedding]
    }


def reset_collection() -> None:
    """
    Clear stored vectors.

    This is intended for tests and manual local resets only. Normal ingestion
    upserts vectors and must not delete existing organization embeddings.
    """
    _memory_vectors.clear()

    if not is_database_configured():
        return

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from document_embeddings")


def store_embeddings(chunks: list[dict], clear_existing: bool = False) -> None:
    """
    Store document chunk embeddings in shared Supabase/Postgres pgvector storage.

    A no-database in-memory fallback is kept only for tests and local
    development when DATABASE_URL is not configured.
    """
    if clear_existing:
        reset_collection()

    rows = [
        normalized_chunk
        for chunk in chunks
        if (normalized_chunk := _normalize_chunk(chunk)) is not None
    ]

    if not rows:
        return

    if not is_database_configured():
        for row in rows:
            _memory_vectors[row["chunk_id"]] = row
        return

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.executemany(
                """
                insert into document_embeddings (
                    chunk_id,
                    organization_id,
                    document_id,
                    chunk_index,
                    page_number,
                    text,
                    embedding
                )
                values (%s, %s::uuid, %s::uuid, %s, %s, %s, %s::vector)
                on conflict (chunk_id) do update set
                    organization_id = excluded.organization_id,
                    document_id = excluded.document_id,
                    chunk_index = excluded.chunk_index,
                    page_number = excluded.page_number,
                    text = excluded.text,
                    embedding = excluded.embedding,
                    updated_at = now()
                """,
                [
                    (
                        row["chunk_id"],
                        row["organization_id"],
                        row["document_id"],
                        row["chunk_index"],
                        row["page_number"],
                        row["text"],
                        _vector_literal(row["embedding"])
                    )
                    for row in rows
                ]
            )


def search_similar(
    query_embedding: list[float],
    top_k: int = 3,
    organization_id: str | None = None
) -> list[dict]:
    """
    Search for similar chunks using a shared organization-scoped vector table.
    """
    if not query_embedding:
        return []

    scoped_organization_id = organization_id or settings.default_organization_id

    if not is_database_configured():
        results = [
            {
                **row,
                "score": _cosine_distance(query_embedding, row["embedding"])
            }
            for row in _memory_vectors.values()
            if row["organization_id"] == scoped_organization_id
        ]
        results.sort(key=lambda row: row["score"])
        return [
            {
                "text": row["text"],
                "document_id": row["document_id"],
                "organization_id": row["organization_id"],
                "chunk_index": row["chunk_index"],
                "chunk_id": row["chunk_id"],
                "page_number": row["page_number"],
                "score": row["score"]
            }
            for row in results[:top_k]
        ]

    embedding_literal = _vector_literal([float(value) for value in query_embedding])

    with psycopg.connect(settings.database_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                    document_embeddings.text,
                    document_embeddings.document_id::text,
                    document_embeddings.organization_id::text,
                    document_embeddings.chunk_index,
                    document_embeddings.chunk_id,
                    document_embeddings.page_number,
                    document_embeddings.embedding <=> %s::vector as score
                from document_embeddings
                join documents
                    on documents.id = document_embeddings.document_id
                where document_embeddings.organization_id = %s::uuid
                    and documents.organization_id = %s::uuid
                order by document_embeddings.embedding <=> %s::vector
                limit %s
                """,
                (
                    embedding_literal,
                    scoped_organization_id,
                    scoped_organization_id,
                    embedding_literal,
                    top_k
                )
            )

            return [
                {
                    "text": row[0],
                    "document_id": row[1],
                    "organization_id": row[2],
                    "chunk_index": row[3],
                    "chunk_id": row[4],
                    "page_number": row[5],
                    "score": row[6]
                }
                for row in cursor.fetchall()
            ]
