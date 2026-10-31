"""AWS-only entry point for embedding inference and the existing ingestion queue."""

import os
import uuid
import json
from functools import lru_cache


@lru_cache(maxsize=1)
def configure_ingestion() -> None:
    import boto3
    from botocore.config import Config

    parameter = os.environ["AVERION_CONFIG_PARAMETER"]
    response = boto3.client(
        "ssm", region_name=os.environ["AWS_REGION"],
        config=Config(connect_timeout=5, read_timeout=15, retries={"total_max_attempts": 2}),
    ).get_parameter(Name=parameter, WithDecryption=True)
    values = json.loads(response["Parameter"]["Value"])
    allowed = {"DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET", "DOCUMENT_STORAGE_BACKEND"}
    if not values.get("DATABASE_URL") or not values.get("SUPABASE_SERVICE_ROLE_KEY"):
        raise RuntimeError("Ingestion configuration is incomplete")
    for key in allowed:
        if key in values:
            os.environ[key] = str(values[key])


def handler(event: dict, context) -> dict:
    role = os.environ.get("AVERION_AWS_ROLE")
    if role == "embeddings":
        from app.core.config import settings
        from app.ai.embeddings import get_embedding_model

        action = event.get("action")
        if action not in {"embed", "health"}:
            raise ValueError("Unsupported embedding operation")
        texts = event.get("texts", [])
        if action == "embed" and (
            not isinstance(texts, list) or not 1 <= len(texts) <= 32
            or any(not isinstance(t, str) for t in texts)
            or sum(len(t) for t in texts) > 500_000
        ):
            raise ValueError("Invalid embedding batch")
        model = get_embedding_model()
        result = {"model": settings.embedding_model_name, "loaded": True}
        if action == "embed":
            result["vectors"] = model.encode(
                texts, batch_size=settings.embedding_batch_size, show_progress_bar=False,
            ).tolist()
        return result

    if role != "ingestion":
        raise RuntimeError("AWS worker role is not configured")

    configure_ingestion()
    from app.db.ingestion_jobs import claim_next_ingestion_job
    from app.services.document_ingestion import process_ingestion_job

    worker_id = f"aws-lambda:{context.aws_request_id}:{uuid.uuid4().hex[:8]}"
    processed = 0
    # Keep ample time for the next document. Leases/retries remain in PostgreSQL.
    while processed == 0 or context.get_remaining_time_in_millis() > 600_000:
        job = claim_next_ingestion_job(worker_id)
        if job is None:
            break
        process_ingestion_job(job)
        processed += 1
    return {"processed": processed}
