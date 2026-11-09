"""Typed application errors that map to stable API responses."""
from __future__ import annotations


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


class InvalidImageError(ApiError):
    def __init__(self, message: str) -> None:
        super().__init__(422, "invalid_image", message)


class InvalidParameterError(ApiError):
    def __init__(self, message: str) -> None:
        super().__init__(422, "invalid_parameter", message)


class PayloadTooLargeError(ApiError):
    def __init__(self, message: str) -> None:
        super().__init__(413, "payload_too_large", message)


class ServiceBusyError(ApiError):
    def __init__(self, message: str = "推理服务繁忙，请稍后重试。") -> None:
        super().__init__(503, "service_busy", message)


class ModelUnavailableError(ApiError):
    def __init__(self, message: str) -> None:
        super().__init__(503, "model_unavailable", message)


class RateLimitedError(ApiError):
    def __init__(self, retry_after: int) -> None:
        super().__init__(429, "rate_limited", "请求过于频繁，请稍后重试。")
        self.retry_after = retry_after
