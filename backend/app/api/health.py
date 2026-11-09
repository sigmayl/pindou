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
    """Ready unless RMBG is enabled, preloaded at startup, and failed to load.

    Without preloading the model is fetched lazily on the first matting request,
    so the service is ready as soon as it accepts connections.
    """
    state = request.app.state
    settings = state.settings
    rmbg = state.rmbg_service
    failed = settings.rmbg_enabled and settings.rmbg_preload and not rmbg.loaded
    if failed:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(
        status="unavailable" if failed else "ready",
        details={
            "rmbg_enabled": settings.rmbg_enabled,
            "rmbg_loaded": rmbg.loaded,
            "rmbg_error": rmbg.load_error,
        },
    )
