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
from app.schemas.table_query import TableQuery
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
    updated = await repository.update_many([(spawned.employee_id, spawned)])
    assert updated == {spawned.employee_id}

    listing, listing_total = await repository.paged(TableQuery(), 1, 50)
    assert listing_total >= 1
    renamed = next(one for one in listing if one.employee_id == spawned.employee_id)
    assert renamed.employee_name == "Renamed"


@requires_database
async def test_update_moves_employee_id(repository: EmployeeRepository) -> None:
    spawned = _test_employee("Id Mover")
    await repository.insert_many([spawned])

    moved = _test_employee("Id Mover")
    moved.email = spawned.email
    updated = await repository.update_many([(spawned.employee_id, moved)])
    assert updated == {moved.employee_id}
    # The identity map re-keys at commit, so the move is asserted against the
    # table itself: only the row under the new key remains.
    rows = await repository.get_many([spawned.employee_id, moved.employee_id])
    assert rows.keys() == {moved.employee_id}
    assert rows[moved.employee_id].employee_name == "Id Mover"


@requires_database
async def test_composed_search_filter_sort(repository: EmployeeRepository) -> None:
    # Values carry the test prefix so the shared table's real rows can never
    # satisfy the same search or filter.
    engineer = _test_employee("Zoe Alpha")
    engineer.designation = "PRVessel Specialist"
    engineer.org = "PRDelivery"
    manager = _test_employee("Yan Bravo")
    manager.designation = "PRPursuit Manager"
    manager.org = "PRQuality"
    await repository.insert_many([engineer, manager])

    # Search reaches the name and the designation independently.
    by_name, _ = await repository.paged(TableQuery(search="zoe alpha"), 1, 10)
    assert [one.employee_id for one in by_name] == [engineer.employee_id]
    by_designation, _ = await repository.paged(
        TableQuery(search="pursuit manager"), 1, 10
    )
    assert [one.employee_id for one in by_designation] == [manager.employee_id]

    # Dropdown filters compose exactly, and search + filter compose together.
    filtered, _ = await repository.paged(TableQuery(org="PRQuality"), 1, 10)
    assert [one.employee_id for one in filtered] == [manager.employee_id]
    composed, _ = await repository.paged(
        TableQuery(search="pursuit manager", org="PRQuality"), 1, 10
    )
    assert [one.employee_id for one in composed] == [manager.employee_id]

    # Sort overrides the default name order (the shared table holds real rows
    # too, so the assertion is on the test rows' relative order): descending
    # designation puts "PRVessel Specialist" before "PRPursuit Manager".
    sorted_rows, _ = await repository.paged(
        TableQuery(sort_by="designation", sort_order="desc"), 1, 50
    )
    positions = {one.employee_name: index for index, one in enumerate(sorted_rows)}
    assert positions["Zoe Alpha"] < positions["Yan Bravo"]

    # Whole-roster facets include the test rows' values among the field lists.
    facets = await repository.facet_values()
    assert "PRPursuit Manager" in facets.designations
    assert "PRQuality" in facets.orgs


@requires_database
async def test_diff_reports_existing_emails_as_conflicts(
    repository: EmployeeRepository,
) -> None:
    stored = _test_employee("Diff Source")
    await repository.insert_many([stored])

    incoming = fixture_rows()[0].model_copy(
        update={"employee_id": "PRFIX-1", "email": stored.email}
    )
    report = await diff_roster(
        ParsedRoster(rows=[incoming], duplicates_skipped=0), repository
    )
    assert report.imported_count == 0
    assert [conflict.email for conflict in report.conflicts] == [stored.email]
    # The conflict renders by email identity, so the email itself is never a
    # reported change; a moved ID is a value change (see changed_wire_fields),
    # and this fixture does move one.
    assert set(report.conflicts[0].changed_fields) == {"employeeId", "name"}
