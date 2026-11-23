"""Apply contract with a stubbed repository: what reaches the database and
when the reviewed decision is refused. Real-table round-trips live in
test_roster_persistence.py."""

from pathlib import Path

import pytest

from app.core.errors import AppError
from app.models.employee import Employee
from app.schemas.employee import RosterEmployeeOut, RosterApplyPayload
from app.services.roster_apply import apply_roster
from app.services.roster_import import parse_roster_csv
from app.services.roster_mapping import to_employee


class StubEmployeeRepository:
    def __init__(self, stored: list[Employee] | None = None) -> None:
        self._stored = {one.employee_id: one for one in stored or []}
        self.inserted: list[str] = []
        self.updated: list[str] = []

    async def get_many(self, employee_ids: list[str]) -> dict[str, Employee]:
        return {key: self._stored[key] for key in employee_ids if key in self._stored}

    async def insert_many(self, employees: list[Employee]) -> None:
        self.inserted = [one.employee_id for one in employees]
        self._stored |= {one.employee_id: one for one in employees}

    async def update_many(self, employees: list[Employee]) -> set[str]:
        self.updated = [one.employee_id for one in employees]
        return {one.employee_id for one in employees}


def fixture_rows() -> list[RosterEmployeeOut]:
    fixture = Path(__file__).parent / "fixtures" / "roster_valid.csv"
    return parse_roster_csv(fixture.read_bytes()).rows


async def test_apply_inserts_every_declared_new_row() -> None:
    rows = fixture_rows()
    repository = StubEmployeeRepository()
    report = await apply_roster(
        RosterApplyPayload(inserts=rows[:2], updates=[]), repository
    )
    assert report.imported_count == 2
    assert report.updated_count == 0
    assert repository.inserted == [one.employee_id for one in rows[:2]]
    assert repository.updated == []


async def test_apply_updates_chosen_rows_only() -> None:
    rows = fixture_rows()
    repository = StubEmployeeRepository([to_employee(rows[0])])
    report = await apply_roster(
        RosterApplyPayload(inserts=[], updates=[rows[0]]), repository
    )
    assert report.updated_count == 1
    assert repository.updated == [rows[0].employee_id]


async def test_apply_refuses_insert_when_id_already_stored() -> None:
    rows = fixture_rows()
    repository = StubEmployeeRepository([to_employee(rows[0])])
    with pytest.raises(AppError) as excinfo:
        await apply_roster(RosterApplyPayload(inserts=rows[:1], updates=[]), repository)
    assert excinfo.value.code == "roster_insert_conflict"
    assert excinfo.value.status_code == 409


async def test_apply_refuses_update_when_id_vanished() -> None:
    rows = fixture_rows()
    repository = StubEmployeeRepository()
    with pytest.raises(AppError) as excinfo:
        await apply_roster(RosterApplyPayload(inserts=[], updates=[rows[0]]), repository)
    assert excinfo.value.code == "roster_update_missing"
    assert excinfo.value.status_code == 409
