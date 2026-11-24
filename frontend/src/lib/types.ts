export interface Employee {
  firstName: string
  lastName: string
  email: string
  role: string
  department: string
  manager: string
}

export interface CycleSettings {
  submissionDeadline: string
  managerReviewStart: string
  managerReviewEnd: string
  hrApprovalReleaseBy: string
}

export type CsvParseResult =
  | { ok: true; employees: Employee[] }
  | { ok: false; error: string }

export type RosterMergeResult = { added: number; duplicates: number; roster: Employee[] }

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
  commitments: string | null
}

export interface SelfEvaluationValidation {
  fieldErrors: SelfEvaluationFieldErrors
  isValid: boolean
}

export type ReviewSaveResult = { ok: true } | { ok: false; error: string }
