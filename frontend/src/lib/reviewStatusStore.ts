import {
  MOCK_EMPLOYEE,
  deriveReviewStatus,
  loadSelfEvaluationRecord,
} from './selfEvaluationStore'
import type { Employee, ReviewStatus } from './types'

export type CompletionFilter = 'all' | 'pending' | 'completed'

export const COMPLETION_FILTERS: readonly { value: CompletionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
]

/** Mock roster-wide assignment until the backend serves admin review state.
    Weighted cycle keeps the distribution realistic for the seed list. */
const MOCK_STATUS_CYCLE: readonly ReviewStatus[] = [
  'in_progress',
  'submitted',
  'not_started',
  'signed_off',
  'submitted',
  'in_progress',
  'not_started',
  'submitted',
  'signed_off',
  'not_started',
]

export interface EmployeeReviewStatus {
  employee: Employee
  status: ReviewStatus
}

/** Submitted and signed-off reviews count as complete for admin filtering. */
export function isReviewComplete(status: ReviewStatus): boolean {
  return status === 'submitted' || status === 'signed_off'
}

function mockStatusFor(email: string): ReviewStatus {
  const hash = [...email].reduce((sum, character) => sum + character.charCodeAt(0), 0)
  return MOCK_STATUS_CYCLE[hash % MOCK_STATUS_CYCLE.length] ?? 'not_started'
}

export function loadReviewStatuses(employees: readonly Employee[]): EmployeeReviewStatus[] {
  const liveRecord = loadSelfEvaluationRecord()
  return employees.map((employee) => ({
    employee,
    status:
      employee.email === MOCK_EMPLOYEE.email
        ? deriveReviewStatus(liveRecord)
        : mockStatusFor(employee.email),
  }))
}

export function countReviewStatuses(entries: readonly EmployeeReviewStatus[]): Record<ReviewStatus, number> {
  const counts: Record<ReviewStatus, number> = {
    not_started: 0,
    in_progress: 0,
    submitted: 0,
    signed_off: 0,
  }
  for (const entry of entries) counts[entry.status] += 1
  return counts
}

export function filterEntries(
  entries: readonly EmployeeReviewStatus[],
  filter: CompletionFilter,
): EmployeeReviewStatus[] {
  if (filter === 'all') return [...entries]
  if (filter === 'pending') return entries.filter((entry) => !isReviewComplete(entry.status))
  return entries.filter((entry) => isReviewComplete(entry.status))
}
