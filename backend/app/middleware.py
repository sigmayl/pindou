"""HTTP middleware: request IDs, security headers, upload pre-checks and rate limits."""
from __future__ import annotations

import logging
import threading
import time
import uuid

from fastapi import Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

LOGGER = logging.getLogger(__name__)


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        request.state.request_id = request_id
        started = time.perf_counter()
        response = await call_next(request)
        elapsed = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
        )
        LOGGER.info(
            "%s %s %s %.0fms request_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            elapsed,
            request_id,
        )
        return response


class UploadSizeMiddleware(BaseHTTPMiddleware):
    """Reject oversized multipart bodies before FastAPI parses them."""

    def __init__(self, app, max_bytes: int) -> None:
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method in {"POST", "PUT", "PATCH"}:
            length = request.headers.get("content-length")
            if length is not None:
                try:
                    size = int(length)
                except ValueError:
                    size = 0
                # Multipart framing adds a small, bounded overhead.
                if size > self.max_bytes + 1024 * 1024:
                    return JSONResponse(
                        status_code=413,
                        content={
                            "error": {
                                "code": "payload_too_large",
                                "message": "上传内容超过大小限制。",
                            }
                        },
                    )
        return await call_next(request)


class TokenBucket:
    def __init__(self, rate_per_minute: int, burst: int) -> None:
        self.rate = rate_per_minute / 60.0
        self.burst = max(1, burst)
        self._lock = threading.Lock()
        self._buckets: dict[str, tuple[float, float]] = {}

    def consume(self, key: str) -> tuple[bool, int]:
        now = time.monotonic()
        with self._lock:
            tokens, updated = self._buckets.get(key, (float(self.burst), now))
            tokens = min(float(self.burst), tokens + (now - updated) * self.rate)
            if tokens < 1.0:
                self._buckets[key] = (tokens, now)
                retry_after = max(1, int((1.0 - tokens) / max(self.rate, 1e-9)))
                self._prune(now)
                return False, retry_after
            self._buckets[key] = (tokens - 1.0, now)
            self._prune(now)
            return True, 0

    def _prune(self, now: float) -> None:
        if len(self._buckets) <= 10_000:
            return
        cutoff = now - 300
        self._buckets = {
            item: value for item, value in self._buckets.items() if value[1] >= cutoff
        }


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        rate_per_minute: int,
        burst: int,
        trust_proxy_headers: bool,
    ) -> None:
        super().__init__(app)
        self.limiter = TokenBucket(rate_per_minute, burst)
        self.enabled = rate_per_minute > 0
        self.trust_proxy_headers = trust_proxy_headers

    def _client_key(self, request: Request) -> str:
        if self.trust_proxy_headers:
            # Our nginx sets X-Real-IP from $remote_addr and overwrites
            # X-Forwarded-For, so neither can be spoofed by the client.
            real_ip = request.headers.get("X-Real-IP")
            if real_ip:
                return real_ip.strip()
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                return forwarded.split(",")[-1].strip()
        return request.client.host if request.client else "unknown"

    async def dispatch(self, request: Request, call_next) -> Response:
        if (
            self.enabled
            and request.method == "POST"
            and request.url.path.startswith("/api/")
        ):
            allowed, retry_after = self.limiter.consume(self._client_key(request))
            if not allowed:
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": {
                            "code": "rate_limited",
                            "message": "请求过于频繁，请稍后重试。",
                        }
                    },
                    headers={"Retry-After": str(retry_after)},
                )
        return await call_next(request)
