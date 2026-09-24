"""Security middleware: HTTP headers and request body size guard."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import get_settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=()",
        )
        response.headers.setdefault("X-XSS-Protection", "0")
        # Tokens live in localStorage (Bearer); no session cookies — CSRF surface is low.
        # Cache-Control for API JSON responses.
        if request.url.path.startswith("/") and "Cache-Control" not in response.headers:
            if request.url.path not in ("/health", "/ready", "/docs", "/openapi.json", "/redoc"):
                response.headers.setdefault("Cache-Control", "no-store")
        return response


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject oversized Content-Length before body is fully buffered."""

    async def dispatch(self, request: Request, call_next) -> Response:
        settings = get_settings()
        max_bytes = settings.vbx_max_upload_bytes
        cl = request.headers.get("content-length")
        if cl is not None:
            try:
                if int(cl) > max_bytes:
                    return JSONResponse(
                        status_code=413,
                        content={
                            "detail": (
                                f"Размер тела запроса превышает лимит "
                                f"{max_bytes // (1024 * 1024)} МБ"
                            )
                        },
                    )
            except ValueError:
                pass
        return await call_next(request)
