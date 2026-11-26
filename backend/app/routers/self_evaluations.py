"""Employee-facing self-evaluation endpoints plus the admin status board.

Employee routes authenticate through get_roster_user; the board route stacks
get_admin_user on top (role gate in core/auth.py). Routers stay thin by rule:
the use cases — read, partial save, submit, board — live in the service.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from app.core.auth import AuthUser, get_admin_user, get_roster_user
from app.repositories.evaluation_repository import (
    EvaluationRepository,
    get_evaluation_repository,
)
from app.repositories.employee_repository import EmployeeRepository, get_employee_repository
from app.repositories.review_cycle_repository import (
    ReviewCycleRepository,
    get_review_cycle_repository,
)
from app.schemas.paging import Paging, paging
from app.schemas.table_query import TableQuery, board_query, roster_query
from app.schemas.self_evaluation import (
    CompletedReviewCount,
    FormStatusOut,
    ReviewDocumentList,
    ReviewStatusList,
    SelfEvaluationOut,
    SelfEvaluationPatch,
)
from app.services.evaluation_export import completed_count, completed_documents, employee_document
from app.services.review_status_export import review_status_csv
from app.services.self_evaluation import (
    current_self_evaluation,
    employee_form_status,
    list_review_statuses,
    save_self_evaluation,
    submit_self_evaluation,
)

router = APIRouter(tags=["self-evaluations"])


@router.get("/evaluations", response_model=ReviewStatusList)
async def list_review_form_statuses(
    _admin: Annotated[AuthUser, Depends(get_admin_user)],
    employee_repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
    cycle_repository: Annotated[ReviewCycleRepository, Depends(get_review_cycle_repository)],
    bounds: Annotated[Paging, Depends(paging)],
    query: Annotated[TableQuery, Depends(board_query)],
) -> ReviewStatusList:
    return await list_review_statuses(
        employee_repository=employee_repository,
        cycle_repository=cycle_repository,
        paging=bounds,
        query=query,
    )


@router.get("/evaluations/export/status")
async def export_review_status_csv(
    _admin: Annotated[AuthUser, Depends(get_admin_user)],
    employee_repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
    cycle_repository: Annotated[ReviewCycleRepository, Depends(get_review_cycle_repository)],
    query: Annotated[TableQuery, Depends(board_query)],
) -> Response:
    """The board's Download CSV: every employee row the composed board query
    matches (no paging) — roster columns plus form status and submitted
    date, in the board's order."""
    content = await review_status_csv(employee_repository, cycle_repository, query)
    return Response(
        content=content,
        media_type="application/csv;charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="review-status.csv"'},
    )


@router.get("/evaluations/export/count", response_model=CompletedReviewCount)
async def count_completed_reviews(
    _admin: Annotated[AuthUser, Depends(get_admin_user)],
    employee_repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
    cycle_repository: Annotated[ReviewCycleRepository, Depends(get_review_cycle_repository)],
    query: Annotated[TableQuery, Depends(roster_query)],
) -> CompletedReviewCount:
    """The completed-reviews bell the bulk download button announces: how
    many reviews the composed roster query would download — completed
    bucket only, the query's own status word plays no part."""
    return await completed_count(employee_repository, cycle_repository, query)


@router.get("/evaluations/export", response_model=ReviewDocumentList)
async def export_completed_reviews(
    _admin: Annotated[AuthUser, Depends(get_admin_user)],
    employee_repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
    cycle_repository: Annotated[ReviewCycleRepository, Depends(get_review_cycle_repository)],
    query: Annotated[TableQuery, Depends(board_query)],
) -> ReviewDocumentList:
    """Every completed self-evaluation document the composed roster query
    matches (no paging) — the bulk ZIP's payload, rendered as the same wire
    the /evaluations/me read serves so one client parser covers all."""
    return await completed_documents(employee_repository, cycle_repository, query)


@router.get("/evaluations/me", response_model=SelfEvaluationOut)
async def read_my_evaluation(
    user: Annotated[AuthUser, Depends(get_roster_user)],
    employee_repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
    evaluation_repository: Annotated[EvaluationRepository, Depends(get_evaluation_repository)],
    cycle_repository: Annotated[ReviewCycleRepository, Depends(get_review_cycle_repository)],
) -> SelfEvaluationOut:
    return await current_self_evaluation(
        user,
        employee_repository=employee_repository,
        evaluation_repository=evaluation_repository,
        cycle_repository=cycle_repository,
    )


@router.patch("/evaluations/me", response_model=SelfEvaluationOut)
async def save_my_evaluation(
    patch: SelfEvaluationPatch,
    user: Annotated[AuthUser, Depends(get_roster_user)],
    employee_repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
    evaluation_repository: Annotated[EvaluationRepository, Depends(get_evaluation_repository)],
    cycle_repository: Annotated[ReviewCycleRepository, Depends(get_review_cycle_repository)],
) -> SelfEvaluationOut:
    return await save_self_evaluation(
        user,
        patch,
        employee_repository=employee_repository,
        evaluation_repository=evaluation_repository,
        cycle_repository=cycle_repository,
    )


@router.post("/evaluations/me/submit", response_model=SelfEvaluationOut)
async def submit_my_evaluation(
    user: Annotated[AuthUser, Depends(get_roster_user)],
    employee_repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
    evaluation_repository: Annotated[EvaluationRepository, Depends(get_evaluation_repository)],
    cycle_repository: Annotated[ReviewCycleRepository, Depends(get_review_cycle_repository)],
) -> SelfEvaluationOut:
    return await submit_self_evaluation(
        user,
        employee_repository=employee_repository,
        evaluation_repository=evaluation_repository,
        cycle_repository=cycle_repository,
    )


@router.get("/evaluations/{employee_id}/status", response_model=FormStatusOut)
async def read_employee_form_status(
    employee_id: str,
    _admin: Annotated[AuthUser, Depends(get_admin_user)],
    employee_repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
    evaluation_repository: Annotated[EvaluationRepository, Depends(get_evaluation_repository)],
    cycle_repository: Annotated[ReviewCycleRepository, Depends(get_review_cycle_repository)],
) -> FormStatusOut:
    """The profile card's form-status probe — completed or pending, served
    with 200 in both cases so the card's check never reads an HTTP error."""
    return await employee_form_status(
        employee_id,
        employee_repository=employee_repository,
        cycle_repository=cycle_repository,
        evaluation_repository=evaluation_repository,
    )


@router.get("/evaluations/{employee_id}", response_model=SelfEvaluationOut)
async def read_employee_evaluation(
    employee_id: str,
    _admin: Annotated[AuthUser, Depends(get_admin_user)],
    employee_repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
    evaluation_repository: Annotated[EvaluationRepository, Depends(get_evaluation_repository)],
    cycle_repository: Annotated[ReviewCycleRepository, Depends(get_review_cycle_repository)],
) -> SelfEvaluationOut:
    """One employee's review document for the admin profile card's download;
    a review still in the employee's hands is a 409 — the exact word the
    profile card hides its download button on."""
    return await employee_document(
        employee_id,
        employee_repository=employee_repository,
        cycle_repository=cycle_repository,
        evaluation_repository=evaluation_repository,
    )
