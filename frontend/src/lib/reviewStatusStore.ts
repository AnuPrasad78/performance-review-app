/** The admin review board's shared vocabulary: the entry shape the API feeds,
    filter nouns, and the display counts. Status values come from the
    backend's stored six-word lifecycle (GET /api/evaluations) — nothing is
    fabricated here; distribution counting happens server-side. */

import type { Employee, RawReviewStatus, ReviewStatus, StatusFilter } from './types'

export type EmployeeReviewStatus = {
  employee: Employee
  status: ReviewStatus
  /** Submissions stamp from evaluations.employee_signed_at; null while open. */
  submittedAt: string | null
}

/** The status filter's nouns; each names the backend's status= query word. */
export type CompletionFilter = StatusFilter

export const COMPLETION_FILTERS: readonly { value: CompletionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'not_started', label: 'Not started' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
]

/** The one collapse point between the backend's six wire words and the
    three display pill words. `not_started` maps to itself and self-eval
    work to `in_progress`; every past-submission word — the whole manager
    phase today — counts as `submitted`, exactly as the signed_off word did
    before the lifecycle widened. The manager-phase pills land here when
    that phase ships UI. */
export const RAW_TO_DISPLAY: Record<RawReviewStatus, ReviewStatus> = {
  not_started: 'not_started',
  self_evaluation_in_progress: 'in_progress',
  self_evaluation_completed: 'submitted',
  in_manager_review: 'submitted',
  manager_evaluation_in_progress: 'submitted',
  manager_evaluation_completed: 'submitted',
}

/** The board tiles and pie render display words; `counts` covers the
    backend's six-word vocabulary, collapsed here — this module is the
    single place the collapse exists. */
export function displayCounts(
  counts: Partial<Record<RawReviewStatus, number>>,
): Record<ReviewStatus, number> {
  const grab = (status: RawReviewStatus): number => counts[status] ?? 0
  return {
    not_started: grab('not_started'),
    in_progress: grab('self_evaluation_in_progress'),
    submitted:
      grab('self_evaluation_completed') +
      grab('in_manager_review') +
      grab('manager_evaluation_in_progress') +
      grab('manager_evaluation_completed'),
  }
}