"""API request and response models."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody


class PixelateResponse(BaseModel):
    image: str = Field(description="Base64 PNG data URI of the raw pixel grid")
    meta: dict[str, int]
    elapsed_ms: float


class MatteResponse(BaseModel):
    mask: str = Field(description="Base64 PNG data URI of the 1024x1024 matte")
    width: int
    height: int
    elapsed_ms: float


class ServiceInfo(BaseModel):
    name: str
    version: str
    environment: str
    pixel_sizes: list[int]
    max_upload_bytes: int
    max_image_pixels: int
    rmbg_enabled: bool
    rmbg_loaded: bool
    pixel_model_loaded: bool


class HealthResponse(BaseModel):
    status: str
    details: dict[str, Any] | None = None
