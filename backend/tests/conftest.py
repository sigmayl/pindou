from __future__ import annotations

import io
from pathlib import Path

import pytest
from PIL import Image

from app.config import Settings
from app.services.images import ImageLimits


def make_image(width: int = 320, height: int = 240) -> Image.Image:
    image = Image.new("RGB", (width, height), "white")
    for x in range(width):
        for y in range(height):
            image.putpixel((x, y), ((x * 7) % 256, (y * 11) % 256, ((x + y) * 3) % 256))
    return image


def image_bytes(image: Image.Image, fmt: str = "PNG") -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return buffer.getvalue()


@pytest.fixture()
def settings(tmp_path: Path) -> Settings:
    return Settings(
        weights_dir=Path(__file__).resolve().parents[1] / "weights",
        rmbg_enabled=False,
        rate_limit_per_minute=0,
        pixel_threads=2,
        environment="test",
    )


@pytest.fixture()
def limits() -> ImageLimits:
    return ImageLimits(max_bytes=20 * 1024 * 1024, max_pixels=30_000_000)
