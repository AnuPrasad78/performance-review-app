"""Persistence round-trip against the real database.

Runs only when PR_DATABASE_URL is resolvable (the developer .env or CI);
each test writes rows with a dedicated test-prefix employee_id and removes
them again, so the shared table is left untouched regardless of outcome.
"""

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings
from app.models.employee import Employee
from app.repositories.employee_repository import EmployeeRepository
from app.services.roster_diff import diff_roster
from app.services.roster_import import ParsedRoster
from app.services.roster_mapping import to_employee
from tests.test_roster_apply import fixture_rows

_TEST_PREFIX = "PRTEST-"


def _configured_database_url() -> str | None:
    try:
        return Settings().database_url
    except Exception:  # noqa: BLE001 — settings validation failure means no DB
        return None


requires_database = pytest.mark.skipif(
    _configured_database_url() is None, reason="no database configured"
)


@pytest.fixture()
async def repository() -> AsyncIterator[EmployeeRepository]:
    settings = Settings()
    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        try:
            yield EmployeeRepository(session)
            await session.commit()
        finally:
            await session.rollback()
            await session.execute(
                delete(Employee).where(Employee.employee_id.startswith(_TEST_PREFIX))
            )
            await session.commit()
    await engine.dispose()


def _test_employee(name: str) -> Employee:
    employee = to_employee(fixture_rows()[0])
    employee.employee_id = _TEST_PREFIX + str(uuid.uuid4())[:8]
    employee.email = f"{_TEST_PREFIX}{name.lower()}@example.test"
    employee.employee_name = name
    return employee


@requires_database
async def test_insert_get_update_list_round_trip(
    repository: EmployeeRepository,
) -> None:
    spawned = _test_employee("Round Trip")
    await repository.insert_many([spawned])
    fetched = await repository.get_many([spawned.employee_id])
    assert fetched[spawned.employee_id].employee_name == "Round Trip"

    spawned.employee_name = "Renamed"
    updated = await repository.update_many([spawned])
    assert updated == {spawned.employee_id}

    listing = await repository.list_all()
    renamed = next(one for one in listing if one.employee_id == spawned.employee_id)
    assert renamed.employee_name == "Renamed"


@requires_database
async def test_diff_reports_existing_ids_as_conflicts(
    repository: EmployeeRepository,
) -> None:
    stored = _test_employee("Diff Source")
    await repository.insert_many([stored])

    incoming = fixture_rows()[0].model_copy(update={"employee_id": stored.employee_id})
    report = await diff_roster(
        ParsedRoster(rows=[incoming], duplicates_skipped=0), repository
    )
    assert report.imported_count == 0
    assert [conflict.employee_id for conflict in report.conflicts] == [stored.employee_id]
    assert set(report.conflicts[0].changed_fields) >= {"email", "name"}
