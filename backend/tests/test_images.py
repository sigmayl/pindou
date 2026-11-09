from __future__ import annotations

from pathlib import Path

import pytest

from app.errors import InvalidImageError, PayloadTooLargeError
from app.services.images import ImageLimits, load_rgb_image
from tests.conftest import image_bytes, make_image

WEIGHTS = Path(__file__).resolve().parents[1] / "weights"
requires_weights = pytest.mark.skipif(
    not (WEIGHTS / "160_net_G_A.pth").is_file() or not (WEIGHTS / "alias_net.pth").is_file(),
    reason="pixelization weights not downloaded",
)


def test_load_rejects_garbage(limits: ImageLimits):
    with pytest.raises(InvalidImageError):
        load_rgb_image(b"not an image", limits)


def test_load_rejects_oversized_payload(limits: ImageLimits):
    with pytest.raises(PayloadTooLargeError):
        load_rgb_image(b"x" * 32, ImageLimits(max_bytes=16, max_pixels=100))


def test_load_flattens_transparency_on_white(limits: ImageLimits):
    image = make_image(32, 32).convert("RGBA")
    image.putalpha(0)
    out = load_rgb_image(image_bytes(image), limits)
    assert out.mode == "RGB"
    assert out.getpixel((0, 0)) == (255, 255, 255)


@requires_weights
def test_pixelate_outputs_grid_and_metadata(settings):
    from app.services.pixelization import PixelizationService

    service = PixelizationService(settings.weights_dir, settings.max_pixel_size)
    service.load()
    result = service.pixelate(make_image(320, 240), 8)
    assert result.image.mode == "RGB"
    assert result.image.size == (result.meta.grid_width, result.meta.grid_height)
    assert result.meta.grid_width == 40
    assert result.meta.grid_height == 30

    again = service.pixelate(make_image(320, 240), 8)
    assert list(result.image.getdata()) == list(again.image.getdata())
