"""Admin review-document exports: the bulk ZIP's reads and one employee's
document for the profile-card download.

Every use case serves the COMPLETED side of the workflow only — the words the
board's `completed` filter noun stands for (FILTER_STATUS_WORDS), resolved per
query against the current cycle. The documents reuse the self-evaluation wire
render (services.self_evaluation.render_document) so the review PDF contract
exists once; manager assessments ride the wire but the PDF builder excludes
them. Router docs for the three endpoints live with the router.
"""

from app.core.errors import AppError
from app.models.review_cycle import ReviewCycle
from app.repositories.evaluation_repository import EvaluationRepository
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.review_cycle_repository import ReviewCycleRepository
from app.schemas.self_evaluation import (
    CompletedReviewCount,
    ReviewDocumentList,
    SelfEvaluationOut,
)
from app.schemas.table_query import TableQuery
from app.services.self_evaluation import FILTER_STATUS_WORDS, current_cycle, render_document

#: The stored-status words (wire case) behind "completed" — every use case
#: here filters on this one bucket, whatever the query's own `status` says;
#: the repositories never read query.status, and the client's export calls
#: drop the word so the wire states exactly what the read serves.
_COMPLETED_WORDS = FILTER_STATUS_WORDS["completed"]


async def completed_documents(
    employee_repository: EmployeeRepository,
    cycle_repository: ReviewCycleRepository,
    query: TableQuery,
) -> ReviewDocumentList:
    cycle: ReviewCycle = await current_cycle(cycle_repository)
    pairs = await employee_repository.roster_year_matching(
        cycle.review_year, query, statuses=_COMPLETED_WORDS
    )
    documents = [render_document(employee, cycle, evaluation) for employee, evaluation in pairs]
    return ReviewDocumentList(evaluations=documents, total=len(documents))


async def completed_count(
    employee_repository: EmployeeRepository,
    cycle_repository: ReviewCycleRepository,
    query: TableQuery,
) -> CompletedReviewCount:
    cycle = await current_cycle(cycle_repository)
    count = await employee_repository.count_matching(
        query, review_year=cycle.review_year, statuses=_COMPLETED_WORDS
    )
    return CompletedReviewCount(completed_count=count)


async def employee_document(
    employee_id: str,
    *,
    employee_repository: EmployeeRepository,
    cycle_repository: ReviewCycleRepository,
    evaluation_repository: EvaluationRepository,
) -> SelfEvaluationOut:
    employee = await employee_repository.get(employee_id)
    if employee is None:
        raise AppError(
            "Employee not found in the roster.", code="employee_missing", status_code=404
        )
    cycle = await current_cycle(cycle_repository)
    evaluation = await evaluation_repository.get_for_employee(employee_id, cycle.review_year)
    if evaluation is None or evaluation.status.lower() not in _COMPLETED_WORDS:
        raise AppError(
            "This employee's review is not completed yet.",
            code="review_not_completed",
            status_code=409,
        )
    return render_document(employee, cycle, evaluation)
