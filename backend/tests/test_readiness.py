"""Readiness probe contract (repository stubbed; the real-database path is
covered in test_migrations.py)."""

from fastapi.testclient import TestClient
from sqlalchemy.exc import ProgrammingError

from app.core.config import Settings
from app.core.migrations import MigrationChain, migration_chain
from app.main import create_app
from app.repositories.schema_version_repository import get_schema_version_repository

DATABASE_URL = "postgresql+asyncpg://ignored:ignored@localhost:5432/ignored"
CHAIN = MigrationChain(head="rev_b", known_revisions=frozenset({"rev_a", "rev_b"}))


class StubSchemaVersions:
    def __init__(self, revision: str | None = None, error: Exception | None = None) -> None:
        self._revision = revision
        self._error = error

    async def current_revision(self) -> str | None:
        if self._error is not None:
            raise self._error
        return self._revision


def client_for(stub: StubSchemaVersions) -> TestClient:
    app = create_app(Settings(database_url=DATABASE_URL))
    app.dependency_overrides[get_schema_version_repository] = lambda: stub
    app.dependency_overrides[migration_chain] = lambda: CHAIN
    return TestClient(app)


def test_ready_when_schema_is_at_head() -> None:
    response = client_for(StubSchemaVersions("rev_b")).get("/api/ready")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "schemaRevision": "rev_b",
        "codeRevision": "rev_b",
    }


def test_not_ready_when_schema_is_behind_the_release() -> None:
    response = client_for(StubSchemaVersions("rev_a")).get("/api/ready")
    assert response.status_code == 503
    assert response.json()["code"] == "schema_behind"


def test_ready_when_schema_is_ahead_of_an_older_replica() -> None:
    response = client_for(StubSchemaVersions("rev_c_from_next_release")).get("/api/ready")
    assert response.status_code == 200


def test_not_ready_when_never_migrated() -> None:
    response = client_for(StubSchemaVersions(None)).get("/api/ready")
    assert response.status_code == 503
    assert response.json()["code"] == "schema_not_migrated"


def test_not_ready_when_alembic_table_is_missing() -> None:
    missing = ProgrammingError("SELECT", {}, Exception("relation does not exist"))
    response = client_for(StubSchemaVersions(error=missing)).get("/api/ready")
    assert response.status_code == 503
    assert response.json()["code"] == "schema_not_migrated"


def test_not_ready_when_database_is_unreachable() -> None:
    response = client_for(StubSchemaVersions(error=OSError("refused"))).get("/api/ready")
    assert response.status_code == 503
    assert response.json()["code"] == "database_unavailable"

