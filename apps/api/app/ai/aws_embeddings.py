"""Private Lambda transport; AWS credentials are supplied by the host environment."""

import json
import math
import time
from functools import lru_cache

from app.core.config import settings


@lru_cache(maxsize=1)
def lambda_client():
    import boto3
    from botocore.config import Config

    return boto3.client(
        "lambda", region_name=settings.embedding_aws_region,
        config=Config(
            connect_timeout=5, read_timeout=settings.embedding_aws_timeout_seconds,
            retries={"total_max_attempts": 2, "mode": "standard"},
        ),
    )


def invoke_embedding_service(payload: dict) -> dict:
    if not settings.embedding_aws_function_name:
        raise RuntimeError("AWS embedding function is not configured")
    response = lambda_client().invoke(
        FunctionName=settings.embedding_aws_function_name,
        InvocationType="RequestResponse",
        Payload=json.dumps(payload).encode("utf-8"),
    )
    stream = response["Payload"]
    try:
        body = json.loads(stream.read())
    finally:
        stream.close()
    if response.get("FunctionError"):
        raise RuntimeError("AWS embedding service failed")
    if body.get("model") != settings.embedding_model_name or not body.get("loaded"):
        raise RuntimeError("AWS embedding model is unavailable or mismatched")
    return body


def encode_remote(texts: list[str]) -> list[list[float]]:
    if len(texts) > 32:
        return [v for start in range(0, len(texts), 32) for v in encode_remote(texts[start:start + 32])]
    if not texts:
        return []
    body = invoke_embedding_service({"action": "embed", "texts": texts})
    vectors = body.get("vectors")
    if not isinstance(vectors, list) or len(vectors) != len(texts):
        raise RuntimeError("AWS embedding service returned an invalid batch")
    for vector in vectors:
        if (
            not isinstance(vector, list) or len(vector) != 384
            or any(not isinstance(v, (float, int)) or not math.isfinite(v) for v in vector)
        ):
            raise RuntimeError("AWS embedding service returned an invalid vector")
    return vectors


_health_checked_at = 0.0
_health = {"loaded": False, "error": "not_checked"}


def remote_model_status() -> dict:
    global _health_checked_at, _health
    if not _health_checked_at or time.monotonic() - _health_checked_at >= 60:
        try:
            invoke_embedding_service({"action": "health"})
            _health = {"loaded": True, "error": None}
        except Exception as exc:
            # Never return SDK messages, credentials, or inference text in health output.
            _health = {"loaded": False, "error": type(exc).__name__}
        _health_checked_at = time.monotonic()
    return {"model": settings.embedding_model_name, **_health}
