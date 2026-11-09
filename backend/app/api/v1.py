"""Versioned inference endpoints (background matting only)."""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter, File, Request, UploadFile

from ..config import Settings
from ..schemas import MatteResponse, ServiceInfo
from ..services.images import ImageLimits, load_rgb_image, png_data_uri, read_upload

LOGGER = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["inference"])


def _limits(settings: Settings) -> ImageLimits:
    return ImageLimits(
        max_bytes=settings.max_upload_bytes,
        max_pixels=settings.max_image_pixels,
    )


@router.get("/info", response_model=ServiceInfo)
async def info(request: Request) -> ServiceInfo:
    state = request.app.state
    settings: Settings = state.settings
    return ServiceInfo(
        name=settings.app_name,
        version=state.version,
        environment=settings.environment,
        max_upload_bytes=settings.max_upload_bytes,
        max_image_pixels=settings.max_image_pixels,
        rmbg_enabled=settings.rmbg_enabled,
        rmbg_loaded=state.rmbg_service.loaded,
    )


@router.post("/remove-background", response_model=MatteResponse)
async def remove_background(
    request: Request,
    image: UploadFile = File(..., description="Source image"),
) -> MatteResponse:
    state = request.app.state
    settings: Settings = state.settings
    started = time.perf_counter()
    data = await read_upload(image, _limits(settings))

    def run_pipeline():
        source = load_rgb_image(data, _limits(settings))
        return source, state.rmbg_service.predict(source)

    source, result = await state.gate.run(run_pipeline)
    elapsed = (time.perf_counter() - started) * 1000
    LOGGER.info(
        "rmbg ok src=%dx%d elapsed_ms=%.0f",
        source.width,
        source.height,
        elapsed,
    )
    return MatteResponse(
        mask=png_data_uri(result.mask),
        width=result.mask.width,
        height=result.mask.height,
        elapsed_ms=round(elapsed, 1),
    )
