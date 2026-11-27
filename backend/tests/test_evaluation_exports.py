"""Admin review-document downloads: GET /api/evaluations/export (the whole
matched completed set, no paging), GET /api/evaluations/export/count, and
GET /api/evaluations/{employee_id} for the profile-card download. Repositories
are stubbed, so no database is involved."""

from app.models.employee import Employee
from app.models.evaluation import Evaluation
from tests.evaluation_fixtures import (
    CYCLE,
    PASSED_CYCLE,
    evaluation,
    make_board_client,
    roster_employee,
)

ASHA_EMAIL = "asha_menon@emids.com"


def completed_roster() -> list[Employee]:
    """One roster where the past-submission statuses and the open statuses
    are all present, so the completed-bucket read picks up exactly those."""
    return [
        roster_employee("EMP-V001", "Asha Menon"),
        roster_employee("EMP-V002", "Bilal Khan"),
        roster_employee("EMP-V003", "Cara Fernandes"),
        roster_employee("EMP-V004", "Devika Nair"),
        roster_employee("EMP-V005", "Eshan Gupta"),
        roster_employee("EMP-V006", "Faisal Khan"),
    ]


def completed_rows() -> list[Evaluation]:
    rows = [
        evaluation(
            "SELF_EVALUATION_COMPLETED",
            employee_id="EMP-V001",
            email="asha_menon@emids.com",
            self_rating=4,
            q1_employee_response="Led the intake rewrite.",
        ),
        evaluation("IN_MANAGER_REVIEW", employee_id="EMP-V003", email="cara_fernandes@emids.com"),
        evaluation(
            "MANAGER_EVALUATION_COMPLETED",
            employee_id="EMP-V005",
            email="eshan_gupta@emids.com",
        ),
    ]
    return rows


def export_response(client: object, **params: str) -> object:
    return client.get(
        "/api/evaluations/export", params=params, headers={"X-Stub-User": ASHA_EMAIL}
    )


def test_export_serves_every_completed_document_but_nothing_open() -> None:
    client = make_board_client(
        completed_roster(), completed_rows(), admin_emails=[ASHA_EMAIL]
    )

    response = export_response(client)

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 3
    assert [entry["employee"]["employeeId"] for entry in payload["evaluations"]] == [
        "EMP-V001",  # self_evaluation_completed
        "EMP-V003",  # in_manager_review
        "EMP-V005",  # manager_evaluation_completed
    ]
    document = payload["evaluations"][0]
    assert document["employee"]["name"] == "Asha Menon"
    assert document["responses"]["contribution"] == "Led the intake rewrite."
    assert document["responses"]["strengths"] == ""
    assert document["overallRating"] == 4
    assert document["overallSummary"] == ""
    assert document["forwardCommitments"][0]["commitment"] == "Own the intake rewrite"
    assert document["employeeSignedAt"] is None


def test_export_narrows_by_roster_search_and_filter() -> None:
    client = make_board_client(
        completed_roster(), completed_rows(), admin_emails=[ASHA_EMAIL]
    )

    search_hit = export_response(client, search="cara")
    filtered = export_response(client, businessUnit="Provider Solutions")
    seeded = export_response(client, businessUnit="Payer Digital")

    assert search_hit.status_code == 200
    assert search_hit.json()["total"] == 1
    assert search_hit.json()["evaluations"][0]["employee"]["employeeId"] == "EMP-V003"
    assert filtered.json()["total"] == 0
    assert seeded.json()["total"] == 3


def test_export_count_matches_the_export_total_and_ignores_the_status_word() -> None:
    client = make_board_client(
        completed_roster(), completed_rows(), admin_emails=[ASHA_EMAIL]
    )

    count = (
        client.get(
            "/api/evaluations/export/count",
            params={"status": "not_started"},
            headers={"X-Stub-User": ASHA_EMAIL},
        )
    )
    bare = client.get(
        "/api/evaluations/export/count", headers={"X-Stub-User": ASHA_EMAIL}
    )

    # The export serves the fixed past-submission bucket; a recognized status
    # word on the query is respected as roster narrowing but never pretends
    # to change the finished-review set.
    assert count.status_code == 200
    assert count.json()["completedCount"] == 3
    assert bare.json()["completedCount"] == 3


def test_count_404s_without_a_configured_cycle() -> None:
    client = make_board_client(
        completed_roster(),
        completed_rows(),
        cycle=None,
        admin_emails=[ASHA_EMAIL]
    )

    count = client.get(
        "/api/evaluations/export/count", headers={"X-Stub-User": ASHA_EMAIL}
    )

    assert count.status_code == 404
    assert count.json()["code"] == "cycle_missing"


def test_employee_document_serves_a_completed_review() -> None:
    client = make_board_client(
        completed_roster(), completed_rows(), admin_emails=[ASHA_EMAIL]
    )

    response = client.get(
        "/api/evaluations/EMP-V001", headers={"X-Stub-User": ASHA_EMAIL}
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["reviewYear"] == 2026
    assert payload["responses"]["contribution"] == "Led the intake rewrite."
    assert payload["overallRating"] == 4
    assert payload["managerComments"]["contribution"] == ""


def test_employee_document_rejects_reviews_still_in_the_employee_hands() -> None:
    client = make_board_client(
        completed_roster(), completed_rows(), admin_emails=[ASHA_EMAIL]
    )

    in_progress = client.get(
        "/api/evaluations/EMP-V002", headers={"X-Stub-User": ASHA_EMAIL}
    )
    without_row = client.get(
        "/api/evaluations/EMP-V004", headers={"X-Stub-User": ASHA_EMAIL}
    )
    unknown_id = client.get(
        "/api/evaluations/EMP-NOPE", headers={"X-Stub-User": ASHA_EMAIL}
    )

    for response in (in_progress, without_row):
        assert response.status_code == 409
        assert response.json()["code"] == "review_not_completed"
    assert unknown_id.status_code == 404
    assert unknown_id.json()["code"] == "employee_missing"


def test_exports_demand_the_admin_role() -> None:
    member = roster_employee("EMP-V001", "Asha Menon")
    client = make_board_client(
        [member], [], admin_emails=["hr_admin@emids.com"]
    )

    export = client.get("/api/evaluations/export", headers={"X-Stub-User": ASHA_EMAIL})
    count = client.get(
        "/api/evaluations/export/count", headers={"X-Stub-User": ASHA_EMAIL}
    )
    document = client.get(
        "/api/evaluations/EMP-V001", headers={"X-Stub-User": ASHA_EMAIL}
    )

    for response in (export, count, document):
        assert response.status_code == 403
        assert response.json()["code"] == "admin_required"


def test_count_and_export_never_read_off_cycle_years() -> None:
    worker = roster_employee("EMP-V001", "Asha Menon")
    staled_row = evaluation(
        "SELF_EVALUATION_COMPLETED",
        employee_id="EMP-V001",
        review_year=2025,
        email="asha_menon@emids.com",
    )
    client = make_board_client(
        [worker], [staled_row], cycle=CYCLE, admin_emails=[ASHA_EMAIL]
    )

    count = client.get(
        "/api/evaluations/export/count", headers={"X-Stub-User": ASHA_EMAIL}
    )
    export = export_response(client)

    # A row from another cycle year is not this cycle's completed review.
    assert count.json()["completedCount"] == 0
    assert export.json()["total"] == 0


def test_document_read_with_passed_cycle_still_serves_the_completed_row() -> None:
    worker = roster_employee("EMP-V001", "Asha Menon")
    row = evaluation(
        "SELF_EVALUATION_COMPLETED",
        employee_id="EMP-V001",
        email="asha_menon@emids.com",
    )
    client = make_board_client(
        [worker], [row], cycle=PASSED_CYCLE, admin_emails=[ASHA_EMAIL]
    )

    response = client.get(
        "/api/evaluations/EMP-V001", headers={"X-Stub-User": ASHA_EMAIL}
    )

    assert response.status_code == 200
    assert response.json()["deadlinePassed"] is True


def test_form_status_answers_200_for_both_sides_of_the_cycle() -> None:
    completed_worker = roster_employee("EMP-V001", "Asha Menon")
    pending_worker = roster_employee("EMP-V002", "Bilal Khan")
    client = make_board_client(
        [completed_worker, pending_worker],
        [
            evaluation(
                "MANAGER_EVALUATION_COMPLETED",
                employee_id="EMP-V001",
                email="asha_menon@emids.com",
            ),
        ],
        admin_emails=[ASHA_EMAIL],
    )

    completed = client.get(
        "/api/evaluations/EMP-V001/status", headers={"X-Stub-User": ASHA_EMAIL}
    )
    pending = client.get(
        "/api/evaluations/EMP-V002/status", headers={"X-Stub-User": ASHA_EMAIL}
    )

    assert completed.status_code == 200
    assert completed.json() == {"employeeId": "EMP-V001", "formStatus": "completed"}
    assert pending.status_code == 200
    assert pending.json() == {"employeeId": "EMP-V002", "formStatus": "pending"}


def test_form_status_404s_for_a_missing_employee_and_a_missing_cycle() -> None:
    client = make_board_client(
        completed_roster(), completed_rows(), admin_emails=[ASHA_EMAIL]
    )
    cycleless = make_board_client(
        completed_roster(),
        completed_rows(),
        cycle=None,
        admin_emails=[ASHA_EMAIL],
    )

    missing = client.get(
        "/api/evaluations/EMP-NOPE/status", headers={"X-Stub-User": ASHA_EMAIL}
    )
    without_cycle = cycleless.get(
        "/api/evaluations/EMP-V001/status", headers={"X-Stub-User": ASHA_EMAIL}
    )

    assert missing.status_code == 404
    assert missing.json()["code"] == "employee_missing"
    assert without_cycle.status_code == 404
    assert without_cycle.json()["code"] == "cycle_missing"


def test_form_status_demands_the_admin_role() -> None:
    member = roster_employee("EMP-V001", "Asha Menon")
    client = make_board_client(
        [member], [], admin_emails=["hr_admin@emids.com"]
    )

    response = client.get(
        "/api/evaluations/EMP-V001/status", headers={"X-Stub-User": ASHA_EMAIL}
    )

    assert response.status_code == 403
    assert response.json()["code"] == "admin_required"
