/** The admin review board's shared vocabulary: the entry shape the API feeds,
    filter nouns, and the display counts. Status values come from the
    backend's derived words (GET /api/evaluations) — nothing is fabricated
    here; distribution counting happens server-side. */

import type { Employee, RawReviewStatus, ReviewStatus, StatusFilter } from './types'

export type EmployeeReviewStatus = {
  employee: Employee
  status: ReviewStatus
}

/** The status filter's nouns; each names the backend's status= query word. */
export type CompletionFilter = StatusFilter

export const COMPLETION_FILTERS: readonly { value: CompletionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
]

/** The board's display vocabulary has no signed-off word: a signed form
    counts inside `submitted`. `counts` covers the backend's four-word
    vocabulary (signed_off included); this is the single place the collapse. */
export function displayCounts(
  counts: Partial<Record<RawReviewStatus, number>>,
): Record<ReviewStatus, number> {
  const grab = (status: RawReviewStatus): number => counts[status] ?? 0
  return {
    not_started: grab('not_started'),
    in_progress: grab('in_progress'),
    submitted: grab('submitted') + grab('signed_off'),
  }
}
