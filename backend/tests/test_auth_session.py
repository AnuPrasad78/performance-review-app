"""Session login + identity rules, repository stubbed out.

Pins the wire behavior that matters to the frontend: camelCase identity,
consistent 401 envelopes for unknown/missing identity, case-insensitive
address matching, and the admin allow-list living in settings rather than
the roster.
"""

import pytest
from fastapi.testclient import TestClient

from app.core.auth import role_for_email
from app.core.config import Settings, get_settings
from app.main import create_app
from app.models.employee import Employee
from app.repositories.evaluation_repository import get_evaluation_repository
from app.repositories.employee_repository import get_employee_repository
from app.repositories.review_cycle_repository import get_review_cycle_repository
from app.schemas.employee import ROSTER_ATTRIBUTES


def _settings(stub_admin_emails: list[str] | None = None) -> Settings:
    return Settings(
        database_url="postgresql+asyncpg://ignored:ignored@localhost:5432/ignored",
        stub_admin_emails=stub_admin_emails or [],
    )


def stored_employee(employee_id: str, email: str, name: str) -> Employee:
    # Roster columns are required strings at the wire but nullable in storage;
    # only the queried email drives these tests' behavior.
    employee = Employee(employee_id=employee_id)
    for _schema_field, column in ROSTER_ATTRIBUTES:
        setattr(employee, column, "" if column != "email" else email)
    employee.employee_name = name
    return employee


def make_client(stored: list[Employee], stub_admin_emails: list[str] | None = None) -> TestClient:
    settings = _settings(stub_admin_emails)
    app = create_app(settings)
    # get_settings is the lru_cache accessor the DI layer uses; without this
    # override the test's settings lose to a process-cached .env read.
    app.dependency_overrides[get_settings] = lambda: settings

    class _StubEmployeeRepository:
        def __init__(self, stored: list[Employee]) -> None:
            self._lower = {one.email.lower(): one for one in stored}

        async def get_by_email(self, email: str) -> Employee | None:
            return self._lower.get(email.strip().lower())

    employee_stub = _StubEmployeeRepository(stored)
    app.dependency_overrides[get_employee_repository] = lambda: employee_stub
    app.dependency_overrides[get_evaluation_repository] = lambda: None
    app.dependency_overrides[get_review_cycle_repository] = lambda: None
    return TestClient(app)


@pytest.fixture()
def asha() -> Employee:
    return stored_employee("EMP-V001", "asha_menon@emids.com", "Asha Menon")


def test_login_returns_camel_case_identity_for_a_rostered_email(asha: Employee) -> None:
    client = make_client([asha])
    response = client.post("/api/auth/session", json={"email": "asha_menon@emids.com"})
    assert response.status_code == 200
    assert response.json() == {
        "employeeId": "EMP-V001",
        "name": "Asha Menon",
        "email": "asha_menon@emids.com",
        "role": "employee",
    }


def test_login_matches_the_address_case_insensitively(asha: Employee) -> None:
    client = make_client([asha])
    response = client.post("/api/auth/session", json={"email": "  ASHA_MENON@Emids.com  "})
    assert response.status_code == 200
    assert response.json()["employeeId"] == "EMP-V001"


def test_unknown_email_is_a_401_envelope() -> None:
    client = make_client([])
    response = client.post("/api/auth/session", json={"email": "nobody@emids.com"})
    assert response.status_code == 401
    assert response.json() == {
        "detail": "This address is not on the review roster.",
        "code": "auth_unknown_email",
    }


def test_allowlisted_email_carries_the_admin_role(asha: Employee) -> None:
    asha.email = "boss@emids.com"
    client = make_client([asha], stub_admin_emails=["boss@emids.com"])
    response = client.post("/api/auth/session", json={"email": "BOSS@emids.com"})
    assert response.status_code == 200
    assert response.json()["role"] == "admin"


def test_role_rule_is_case_insensitive_and_configuration_only() -> None:
    settings = _settings(stub_admin_emails=["boss@emids.com"])
    assert role_for_email(" BOSS@EMIDS.COM ", settings) == "admin"
    assert role_for_email("asha_menon@emids.com", settings) == "employee"


def test_missing_identity_header_is_a_401_envelope(asha: Employee) -> None:
    client = make_client([asha])
    response = client.get("/api/evaluations/me", headers={"X-Stub-User": "   "})
    assert response.status_code == 401
    assert response.json()["code"] == "auth_required"


def test_off_roster_admin_still_signs_in() -> None:
    # Admins review the roster, so roster membership cannot gate their access.
    client = make_client([], stub_admin_emails=["console.admin@emids.com"])
    response = client.post("/api/auth/session", json={"email": " Console.Admin@Emids.com "})
    assert response.status_code == 200
    assert response.json() == {
        "employeeId": "",
        "name": "Console Admin",
        "email": "console.admin@emids.com",
        "role": "admin",
    }


def test_employee_endpoints_reject_the_off_roster_admin_identity() -> None:
    # An admin without a roster row has no evaluation to act on; the 403 makes
    # that explicit instead of the service's 500 "vanished row" failure.
    client = make_client([], stub_admin_emails=["console.admin@emids.com"])
    response = client.get(
        "/api/evaluations/me", headers={"X-Stub-User": "console.admin@emids.com"}
    )
    assert response.status_code == 403
    assert response.json()["code"] == "roster_required"


def test_unknown_non_admin_email_is_still_a_401() -> None:
    client = make_client([], stub_admin_emails=["console.admin@emids.com"])
    response = client.post("/api/auth/session", json={"email": "nobody@emids.com"})
    assert response.status_code == 401
    assert response.json()["code"] == "auth_unknown_email"


def _inactive(employee: Employee) -> Employee:
    employee.employment_status = "Inactive"
    return employee


def test_inactive_employee_cannot_sign_in(asha: Employee) -> None:
    client = make_client([_inactive(asha)])
    response = client.post("/api/auth/session", json={"email": "asha_menon@emids.com"})
    assert response.status_code == 403
    assert response.json() == {
        "detail": "Your account is inactive. Contact admin.",
        "code": "employee_inactive",
    }


def test_inactive_status_is_matched_case_insensitively(asha: Employee) -> None:
    asha.employment_status = " inactive "
    client = make_client([asha])
    response = client.post("/api/auth/session", json={"email": "asha_menon@emids.com"})
    assert response.status_code == 403
    assert response.json()["code"] == "employee_inactive"


def test_inactive_employee_is_refused_on_protected_endpoints(asha: Employee) -> None:
    # An identity carried in from before the deactivation stops working too.
    client = make_client([_inactive(asha)])
    response = client.get("/api/evaluations/me", headers={"X-Stub-User": "asha_menon@emids.com"})
    assert response.status_code == 403
    assert response.json()["code"] == "employee_inactive"


@pytest.mark.parametrize("status", ["Active", "", None])
def test_active_or_blank_status_still_signs_in(asha: Employee, status: str | None) -> None:
    asha.employment_status = status
    client = make_client([asha])
    response = client.post("/api/auth/session", json={"email": "asha_menon@emids.com"})
    assert response.status_code == 200
    assert response.json()["employeeId"] == "EMP-V001"


def test_allowlisted_admin_with_an_inactive_roster_row_keeps_console_access(asha: Employee) -> None:
    client = make_client([_inactive(asha)], stub_admin_emails=["asha_menon@emids.com"])
    response = client.post("/api/auth/session", json={"email": "asha_menon@emids.com"})
    assert response.status_code == 200
    assert response.json()["role"] == "admin"
