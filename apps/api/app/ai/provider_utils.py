import logging
import re
import time
from collections.abc import Callable
from typing import TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class AIProviderError(RuntimeError):
    """Base class for provider failures with a sanitized public message."""

    def __init__(self, public_message: str, *, provider: str | None = None) -> None:
        super().__init__(public_message)
        self.public_message = public_message
        self.provider = provider


class ProviderConfigurationError(AIProviderError):
    """Raised when a provider cannot be used because config is incomplete."""


class ProviderRequestError(AIProviderError):
    """Raised when a configured provider request fails."""


SECRET_PATTERNS = (
    re.compile(r"(sk-[A-Za-z0-9_\-]{8,})"),
    re.compile(r"(gsk_[A-Za-z0-9_\-]{8,})"),
    re.compile(r"(?i)(api[_-]?key|authorization|bearer|token)(\s*[=:]\s*)([^\s,;]+)"),
)


def sanitize_provider_error(error: Exception | str) -> str:
    """Remove likely secret values from provider error text before logging."""
    text = str(error)
    for pattern in SECRET_PATTERNS:
        if pattern.groups >= 3:
            text = pattern.sub(r"\1\2[redacted]", text)
        else:
            text = pattern.sub("[redacted]", text)
    return text


def provider_failure_message(kind: str = "AI provider") -> str:
    return f"{kind} is temporarily unavailable. Please try again."


def is_transient_provider_error(error: Exception) -> bool:
    """Return whether a failed request is safe to retry once."""
    status_code = getattr(error, "status_code", None)
    response = getattr(error, "response", None)
    if status_code is None and response is not None:
        status_code = getattr(response, "status_code", None)

    if isinstance(status_code, int):
        return status_code == 408 or status_code == 429 or status_code >= 500

    return isinstance(error, (ConnectionError, TimeoutError)) or type(error).__name__ in {
        "APIConnectionError",
        "APITimeoutError",
        "InternalServerError",
        "RateLimitError",
    }


def run_with_retries(
    operation: Callable[[], T],
    *,
    provider: str,
    attempts: int,
    delay_seconds: float = 0.1,
    public_message: str | None = None
) -> T:
    """Run a provider call with bounded retries and sanitized logging."""
    max_attempts = max(1, attempts)
    last_error: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            return operation()
        except Exception as exc:  # pragma: no cover - exercised via callers
            last_error = exc
            logger.warning(
                "%s provider request failed on attempt %s/%s: %s",
                provider,
                attempt,
                max_attempts,
                sanitize_provider_error(exc)
            )
            if not is_transient_provider_error(exc):
                break
            if attempt < max_attempts and delay_seconds > 0:
                time.sleep(delay_seconds)

    raise ProviderRequestError(
        public_message or provider_failure_message(),
        provider=provider
    ) from last_error
