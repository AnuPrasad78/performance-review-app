/** The employee view's domain layer: wire → record translation, status
    derivation, and the draft → patch payload. Storage and fetching no longer
    live here — GET/PATCH/POST on /api/evaluations/me is the source (api.ts). */

import { EMPTY_COMMITMENTS, REVIEW_QUESTIONS } from './selfEvaluationContent'
import type {
  ForwardCommitment,
  RatingValue,
  ReviewStatus,
  SelfEvaluationDraft,
  SelfEvaluationEmployee,
  SelfEvaluationPartial,
  SelfEvaluationWire,
  TopicResponses,
} from './types'

export interface SelfEvaluationRecord {
  draft: SelfEvaluationDraft
  submittedAt: string | null
  employeeSignedAt: string | null
  submissionDeadline: string
  /** Server-owned lock flag: open reviews and post-submit-before-manager-end. */
  commitmentsEditable: boolean
}

export function buildFreshDraft(employee: SelfEvaluationEmployee): SelfEvaluationDraft {
  return {
    employee,
    questions: REVIEW_QUESTIONS.map((question) => ({ ...question, employeeResponse: '' })),
    overallRating: null,
    overallSummary: '',
    commitments: EMPTY_COMMITMENTS.map((commitment) => ({ ...commitment })),
    acknowledged: false,
  }
}

function ratingOf(value: number | null): RatingValue | null {
  return value !== null && value >= 1 && value <= 5 ? (value as RatingValue) : null
}

function commitmentsFromApi(values: readonly { commitment: string; support: string }[]): readonly ForwardCommitment[] {
  // Positional ids only: the wire list is authoritative and the ids exist so
  // the form's React keys and change handlers can address a row.
  if (values.length === 0) return EMPTY_COMMITMENTS.map((commitment) => ({ ...commitment }))
  return values.map((entry, index) => ({ ...entry, id: index + 1 }))
}

/** Workflow-state refresh after a save. The server echo is at most as new as
    the client draft (typing continued during the request), so only the
    server-owned fields — dates, deadline, lock flag — are taken back; the
    local draft keeps every unsaved keystroke instead of being clobbered. */
export function mergeRecordFromApi(
  record: SelfEvaluationRecord,
  data: SelfEvaluationWire,
): SelfEvaluationRecord {
  return {
    ...record,
    submittedAt: data.submittedAt,
    employeeSignedAt: data.employeeSignedAt,
    submissionDeadline: data.submissionDeadline,
    commitmentsEditable: data.commitmentsEditable,
  }
}

/** The record is rebuilt from every API answer — GET, PATCH, and POST all
    return the same wire shape, so the page always ends on server truth. */
export function recordFromApi(data: SelfEvaluationWire): SelfEvaluationRecord {
  const draft: SelfEvaluationDraft = {
    ...buildFreshDraft(data.employee),
    questions: REVIEW_QUESTIONS.map((question) => ({
      ...question,
      employeeResponse: data.responses[question.id],
      managerComment: data.managerComments[question.id] !== '' ? data.managerComments[question.id] : null,
    })),
    overallRating: ratingOf(data.overallRating),
    overallSummary: data.overallSummary,
    commitments: commitmentsFromApi(data.forwardCommitments),
    acknowledged: data.employeeSignedAt !== null,
  }
  return {
    draft,
    submittedAt: data.submittedAt,
    employeeSignedAt: data.employeeSignedAt,
    submissionDeadline: data.submissionDeadline,
    commitmentsEditable: data.commitmentsEditable,
  }
}

/** Draft → the presence-shaped patch. While the review is open this sends the
    whole employee-owned subset; after submit the caller reduces it to
    commitments only (the server rejects the frozen members either way). */
export function payloadFromDraft(draft: SelfEvaluationDraft): SelfEvaluationPartial {
  const responses = {} as TopicResponses
  for (const question of draft.questions) {
    responses[question.id] = question.employeeResponse
  }
  return {
    responses,
    // The patch's wire key (backend contract) is selfRating; the GET's is
    // overallRating. Using the GET's key here was silently dropped by the
    // backend — the regression test pins the body's key name.
    selfRating: draft.overallRating,
    overallSummary: draft.overallSummary,
    forwardCommitments: draft.commitments.map(({ commitment, support }) => ({
      commitment,
      support,
    })),
  }
}

export function commitmentsPayloadFromDraft(draft: SelfEvaluationDraft): SelfEvaluationPartial {
  return {
    forwardCommitments: draft.commitments.map(({ commitment, support }) => ({
      commitment,
      support,
    })),
  }
}

/** Status derives from what the API persisted, so the strip never invents review state. */
export function deriveReviewStatus(record: SelfEvaluationRecord): ReviewStatus {
  if (record.employeeSignedAt !== null) return 'signed_off'
  if (record.submittedAt !== null) return 'submitted'
  const answered = record.draft.questions.some((question) => question.employeeResponse !== '')
  return answered ? 'in_progress' : 'not_started'
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
  signed_off: 'Signed off',
}

/** Fixed pill vocabulary only (ui.md §4.1): approved / pending / cancelled wash+text pairs. */
export type ReviewStatusTone = 'approved' | 'pending' | 'cancelled'

export function reviewStatusTone(status: ReviewStatus): ReviewStatusTone {
  if (status === 'signed_off') return 'approved'
  if (status === 'not_started') return 'cancelled'
  return 'pending'
}
