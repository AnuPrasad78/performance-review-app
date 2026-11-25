"""GET /api/evaluations/me contract: wire shape, q1..q4 → topic mapping, the
submitted/signed date derivations, and get-or-empty behavior. Repositories
are stubbed, so no database is involved."""

import datetime

from tests.evaluation_fixtures import (
    IDENTITY,
    evaluation,
    make_client,
    read,
    roster_employee,
)
from app.models.evaluation import STATUS_IN_PROGRESS, STATUS_SUBMITTED

UTC = datetime.timezone.utc


def test_no_evaluation_row_reads_as_an_empty_open_form() -> None:
    client, _ = make_client()
    response = read(client)

    assert response.status_code == 200
    payload = response.json()
    assert payload["reviewYear"] == 2026
    assert payload["submissionDeadline"].startswith("2027-01-15")
    assert payload["deadlinePassed"] is False
    assert payload["submittedAt"] is None
    assert payload["employeeSignedAt"] is None
    assert payload["responses"] == {
        "contribution": "",
        "strengths": "",
        "development": "",
        "support": "",
    }
    assert payload["managerComments"] == {
        "contribution": "",
        "strengths": "",
        "development": "",
        "support": "",
    }
    assert payload["overallRating"] is None
    assert payload["overallSummary"] == ""
    assert payload["forwardCommitments"] == []
    # An open review is its own commitment window: editable until submitted.
    assert payload["commitmentsEditable"] is True
    # The profile card renders straight from this sub-object.
    assert payload["employee"]["employeeId"] == "EMP-V001"
    assert payload["employee"]["designation"] == "Software Engineer"
    assert payload["employee"]["status"] == "Active"


def test_open_evaluation_marries_q_columns_to_topics() -> None:
    row = evaluation(
        STATUS_IN_PROGRESS,

        q1_employee_response="Delivered the intake rewrite.",
        q2_employee_response="Data modeling holds up.",
        q3_employee_response="Deep Kafka work.",
        q4_employee_response="Design reviews.",
        q1_manager_comments=None,
        self_rating=4,
        employee_overall_comments="Strong year.",
        forward_commitments=[
            {"commitment": "Own the intake rewrite", "support": "Lead mentoring"},
            {"committed": "not-a-contract-key"},
        ],
    )
    client, _ = make_client(evaluation_row=row)
    payload = read(client).json()

    assert payload["responses"] == {
        "contribution": "Delivered the intake rewrite.",
        "strengths": "Data modeling holds up.",
        "development": "Deep Kafka work.",
        "support": "Design reviews.",
    }
    assert payload["managerComments"] == {
        "contribution": "",
        "strengths": "",
        "development": "",
        "support": "",
    }
    assert payload["overallRating"] == 4
    assert payload["overallSummary"] == "Strong year."
    assert payload["forwardCommitments"] == [
        {"commitment": "Own the intake rewrite", "support": "Lead mentoring"},
        {"commitment": "", "support": ""},
    ]
    assert payload["submittedAt"] is None
    assert payload["employeeSignedAt"] is None


def test_submitted_status_derives_the_wire_dates() -> None:
    row = evaluation(
        STATUS_SUBMITTED,

        updated_at=datetime.datetime(2026, 11, 20, 9, 30, tzinfo=UTC),
        employee_signed_at=datetime.datetime(2026, 11, 21, 10, 0, tzinfo=UTC),
    )
    client, _ = make_client(evaluation_row=row)
    payload = read(client).json()

    assert payload["submittedAt"] == "2026-11-20"
    assert payload["employeeSignedAt"] == "2026-11-21"


def test_manager_phase_still_reads_as_submitted() -> None:
    # Past the active pair, submitted_at holds: the manager window's words
    # describe the manager's side, not a reopened employee form.
    row = evaluation(
        "IN_MANAGER_REVIEW",
        updated_at=datetime.datetime(2026, 11, 20, 9, 30, tzinfo=UTC),
    )
    client, _ = make_client(evaluation_row=row)
    payload = read(client).json()

    assert payload["submittedAt"] == "2026-11-20"
    assert payload["employeeSignedAt"] is None


def test_missing_cycle_is_a_404_envelope() -> None:
    client, _ = make_client(cycle=None)
    response = client.get("/api/evaluations/me", headers=IDENTITY)

    assert response.status_code == 404
    assert response.json()["code"] == "cycle_missing"