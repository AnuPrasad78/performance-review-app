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
        self.updated_from: list[str] = []
        self.updated_to: list[str] = []

    async def get_many_by_email(self, emails: list[str]) -> dict[str, Employee]:
        lowered = {email.lower() for email in emails}
        return {
            one.email.lower(): one
            for one in self._stored.values()
            if one.email.lower() in lowered
        }

    async def insert_many(self, employees: list[Employee]) -> None:
        self.inserted = [one.employee_id for one in employees]
        self._stored |= {one.employee_id: one for one in employees}

    async def update_many(self, updates: list[tuple[str, Employee]]) -> set[str]:
        for stored_pk, employee in updates:
            self.updated_from.append(stored_pk)
            self.updated_to.append(employee.employee_id)
            self._stored.pop(stored_pk, None)
            self._stored[employee.employee_id] = employee
        return set(self.updated_to)


class StubEvaluationRepository:
    """Records the sync_emails calls the apply path owes the mirror."""

    def __init__(self) -> None:
        self.synced: list[str] = []

    async def sync_emails(self, employee_ids: list[str]) -> None:
        self.synced = employee_ids


def fixture_rows() -> list[RosterEmployeeOut]:
    fixture = Path(__file__).parent / "fixtures" / "roster_valid.csv"
    return parse_roster_csv(fixture.read_bytes()).rows


async def test_apply_inserts_every_declared_new_row() -> None:
    rows = fixture_rows()
    repository = StubEmployeeRepository()
    report = await apply_roster(
        RosterApplyPayload(inserts=rows[:2], updates=[]), repository, StubEvaluationRepository()
    )
    assert report.imported_count == 2
    assert report.updated_count == 0
    assert repository.inserted == [one.employee_id for one in rows[:2]]
    assert repository.updated_to == []


async def test_apply_updates_chosen_rows_only() -> None:
    rows = fixture_rows()
    repository = StubEmployeeRepository([to_employee(rows[0])])
    report = await apply_roster(
        RosterApplyPayload(inserts=[], updates=[rows[0]]), repository, StubEvaluationRepository()
    )
    assert report.updated_count == 1
    assert repository.updated_from == [rows[0].employee_id]
    assert repository.updated_to == [rows[0].employee_id]


async def test_apply_moves_employee_id_of_updated_row() -> None:
    """An updated row whose CSV employee_id differs from the stored one: the
    stored row is keyed by its email and re-keyed onto the incoming ID."""
    rows = fixture_rows()
    repository = StubEmployeeRepository([to_employee(rows[0])])
    moved = rows[0].model_copy(update={"employee_id": "EMP-Moved"})
    report = await apply_roster(
        RosterApplyPayload(inserts=[], updates=[moved]), repository, StubEvaluationRepository()
    )
    assert report.updated_count == 1
    assert repository.updated_from == [rows[0].employee_id]
    assert repository.updated_to == ["EMP-Moved"]


async def test_apply_resyncs_the_email_mirror_of_updated_rows() -> None:
    # Rewritten rows are exactly the ones whose mirror must re-derive; the
    # resync keys on the written IDs, moved ones included. Inserts need none:
    # a fresh employee cannot own evaluations.
    rows = fixture_rows()
    repository = StubEmployeeRepository([to_employee(rows[0])])
    moved = rows[0].model_copy(update={"employee_id": "EMP-Moved"})
    evaluations = StubEvaluationRepository()
    report = await apply_roster(
        RosterApplyPayload(inserts=rows[1:2], updates=[moved]), repository, evaluations
    )
    assert report.updated_count == 1
    assert evaluations.synced == ["EMP-Moved"]


async def test_apply_refuses_insert_when_email_already_stored() -> None:
    rows = fixture_rows()
    repository = StubEmployeeRepository([to_employee(rows[0])])
    with pytest.raises(AppError) as excinfo:
        await apply_roster(
            RosterApplyPayload(inserts=rows[:1], updates=[]),
            repository,
            StubEvaluationRepository(),
        )
    assert excinfo.value.code == "roster_insert_conflict"
    assert excinfo.value.status_code == 409


async def test_apply_match_is_case_insensitive() -> None:
    rows = fixture_rows()
    stored = to_employee(rows[0])
    stored.email = rows[0].email.upper()
    repository = StubEmployeeRepository([stored])
    report = await apply_roster(
        RosterApplyPayload(inserts=[], updates=[rows[0]]), repository, StubEvaluationRepository()
    )
    assert report.updated_count == 1
    assert repository.updated_to == [stored.employee_id]


async def test_apply_refuses_update_when_email_vanished() -> None:
    rows = fixture_rows()
    repository = StubEmployeeRepository()
    with pytest.raises(AppError) as excinfo:
        await apply_roster(
            RosterApplyPayload(inserts=[], updates=[rows[0]]),
            repository,
            StubEvaluationRepository(),
        )
    assert excinfo.value.code == "roster_update_missing"
    assert excinfo.value.status_code == 409