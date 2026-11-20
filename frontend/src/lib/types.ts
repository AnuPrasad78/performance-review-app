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
