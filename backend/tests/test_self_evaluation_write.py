"""PATCH /api/evaluations/me and POST /api/evaluations/me/submit contracts:
presence-shaped partial saves, the freeze rules, submission completeness, and
the deadline guard. Repositories are stubbed, so no database is involved."""

from tests.evaluation_fixtures import (
    CYCLE,
    IDENTITY,
    PASSED_CYCLE,
    evaluation,
    make_client,
    save,
    submit,
)
from app.models.evaluation import STATUS_IN_PROGRESS, STATUS_SUBMITTED


def full_answers() -> dict[str, str]:
    return {
        "contribution": "Delivered the intake rewrite.",
        "strengths": "Data modeling holds up.",
        "development": "Deep Kafka work.",
        "support": "Design reviews.",
    }


def complete_row() -> object:
    from tests.evaluation_fixtures import evaluation

    answers = full_answers()
    return evaluation(
        STATUS_IN_PROGRESS,
        q1_employee_response=answers["contribution"],
        q2_employee_response=answers["strengths"],
        q3_employee_response=answers["development"],
        q4_employee_response=answers["support"],
        self_rating=4,
        employee_overall_comments="Strong year.",
    )


def test_first_partial_save_opens_the_row_in_progress() -> None:
    # responses is a field-level unit: the saving page always holds all four
    # topics, so the patch carries the complete map (boundary validates it).
    client, evaluations = make_client()
    response = save(client, {"responses": full_answers()})

    assert response.status_code == 200
    assert response.json()["responses"]["contribution"] == "Delivered the intake rewrite."
    assert evaluations.row is not None
    assert evaluations.row.status == STATUS_IN_PROGRESS
    assert evaluations.row.q1_employee_response == "Delivered the intake rewrite."


def test_first_save_writes_the_email_display_mirror() -> None:
    # The deployed schema (pr_0007_email_display_mirror) requires the
    # denormalized email on create; a row written without it 500s at the
    # storage layer — the regression that left freshly deleted accounts
    # unsaveable and unsendable.
    client, evaluations = make_client()

    response = save(client, {"responses": full_answers()})

    assert response.status_code == 200
    assert evaluations.row is not None
    assert evaluations.row.email == "asha_menon@emids.com"


def test_partial_saves_replace_only_the_members_they_carry() -> None:
    row = __import__("tests.evaluation_fixtures", fromlist=["evaluation"]).evaluation(
        STATUS_IN_PROGRESS, q1_employee_response="Preexisting answer."
    )
    client, evaluations = make_client(evaluation_row=row)

    response = save(client, {"selfRating": 3})

    assert response.status_code == 200
    payload = response.json()
    assert payload["overallRating"] == 3
    # Presence semantics: an absent answer stands untouched.
    assert payload["responses"]["contribution"] == "Preexisting answer."
    assert payload["overallSummary"] == ""
    assert evaluations.row.q1_employee_response == "Preexisting answer."


def test_an_empty_patch_is_an_error() -> None:
    client, _ = make_client()
    response = save(client, {})
    assert response.status_code == 400
    assert response.json()["code"] == "empty_update"


def test_self_rating_outside_the_scale_is_rejected() -> None:
    client, _ = make_client()
    response = save(client, {"selfRating": 6})
    assert response.status_code == 400
    assert response.json()["code"] == "self_rating_range"


def test_more_commitments_than_the_cap_is_rejected() -> None:
    client, _ = make_client()
    body = {
        "forwardCommitments": [
            {"commitment": f"#{index}", "support": ""}
            for index in range(1, 5)
        ],
    }
    response = save(client, body)
    assert response.status_code == 400
    assert response.json()["code"] == "commitment_cap_exceeded"


def test_submitted_answers_are_frozen() -> None:
    client, _ = make_client(evaluation_row=evaluation(STATUS_SUBMITTED))
    response = save(client, {"responses": full_answers()})
    assert response.status_code == 409
    assert response.json()["code"] == "review_frozen"


def test_commitments_stay_editable_inside_the_manager_window() -> None:
    client, evaluations = make_client(
        evaluation_row=evaluation(STATUS_SUBMITTED)
    )
    response = save(
        client,
        {
            "forwardCommitments": [
                {"commitment": "Own the 2027 intake rewrite", "support": "Lead mentoring"},
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["commitmentsEditable"] is True
    assert evaluations.row.forward_commitments == [
        {"commitment": "Own the 2027 intake rewrite", "support": "Lead mentoring"}
    ]


def test_commitments_lock_after_the_manager_window() -> None:
    client, _ = make_client(
        cycle=PASSED_CYCLE,
        evaluation_row=evaluation(STATUS_SUBMITTED),
    )
    response = save(
        client,
        {"forwardCommitments": [{"commitment": "Late change", "support": ""}]},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "commitments_locked"


def test_read_reports_the_lock_so_the_ui_never_rederives_the_window() -> None:
    client, _ = make_client(
        cycle=PASSED_CYCLE,
        evaluation_row=evaluation(STATUS_SUBMITTED),
    )

    response = client.get("/api/evaluations/me", headers=IDENTITY)

    assert response.status_code == 200
    assert response.json()["commitmentsEditable"] is False


def test_submit_needs_a_started_review() -> None:
    client, _ = make_client()
    response = submit(client)
    assert response.status_code == 409
    assert response.json()["code"] == "evaluation_not_started"


def test_submit_requires_every_piece() -> None:
    client, _ = make_client(
        evaluation_row=evaluation(
            STATUS_IN_PROGRESS, q1_employee_response="Only one answer exists."
        )
    )
    response = submit(client)
    assert response.status_code == 400
    payload = response.json()
    assert payload["code"] == "submission_incomplete"
    for missing in ["strengths", "development", "support", "self rating", "overall comments"]:
        assert missing in payload["detail"]


def test_submit_completes_the_review() -> None:
    client, evaluations = make_client(evaluation_row=complete_row())
    response = submit(client)

    assert response.status_code == 200
    assert response.json()["submittedAt"] is None  # exact date is A6's stamp
    assert evaluations.row.status == STATUS_SUBMITTED


def test_submit_lands_on_an_already_submitted_review() -> None:
    client, _ = make_client(evaluation_row=evaluation(STATUS_SUBMITTED))
    response = submit(client)
    assert response.status_code == 409
    assert response.json()["code"] == "already_submitted"


def test_submit_after_the_deadline_is_refused() -> None:
    client, _ = make_client(cycle=PASSED_CYCLE, evaluation_row=complete_row())
    response = submit(client)
    assert response.status_code == 403
    assert response.json()["code"] == "submission_deadline_passed"


def test_patch_of_an_open_review_after_the_deadline_is_refused() -> None:
    client, evaluations = make_client(cycle=PASSED_CYCLE, evaluation_row=complete_row())
    response = save(client, {"responses": full_answers()})

    assert response.status_code == 403
    assert response.json()["code"] == "submission_deadline_passed"
    # The refusal precedes every write: the stub keeps the untouched row.
    assert evaluations.row.q1_employee_response == full_answers()["contribution"]
    assert evaluations.row.employee_overall_comments == "Strong year."


def test_get_after_the_deadline_stays_readable_for_the_closed_screen() -> None:
    from tests.evaluation_fixtures import read

    client, _ = make_client(cycle=PASSED_CYCLE, evaluation_row=complete_row())
    response = read(client)

    assert response.status_code == 200
    payload = response.json()
    assert payload["deadlinePassed"] is True
    assert payload["commitmentsEditable"] is False


def test_cycle_reference_stays_shared() -> None:
    # The window variants come from one source so the rule tests and read
    # tests cannot drift apart.
    assert PASSED_CYCLE.manager_review_end < CYCLE.manager_review_end
