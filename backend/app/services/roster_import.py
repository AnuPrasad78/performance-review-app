"""Roster CSV parsing and validation.

The single source of truth for what the app accepts as a roster upload —
per CLAUDE.md the backend rule is authoritative, the frontend only renders.

Accepted shape (the all-valid / managers roster):

    Employee Name, Employee ID, Email, Designation, Location, Org,
    Business Unit, Current Account / Project, Delivery Head, Delivery Manager,
    Business Partner, Reporting Manager, Status, Date of Joining

Row rules: employee name, employee ID, email, and reporting manager are
required; email is shape-checked; status is limited to Active/Inactive; a
Date of Joining cell, when given, is an ISO date (blank is allowed — the
review-cycle eligibility gate treats a missing DOJ as eligible).
Duplicate emails inside one file are skipped (counted); duplicate employee
IDs are a row error because employee_id is the primary key.

This module is parsing only — it never touches the database; deciding what to
write against stored employees is roster_diff's concern.
"""

import csv
import datetime
import re
from collections.abc import Iterator
from dataclasses import dataclass

from app.core.errors import AppError
from app.schemas.employee import (
    RosterEmployeeOut,
    RosterRowError,
    RosterRowErrors,
)

ROSTER_HEADER_COLUMNS = [
    "employee name",
    "employee id",
    "email",
    "designation",
    "location",
    "org",
    "business unit",
    "current account / project",
    "delivery head",
    "delivery manager",
    "business partner",
    "reporting manager",
    "status",
    "date of joining",
]

#: Values a row must carry to be importable at all.
REQUIRED_COLUMNS = ("employee name", "employee id", "email", "reporting manager")

EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

JOINING_DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")

VALID_STATUSES = ("active", "inactive")


class RosterHeaderInvalid(AppError):
    def __init__(self) -> None:
        super().__init__(
            "The header row must list: " + ", ".join(ROSTER_HEADER_COLUMNS) + ".",
            code="roster_header_invalid",
        )


class RosterFileUnreadable(AppError):
    def __init__(self) -> None:
        super().__init__(
            "The file could not be read as CSV text.",
            code="roster_file_unreadable",
        )


class RosterRowsInvalid(AppError):
    def __init__(self, errors: list[RosterRowError]) -> None:
        displayed = ", ".join(f"line {error.line}" for error in errors[:5])
        super().__init__(
            f"{len(errors)} row(s) failed validation "
            f"({displayed}{'…' if len(errors) > 5 else ''}).",
            code="roster_rows_invalid",
            payload=RosterRowErrors(errors=errors),
        )


class _CountingLineFeed:
    """Feeds physical lines to csv.reader while tracking the last one fed.

    csv.reader pulls one line at a time (more only when a quoted field spans
    lines), so after every yielded row `end_line` is the source line the row
    ends on — the number error messages name.
    """

    def __init__(self, lines: list[str]) -> None:
        self._lines = lines
        self._next_index = 0
        self.end_line = 0

    def __iter__(self) -> Iterator[str]:
        return self

    def __next__(self) -> str:
        if self._next_index >= len(self._lines):
            raise StopIteration
        line = self._lines[self._next_index]
        self._next_index += 1
        self.end_line = self._next_index
        return line


def _header_indexes(cells: list[str]) -> dict[str, int]:
    normalized = [cell.strip().lower() for cell in cells]
    if sorted(normalized) != sorted(ROSTER_HEADER_COLUMNS):
        raise RosterHeaderInvalid()
    return dict(zip(normalized, range(len(normalized)), strict=True))


def _cell(row_index: dict[str, int], cells: list[str], column: str) -> str:
    position = row_index[column]
    return cells[position].strip() if position < len(cells) else ""


def _validate_row(row_index: dict[str, int], cells: list[str]) -> str | None:
    def value(column: str) -> str:
        return _cell(row_index, cells, column)

    missing = [column for column in REQUIRED_COLUMNS if value(column) == ""]
    if missing:
        return f"missing required value(s): {', '.join(missing)}."
    if not EMAIL_PATTERN.fullmatch(value("email").lower()):
        return "email is missing or invalid."
    status = value("status")
    if status.lower() not in VALID_STATUSES:
        return f"status must be Active or Inactive, got '{status}'."
    joining = value("date of joining")
    if joining != "" and not JOINING_DATE_PATTERN.fullmatch(joining):
        return f"date of joining must be a YYYY-MM-DD date, got '{joining}'."
    return None


@dataclass(frozen=True)
class ParsedRoster:
    """Every valid row of one uploaded file plus the duplicate-email count.

    A file with any invalid row raises instead — the import is all-or-nothing
    by file, so a partial ParsedRoster never exists.
    """

    rows: list[RosterEmployeeOut]
    duplicates_skipped: int


def parse_roster_csv(data: bytes) -> ParsedRoster:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as decode_error:
        raise RosterFileUnreadable() from decode_error

    feed = _CountingLineFeed(text.splitlines())
    rows = csv.reader(feed)

    try:
        header = next(rows)
    except StopIteration as empty_error:
        raise RosterHeaderInvalid() from empty_error
    row_index = _header_indexes(header)

    employees: list[RosterEmployeeOut] = []
    row_errors: list[RosterRowError] = []
    seen_emails: set[str] = set()
    duplicates_skipped = 0

    for cells in rows:
        line_number = feed.end_line
        if cells and all(cell.strip() == "" for cell in cells):
            continue

        error_message = _validate_row(row_index, cells)
        if error_message is not None:
            row_errors.append(RosterRowError(line=line_number, message=error_message))
            continue

        employee_id = _cell(row_index, cells, "employee id")
        email = _cell(row_index, cells, "email").lower()
        if email in seen_emails:
            duplicates_skipped += 1
            continue
        if employee_id in {existing.employee_id for existing in employees}:
            row_errors.append(
                RosterRowError(
                    line=line_number,
                    message=f"employee ID '{employee_id}' appears more than once.",
                )
            )
            continue

        seen_emails.add(email)
        joining = _cell(row_index, cells, "date of joining")
        employees.append(
            RosterEmployeeOut(
                employee_id=employee_id,
                name=_cell(row_index, cells, "employee name"),
                email=email,
                designation=_cell(row_index, cells, "designation"),
                location=_cell(row_index, cells, "location"),
                org=_cell(row_index, cells, "org"),
                business_unit=_cell(row_index, cells, "business unit"),
                project=_cell(row_index, cells, "current account / project"),
                delivery_head=_cell(row_index, cells, "delivery head"),
                delivery_manager=_cell(row_index, cells, "delivery manager"),
                business_partner=_cell(row_index, cells, "business partner"),
                reporting_manager=_cell(row_index, cells, "reporting manager"),
                status=_cell(row_index, cells, "status").capitalize(),
                joining_date=datetime.date.fromisoformat(joining) if joining != "" else None,
            )
        )

    if row_errors:
        raise RosterRowsInvalid(row_errors)
    return ParsedRoster(
        rows=employees,
        duplicates_skipped=duplicates_skipped,
    )
