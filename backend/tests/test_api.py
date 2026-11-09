from __future__ import annotations

from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.errors import ModelUnavailableError
from app.main import create_app
from app.services.rmbg import MatteResult

from .conftest import image_bytes, make_image


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


def test_info(client, settings):
    response = client.get("/api/v1/info")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "name",
        "version",
        "environment",
        "max_upload_bytes",
        "max_image_pixels",
        "rmbg_enabled",
        "rmbg_loaded",
    }
    assert body["environment"] == "test"
    assert body["max_upload_bytes"] == settings.max_upload_bytes
    assert body["max_image_pixels"] == settings.max_image_pixels
    assert body["rmbg_enabled"] is False
    assert body["rmbg_loaded"] is False


def test_pixelate_endpoint_removed(client):
    response = client.post(
        "/api/v1/pixelate",
        files={"image": ("a.png", image_bytes(make_image(64, 64)), "image/png")},
    )
    assert response.status_code in {404, 405}


def test_ready_when_rmbg_disabled(client):
    response = client.get("/readyz")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["details"]["rmbg_enabled"] is False
    assert body["details"]["rmbg_loaded"] is False


def test_ready_when_rmbg_lazy(settings):
    app = create_app(replace(settings, rmbg_enabled=True, rmbg_preload=False))
    with TestClient(app) as client:
        response = client.get("/readyz")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["details"]["rmbg_enabled"] is True


def test_not_ready_when_rmbg_preload_fails(settings, monkeypatch):
    app = create_app(replace(settings, rmbg_enabled=True, rmbg_preload=True))
    service = app.state.rmbg_service

    def failing_load():
        service._load_error = "boom"
        raise ModelUnavailableError("unavailable")

    monkeypatch.setattr(service, "load", failing_load)
    with TestClient(app) as client:
        response = client.get("/readyz")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "unavailable"
    assert body["details"] == {"rmbg_enabled": True, "rmbg_loaded": False, "rmbg_error": "boom"}


def test_invalid_upload(client):
    response = client.post(
        "/api/v1/remove-background",
        files={"image": ("bad.png", b"not-an-image", "image/png")},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_image"


def test_rmbg_returns_mask(settings, monkeypatch):
    app = create_app(replace(settings, rmbg_enabled=True))
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
