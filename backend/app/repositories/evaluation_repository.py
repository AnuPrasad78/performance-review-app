"""Reads and writes for the evaluations table.

The review document's DAL: reads and the partial saves both key on
(employee_id, review_year) — the table's uniqueness contract — plus add() for
the get-or-create first save and the roster-wide year read for the admin
board, mirroring the employees repository's flush-not-commit rule (core/db.py
owns the commit at request end).

Eager loading is unnecessary here: the service joins evaluation rows against
roster rows it already fetched from the employee repository, so the model's
relationships are never traversed and no N+1 exists to suppress.

The email display mirror's maintenance lives here too (sync_emails): the
column is owned by this table, so its only rewrite path is this repository,
not the write path that happened to change the source value.
"""

from collections.abc import AsyncIterator, Sequence
from typing import Annotated

from fastapi import Depends
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models.employee import Employee
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

    async def add(self, evaluation: Evaluation) -> None:
        # Flush so the unique (employee, year) constraint surfaces inside the
        # request instead of at commit time, where it would bypass the
        # error envelope.
        self._session.add(evaluation)
        await self._session.flush()

    async def sync_emails(self, employee_ids: Sequence[str]) -> None:
        """Re-mirror employees.email onto each employee's evaluation rows.

        The roster apply path calls this after rewriting employee rows — an
        email correction or an ID move (evaluations follow the new ID through
        the FK's ON UPDATE CASCADE within the same flush). Keyed on the new
        PKs because the cascade has already run; a correlated scalar subquery
        keeps the whole resync one statement. Flush makes the mirror visible
        to same-request reads.
        """
        if not employee_ids:
            return
        statement = (
            update(Evaluation)
            .where(Evaluation.employee_id.in_(employee_ids))
            .values(
                email=select(func.lower(Employee.email)).where(
                    Employee.employee_id == Evaluation.employee_id
                )
            )
            .execution_options(synchronize_session=False)
        )
        await self._session.execute(statement)
        await self._session.flush()


def get_evaluation_repository(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AsyncIterator[EvaluationRepository]:
    yield EvaluationRepository(session)