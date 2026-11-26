"""Employee roster endpoints.

/import parses and validates a CSV, then reports what would change against the
stored table; /import/apply commits the admin-reviewed decision. The list
endpoint serves the admin Users table with the shared table query (search,
filters, sort, and the board's form-status noun), /employees/export streams
the matched rows as the roster CSV, and /employees/facets serves the filter
dropdowns' option lists; those three sit behind the admin role gate. The
import endpoints remain a documented auth-opt-out, per CLAUDE.md's stub-auth
phase.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile, Response

from app.core.auth import AuthUser, get_admin_user
from app.repositories.employee_repository import (
    EmployeeRepository,
    get_employee_repository,
)
from app.repositories.evaluation_repository import (
    EvaluationRepository,
    get_evaluation_repository,
)
from app.repositories.review_cycle_repository import (
    ReviewCycleRepository,
    get_review_cycle_repository,
)
from app.schemas.employee import (
    EmployeeList,
    EmployeeStatusPatch,
    RosterEmployeeOut,
    RosterApplyPayload,
    RosterApplyReport,
    RosterFacets,
    RosterImportReport,
)
from app.schemas.paging import Paging, paging
from app.schemas.table_query import TableQuery, roster_query
from app.services.roster_apply import apply_roster
from app.services.roster_diff import diff_roster
from app.services.roster_import import parse_roster_csv
from app.services.roster_mapping import to_row
from app.services.roster_read import employees_page, employees_to_export
from app.services.roster_status import set_employment_status

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
    evaluation_repository: Annotated[
        EvaluationRepository, Depends(get_evaluation_repository)
    ],
) -> RosterApplyReport:
    return await apply_roster(payload, repository, evaluation_repository)


@router.get("/employees", response_model=EmployeeList)
async def list_employees(
    repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
    cycle_repository: Annotated[ReviewCycleRepository, Depends(get_review_cycle_repository)],
    bounds: Annotated[Paging, Depends(paging)],
    query: Annotated[TableQuery, Depends(roster_query)],
) -> EmployeeList:
    stored, total = await employees_page(
        repository, cycle_repository, query, bounds.page, bounds.page_size
    )
    return EmployeeList(
        employees=[to_row(one) for one in stored],
        total=total,
        page=bounds.page,
        page_size=bounds.page_size,
    )


@router.get("/employees/export")
async def export_employees(
    _admin: Annotated[AuthUser, Depends(get_admin_user)],
    repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
    cycle_repository: Annotated[ReviewCycleRepository, Depends(get_review_cycle_repository)],
    query: Annotated[TableQuery, Depends(roster_query)],
) -> Response:
    content = await employees_to_export(repository, cycle_repository, query)
    return Response(
        content=content,
        media_type="application/csv;charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="employee-roster.csv"'},
    )


@router.patch("/employees/{employee_id}", response_model=RosterEmployeeOut)
async def patch_employee(
    employee_id: str,
    patch: EmployeeStatusPatch,
    _admin: Annotated[AuthUser, Depends(get_admin_user)],
    repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
) -> RosterEmployeeOut:
    """The profile card's employment-status write — the one-member patch the
    service applies; the stored row's roster render comes back."""
    employee = await set_employment_status(employee_id, patch, repository)
    return to_row(employee)


@router.get("/employees/facets", response_model=RosterFacets)
async def list_employee_facets(
    _admin: Annotated[AuthUser, Depends(get_admin_user)],
    repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
) -> RosterFacets:
    facets = await repository.facet_values()
    return RosterFacets(
        designations=facets.designations,
        locations=facets.locations,
        orgs=facets.orgs,
        business_units=facets.business_units,
        reporting_managers=facets.reporting_managers,
        employment_statuses=facets.employment_statuses,
    )
