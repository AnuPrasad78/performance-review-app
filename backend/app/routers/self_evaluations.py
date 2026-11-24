"""Employee-facing self-evaluation endpoints plus the admin status board.

Employee routes authenticate through get_roster_user; the board route stacks
get_admin_user on top (role gate in core/auth.py). Routers stay thin by rule:
the use cases — read, partial save, submit, board — live in the service.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

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
from app.schemas.self_evaluation import (
    ReviewStatusList,
    SelfEvaluationOut,
    SelfEvaluationPatch,
)
from app.services.self_evaluation import (
    current_self_evaluation,
    list_review_statuses,
    save_self_evaluation,
    submit_self_evaluation,
)

router = APIRouter(tags=["self-evaluations"])


@router.get("/evaluations", response_model=ReviewStatusList)
async def list_review_form_statuses(
    _admin: Annotated[AuthUser, Depends(get_admin_user)],
    employee_repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
    evaluation_repository: Annotated[EvaluationRepository, Depends(get_evaluation_repository)],
    cycle_repository: Annotated[ReviewCycleRepository, Depends(get_review_cycle_repository)],
) -> ReviewStatusList:
    return await list_review_statuses(
        employee_repository=employee_repository,
        evaluation_repository=evaluation_repository,
        cycle_repository=cycle_repository,
    )


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
