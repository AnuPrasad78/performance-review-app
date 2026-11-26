"""GET /api/evaluations/export/status — the review board's CSV export: the
whole matched set (no paging), the roster columns plus Form Status and
Submitted Date, honoring the composed search/filter/sort the board runs.
Repositories are stubbed through the shared board fixtures."""

import datetime

from tests.evaluation_fixtures import (
    IDENTITY,
    evaluation,
    make_board_client,
    roster_employee,
)

ASHA_EMAIL = "asha_menon@emids.com"

EXPECTED_HEADER = (
    "﻿Employee Name,Employee ID,Email,Designation,Location,Org,Business Unit,"
    "Current Account / Project,Delivery Head,Delivery Manager,Business Partner,"
    "Reporting Manager,Status,Date of Joining,Form Status,Submitted Date"
)


def export(client: object, **params: str) -> object:
    return client.get("/api/evaluations/export/status", params=params, headers=IDENTITY)


def csv_lines(response: object) -> list[str]:
    return [line for line in response.content.decode("utf-8").split("\r\n") if line]


def _board() -> object:
    """Four roster rows spanning the lifecycle: Bilal mid self-eval, Devika
    stored not-started, Cara signed and in the manager phase, and Asha with
    no evaluation row at all."""
    asha = roster_employee("EMP-V001", "Asha Menon")
    bilal = roster_employee("EMP-V002", "Bilal Khan")
    cara = roster_employee("EMP-V003", "Cara Fernandes")
    devika = roster_employee("EMP-V004", "Devika Nair")
    rows = [
        evaluation("SELF_EVALUATION_IN_PROGRESS", employee_id="EMP-V002"),
        evaluation("NOT_STARTED", employee_id="EMP-V004"),
        evaluation(
            "IN_MANAGER_REVIEW",
            employee_id="EMP-V003",
            employee_signed_at=datetime.datetime(
                2027, 1, 10, 14, 30, tzinfo=datetime.timezone.utc
            ),
        ),
    ]
    return make_board_client([asha, bilal, cara, devika], rows, admin_emails=[ASHA_EMAIL])


def test_the_export_renders_every_matched_row_with_board_columns() -> None:
    client = _board()

    response = export(client)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/csv")
    assert 'attachment; filename="review-status.csv"' in response.headers["content-disposition"]
    lines = csv_lines(response)
    assert lines[0] == EXPECTED_HEADER
    assert len(lines) == 5  # header + 4 rows: the whole roster, no paging
    assert response.status_code == 200
    # The board's display words, from the stored lifecycle: the open word
    # reads In progress, the stored not-started and the no-row cases Not
    # started, the manager phase (past submission) Submitted — with the
    # signature date beside it only where the form closed.
    assert lines[1].startswith("Asha Menon,EMP-V001")
    assert lines[1].endswith("Not started,")
    assert lines[2].startswith("Bilal Khan,EMP-V002")
    assert lines[2].endswith("In progress,")
    assert lines[3].startswith("Cara Fernandes,EMP-V003")
    assert lines[3].endswith("Submitted,2027-01-10")
    assert lines[4].startswith("Devika Nair,EMP-V004")
    assert lines[4].endswith("Not started,")


def test_the_export_honors_the_board_search_sort_and_status_filter() -> None:
    client = _board()

    response = export(client, search="Khan", status="pending")

    lines = csv_lines(response)
    assert len(lines) == 2  # header + Bilal alone: not-started and mid-eval are pending
    assert lines[1].startswith("Bilal Khan,EMP-V002,bilal_khan@emids.com,Software Engineer")


def test_the_status_filter_narrows_to_the_completed_bucket_in_board_order() -> None:
    client = _board()

    response = export(
        client, status="completed", sortBy="employeeName", sortOrder="desc"
    )

    lines = csv_lines(response)
    assert len(lines) == 2  # header + Cara alone: the manager phase is past submission
    assert lines[1].startswith("Cara Fernandes,EMP-V003,cara_fernandes@emids.com,Software Engineer")


def test_a_missing_cycle_answers_cycle_missing() -> None:
    asha = roster_employee("EMP-V001", "Asha Menon")
    client = make_board_client([asha], [], cycle=None, admin_emails=[ASHA_EMAIL])

    response = export(client)

    assert response.status_code == 404
    assert response.json()["code"] == "cycle_missing"


def test_the_export_requires_an_admin_identity() -> None:
    client = _board()

    anonymous = client.get("/api/evaluations/export/status")
    non_admin = client.get(
        "/api/evaluations/export/status", headers={"X-Stub-User": "bilal_khan@emids.com"}
    )

    assert anonymous.status_code == 401
    assert non_admin.status_code == 403
