"""Reads the schema revision Alembic stamped into the database."""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import column, select, table
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session

_ALEMBIC_VERSION = table("alembic_version", column("version_num"))


class SchemaVersionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def current_revision(self) -> str | None:
        """The stamped revision; None when the table exists but is empty.
        A database Alembic never touched raises (no alembic_version table)."""
        return await self._session.scalar(select(_ALEMBIC_VERSION.c.version_num))


def get_schema_version_repository(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AsyncIterator[SchemaVersionRepository]:
    yield SchemaVersionRepository(session)
