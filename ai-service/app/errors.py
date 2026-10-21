"""Domain exceptions mapped to consistent JSON error responses."""

from __future__ import annotations


class ServiceError(Exception):
    """Base class: carries an HTTP status, a stable machine code and a safe message."""

    status_code: int = 400
    code: str = "BAD_REQUEST"

    def __init__(self, message: str, *, code: str | None = None, status_code: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code


class InvalidDocumentError(ServiceError):
    status_code = 422
    code = "INVALID_DOCUMENT"


class UnsupportedDocumentError(ServiceError):
    status_code = 415
    code = "UNSUPPORTED_DOCUMENT"


class DocumentTooLargeError(ServiceError):
    status_code = 413
    code = "DOCUMENT_TOO_LARGE"


class InvalidInputError(ServiceError):
    status_code = 422
    code = "INVALID_INPUT"


class ModelUnavailableError(ServiceError):
    status_code = 503
    code = "MODEL_UNAVAILABLE"


class InferenceTimeoutError(ServiceError):
    status_code = 504
    code = "INFERENCE_TIMEOUT"


class InferenceError(ServiceError):
    status_code = 500
    code = "INFERENCE_FAILED"
