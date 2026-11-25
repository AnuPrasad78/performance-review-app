"""Read and write models for the employee view — the workflow state machine.

Mapping decisions pinned here once, shared by the read GET and both writes and
the admin board:

- q1..q4 positions vs. topic ids: the storage columns are positional; the
  domain is the topic (contribution/strengths/development/support). The
  2026 form fixes the order, so one positional table is the single source
  of the correspondence — never encode it again elsewhere.
- submitted_at: the status vocabulary has no submit timestamp; the
  derivation is "status advanced past IN_PROGRESS". Exactly when the submit
  happened is what the A6 evaluation_audit_logs migration will stamp; until
  then updated_at over-approximates it (later commitment edits move it).
  A status of REOPENED keeps the freeze for the employee, so it counts as
  submitted from this view's side (its employee-freeze persists).
- get-or-empty (read) / get-or-create (first save): an employee without an
  evaluation row is not an error — the form starts empty and the first
  partial save opens the row in IN_PROGRESS. No review_cycles row at all IS
  an error for every use case.
- Freeze rules (the workflow): after submit the employee's answers, rating,
  and overall comments are locked; forward commitments alone stay editable
  until the manager review window closes — they are the 2027 goal-setting
  input and are amended after the discussion by design. Overall comments
  never unlock again.
"""

import datetime

from app.core.auth import AuthUser
from app.core.errors import AppError
from app.models.employee import Employee
from app.models.evaluation import (
    RESPONSE_TOPICS,
    STATUS_IN_PROGRESS as _IN_PROGRESS,
    STATUS_SUBMITTED as _SUBMITTED,
    Evaluation,
)
from app.models.review_cycle import ReviewCycle
from app.repositories.evaluation_repository import EvaluationRepository
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.review_cycle_repository import ReviewCycleRepository
from app.schemas.employee import RosterEmployeeOut
from app.schemas.paging import Paging
from app.schemas.table_query import TableQuery
from app.schemas.self_evaluation import (
    BoardStatus,
    ForwardCommitmentOut,
    QuestionResponses,
    ReviewStatusEntry,
    ReviewStatusList,
    SelfEvaluationOut,
    SelfEvaluationPatch,
)
from app.services.roster_mapping import to_row


def deadline_passed(cycle: ReviewCycle) -> bool:
    """The single definition of "the form is closed" for the whole view:
    render (the closed screen's flag), save, and submit all read this one
    function — never copy the comparison elsewhere. A naive value surfacing
    from the driver is normalized as UTC so the comparison can never raise."""
    now = datetime.datetime.now(datetime.timezone.utc)
    moment = cycle.submission_deadline
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=datetime.timezone.utc)
    return now > moment

#: Mirrors the DB's valid_forward_commitments check (array ≤ 3); migration A8
#: is the change that raises both together — never this alone.
COMMITMENT_CAP = 3


def _topic_values(
    evaluation: Evaluation | None, column_index: int
) -> dict[str, str]:
    """Values of every topic's RESPONSE_TOPICS[column_index] column; an unset
    row reads as empty strings because the form starts blank, it never lies."""
    if evaluation is None:
        return {entry[0]: "" for entry in RESPONSE_TOPICS}
    return {
        entry[0]: (getattr(evaluation, entry[column_index]) or "")
        for entry in RESPONSE_TOPICS
    }


def _commitments(evaluation: Evaluation | None) -> list[ForwardCommitmentOut]:
    entries = evaluation.forward_commitments if evaluation is not None else []
    return [
        # Stored rows own exactly the two keys the screen renders; anything a
        # stale or malformed row might carry is dropped at this boundary.
        ForwardCommitmentOut(
            commitment=str(entry.get("commitment", "")) if isinstance(entry, dict) else "",
            support=str(entry.get("support", "")) if isinstance(entry, dict) else "",
        )
        for entry in entries
    ]


def _submitted_at(evaluation: Evaluation | None) -> datetime.date | None:
    if evaluation is None or evaluation.status == _IN_PROGRESS:
        return None
    return evaluation.updated_at.date() if evaluation.updated_at is not None else None


def _signed_at(evaluation: Evaluation | None) -> datetime.date | None:
    if evaluation is None or evaluation.employee_signed_at is None:
        return None
    return evaluation.employee_signed_at.date()


def _commitments_editable(evaluation: Evaluation | None, cycle: ReviewCycle) -> bool:
    if evaluation is None or evaluation.status == _IN_PROGRESS:
        # The open review's commitments live inside the submission window:
        # once the deadline passes, the PATCH guard refuses them all, so the
        # flag must say the same thing.
        return not deadline_passed(cycle)
    return cycle.manager_review_end >= datetime.date.today()


def _render(
    employee: Employee, cycle: ReviewCycle, evaluation: Evaluation | None
) -> SelfEvaluationOut:
    return SelfEvaluationOut(
        employee=to_row(employee),
        review_year=cycle.review_year,
        submission_deadline=cycle.submission_deadline,
        deadline_passed=deadline_passed(cycle),
        submitted_at=_submitted_at(evaluation),
        employee_signed_at=_signed_at(evaluation),
        responses=QuestionResponses(**_topic_values(evaluation, column_index=1)),
        manager_comments=QuestionResponses(**_topic_values(evaluation, column_index=2)),
        overall_rating=evaluation.self_rating if evaluation is not None else None,
        overall_summary=(
            evaluation.employee_overall_comments if evaluation is not None else ""
        )
        or "",
        forward_commitments=_commitments(evaluation),
        commitments_editable=_commitments_editable(evaluation, cycle),
    )


async def _scoped(
    user: AuthUser,
    evaluation_repository: EvaluationRepository,
    cycle_repository: ReviewCycleRepository,
) -> tuple[ReviewCycle, Evaluation | None]:
    cycle = await cycle_repository.current()
    if cycle is None:
        raise AppError(
            "No review cycle is configured yet.", code="cycle_missing", status_code=404
        )
    evaluation = await evaluation_repository.get_for_employee(
        user.employee_id, cycle.review_year
    )
    return cycle, evaluation


async def _roster_employee(
    user: AuthUser, employee_repository: EmployeeRepository
) -> Employee:
    employee = await employee_repository.get(user.employee_id)
    if employee is None:
        # Identity resolved moments earlier; a vanished roster row is an
        # environment failure, not a client error.
        raise AppError(
            "Your roster entry could not be loaded.", code="employee_missing", status_code=500
        )
    return employee


async def current_self_evaluation(
    user: AuthUser,
    employee_repository: EmployeeRepository,
    evaluation_repository: EvaluationRepository,
    cycle_repository: ReviewCycleRepository,
) -> SelfEvaluationOut:
    cycle, evaluation = await _scoped(user, evaluation_repository, cycle_repository)
    employee = await _roster_employee(user, employee_repository)
    return _render(employee, cycle, evaluation)


def _commitment_rows(values: list[ForwardCommitmentOut]) -> list[dict[str, str]]:
    # Persistence keeps raw dictionaries with only the two rendered keys. The
    # cap mirrors the DB's valid_forward_commitments check — migration A8 is
    # the change that raises the two together, never this alone.
    rows = [{"commitment": entry.commitment, "support": entry.support} for entry in values]
    if len(rows) > COMMITMENT_CAP:
        raise AppError(
            f"Save at most {COMMITMENT_CAP} forward commitments.",
            code="commitment_cap_exceeded",
            status_code=400,
        )
    return rows


async def _open_or_create(
    user: AuthUser,
    cycle: ReviewCycle,
    evaluation: Evaluation | None,
    evaluation_repository: EvaluationRepository,
) -> Evaluation:
    if evaluation is None:
        evaluation = Evaluation(
            employee_id=user.employee_id,
            review_year=cycle.review_year,
            cycle_id=cycle.cycle_id,
            status=_IN_PROGRESS,
            forward_commitments=[],
        )
        await evaluation_repository.add(evaluation)
    return evaluation


async def save_self_evaluation(
    user: AuthUser,
    patch: SelfEvaluationPatch,
    employee_repository: EmployeeRepository,
    evaluation_repository: EvaluationRepository,
    cycle_repository: ReviewCycleRepository,
) -> SelfEvaluationOut:
    # One partial update: provided members move, omitted members stand. The
    # patch schema cannot even mention manager columns, so manager protection
    # is structural, not a runtime check to forget.
    if (
        patch.responses is None
        and patch.self_rating is None
        and patch.overall_summary is None
        and patch.forward_commitments is None
    ):
        raise AppError("Nothing to save.", code="empty_update", status_code=400)
    if patch.self_rating is not None and not (1 <= patch.self_rating <= 5):
        raise AppError(
            "The overall self-rating must be between 1 and 5.",
            code="self_rating_range",
            status_code=400,
        )

    cycle, evaluation = await _scoped(user, evaluation_repository, cycle_repository)
    employee = await _roster_employee(user, employee_repository)
    evaluation = await _open_or_create(user, cycle, evaluation, evaluation_repository)

    if evaluation.status != _IN_PROGRESS:
        frozen_member = (
            patch.responses is not None
            or patch.self_rating is not None
            or patch.overall_summary is not None
        )
        if frozen_member:
            raise AppError(
                "Your self-evaluation was submitted and is locked.",
                code="review_frozen",
                status_code=409,
            )
    if evaluation.status == _IN_PROGRESS and deadline_passed(cycle):
        raise AppError(
            "The submission deadline has passed.",
            code="submission_deadline_passed",
            status_code=403,
        )
    if patch.forward_commitments is not None and not _commitments_editable(
        evaluation, cycle
    ):
        raise AppError(
            "Forward commitments close after the manager review window.",
            code="commitments_locked",
            status_code=409,
        )

    if patch.responses is not None:
        by_id = patch.responses.model_dump()
        for _topic, employee_column, _manager_column in RESPONSE_TOPICS:
            setattr(evaluation, employee_column, by_id[_topic])
    if patch.self_rating is not None:
        evaluation.self_rating = patch.self_rating
    if patch.overall_summary is not None:
        evaluation.employee_overall_comments = patch.overall_summary
    if patch.forward_commitments is not None:
        evaluation.forward_commitments = _commitment_rows(patch.forward_commitments)

    return _render(employee, cycle, evaluation)


def _submission_missing_parts(evaluation: Evaluation) -> list[str]:
    parts: list[str] = []
    topics = _topic_values(evaluation, column_index=1)
    for topic, value in topics.items():
        if value == "":
            parts.append(topic)
    if evaluation.self_rating is None:
        parts.append("self rating")
    if (evaluation.employee_overall_comments or "") == "":
        parts.append("overall comments")
    return parts


async def submit_self_evaluation(
    user: AuthUser,
    employee_repository: EmployeeRepository,
    evaluation_repository: EvaluationRepository,
    cycle_repository: ReviewCycleRepository,
) -> SelfEvaluationOut:
    cycle, evaluation = await _scoped(user, evaluation_repository, cycle_repository)
    employee = await _roster_employee(user, employee_repository)

    if evaluation is None or (
        evaluation.status == _IN_PROGRESS and not any(
            (getattr(evaluation, employee_column) or "")
            for _topic, employee_column, _manager_column in RESPONSE_TOPICS
        )
    ):
        raise AppError(
            "You have not started this self-evaluation yet.",
            code="evaluation_not_started",
            status_code=409,
        )
    if evaluation.status != _IN_PROGRESS:
        raise AppError(
            "This self-evaluation was already submitted.",
            code="already_submitted",
            status_code=409,
        )
    if deadline_passed(cycle):
        raise AppError(
            "The submission deadline has passed.",
            code="submission_deadline_passed",
            status_code=403,
        )

    missing = _submission_missing_parts(evaluation)
    if missing:
        raise AppError(
            "Complete your review before submitting: " + ", ".join(missing) + ".",
            code="submission_incomplete",
            status_code=400,
        )

    evaluation.status = _SUBMITTED
    return _render(employee, cycle, evaluation)


def _board_status(evaluation: Evaluation | None) -> BoardStatus:
    """The admin board's derived words for one roster row. Same workflow facts
    as the employee view, seen from the outside: no row or a row with nothing
    in it is "not started"; submitted-family statuses read as "submitted"
    until the employee signature exists (which is the manager phase's stamp)."""
    if evaluation is None:
        return "not_started"
    if evaluation.status == _IN_PROGRESS:
        answered = any(
            (getattr(evaluation, employee_column) or "")
            for _topic, employee_column, _manager_column in RESPONSE_TOPICS
        )
        return "in_progress" if answered else "not_started"
    if evaluation.employee_signed_at is not None:
        return "signed_off"
    return "submitted"


#: The admin filter nouns and the derived words they stand for. `pending`
#: reviews in flight, `completed` the submitted family — the same bucketing
#: the frontend's filtering chips render (lib/reviewStatusStore).
FILTER_STATUS_WORDS: dict[str, frozenset[str]] = {
    "all": frozenset(),
    "pending": frozenset({"not_started", "in_progress"}),
    "completed": frozenset({"submitted", "signed_off"}),
}


async def list_review_statuses(
    employee_repository: EmployeeRepository,
    cycle_repository: ReviewCycleRepository,
    paging: Paging,
    query: TableQuery,
) -> ReviewStatusList:
    cycle = await cycle_repository.current()
    if cycle is None:
        raise AppError(
            "No review cycle is configured yet.", code="cycle_missing", status_code=404
        )
    words = FILTER_STATUS_WORDS[query.status]
    page_slice = await employee_repository.roster_year_page(
        cycle.review_year,
        query=query,
        statuses=words if words else None,
        page=paging.page,
        page_size=paging.page_size,
    )
    return ReviewStatusList(
        reviews=[
            ReviewStatusEntry(employee=to_row(employee), status=_board_status(evaluation))
            for employee, evaluation in page_slice.rows
        ],
        total=page_slice.total,
        page=paging.page,
        page_size=paging.page_size,
        status_counts=page_slice.status_counts,
    )
