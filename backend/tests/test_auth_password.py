"""The provision-password regime of the email/password sign-in form.

Pins what turning the shared password on must change: the form checks it
without revealing roster membership, a correct pair earns the session
cookie, and the stub header stops being an identity anywhere.
"""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.main import create_app
from app.models.employee import Employee
from app.repositories.employee_repository import get_employee_repository
from app.repositories.evaluation_repository import get_evaluation_repository
from app.repositories.review_cycle_repository import get_review_cycle_repository
from app.schemas.employee import ROSTER_ATTRIBUTES

PROVISION_PASSWORD = "Unit-Test-Provision-Password"
SESSION_SECRET = "unit-test-session-secret"
ADMIN = "console.admin@emids.com"


def _settings(**overrides: object) -> Settings:
    base: dict[str, object] = {
        "database_url": "postgresql+asyncpg://ignored:ignored@localhost:5432/ignored",
        "stub_admin_emails": [ADMIN],
        "provision_password": PROVISION_PASSWORD,
        "session_secret": SESSION_SECRET,
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def _employee(employee_id: str, email: str, name: str) -> Employee:
    employee = Employee(employee_id=employee_id)
    for _schema_field, column in ROSTER_ATTRIBUTES:
        setattr(employee, column, "" if column != "email" else email)
    employee.employee_name = name
    return employee


def make_client(settings: Settings) -> TestClient:
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    asha = _employee("EMP-V001", "asha_menon@emids.com", "Asha Menon")

    class _StubEmployeeRepository:
        async def get_by_email(self, email: str) -> Employee | None:
            return asha if email.strip().lower() == asha.email else None

    employee_stub = _StubEmployeeRepository()
    app.dependency_overrides[get_employee_repository] = lambda: employee_stub
    app.dependency_overrides[get_evaluation_repository] = lambda: None
    app.dependency_overrides[get_review_cycle_repository] = lambda: None
    return TestClient(app)


def test_correct_password_signs_in_and_sets_the_session_cookie() -> None:
    client = make_client(_settings())
    response = client.post(
        "/api/auth/session",
        json={"email": "asha_menon@emids.com", "password": PROVISION_PASSWORD},
    )
    assert response.status_code == 200
    assert response.json()["employeeId"] == "EMP-V001"
    assert "pr_session" in response.cookies

    adopted = client.get("/api/auth/session")
    assert adopted.status_code == 200
    assert adopted.json()["email"] == "asha_menon@emids.com"


def test_off_roster_admin_signs_in_with_the_password() -> None:
    client = make_client(_settings())
    response = client.post("/api/auth/session", json={"email": ADMIN, "password": PROVISION_PASSWORD})
    assert response.status_code == 200
    assert response.json()["role"] == "admin"


@pytest.mark.parametrize("password", ["", "wrong", PROVISION_PASSWORD.lower()])
def test_wrong_password_is_a_generic_401_without_a_cookie(password: str) -> None:
    client = make_client(_settings())
    response = client.post(
        "/api/auth/session", json={"email": "asha_menon@emids.com", "password": password}
    )
    assert response.status_code == 401
    assert response.json()["code"] == "auth_invalid_credentials"
    assert "pr_session" not in response.cookies


def test_wrong_password_does_not_reveal_whether_the_address_is_on_the_roster() -> None:
    client = make_client(_settings())
    on_roster = client.post(
        "/api/auth/session", json={"email": "asha_menon@emids.com", "password": "wrong"}
    )
    off_roster = client.post("/api/auth/session", json={"email": "nobody@emids.com", "password": "wrong"})
    assert on_roster.json() == off_roster.json()


def test_stub_header_is_not_an_identity_once_a_password_is_configured() -> None:
    client = make_client(_settings())
    response = client.get("/api/evaluations/me", headers={"X-Stub-User": "asha_menon@emids.com"})
    assert response.status_code == 401
    assert response.json()["code"] == "auth_required"


def test_dev_without_a_password_keeps_the_email_only_form() -> None:
    client = make_client(_settings(provision_password=""))
    response = client.post("/api/auth/session", json={"email": "asha_menon@emids.com"})
    assert response.status_code == 200
    assert "pr_session" not in response.cookies


def test_prod_without_a_password_closes_the_form() -> None:
    settings = _settings(
        provision_password="",
        environment="prod",
        entra_tenant_id="t",
        entra_client_id="c",
        entra_client_secret="s",
        sso_redirect_uri="https://example.test/api/auth/sso/callback",
    )
    client = make_client(settings)
    response = client.post("/api/auth/session", json={"email": "asha_menon@emids.com"})
    assert response.status_code == 401
    assert response.json()["code"] == "auth_sso_required"


def test_password_without_a_session_key_refuses_to_boot() -> None:
    with pytest.raises(ValidationError, match="PR_SESSION_SECRET"):
        _settings(session_secret="")
