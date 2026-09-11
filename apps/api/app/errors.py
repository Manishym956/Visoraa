from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from uuid import uuid4


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def error_body(code: str, message: str, request_id: str) -> dict[str, object]:
    return {"error": {"code": code, "message": message, "requestId": request_id}}


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = request.headers.get("x-request-id") or str(uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", str(uuid4()))
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(exc.code, exc.message, request_id),
    )


async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
    request_id = getattr(request.state, "request_id", str(uuid4()))
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed."
    code = "HTTP_ERROR" if exc.status_code != 404 else "NOT_FOUND"
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(code, detail, request_id),
    )


@dataclass(frozen=True)
class ImageLimits:
    max_bytes: int = 8 * 1024 * 1024
    min_bytes: int = 32
    allowed_types: tuple[str, ...] = (
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "application/octet-stream",
    )
