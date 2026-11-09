"""FastAPI application factory."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, suppress

import torch
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import __version__
from .api import health, v1
from .config import Settings, get_settings
from .errors import ApiError
from .logging_config import setup_logging
from .middleware import (
    RateLimitMiddleware,
    RequestContextMiddleware,
    UploadSizeMiddleware,
)
from .services.gate import InferenceGate
from .services.pixelization import PixelizationService
from .services.rmbg import RmbgService

LOGGER = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    setup_logging(settings.log_level)
    torch.set_num_threads(settings.pixel_threads)
    # Already configured when a test creates several apps.
    with suppress(RuntimeError):
        torch.set_num_interop_threads(1)

    pixel_service = PixelizationService(
        weights_dir=settings.weights_dir,
        max_pixel_size=settings.max_pixel_size,
    )
    rmbg_service = RmbgService(
        enabled=settings.rmbg_enabled,
        model_id=settings.rmbg_model_id,
        revision=settings.rmbg_revision,
        local_files_only=settings.rmbg_local_files_only,
        hf_token=settings.hf_token,
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        LOGGER.info(
            "Starting %s %s env=%s threads=%d weights=%s",
            settings.app_name,
            __version__,
            settings.environment,
            settings.pixel_threads,
            settings.weights_dir,
        )
        try:
            await asyncio.to_thread(pixel_service.load)
            LOGGER.info("Pixelization model ready")
        except Exception as exc:  # noqa: BLE001 - readiness reports the failure
            LOGGER.exception("Pixelization model failed to load: %s", exc)
        if settings.rmbg_enabled and settings.rmbg_preload:
            try:
                await asyncio.to_thread(rmbg_service.load)
                LOGGER.info("RMBG model ready")
            except Exception as exc:  # noqa: BLE001
                LOGGER.exception("RMBG model failed to load: %s", exc)
        yield
        LOGGER.info("Shutting down")

    app = FastAPI(
        title="Pindou Convert Inference API",
        version=__version__,
        description=(
            "CPU inference for pixel-art generation and background matting. "
            "Color quantization, bead optimization and pattern rendering live in the web client."
        ),
        docs_url="/docs",
        redoc_url=None,
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.version = __version__
    app.state.pixel_service = pixel_service
    app.state.rmbg_service = rmbg_service
    app.state.gate = InferenceGate(
        concurrency=settings.inference_concurrency,
        wait_timeout=settings.inference_wait_timeout,
    )

    if settings.trusted_hosts != ("*",):
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(settings.trusted_hosts))
    app.add_middleware(UploadSizeMiddleware, max_bytes=settings.max_upload_bytes)
    app.add_middleware(
        RateLimitMiddleware,
        rate_per_minute=settings.rate_limit_per_minute,
        burst=settings.rate_limit_burst,
        trust_proxy_headers=settings.trust_proxy_headers,
    )
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    # Added last so CORS headers are present even on middleware-generated errors.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Accept", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )

    app.include_router(health.router)
    app.include_router(v1.router)

    @app.get("/", include_in_schema=False)
    async def root():
        return {
            "name": settings.app_name,
            "version": __version__,
            "docs": "/docs",
            "health": "/healthz",
        }

    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
        headers = {}
        if hasattr(exc, "retry_after"):
            headers["Retry-After"] = str(exc.retry_after)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "invalid_parameter",
                    "message": "请求参数不合法。",
                    "details": [
                        {"loc": list(item.get("loc", [])), "msg": item.get("msg", "")}
                        for item in exc.errors()
                    ],
                }
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": "http_error", "message": str(exc.detail)}},
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
        LOGGER.exception("Unhandled error on %s", request.url.path)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "internal_error",
                    "message": "服务端处理失败，请稍后重试。",
                }
            },
        )

    return app


app = create_app()
