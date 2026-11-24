"""First automated tests — deliberately simple, aimed at behavior.

These fix the shape of the API contract rather than implementation choices:
status codes, envelope keys, and the fact that /api/health never needs a
database. When tests change here, the frontend-facing contract changed —
review accordingly.
"""

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def make_client(settings: Settings | None = None) -> TestClient:
    resolved = settings if settings is not None else Settings(
        database_url="postgresql+asyncpg://ignored:ignored@localhost:5432/ignored"
    )
    return TestClient(create_app(resolved))


def test_health_reports_ok_and_environment() -> None:
    response = make_client().get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["environment"] == "dev"


def test_unknown_route_matches_the_error_envelope() -> None:
    response = make_client().get("/api/does-not-exist")
    assert response.status_code == 404
    body = response.json()
    assert body["detail"] == "Not Found"
    assert body["code"] == "http_404"