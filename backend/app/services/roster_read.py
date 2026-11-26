"""Serves the admin Users table's reads: the list page and its CSV export.

The Users table shares the board's form-status filter (`status`: all |
pending | completed), so both reads resolve query.status through the same
bucket map the board's service owns (FILTER_STATUS_WORDS), against the
current cycle. The export renders the roster CSV contract verbatim — the
same headers the import validates, Title case — so a download round-trips
through the upload.
"""

import csv
import io
from collections.abc import Iterable, Sequence

from app.models.employee import Employee
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.review_cycle_repository import ReviewCycleRepository
from app.schemas.table_query import TableQuery
from app.services.roster_mapping import to_row
from app.services.self_evaluation import FILTER_STATUS_WORDS, current_cycle

#: The roster export column contract: (CSV header, RosterEmployeeOut field)
#: — the wire shape the import parses, so title changes never drift from the
#: parse contract. rosterCsv.ts (frontend) mirrors this order. The review
#: status export appends its own two board columns after these.
EXPORT_COLUMNS: tuple[tuple[str, str], ...] = (
    ("Employee Name", "name"),
    ("Employee ID", "employee_id"),
    ("Email", "email"),
    ("Designation", "designation"),
    ("Location", "location"),
    ("Org", "org"),
    ("Business Unit", "business_unit"),
    ("Current Account / Project", "project"),
    ("Delivery Head", "delivery_head"),
    ("Delivery Manager", "delivery_manager"),
    ("Business Partner", "business_partner"),
    ("Reporting Manager", "reporting_manager"),
    ("Status", "status"),
    # Note: rendered by csv.writer — None prints as the empty string, a date
    # prints as its ISO form — so this column round-trips the upload contract.
    ("Date of Joining", "joining_date"),
)


def export_csv(headers: Sequence[str], rows: Iterable[Sequence[str]]) -> str:
    """RFC 4180 CSV text, Excel-friendly: CRLF rows, a UTF-8 BOM, and empty
    roster cells as empty strings (the parse round-trips them). Both admin
    CSV exports render through this one writer."""
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    return "\ufeff" + buffer.getvalue()


async def _status_terms(
    query: TableQuery, cycle_repository: ReviewCycleRepository
) -> tuple[frozenset[str] | None, int | None]:
    """query.status as the repository's narrowing terms: the wire words (None
    = any) and the cycle year they filter through, or (None, None) when no
    status word narrows the read. A status filter without a configured cycle
    is the board's cycle_missing envelope, not a silent all-roster read."""
    if query.status == "all":
        return None, None
    cycle = await current_cycle(cycle_repository)
    return FILTER_STATUS_WORDS[query.status], cycle.review_year


async def employees_page(
    employee_repository: EmployeeRepository,
    cycle_repository: ReviewCycleRepository,
    query: TableQuery,
    page: int,
    page_size: int,
) -> tuple[list[Employee], int]:
    """One Users-table page with the filtered total under the composed query."""
    statuses, review_year = await _status_terms(query, cycle_repository)
    return await employee_repository.paged(
        query,
        page,
        page_size,
        review_year=review_year,
        statuses=statuses,
    )


async def employees_to_export(
    employee_repository: EmployeeRepository,
    cycle_repository: ReviewCycleRepository,
    query: TableQuery,
) -> str:
    """CSV text of every roster row the composed query matches."""
    statuses, review_year = await _status_terms(query, cycle_repository)
    employees = await employee_repository.matching(
        query, review_year=review_year, statuses=statuses
    )
    return export_csv(
        [header for header, _field in EXPORT_COLUMNS],
        [
            [getattr(to_row(employee), field) for _header, field in EXPORT_COLUMNS]
            for employee in employees
        ],
    )
