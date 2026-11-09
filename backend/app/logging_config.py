"""Minimal structured-ish logging setup."""
from __future__ import annotations

import logging
import sys


def setup_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    # These libraries are noisy at INFO level.
    for noisy in ("httpx", "urllib3", "huggingface_hub", "transformers"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
