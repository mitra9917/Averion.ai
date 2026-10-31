"""Wake the AWS worker; the durable database queue remains the source of truth."""

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def dispatch_aws_worker() -> None:
    if not settings.document_worker_aws_function_name:
        return
    from app.ai.aws_embeddings import lambda_client

    try:
        lambda_client().invoke(
            FunctionName=settings.document_worker_aws_function_name,
            InvocationType="Event", Payload=b"{}",
        )
    except Exception:
        # Upload is already durably queued. The scheduled worker retries independently.
        logger.warning("AWS worker wake-up failed; scheduled queue polling will recover")
