/** Mirrors the roster CSV the backend validates (see POST /api/employees/import):
    Employee Name, Employee ID, Email, Designation, Location, Org,
    Business Unit, Current Account / Project, Delivery Head, Delivery Manager,
    Business Partner, Reporting Manager, Status, Date of Joining. */
export type EmployeeStatus = 'Active' | 'Inactive'

export interface Employee {
  employeeId: string
  name: string
  email: string
  designation: string
  location: string
  org: string
  businessUnit: string
  project: string
  deliveryHead: string
  deliveryManager: string
  businessPartner: string
  reportingManager: string
  status: EmployeeStatus
  /** ISO date ('' when the roster cell is blank) — the review-form
      eligibility gate compares this against the cycle's cutoff date. */
  joiningDate: string
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
  /** The optional joining-date cutoff ('' = no restriction) — employees
      whose Date of Joining comes after it cannot access this cycle's form. */
  employeeEligibilityDate: string
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
  eligibilityDate: string
}

export interface RosterRowError {
  line: number
  message: string
}

/** One uploaded row whose email identity is already stored (case-insensitive
    match) — the admin decides per row whether the stored employee is
    overwritten (Update) or kept. */
export interface RosterConflict {
  email: string
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
  | { ok: true; employees: readonly Employee[]; total: number; page: number; pageSize: number }
  | { ok: false; detail: string; code: string }

/** GET /api/employees/export: the server's roster CSV of every employee the
    composed query matches (admin-gated; fetched as a blob for the browser's
    download seam). */
export type RosterCsvExportResult =
  | { ok: true; blob: Blob }
  | { ok: false; detail: string; code: string }

/** Sort words the backend whitelists for the two admin tables (camelCase wire,
    mirror of schemas/table_query.py); `status` exists on the board only,
    ordering by the server's workflow rank. */
export type RosterSortField =
  | 'employeeName'
  | 'employeeId'
  | 'email'
  | 'designation'
  | 'location'
  | 'org'
  | 'businessUnit'
  | 'reportingManager'
  | 'employmentStatus'

export type SortOrder = 'asc' | 'desc'

/** The admin Users table's composed read: every word is optional and blank
    means "any" — search (name or designation), the dropdown filters, the
    form-status word (all | one lifecycle word), and the sort; the page rides
    along as `{ page }`. */
export interface RosterQuery {
  search?: string
  designation?: string
  location?: string
  org?: string
  businessUnit?: string
  businessPartner?: string
  reportingManager?: string
  employmentStatus?: string
  status?: StatusFilter
  sortBy?: RosterSortField
  sortOrder?: SortOrder
}

/** The admin board's composed read: the form-status word always travels (its
    default "all" is shipped like any other choice); the page rides along
    like the roster's does. */
export type ReviewBoardQuery = RosterQuery & { status: StatusFilter; page: number }

/** The whole-roster dropdown option lists behind GET /api/employees/facets. */
export interface RosterFacets {
  designations: string[]
  locations: string[]
  orgs: string[]
  businessUnits: string[]
  businessPartners: string[]
  reportingManagers: string[]
  employmentStatuses: string[]
}

export type RosterFacetsResult =
  | { ok: true; facets: RosterFacets }
  | { ok: false; detail: string; code: string }

export type CycleSettingsFieldErrors = {
  reviewYear: string | null
  deadlineDate: string | null
  deadlineTime: string | null
  managerReviewStart: string | null
  managerReviewEnd: string | null
  hrApprovalReleaseBy: string | null
  eligibilityDate: string | null
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

/** The board's status vocabulary is the stored lifecycle verbatim — six wire
    words (lower-cased stored word; backend BoardStatus in
    schemas/self_evaluation.py). The admin board renders these words as
    written: pills, filter options, pie, and tiles all speak exactly the word
    a row stores — the display-only collapse that once turned them into three
    pill words is gone (lib/reviewStatusStore is the vocabulary module). */
export type ReviewStatus =
  | 'not_started'
  | 'self_evaluation_in_progress'
  | 'self_evaluation_completed'
  | 'in_manager_review'
  | 'manager_evaluation_in_progress'
  | 'manager_evaluation_completed'

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
    (the full roster wire shape, reused) plus the row's stored workflow word. */
export interface ReviewStatusWire {
  employee: Employee
  status: ReviewStatus
  /** The employee's submission stamp, from evaluations.employee_signed_at. */
  submittedAt: string | null
}

/** One server page of the admin board. `total` counts the rows under the
    applied status filter; `statusCounts` is the whole-roster distribution in
    the stored lifecycle's wire words (snake_case, matching `status`). */
export interface ReviewBoardPage {
  readonly reviews: readonly ReviewStatusWire[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
  readonly statusCounts: Partial<Record<ReviewStatus, number>>
}

export type ReviewBoardResult =
  | { ok: true; board: ReviewBoardPage }
  | { ok: false; detail: string; code: string }

/** GET /api/evaluations/export/count: how many reviews the composed roster
    query would download — the bulk button's live number. */
export type ReviewCountResult =
  | { ok: true; count: number }
  | { ok: false; detail: string; code: string }

/** GET /api/evaluations/export: every completed review document the composed
    roster query matches, each in the /evaluations/me wire shape so one
    parser covers the review board's downloads and the employee's own read. */
export type ReviewDocumentsResult =
  | { ok: true; reviews: readonly SelfEvaluationWire[] }
  | { ok: false; detail: string; code: string }

/** The Users page's form-status nouns (GET /api/evaluations/{id}/status) —
    completed covers every past-submission word, pending the open ones. The
    profile card reads it as its probe; the endpoint answers 200 either way. */
export type FormStatus = 'pending' | 'completed'

export type FormStatusResult =
  | { ok: true; formStatus: FormStatus }
  | { ok: false; detail: string; code: string }

/** The admin's one-employee roster write over PATCH /api/employees/{id} —
    any subset of the roster record; an omitted field leaves the stored
    column alone, so the Status column's flip and the edit form share it. */
export interface EmployeePatch {
  employeeId?: string
  name?: string
  email?: string
  designation?: string
  location?: string
  org?: string
  businessUnit?: string
  project?: string
  deliveryHead?: string
  deliveryManager?: string
  businessPartner?: string
  reportingManager?: string
  status?: EmployeeStatus
  joiningDate?: string
}

/** PATCH /api/employees/{id}: the stored roster row comes back, already
    re-written — including the post-write identity when the patch moved
    employee ID or email. */
export type EmployeePatchResult =
  | { ok: true; employee: Employee }
  | { ok: false; detail: string; code: string }

/** The board's form-status filter words: `all` plus one option per lifecycle
    word — the filter names the stored word itself (backend BoardStatusFilter
    mirrors it verbatim; the old bucket nouns pending/completed are gone). */
export type StatusFilter = 'all' | ReviewStatus
