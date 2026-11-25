"""Liveness and configuration introspection.

Deliberately no database probing: this endpoint answers "is the process up
and correctly configured?". A readiness check that exercises the database
will be a separate route later — liveness and readiness fail differently and
observability reacts to them differently.
"""

from fastapi import APIRouter, Request

router = APIRouter(tags=["health"])


@router.get("/health")
def health(request: Request) -> dict[str, str]:
    settings = request.app.state.settings
    return {
        "status": "ok",
        "app": settings.app_name,
        "environment": settings.environment,
    }