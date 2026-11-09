from __future__ import annotations

import pytest

from app.errors import InvalidImageError, PayloadTooLargeError
from app.services.images import ImageLimits, load_rgb_image
from tests.conftest import image_bytes, make_image


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
