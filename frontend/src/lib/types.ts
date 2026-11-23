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

export interface CycleSettings {
  submissionDeadline: string
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

export interface CycleSettingsFieldErrors {
  submissionDeadline: string | null
  managerReviewStart: string | null
  managerReviewEnd: string | null
  hrApprovalReleaseBy: string | null
}

export type CycleSettingsValidation = {
  fieldErrors: CycleSettingsFieldErrors
  dateError: string | null
  isValid: boolean
}

export type RatingValue = 1 | 2 | 3 | 4 | 5

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

export interface RatingScaleEntry {
  value: RatingValue
  name: string
  description: string
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
