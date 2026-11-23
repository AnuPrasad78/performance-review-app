"""Reads and writes for the employees table.

Owed by the DAL contract: every query the app runs against employees lives
here; services describe *what* should happen, not how rows are fetched. The
session commits at request end (core/db.py), so flushes — not commits — keep
query results and constraint checks visible within the unit of work.
"""

from collections.abc import AsyncIterator, Sequence
from typing import Annotated

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models.employee import Employee
from app.schemas.employee import ROSTER_ATTRIBUTES


class EmployeeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_many(self, employee_ids: Sequence[str]) -> dict[str, Employee]:
        statement = select(Employee).where(Employee.employee_id.in_(employee_ids))
        rows = await self._session.scalars(statement)
        return {row.employee_id: row for row in rows}

    async def list_all(self) -> list[Employee]:
        result = await self._session.scalars(
            select(Employee).order_by(Employee.employee_name, Employee.employee_id)
        )
        return list(result)

    async def insert_many(self, employees: list[Employee]) -> None:
        # Flush so key/e-mail collisions surface inside the request instead of
        # at commit time, where they would bypass the error envelope.
        self._session.add_all(employees)
        await self._session.flush()

    async def update_many(self, employees: list[Employee]) -> set[str]:
        """Overwrite the stored row of each employee's PK with the fields its
        instance carries, returning the PKs that were actually updated."""
        updated: set[str] = set()
        for employee in employees:
            stored = await self._session.get(Employee, employee.employee_id)
            if stored is None:
                continue
            for _schema_field, column in ROSTER_ATTRIBUTES:
                setattr(stored, column, getattr(employee, column))
            updated.add(employee.employee_id)
        await self._session.flush()
        return updated


def get_employee_repository(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AsyncIterator[EmployeeRepository]:
    yield EmployeeRepository(session)
