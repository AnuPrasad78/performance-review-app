"""Application error types and the HTTP error envelope.

The API contract for failures is one consistent shape, per CLAUDE.md:

    {"detail": "<human-readable message>", "code": "<machine-readable id>"}

`code` is what the frontend programs against — "SUBMISSION_DEADLINE_PASSED"
is stable identity; a prose message is decoration that may change. Business
code raises AppError (or subclasses) anywhere in the layers; the framework
wiring below turns that into the envelope, so routers never format errors
by hand.
"""

import json
import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("app.errors")


class AppError(Exception):
    """One business-failure supertype for the app's exception hierarchy.

    `payload` is optional structured data the frontend can render (row-level
    validation errors, for example); plain `{detail, code}` errors omit it.
    """

    status_code: int = 400

    def __init__(
        self,
        detail: str,
        *,
        code: str,
        status_code: int | None = None,
        payload: BaseModel | None = None,
    ):
        super().__init__(detail)
        self.detail = detail
        self.code = code
        self.payload = payload
        if status_code is not None:
            self.status_code = status_code


def envelope_body(exc: AppError) -> dict[str, object]:
    body: dict[str, object] = {"detail": exc.detail, "code": exc.code}
    if exc.payload is not None:
        # Pydantic v2 ships its own JSON encoder; dumping by alias keeps the
        # payload keys on the wire in camelCase like everything the client sees.
        body.update(json.loads(exc.payload.model_dump_json(by_alias=True)))
    return body


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=envelope_body(exc))

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        # Built-in HTTP failures (404 on unknown routes, method rejected, ...)
        # get the same envelope so frontend fixtures never branch on shape.
        detail = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": detail, "code": f"http_{exc.status_code}"},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_: Request, exc: Exception) -> JSONResponse:
        # Last-resort handler: log everything server-side, tell the client
        # nothing actionable but that something failed. Internal details
        # (stack traces, SQL, config) must never reach the response body.
        logger.exception("Unhandled application error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error.", "code": "internal_error"},
        )