from __future__ import annotations

from PIL import Image

from app.services.pixelization import geometry


def test_geometry_matches_upstream_for_1024_image():
    image = Image.new("RGB", (1024, 768))
    meta = geometry(image, 4)
    assert (meta.grid_width, meta.grid_height) == (256, 192)
    assert (meta.crop_width, meta.crop_height) == (1024, 768)

    meta = geometry(image, 6)
    # 1024 * 4 // 6 = 682 -> round(682 / 4) = 170
    assert (meta.resized_width, meta.resized_height) == (682, 512)
    assert (meta.grid_width, meta.grid_height) == (170, 128)
    assert (meta.crop_width, meta.crop_height) == (680, 512)
    assert (meta.crop_left, meta.crop_top) == (1, 0)


def test_geometry_uses_half_even_rounding():
    image = Image.new("RGB", (100, 100))
    # 100 * 4 // 8 = 50 -> round(50 / 4) = round(12.5) = 12 (banker's rounding)
    meta = geometry(image, 8)
    assert meta.grid_width == 12
    assert meta.grid_height == 12
    assert meta.crop_width == 48


def test_geometry_allows_padded_crop():
    image = Image.new("RGB", (225, 428))
    # 225*4//8=112, 428*4//8=214, round(214/4)=54 -> 216, so PIL pads one row.
    meta = geometry(image, 8)
    assert (meta.resized_width, meta.resized_height) == (112, 214)
    assert (meta.grid_width, meta.grid_height) == (28, 54)
    assert (meta.crop_width, meta.crop_height) == (112, 216)
    assert meta.crop_top == -1


def test_geometry_rejects_tiny_images():
    import pytest

    from app.errors import InvalidParameterError

    image = Image.new("RGB", (20, 20))
    with pytest.raises(InvalidParameterError):
        geometry(image, 64)
