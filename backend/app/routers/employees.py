"""Employee roster endpoints.

/import parses and validates a CSV, then reports what would change against the
stored table; /import/apply commits the admin-reviewed decision. Auth
attaches when the role-gated admin feature lands (see models/employee.py) —
until then this is a documented auth-opt-out, per CLAUDE.md's stub-auth phase.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile

from app.repositories.employee_repository import (
    EmployeeRepository,
    get_employee_repository,
)
from app.schemas.employee import (
    EmployeeList,
    RosterApplyPayload,
    RosterApplyReport,
    RosterImportReport,
)
from app.schemas.paging import Paging, paging
from app.services.roster_apply import apply_roster
from app.services.roster_diff import diff_roster
from app.services.roster_import import parse_roster_csv
from app.services.roster_mapping import to_row

router = APIRouter(tags=["employees"])


@router.post("/employees/import", response_model=RosterImportReport)
async def analyze_roster_import(
    file: Annotated[UploadFile, File()],
    repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
) -> RosterImportReport:
    # Transport bytes only — decoding, validation and shaping live in the service.
    data = await file.read()
    return await diff_roster(parse_roster_csv(data), repository)


@router.post("/employees/import/apply", response_model=RosterApplyReport)
async def confirm_roster_import(
    payload: RosterApplyPayload,
    repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
) -> RosterApplyReport:
    return await apply_roster(payload, repository)


@router.get("/employees", response_model=EmployeeList)
async def list_employees(
    repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
    bounds: Annotated[Paging, Depends(paging)],
) -> EmployeeList:
    stored, total = await repository.paged(bounds.page, bounds.page_size)
    return EmployeeList(
        employees=[to_row(one) for one in stored],
        total=total,
        page=bounds.page,
        page_size=bounds.page_size,
    )
