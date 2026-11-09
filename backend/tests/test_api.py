from __future__ import annotations

import base64
import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import create_app
from app.services.rmbg import MatteResult

from .conftest import image_bytes, make_image

WEIGHTS = Path(__file__).resolve().parents[1] / "weights"
requires_weights = pytest.mark.skipif(
    not (WEIGHTS / "160_net_G_A.pth").is_file() or not (WEIGHTS / "alias_net.pth").is_file(),
    reason="pixelization weights not downloaded",
)


@pytest.fixture()
def client(settings):
    app = create_app(settings)
    with TestClient(app) as test_client:
        yield test_client


def test_health(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.headers["X-Request-ID"]


def test_info(client):
    response = client.get("/api/v1/info")
    assert response.status_code == 200
    body = response.json()
    assert body["rmbg_enabled"] is False
    assert 4 in body["pixel_sizes"]


def test_invalid_upload(client):
    response = client.post(
        "/api/v1/pixelate",
        files={"image": ("bad.png", b"not-an-image", "image/png")},
        data={"pixel_size": "8"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_image"


def test_pixel_size_validation(client):
    response = client.post(
        "/api/v1/pixelate",
        files={"image": ("a.png", image_bytes(make_image(64, 64)), "image/png")},
        data={"pixel_size": "3"},
    )
    assert response.status_code == 422


def test_rmbg_returns_mask(settings, monkeypatch):
    settings = settings.__class__(**{**settings.__dict__, "rmbg_enabled": True})
    app = create_app(settings)
    with TestClient(app) as client:
        mask = Image.new("L", (1024, 1024), 128)
        monkeypatch.setattr(
            app.state.rmbg_service,
            "predict",
            lambda image: MatteResult(mask=mask),
        )
        response = client.post(
            "/api/v1/remove-background",
            files={"image": ("a.png", image_bytes(make_image(64, 64)), "image/png")},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["width"] == 1024
        assert body["mask"].startswith("data:image/png;base64,")


def test_rmbg_disabled(client):
    response = client.post(
        "/api/v1/remove-background",
        files={"image": ("a.png", image_bytes(make_image(64, 64)), "image/png")},
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "model_unavailable"


@requires_weights
def test_pixelate_endpoint(client):
    response = client.post(
        "/api/v1/pixelate",
        files={"image": ("a.png", image_bytes(make_image(320, 240)), "image/png")},
        data={"pixel_size": "8"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["meta"]["grid_width"] == 40
    assert body["meta"]["grid_height"] == 30
    assert body["image"].startswith("data:image/png;base64,")
    raw = base64.b64decode(body["image"].split(",", 1)[1])
    with Image.open(io.BytesIO(raw)) as decoded:
        assert decoded.size == (40, 30)
