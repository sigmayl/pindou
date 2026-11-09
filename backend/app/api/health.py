"""Liveness and readiness probes."""
from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from ..schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/readyz", response_model=HealthResponse)
async def readyz(request: Request, response: Response) -> HealthResponse:
    state = request.app.state
    ready = state.pixel_service.loaded
    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(
        status="ready" if ready else "starting",
        details={
            "pixel_model_loaded": state.pixel_service.loaded,
            "pixel_model_error": state.pixel_service.load_error,
            "rmbg_enabled": state.settings.rmbg_enabled,
            "rmbg_loaded": state.rmbg_service.loaded,
        },
    )
