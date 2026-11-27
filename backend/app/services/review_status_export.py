"""Serves the review status board's CSV export.

The admin review console's Download CSV: every employee row the composed
board query matches — never just the page slice — rendered under the roster
CSV contract verbatim plus the board's two columns (form status, submitted
date), in the order GET /api/evaluations sorts. The form-status words mirror
the board's three display pills, whose single collapse the frontend keeps
(lib/reviewStatusStore RAW_TO_DISPLAY): the two words the employee still
owns stay distinct, every stored past-submission word reads "Submitted".
"""

from app.models.evaluation import (
    STATUS_NOT_STARTED,
    STATUS_SELF_EVALUATION_IN_PROGRESS,
    Evaluation,
)
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.review_cycle_repository import ReviewCycleRepository
from app.schemas.table_query import TableQuery
from app.services.roster_mapping import to_row
from app.services.roster_read import EXPORT_COLUMNS, export_csv
from app.services.self_evaluation import FILTER_STATUS_WORDS, current_cycle


def _form_status(evaluation: Evaluation | None) -> str:
    if evaluation is None or evaluation.status == STATUS_NOT_STARTED:
        return "Not started"
    if evaluation.status == STATUS_SELF_EVALUATION_IN_PROGRESS:
        return "In progress"
    return "Submitted"


def _submitted_date(evaluation: Evaluation | None) -> str:
    # Same read the board's Submitted date cell renders: the signature
    # instant evaluates to None while the form is open, so the cell is blank.
    if evaluation is None or evaluation.employee_signed_at is None:
        return ""
    return evaluation.employee_signed_at.date().isoformat()


async def review_status_csv(
    employee_repository: EmployeeRepository,
    cycle_repository: ReviewCycleRepository,
    query: TableQuery,
) -> str:
    """CSV text of the whole matched board set: the roster columns, then the
    employee's form status and submitted date."""
    cycle = await current_cycle(cycle_repository)
    words = FILTER_STATUS_WORDS[query.status]
    rows = await employee_repository.roster_year_matching(
        cycle.review_year, query, statuses=None if not words else list(words)
    )
    headers = [header for header, _field in EXPORT_COLUMNS]
    headers.extend(("Form Status", "Submitted Date"))
    return export_csv(
        headers,
        [
            [
                *(getattr(to_row(employee), field) for _header, field in EXPORT_COLUMNS),
                _form_status(evaluation),
                _submitted_date(evaluation),
            ]
            for employee, evaluation in rows
        ],
    )
