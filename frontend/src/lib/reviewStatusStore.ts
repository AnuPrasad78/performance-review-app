/** The admin review board's shared vocabulary: the entry shape the API feeds,
    the form-status filter nouns, and the distribution counts. Status words
    come from the backend's stored six-word lifecycle (GET /api/evaluations),
    parsed verbatim in lib/api — nothing is fabricated or merged here; the
    backend's statusCounts already covers the whole roster. The display
    collapse this module once owned is gone: the stored word *is* the display
    word. */

import type { Employee, ReviewStatus, StatusFilter } from './types'

export type EmployeeReviewStatus = {
  employee: Employee
  status: ReviewStatus
}

export type CompletionFilter = StatusFilter

/** The vocabulary's single ordered list — the lifecycle words in workflow
    order, wire form. lib/api parses board rows against it; the board's pie
    walks it in the same order so the calendar and the color ladder agree. */
export const REVIEW_STATUS_WORDS: readonly ReviewStatus[] = [
  'not_started',
  'self_evaluation_in_progress',
  'self_evaluation_completed',
  'in_manager_review',
  'manager_evaluation_in_progress',
  'manager_evaluation_completed',
]

/** The form-status filter's nouns: `all` plus one per lifecycle word — the
    stored word *is* the query. Naming mirrors the backend's
    FILTER_STATUS_WORDS (services/self_evaluation); the old bucket nouns
    (pending/completed) are gone — the six-word column outgrew them. */
export const COMPLETION_FILTERS: readonly { value: CompletionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'not_started', label: 'Not started' },
  { value: 'self_evaluation_in_progress', label: 'Self-evaluation in progress' },
  { value: 'self_evaluation_completed', label: 'Self-evaluation completed' },
  { value: 'in_manager_review', label: 'In manager review' },
  { value: 'manager_evaluation_in_progress', label: 'Manager evaluation in progress' },
  { value: 'manager_evaluation_completed', label: 'Manager evaluation completed' },
]

/** The past-submission side of the flow — the frontend mirror of the
    backend's PAST_SUBMISSION_WORDS, and deliberately NOT a filter noun: the
    boards' download affordances key off it ("a finished review, wherever it
    sits in the manager phase") while the filter stays exact. */
export const PAST_SUBMISSION_STATUSES: readonly ReviewStatus[] = [
  'self_evaluation_completed',
  'in_manager_review',
  'manager_evaluation_in_progress',
  'manager_evaluation_completed',
]

/** Did the row leave the employee's hands? The one predicate the board's
    detail card switches on (download affordance, form-status pair). */
export function isPastSubmission(status: ReviewStatus): boolean {
  return PAST_SUBMISSION_STATUSES.includes(status)
}

/** The roster's whole size from the server's whole-roster distribution —
    summing here keeps the board from re-counting rows it only ever sees a
    server slice of. */
export function rosterTotal(counts: Partial<Record<ReviewStatus, number>>): number {
  return REVIEW_STATUS_WORDS.reduce((total, word) => total + (counts[word] ?? 0), 0)
}
