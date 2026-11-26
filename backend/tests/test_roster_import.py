"""Roster import API contract: one validated file in, one structured report out.

The repository is stubbed here: this file pins the wire contract (envelopes,
codes, camelCase payloads) without a database. Persistence against the real
tables is covered by test_roster_persistence.py; parsing rules by their own
unit tests below.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import create_app
from app.models.employee import Employee
from app.repositories.employee_repository import get_employee_repository
from app.services.roster_import import RosterRowsInvalid, parse_roster_csv
from app.services.roster_mapping import to_employee

FIXTURES = Path(__file__).parent / "fixtures"
ADMIN = "hr.admin@emids.com"


def make_client(stored: list[Employee] | None = None) -> TestClient:
    settings = Settings(
        database_url="postgresql+asyncpg://ignored:ignored@localhost:5432/ignored",
        stub_admin_emails=[ADMIN],
    )
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_employee_repository] = lambda: _StubEmployeeRepository(stored or [])
    return TestClient(app, headers={"X-Stub-User": ADMIN})


class _StubEmployeeRepository:
    def __init__(self, stored: list[Employee]) -> None:
        self._stored = {one.employee_id: one for one in stored}

    async def get_by_email(self, email: str) -> Employee | None:
        # The admin is off-roster: identity resolves from the allow-list.
        return None

    async def get_many_by_email(self, emails: list[str]) -> dict[str, Employee]:
        lowered = {email.lower() for email in emails}
        return {
            email: one
            for one in self._stored.values()
            if one.email.lower() in lowered
            for email in (one.email.lower(),)
        }

    async def insert_many(self, employees: list[Employee]) -> None:
        self._stored |= {one.employee_id: one for one in employees}

    async def update_many(self, updates: list[tuple[str, Employee]]) -> set[str]:
        return {employee.employee_id for _stored_pk, employee in updates}


def upload(client: TestClient, text: str) -> Any:
    return client.post(
        "/api/employees/import",
        files={"file": ("roster.csv", text.encode("utf-8"), "text/csv")},
    )


def valid_roster_text() -> str:
    return (FIXTURES / "roster_valid.csv").read_text(encoding="utf-8")


def parsed_valid_rows() -> list[Any]:
    return parse_roster_csv(valid_roster_text().encode("utf-8-sig")).rows


# --- report shape against a stubbed table -----------------------------------


@pytest.mark.parametrize("path", ["/api/employees/import", "/api/employees/import/apply"])
def test_roster_writes_are_admin_only(path: str) -> None:
    # An anonymous caller must be refused before any body is read: these
    # routes rewrite the whole roster.
    response = make_client().post(path, headers={"X-Stub-User": ""})
    assert response.status_code == 401
    assert response.json()["code"] == "auth_required"


def test_valid_roster_reports_new_rows_no_conflicts() -> None:
    response = upload(make_client(), valid_roster_text())
    assert response.status_code == 200
    report = response.json()
    assert report["importedCount"] == 8
    assert report["duplicatesSkipped"] == 0
    assert report["conflicts"] == []


def test_existing_emails_are_reported_as_conflicts() -> None:
    stored = to_employee(parsed_valid_rows()[0])
    stored.location = "Bengaluru"  # type: ignore[assignment]
    response = upload(make_client([stored]), valid_roster_text())
    assert response.status_code == 200
    report = response.json()
    assert report["importedCount"] == 7
    conflict = report["conflicts"][0]
    assert conflict["email"] == stored.email
    assert conflict["changedFields"] == ["location"]
    assert conflict["existing"]["location"] == "Bengaluru"
    assert conflict["incoming"]["location"] == "India"


def test_employee_id_change_is_reported_as_a_changed_field() -> None:
    stored = to_employee(parsed_valid_rows()[0])
    text = valid_roster_text().replace("EMP-V001", "EMP-V200", 1)
    response = upload(make_client([stored]), text)
    assert response.status_code == 200
    (conflict,) = response.json()["conflicts"]
    assert conflict["changedFields"] == ["employeeId"]
    assert conflict["existing"]["employeeId"] == "EMP-V001"
    assert conflict["incoming"]["employeeId"] == "EMP-V200"


def test_email_match_is_case_insensitive() -> None:
    stored = to_employee(parsed_valid_rows()[0])
    stored.email = stored.email.upper()
    response = upload(make_client([stored]), valid_roster_text())
    report = response.json()
    assert report["importedCount"] == 7
    assert report["conflicts"][0]["email"] == stored.email.lower()


def test_header_rejection_keeps_envelope_and_code() -> None:
    text = valid_roster_text().replace("Employee ID", "EmployeeID", 1)
    response = upload(make_client(), text)
    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "roster_header_invalid"


def test_row_rejection_payload_lists_every_bad_line() -> None:
    text = valid_roster_text()
    lines = text.splitlines()
    lines[4] = lines[4].replace("devika_nair@emids.com,", "")
    broken = "\n".join(lines) + "\n"
    response = upload(make_client(), broken)
    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "roster_rows_invalid"
    errors = body["errors"]
    assert len(errors) == 1
    assert errors[0]["line"] == 5
    assert "email" in errors[0]["message"]


def test_non_utf8_upload_uses_unreadable_code() -> None:
    response = make_client().post(
        "/api/employees/import",
        files={"file": ("roster.csv", "Asha Menon,\xff\xfe".encode("latin-1"), "text/csv")},
    )
    body = json.loads(response.content)
    assert response.status_code == 400
    assert body["code"] == "roster_file_unreadable"


# --- parsing rules (unit level: fields, duplicates, status) -------------------


def test_parsed_rows_mirror_csv_fields() -> None:
    rows = parsed_valid_rows()
    first = rows[0]
    assert first.employee_id == "EMP-V001"
    assert first.name == "Asha Menon"
    assert first.email == "asha_menon@emids.com"
    assert first.designation == "Software Engineer"
    assert first.location == "India"
    assert first.project == "Cigna One"
    assert first.delivery_head == "Arumugam Thiraviam"
    assert first.delivery_manager == "Priya Raghavan"
    assert first.reporting_manager == "Priya Raghavan"
    assert first.org == "Delivery"
    assert first.business_unit == "Payer Digital"
    assert first.business_partner == "John D"
    assert first.status == "Active"


def test_inactive_status_survives_as_inactive() -> None:
    gaurav = next(row for row in parsed_valid_rows() if row.employee_id == "EMP-V007")
    assert gaurav.status == "Inactive"


def test_duplicate_email_inside_file_is_skipped_and_counted() -> None:
    text = valid_roster_text()
    lines = text.splitlines()
    duplicate = lines[1].replace("EMP-V001", "EMP-V099")
    duplicated = "\n".join([*lines, duplicate]) + "\n"
    parsed = parse_roster_csv(duplicated.encode("utf-8-sig"))
    assert len(parsed.rows) == 8
    assert parsed.duplicates_skipped == 1


def test_duplicate_employee_id_inside_file_is_a_row_error() -> None:
    text = valid_roster_text()
    lines = text.splitlines()
    duplicate = lines[1].replace("asha_menon@emids.com", "new_person@emids.com")
    duplicated = "\n".join([*lines, duplicate]) + "\n"
    with pytest.raises(RosterRowsInvalid) as excinfo:
        parse_roster_csv(duplicated.encode("utf-8-sig"))
    assert "EMP-V001" in excinfo.value.payload.errors[0].message  # type: ignore[union-attr]


def test_quoted_field_with_embedded_comma_parses() -> None:
    text = valid_roster_text()
    lines = text.splitlines()
    lines[1] = lines[1].replace("Cigna One", '"Cigna, Account One"')
    quoted = "\n".join(lines) + "\n"
    rows = parse_roster_csv(quoted.encode("utf-8-sig")).rows
    assert rows[0].project == "Cigna, Account One"


def test_bad_status_is_rejected() -> None:
    text = valid_roster_text().replace(",Inactive", ",Contract", 1)
    with pytest.raises(RosterRowsInvalid) as excinfo:
        parse_roster_csv(text.encode("utf-8-sig"))
    assert "status" in excinfo.value.payload.errors[0].message  # type: ignore[union-attr]
