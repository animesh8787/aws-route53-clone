"""Domain exceptions mapped to the API's uniform error contract.

Every error body looks like ``{"detail": "<message>", "errors": [{"field", "message"}]}``.
"""
from typing import Any


class AppError(Exception):
    status_code = 400

    def __init__(self, detail: str, errors: list[dict[str, Any]] | None = None):
        super().__init__(detail)
        self.detail = detail
        self.errors = errors or []


class NotFoundError(AppError):
    status_code = 404


class ConflictError(AppError):
    status_code = 409


class ValidationFailure(AppError):
    status_code = 422


class AuthError(AppError):
    status_code = 401


class ProtectedError(AppError):
    status_code = 403


def field_error(field: str, message: str) -> dict[str, str]:
    return {"field": field, "message": message}
