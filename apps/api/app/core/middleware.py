"""Security middleware: HTTP headers, request body size guard, cookie CSRF."""

from __future__ import annotations

import hmac
import secrets
from urllib.parse import urlparse

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import get_settings

_CSRF_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "TRACE"})
_CSRF_EXEMPT_PREFIXES = (
    "/health",
    "/ready",
    "/metrics",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/internal/",
    "/auth/login",
    "/auth/register",
    "/auth/forgot-password",
    "/auth/sso/",
)


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
        # Cookie mode: SameSite=Lax + double-submit CSRF (BFF + CookieCsrfMiddleware).
        # Cache-Control for API JSON responses.
        if request.url.path.startswith("/") and "Cache-Control" not in response.headers:
            if request.url.path not in (
                "/health",
                "/ready",
                "/metrics",
                "/docs",
                "/openapi.json",
                "/redoc",
            ):
                response.headers.setdefault("Cache-Control", "no-store")
        return response


class CookieCsrfMiddleware(BaseHTTPMiddleware):
    """Double-submit CSRF for cookie-session mutating requests (no Bearer/API key).

    When ``VBX_AUTH_COOKIES``/prod profile enables cookies and the request carries
    an access cookie without Authorization / X-API-Key, require matching
    ``vbx_csrf`` cookie + ``X-CSRF-Token`` header. Optionally check Origin/Referer
    against CORS / public URL allowlist.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        settings = get_settings()
        if not settings.auth_cookies_effective():
            return await call_next(request)
        if request.method.upper() in _CSRF_SAFE_METHODS:
            return await call_next(request)
        path = request.url.path or "/"
        if any(path == p or path.startswith(p) for p in _CSRF_EXEMPT_PREFIXES):
            return await call_next(request)
        # Bearer / API-key clients are not cookie-CSRF surfaces
        auth = request.headers.get("authorization") or ""
        if auth.lower().startswith("bearer ") or request.headers.get("x-api-key"):
            return await call_next(request)
        access = request.cookies.get(settings.vbx_access_cookie)
        refresh = request.cookies.get(settings.vbx_refresh_cookie)
        if not access and not refresh:
            return await call_next(request)

        cookie = request.cookies.get("vbx_csrf") or ""
        header = request.headers.get("x-csrf-token") or ""
        if not cookie or not header or not hmac.compare_digest(cookie, header):
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token missing or invalid"},
            )
        if not _origin_allowed(request, settings):
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF origin not allowed"},
            )
        return await call_next(request)


def _origin_allowed(request: Request, settings) -> bool:  # noqa: ANN001
    """Accept missing Origin (same-site navigations / curl) or allowlisted Origin/Referer."""
    origin = (request.headers.get("origin") or "").strip()
    referer = (request.headers.get("referer") or "").strip()
    if not origin and not referer:
        return True
    allowed: set[str] = set(settings.cors_origins_list or [])
    public = (settings.vbx_public_url or "").strip().rstrip("/")
    if public:
        allowed.add(public)
    candidates = []
    if origin:
        candidates.append(origin.rstrip("/"))
    if referer:
        try:
            p = urlparse(referer)
            if p.scheme and p.netloc:
                candidates.append(f"{p.scheme}://{p.netloc}".rstrip("/"))
        except Exception:
            pass
    if not candidates:
        return True
    if not allowed:
        return True
    return any(c in allowed for c in candidates)


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


def issue_csrf_token() -> str:
    return secrets.token_hex(24)
