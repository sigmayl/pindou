"""A small blocking semaphore used to keep CPU inference predictable."""
from __future__ import annotations

import asyncio
import threading
from collections.abc import Callable
from typing import TypeVar

from ..errors import ServiceBusyError

T = TypeVar("T")


class InferenceGate:
    """Limit concurrent CPU inference jobs and fail fast when the queue is full.

    Torch releases the GIL for most kernels, but running several CPU inference
    jobs at once only increases latency.  A blocking semaphore in a worker
    thread keeps the event loop free while one request runs.
    """

    def __init__(self, concurrency: int, wait_timeout: float) -> None:
        self._semaphore = threading.BoundedSemaphore(concurrency)
        self._wait_timeout = wait_timeout

    async def run(self, func: Callable[..., T], *args, **kwargs) -> T:
        acquired = await asyncio.to_thread(self._semaphore.acquire, True, self._wait_timeout)
        if not acquired:
            raise ServiceBusyError()
        try:
            return await asyncio.to_thread(func, *args, **kwargs)
        finally:
            self._semaphore.release()
