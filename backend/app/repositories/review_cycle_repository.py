"""Reads and writes for the review_cycles table.

"Current cycle" — the one the employee answers into — is the highest
review_year configured, because cycles are created once for a whole year and
never coexist as open for answering; when a later year's cycle is published,
it *is* the current one by construction. Admin settings address a cycle by
its own year and never decide which one employees see.
"""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models.review_cycle import ReviewCycle


class ReviewCycleRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def current(self) -> ReviewCycle | None:
        statement = select(ReviewCycle).order_by(ReviewCycle.review_year.desc()).limit(1)
        return await self._session.scalar(statement)

    async def find_by_year(self, review_year: int) -> ReviewCycle | None:
        statement = select(ReviewCycle).where(ReviewCycle.review_year == review_year)
        return await self._session.scalar(statement)

    async def add(self, cycle: ReviewCycle) -> None:
        self._session.add(cycle)
        await self._session.flush()


def get_review_cycle_repository(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AsyncIterator[ReviewCycleRepository]:
    yield ReviewCycleRepository(session)
