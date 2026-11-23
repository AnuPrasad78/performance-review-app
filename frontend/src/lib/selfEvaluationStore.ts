import { EMPTY_COMMITMENTS, REVIEW_QUESTIONS } from './selfEvaluationContent'
import type {
  ReviewSaveResult,
  ReviewStatus,
  SelfEvaluationDraft,
  SelfEvaluationEmployee,
} from './types'

const STORAGE_KEY = 'performance-review.employee.v1'

export interface SelfEvaluationRecord {
  draft: SelfEvaluationDraft | null
  submittedAt: string | null
  employeeSignedAt: string | null
}

/** Mock identity for the employee persona until the backend supplies the session user. */
export const MOCK_EMPLOYEE: SelfEvaluationEmployee = {
  employeeId: 'EMP-V001',
  name: 'Asha Menon',
  email: 'asha_menon@emids.com',
  designation: 'Software Engineer',
  location: 'India',
  org: 'Delivery',
  project: 'Cigna One',
  deliveryHead: 'Arumugam Thiraviam',
  deliveryManager: 'Priya Raghavan',
  businessPartner: 'John D',
  reportingManager: 'Priya Raghavan',
  status: 'Active',
}

export function buildFreshDraft(): SelfEvaluationDraft {
  return {
    employee: MOCK_EMPLOYEE,
    questions: REVIEW_QUESTIONS.map((question) => ({ ...question, employeeResponse: '' })),
    overallRating: null,
    overallSummary: '',
    commitments: EMPTY_COMMITMENTS.map((commitment) => ({ ...commitment })),
    acknowledged: false,
  }
}

function isDraftShape(value: unknown): value is SelfEvaluationDraft {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.overallSummary === 'string' && Array.isArray(candidate.questions)
}

/** Status derives from what was persisted, so the strip never invents review state. */
export function deriveReviewStatus(record: SelfEvaluationRecord): ReviewStatus {
  if (record.employeeSignedAt !== null) return 'signed_off'
  if (record.submittedAt !== null) return 'submitted'
  if (record.draft !== null) return 'in_progress'
  return 'not_started'
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

export function loadSelfEvaluationRecord(): SelfEvaluationRecord {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return { draft: null, submittedAt: null, employeeSignedAt: null }
  }
  if (raw === null) return { draft: null, submittedAt: null, employeeSignedAt: null }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return { draft: null, submittedAt: null, employeeSignedAt: null }
    }
    // Cross-shape persistence data is untrusted input on replay, so only typed-known
    // pieces are carried over; everything else resets to fresh.
    const candidate = parsed as Record<string, unknown>
    const draft = isDraftShape(candidate.draft) ? candidate.draft : null
    const submittedAt = typeof candidate.submittedAt === 'string' ? candidate.submittedAt : null
    const employeeSignedAt =
      typeof candidate.employeeSignedAt === 'string' ? candidate.employeeSignedAt : null
    return { draft, submittedAt, employeeSignedAt }
  } catch {
    return { draft: null, submittedAt: null, employeeSignedAt: null }
  }
}

function writeRecord(record: SelfEvaluationRecord): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Persistence is a mock concern; the page keeps its in-memory state working without it.
  }
}

export function saveDraftRecord(record: SelfEvaluationRecord): ReviewSaveResult {
  writeRecord(record)
  return { ok: true }
}

/** Mock API over the module store. Pages swap these for fetch calls later; the
    resolved types are the backend seam, so component code never changes. */
export function getSelfEvaluation(): Promise<SelfEvaluationRecord> {
  return Promise.resolve(loadSelfEvaluationRecord())
}

export function saveSelfEvaluation(record: SelfEvaluationRecord): Promise<ReviewSaveResult> {
  return Promise.resolve(saveDraftRecord(record))
}
