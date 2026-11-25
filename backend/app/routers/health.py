"""Liveness and readiness probes — public by design (the platform's probes
carry no identity) and free of anything confidential.

/health (liveness) answers "is the process up and correctly configured?" and
deliberately never touches the database: a database outage must not make the
platform restart healthy replicas in a loop.

/ready (readiness) answers "may this replica take traffic?": the database is
reachable and its schema is not behind this release (services/readiness.py).
Failing it takes the replica out of rotation without restarting it.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.core.migrations import MigrationChain, migration_chain
from app.repositories.schema_version_repository import (
    SchemaVersionRepository,
    get_schema_version_repository,
)
from app.schemas.health import ReadinessOut
from app.services.readiness import check_readiness

router = APIRouter(tags=["health"])


@router.get("/health")
def health(request: Request) -> dict[str, str]:
    settings = request.app.state.settings
    return {
        "status": "ok",
        "app": settings.app_name,
        "environment": settings.environment,
    }


@router.get(
    "/ready",
    response_model=ReadinessOut,
    responses={503: {"description": "Database unreachable or schema behind this release"}},
)
async def ready(
    repository: Annotated[SchemaVersionRepository, Depends(get_schema_version_repository)],
    chain: Annotated[MigrationChain, Depends(migration_chain)],
) -> ReadinessOut:
    return await check_readiness(repository, chain)
