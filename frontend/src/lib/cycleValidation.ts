/** Cycle-settings form validation and its draft ↔ wire mapping.

    The deadline is edited as a UTC date + time pair (the calendar every
    timezone shares), so the form compares it by its UTC day against the
    plain-date windows — the same rule `services/cycle_settings.py` enforces
    and the DB constraint backs up; the backend stays authoritative, this
    copy only exists to fail fast under the admin's keyboard. */

import type {
  CycleSettings,
  CycleSettingsDraft,
  CycleSettingsFieldErrors,
  CycleSettingsValidation,
} from './types'
import { formatIsoDate } from './dates'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const YEAR_PATTERN = /^\d{4}$/

function isDateInputValue(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const parsed = new Date(value + 'T00:00:00')
  return !Number.isNaN(parsed.getTime())
}

export function emptyCycleDraft(): CycleSettingsDraft {
  return {
    reviewYear: '',
    deadlineDate: '',
    deadlineTime: '',
    managerReviewStart: '',
    managerReviewEnd: '',
    hrApprovalReleaseBy: '',
  }
}

/** Wire → form: the instant splits into its UTC date and time parts. */
export function cycleSettingsToDraft(settings: CycleSettings | null): CycleSettingsDraft {
  const draft = emptyCycleDraft()
  if (settings === null) return draft
  const instant = new Date(settings.submissionDeadline)
  if (Number.isNaN(instant.getTime())) return draft
  const pad = (n: number): string => String(n).padStart(2, '0')
  return {
    reviewYear: String(settings.reviewYear),
    deadlineDate: `${instant.getUTCFullYear()}-${pad(instant.getUTCMonth() + 1)}-${pad(instant.getUTCDate())}`,
    deadlineTime: `${pad(instant.getUTCHours())}:${pad(instant.getUTCMinutes())}`,
    managerReviewStart: settings.managerReviewStart,
    managerReviewEnd: settings.managerReviewEnd,
    hrApprovalReleaseBy: settings.hrApprovalReleaseBy,
  }
}

/** Form → wire. Call only after validateCycleSettings reports isValid — the
    given branch guarantees the members this composes from are well-formed. */
export function draftToCycleSettings(draft: CycleSettingsDraft): CycleSettings {
  return {
    reviewYear: Number.parseInt(draft.reviewYear, 10),
    submissionDeadline: `${draft.deadlineDate}T${draft.deadlineTime}:00Z`,
    managerReviewStart: draft.managerReviewStart,
    managerReviewEnd: draft.managerReviewEnd,
    hrApprovalReleaseBy: draft.hrApprovalReleaseBy,
  }
}

/** "2027-01-15T10:00:00+00:00" → "15-Jan-2027 10:00" — the toast's rendering
    of the instant the form starts closing. */
export function draftToDeadlineLabel(instant: string): string {
  const parsed = new Date(instant)
  if (Number.isNaN(parsed.getTime())) return instant
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${formatIsoDate(instant.slice(0, 10))} ${pad(parsed.getUTCHours())}:${pad(parsed.getUTCMinutes())}`
}

export function validateCycleSettings(draft: CycleSettingsDraft): CycleSettingsValidation {
  const fieldErrors: CycleSettingsFieldErrors = {
    reviewYear: null,
    deadlineDate: null,
    deadlineTime: null,
    managerReviewStart: null,
    managerReviewEnd: null,
    hrApprovalReleaseBy: null,
  }

  if (!YEAR_PATTERN.test(draft.reviewYear)) {
    fieldErrors.reviewYear = 'Choose the review year the cycle answers into.'
  }
  if (draft.deadlineDate === '' || !isDateInputValue(draft.deadlineDate)) {
    fieldErrors.deadlineDate = 'Choose the self-evaluation submission deadline date.'
  }
  if (!TIME_PATTERN.test(draft.deadlineTime)) {
    fieldErrors.deadlineTime = 'Choose the submission deadline time, in UTC.'
  }
  if (draft.managerReviewStart === '' || !isDateInputValue(draft.managerReviewStart)) {
    fieldErrors.managerReviewStart = 'Choose the manager review start date.'
  }
  if (draft.managerReviewEnd === '' || !isDateInputValue(draft.managerReviewEnd)) {
    fieldErrors.managerReviewEnd = 'Choose the manager review end date.'
  }
  if (draft.hrApprovalReleaseBy === '' || !isDateInputValue(draft.hrApprovalReleaseBy)) {
    fieldErrors.hrApprovalReleaseBy = 'Choose the HR approval and release date.'
  }

  let dateError: string | null = null
  if (!fieldErrors.managerReviewStart && !fieldErrors.managerReviewEnd) {
    if (draft.managerReviewStart > draft.managerReviewEnd) {
      dateError = 'Manager review end date must come on or after the start date.'
    }
  }
  // The deadline's UTC day may equal the manager window's first day, never
  // sit after it.
  if (!dateError && !fieldErrors.deadlineDate && !fieldErrors.managerReviewStart) {
    if (draft.managerReviewStart < draft.deadlineDate) {
      dateError = 'Manager review start date must come on or after the submission deadline.'
    }
  }
  if (!dateError && !fieldErrors.managerReviewEnd && !fieldErrors.hrApprovalReleaseBy) {
    if (draft.hrApprovalReleaseBy < draft.managerReviewEnd) {
      dateError = 'HR approval and release date must come on or after the manager review end date.'
    }
  }

  const noFieldErrors = Object.values(fieldErrors).every((value) => value === null)
  return {
    fieldErrors,
    dateError,
    isValid: noFieldErrors && dateError === null,
  }
}
