from __future__ import annotations

from app.config import Settings


def test_torch_threads_reads_new_variable(monkeypatch):
    monkeypatch.setenv("TORCH_THREADS", "3")
    monkeypatch.setenv("PIXEL_THREADS", "5")
    assert Settings().torch_threads == 3


def test_torch_threads_falls_back_to_legacy_variable(monkeypatch):
    monkeypatch.delenv("TORCH_THREADS", raising=False)
    monkeypatch.setenv("PIXEL_THREADS", "5")
    assert Settings().torch_threads == 5
