/** The employee view's domain layer: wire → record translation, status
    derivation, and the draft → patch payload. All reads and writes are API
    calls on /api/evaluations/me (api.ts); this module holds no storage of its
    own — except the wizard's resume position, which is pure client-side UI
    state and never belongs in the record the server keeps. */

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
  /** Server-owned "the form is closed" verdict: after this moment the page
      renders the closed state, and saves/refusals come from the server too. */
  deadlinePassed: boolean
  /** Server-owned lock flag: open reviews and post-submit-before-manager-end. */
  commitmentsEditable: boolean
  /** Server-owned last-save stamp for the "Draft saved at" display. */
  lastSavedAt: string | null
}

/** Where the wizard resumes on reload; keyed to its own storage entry so the
    API record stays free of view-only fields, and namespaced per signed-in
    email so one account's position never leaks into another's on sign-out. */
export interface ResumeIndices {
  lastStepIndex: number | null
  lastQuestionIndex: number | null
}

const RESUME_STORAGE_KEY = 'performance-review.employee.resume.v1'

function resumeKey(email: string): string {
  return `${RESUME_STORAGE_KEY}:${email.toLowerCase()}`
}

export function loadResumeIndices(email: string): ResumeIndices {
  try {
    const raw = window.localStorage.getItem(resumeKey(email))
    if (raw === null) return { lastStepIndex: null, lastQuestionIndex: null }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return { lastStepIndex: null, lastQuestionIndex: null }
    }
    const candidate = parsed as Record<string, unknown>
    return {
      lastStepIndex: typeof candidate.lastStepIndex === 'number' ? candidate.lastStepIndex : null,
      lastQuestionIndex:
        typeof candidate.lastQuestionIndex === 'number' ? candidate.lastQuestionIndex : null,
    }
  } catch {
    return { lastStepIndex: null, lastQuestionIndex: null }
  }
}

export function saveResumeIndices(email: string, indices: ResumeIndices): void {
  try {
    window.localStorage.setItem(resumeKey(email), JSON.stringify(indices))
  } catch {
    // Persistence is a view concern; navigation keeps working without it.
  }
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

function managerCommentOf(value: string): string | null {
  return value === '' ? null : value
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
    deadlinePassed: data.deadlinePassed,
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
      managerComment: managerCommentOf(data.managerComments[question.id]),
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
    deadlinePassed: data.deadlinePassed,
    commitmentsEditable: data.commitmentsEditable,
    lastSavedAt: data.lastSavedAt,
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

/** Status derives from what the API persisted, so the strip never invents review state.
    A signed form still counts as submitted — the display vocabulary has no signed-off word. */
export function deriveReviewStatus(record: SelfEvaluationRecord): ReviewStatus {
  if (record.submittedAt !== null || record.employeeSignedAt !== null) return 'submitted'
  const answered = record.draft.questions.some((question) => question.employeeResponse !== '')
  return answered ? 'in_progress' : 'not_started'
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
}

/** Fixed pill vocabulary only (ui.md §4.1): approved / pending / cancelled wash+text pairs. */
export type ReviewStatusTone = 'approved' | 'pending' | 'cancelled'

export function reviewStatusTone(status: ReviewStatus): ReviewStatusTone {
  if (status === 'not_started') return 'cancelled'
  return 'pending'
}
