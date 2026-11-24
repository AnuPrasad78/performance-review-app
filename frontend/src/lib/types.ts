/** Mirrors the roster CSV the backend validates (see POST /api/employees/import):
    Employee Name, Employee ID, Email, Designation, Location, Org,
    Current Account / Project, Delivery Head, Delivery Manager, Business
    Partner, Reporting Manager, Status. */
export type EmployeeStatus = 'Active' | 'Inactive'

export interface Employee {
  employeeId: string
  name: string
  email: string
  designation: string
  location: string
  org: string
  project: string
  deliveryHead: string
  deliveryManager: string
  businessPartner: string
  reportingManager: string
  status: EmployeeStatus
}

/** One cycle's settings as the admin API serves them (GET/PUT /api/cycle-settings).
    The submission deadline is an explicit-offset instant (UTC on the wire);
    the windows stay plain dates because those phases operate on whole days. */
export interface CycleSettings {
  reviewYear: number
  submissionDeadline: string
  managerReviewStart: string
  managerReviewEnd: string
  hrApprovalReleaseBy: string
}

/** The admin form's editable view of CycleSettings: the deadline split into a
    date and a (UTC) time input, the year kept as text until validation turns
    it into the wire's number. */
export interface CycleSettingsDraft {
  reviewYear: string
  deadlineDate: string
  deadlineTime: string
  managerReviewStart: string
  managerReviewEnd: string
  hrApprovalReleaseBy: string
}

export interface RosterRowError {
  line: number
  message: string
}

/** One uploaded row whose employee_id is already stored — the admin decides
    per row whether the stored employee is overwritten (Update) or kept. */
export interface RosterConflict {
  employeeId: string
  existing: Employee
  incoming: Employee
  changedFields: string[]
}

export type RosterImportReport = {
  importedCount: number
  duplicatesSkipped: number
  conflicts: RosterConflict[]
  /** Every validated row; the client echoes the new ones back in the apply
      call (rows the admin decided to keep simply stay out). */
  employees: Employee[]
}

export type RosterImportResult =
  | { ok: true; report: RosterImportReport }
  | { ok: false; detail: string; code: string; rowErrors: RosterRowError[] }

export type RosterApplyResult =
  | { ok: true; importedCount: number; updatedCount: number }
  | { ok: false; detail: string; code: string }

export type EmployeeListResult =
  | { ok: true; employees: Employee[] }
  | { ok: false; detail: string; code: string }

export type CycleSettingsFieldErrors = {
  reviewYear: string | null
  deadlineDate: string | null
  deadlineTime: string | null
  managerReviewStart: string | null
  managerReviewEnd: string | null
  hrApprovalReleaseBy: string | null
}

export type CycleSettingsResult =
  | { ok: true; settings: CycleSettings }
  | { ok: false; detail: string; code: string }

export type CycleSettingsValidation = {
  fieldErrors: CycleSettingsFieldErrors
  dateError: string | null
  isValid: boolean
}

export type RatingValue = 1 | 2 | 3 | 4 | 5

/** One published rating level as the rating-scale reference table renders it. */
export interface RatingScaleEntry {
  value: RatingValue
  name: string
  description: string
}

/** Maps onto the fixed pill vocabulary: submitted → pending visuals, signed_off → approved visuals. */
export type ReviewStatus = 'not_started' | 'in_progress' | 'submitted' | 'signed_off'

export type AssessmentQuestionId = 'contribution' | 'strengths' | 'development' | 'support'

export interface AssessmentQuestion {
  id: AssessmentQuestionId
  /** Short heading from the 2026 form, e.g. "Key contributions and achievements". */
  title: string
  /** Full prompt the employee answers. */
  question: string
  employeeResponse: string
  managerComment: string | null
}

export interface ForwardCommitment {
  id: number
  commitment: string
  support: string
}

/** Employee identity is composed from the existing Employee type — never redefined here. */
export interface SelfEvaluationEmployee extends Employee {
  employeeId: string
  location: string
  deliveryManager: string
  deliveryHead: string
}

export type SelfEvaluationEmployeeField = keyof SelfEvaluationEmployee

export interface SelfEvaluationDraft {
  employee: SelfEvaluationEmployee
  questions: readonly AssessmentQuestion[]
  overallRating: RatingValue | null
  overallSummary: string
  commitments: readonly ForwardCommitment[]
  acknowledged: boolean
}

export interface SelfEvaluationFieldErrors {
  questionErrors: Partial<Record<AssessmentQuestionId, string>>
  overallRating: string | null
  overallSummary: string | null
}

export interface SelfEvaluationValidation {
  fieldErrors: SelfEvaluationFieldErrors
  isValid: boolean
}

export type ReviewSaveResult = { ok: true } | { ok: false; error: string }

/** Identity the API reports for the signed-in address — wire mirror of
    backend SessionOut; `role` duplicates AuthRole's union inline because
    types.ts must not import the auth module back. */
export interface SessionWire {
  employeeId: string
  name: string
  email: string
  role: 'admin' | 'employee'
}

export type SessionApiResult =
  | { ok: true; session: SessionWire }
  | { ok: false; detail: string; code: string }

/** Per-topic answer values as the review form names them; the backend maps
    q1..q4 storage columns onto these ids. */
export interface TopicResponses {
  contribution: string
  strengths: string
  development: string
  support: string
}

/** Wire mirror of GET/PATCH/POST(/submit) responses: one payload mixing
    profile, the evaluation row, and cycle settings. Dates are ISO
    yyyy-mm-dd or null; the summary deadline is an ISO instant (with offset).
    `deadlinePassed` is the server's own "form is closed" verdict — the UI
    renders the closed state and the countdown from the pair, never its own
    clock math for open/closed decisions. */
export interface SelfEvaluationWire {
  employee: Employee
  reviewYear: number
  submissionDeadline: string
  deadlinePassed: boolean
  submittedAt: string | null
  employeeSignedAt: string | null
  responses: TopicResponses
  managerComments: TopicResponses
  overallRating: number | null
  overallSummary: string
  forwardCommitments: { commitment: string; support: string }[]
  /** The server owns the commitment-lock window (open review, or post-submit
      until manager review end); the UI never re-derives it. */
  commitmentsEditable: boolean
}

export type SelfEvaluationApiResult =
  | { ok: true; data: SelfEvaluationWire }
  | { ok: false; detail: string; code: string }

/** Presence-shaped partial update: provided members move, omitted ones stand.
    Mirrors backend SelfEvaluationPatch, employee-owned fields only. Note the
    patch's wire key is `selfRating` (backend SelfEvaluationPatch.self_rating)
    even though the GET response calls the same value `overallRating` —
    writing and reading models differ on this side of the seam. */
export interface SelfEvaluationPartial {
  responses?: TopicResponses
  selfRating?: number | null
  overallSummary?: string
  forwardCommitments?: { commitment: string; support: string }[]
}

/** One roster row as the admin board sees it: the profile the board renders
    (the full roster wire shape, reused) plus the derived workflow word. */
export interface ReviewStatusWire {
  employee: Employee
  status: ReviewStatus
}

export type ReviewStatusResult =
  | { ok: true; reviews: ReviewStatusWire[] }
  | { ok: false; detail: string; code: string }
