"""Readiness: may this replica receive traffic right now?

Two conditions, both about the database the replica would serve from:

1. it answers within READINESS_TIMEOUT_SECONDS;
2. its schema is not OLDER than the code. A revision this build knows but
   that is not its head means the migration job has not run yet — serving
   would hit columns that do not exist. A revision this build does NOT know
   is newer than the code (the release's migration already ran while this
   older replica still serves); migrations are written expand-then-contract
   precisely so that state is safe, so it stays ready and only logs.

Liveness (/api/health) never depends on the database: a database outage must
take replicas out of rotation, not restart them in a loop.
"""

import asyncio
import logging

from sqlalchemy.exc import DBAPIError, ProgrammingError, SQLAlchemyError

from app.core.errors import AppError
from app.core.migrations import MigrationChain
from app.repositories.schema_version_repository import SchemaVersionRepository
from app.schemas.health import ReadinessOut

READINESS_TIMEOUT_SECONDS = 3.0

logger = logging.getLogger("app.readiness")


def _not_ready(detail: str, code: str) -> AppError:
    return AppError(detail, code=code, status_code=503)


async def check_readiness(
    repository: SchemaVersionRepository, chain: MigrationChain
) -> ReadinessOut:
    try:
        revision = await asyncio.wait_for(
            repository.current_revision(), timeout=READINESS_TIMEOUT_SECONDS
        )
    except ProgrammingError as missing_table:
        raise _not_ready(
            "The database has never been migrated.", "schema_not_migrated"
        ) from missing_table
    except (TimeoutError, OSError, DBAPIError, SQLAlchemyError) as unreachable:
        logger.warning("Readiness: database unreachable (%s)", type(unreachable).__name__)
        raise _not_ready(
            "The database is unreachable.", "database_unavailable"
        ) from unreachable

    if revision is None:
        raise _not_ready("The database has never been migrated.", "schema_not_migrated")
    if revision != chain.head and revision in chain.known_revisions:
        raise _not_ready(
            f"The database schema ({revision}) is behind this release ({chain.head}); "
            "run the migration job.",
            "schema_behind",
        )
    if revision not in chain.known_revisions:
        logger.warning(
            "Readiness: database schema %s is newer than this release's head %s",
            revision,
            chain.head,
        )
    return ReadinessOut(status="ready", schema_revision=revision, code_revision=chain.head)
