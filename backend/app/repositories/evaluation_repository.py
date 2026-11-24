"""Reads and writes for the evaluations table.

The review document's DAL: reads and the partial saves both key on
(employee_id, review_year) — the table's uniqueness contract — plus add() for
the get-or-create first save and the roster-wide year read for the admin
board, mirroring the employees repository's flush-not-commit rule (core/db.py
owns the commit at request end).

Eager loading is unnecessary here: the service joins evaluation rows against
roster rows it already fetched from the employee repository, so the model's
relationships are never traversed and no N+1 exists to suppress.
"""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models.evaluation import Evaluation


class EvaluationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_for_employee(
        self, employee_id: str, review_year: int
    ) -> Evaluation | None:
        statement = select(Evaluation).where(
            Evaluation.employee_id == employee_id,
            Evaluation.review_year == review_year,
        )
        return await self._session.scalar(statement)

    async def list_by_year(self, review_year: int) -> dict[str, Evaluation]:
        result = await self._session.scalars(
            select(Evaluation).where(Evaluation.review_year == review_year)
        )
        return {row.employee_id: row for row in result}

    async def add(self, evaluation: Evaluation) -> None:
        # Flush so the unique (employee, year) constraint surfaces inside the
        # request instead of at commit time, where it would bypass the
        # error envelope.
        self._session.add(evaluation)
        await self._session.flush()


def get_evaluation_repository(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AsyncIterator[EvaluationRepository]:
    yield EvaluationRepository(session)
