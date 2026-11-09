"""Environment-driven configuration for the inference service."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int, minimum: int | None = None) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc
    if minimum is not None and value < minimum:
        raise RuntimeError(f"{name} must be >= {minimum}")
    return value


def _env_float(name: str, default: float, minimum: float | None = None) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = float(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a number") from exc
    if minimum is not None and value < minimum:
        raise RuntimeError(f"{name} must be >= {minimum}")
    return value


def _env_list(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return tuple(item.strip() for item in raw.split(",") if item.strip())


@dataclass(frozen=True)
class Settings:
    app_name: str = "pindou-convert-inference"
    environment: str = field(default_factory=lambda: os.getenv("APP_ENV", "production"))
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))
    host: str = field(default_factory=lambda: os.getenv("HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: _env_int("PORT", 8000, 1))

    # Model assets -----------------------------------------------------------
    weights_dir: Path = field(
        default_factory=lambda: Path(os.getenv("MODEL_WEIGHTS_DIR", str(BACKEND_ROOT / "weights")))
    )
    pixel_threads: int = field(
        default_factory=lambda: _env_int("PIXEL_THREADS", min(8, os.cpu_count() or 1), 1)
    )
    inference_concurrency: int = field(
        default_factory=lambda: _env_int("INFERENCE_CONCURRENCY", 1, 1)
    )
    inference_wait_timeout: float = field(
        default_factory=lambda: _env_float("INFERENCE_WAIT_TIMEOUT", 120.0, 1.0)
    )
    max_pixel_size: int = field(default_factory=lambda: _env_int("MAX_PIXEL_SIZE", 64, 4))

    # Upload limits ----------------------------------------------------------
    max_upload_bytes: int = field(
        default_factory=lambda: _env_int("MAX_UPLOAD_BYTES", 20 * 1024 * 1024, 1024)
    )
    max_image_pixels: int = field(
        default_factory=lambda: _env_int("MAX_IMAGE_PIXELS", 30_000_000, 256)
    )

    # RMBG-2.0 ---------------------------------------------------------------
    rmbg_enabled: bool = field(default_factory=lambda: _env_bool("RMBG_ENABLED", True))
    rmbg_preload: bool = field(default_factory=lambda: _env_bool("RMBG_PRELOAD", False))
    rmbg_model_id: str = field(
        default_factory=lambda: os.getenv("RMBG_MODEL_ID", "briaai/RMBG-2.0")
    )
    rmbg_revision: str = field(
        default_factory=lambda: os.getenv(
            "RMBG_REVISION", "2fd7b4b0f2393ddb39a267fb62df6c010928a6c6"
        )
    )
    rmbg_local_files_only: bool = field(
        default_factory=lambda: _env_bool("RMBG_LOCAL_FILES_ONLY", False)
    )
    hf_token: str | None = field(default_factory=lambda: os.getenv("HF_TOKEN") or None)

    # HTTP -------------------------------------------------------------------
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: _env_list(
            "CORS_ORIGINS",
            ("http://localhost:5173", "http://127.0.0.1:5173"),
        )
    )
    trusted_hosts: tuple[str, ...] = field(
        default_factory=lambda: _env_list("TRUSTED_HOSTS", ("*",))
    )
    rate_limit_per_minute: int = field(
        default_factory=lambda: _env_int("RATE_LIMIT_PER_MINUTE", 30, 0)
    )
    rate_limit_burst: int = field(default_factory=lambda: _env_int("RATE_LIMIT_BURST", 10, 0))
    trust_proxy_headers: bool = field(
        default_factory=lambda: _env_bool("TRUST_PROXY_HEADERS", False)
    )

    @property
    def pixel_weights(self) -> tuple[Path, Path]:
        return (
            self.weights_dir / "160_net_G_A.pth",
            self.weights_dir / "alias_net.pth",
        )

    def validate(self) -> None:
        if self.max_pixel_size < 4:
            raise RuntimeError("MAX_PIXEL_SIZE must be >= 4")
        if len(self.trusted_hosts) == 0:
            raise RuntimeError("TRUSTED_HOSTS must contain at least one host")


def get_settings() -> Settings:
    settings = Settings()
    settings.validate()
    return settings
