/** The admin review board's shared vocabulary: the entry shape the API feeds,
    counting and filtering rules. Status values come from the backend's
    derived words (GET /api/evaluations) — nothing is fabricated here anymore. */

import type { Employee, ReviewStatus } from './types'

export type EmployeeReviewStatus = {
  employee: Employee
  status: ReviewStatus
}

export type CompletionFilter = 'all' | 'pending' | 'completed'

export const COMPLETION_FILTERS: readonly { value: CompletionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
]

/** Submitted and signed-off reviews count as complete for admin filtering. */
export function isReviewComplete(status: ReviewStatus): boolean {
  return status === 'submitted' || status === 'signed_off'
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
