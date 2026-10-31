import asyncio
import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.responses import JSONResponse

from app.core.config import settings

logger = logging.getLogger("averion.api")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}


class RequestSecurityMiddleware(BaseHTTPMiddleware):
    """Attach security headers, request IDs, and safe access logs."""

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path.rstrip("/") == "/transcribe":
            # Reject declared oversized bodies before multipart parsing/spooling.
            try:
                content_length = int(request.headers.get("content-length", "0"))
            except ValueError:
                return JSONResponse({"detail": "Invalid Content-Length."}, status_code=400)
            if content_length > 26 * 1024 * 1024:
                return JSONResponse({"detail": "Audio request exceeds the size limit."}, status_code=413)
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        started_at = time.perf_counter()
        status_code = 500

        response: Response | None = None
        try:
            response = await call_next(request)
            status_code = response.status_code
        except asyncio.CancelledError:
            status_code = 499
            raise
        except Exception:
            status_code = 500
            raise
        finally:
            duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
            if settings.request_logging_enabled:
                logger.info(
                    "request_completed",
                    extra={
                        "request_id": request_id,
                        "method": request.method,
                        "path": request.url.path,
                        "status_code": status_code,
                        "duration_ms": duration_ms,
                    },
                )

        if response is None:
            raise RuntimeError("Request handler did not return a response")

        response.headers["X-Request-ID"] = request_id

        if settings.security_headers_enabled:
            for header, value in SECURITY_HEADERS.items():
                response.headers.setdefault(header, value)

        return response
