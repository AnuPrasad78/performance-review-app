import type { CycleSettings, CycleSettingsFieldErrors, CycleSettingsValidation } from './types'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isDateInputValue(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const parsed = new Date(value + 'T00:00:00')
  return !Number.isNaN(parsed.getTime())
}

export function validateCycleSettings(settings: CycleSettings): CycleSettingsValidation {
  const fieldErrors: CycleSettingsFieldErrors = {
    submissionDeadline: null,
    managerReviewStart: null,
    managerReviewEnd: null,
    hrApprovalReleaseBy: null,
  }

  if (settings.submissionDeadline === '' || !isDateInputValue(settings.submissionDeadline)) {
    fieldErrors.submissionDeadline = 'Choose the self-evaluation submission deadline.'
  }
  if (settings.managerReviewStart === '' || !isDateInputValue(settings.managerReviewStart)) {
    fieldErrors.managerReviewStart = 'Choose the manager review start date.'
  }
  if (settings.managerReviewEnd === '' || !isDateInputValue(settings.managerReviewEnd)) {
    fieldErrors.managerReviewEnd = 'Choose the manager review end date.'
  }
  if (settings.hrApprovalReleaseBy === '' || !isDateInputValue(settings.hrApprovalReleaseBy)) {
    fieldErrors.hrApprovalReleaseBy = 'Choose the HR approval and release date.'
  }

  let dateError: string | null = null
  if (!fieldErrors.managerReviewStart && !fieldErrors.managerReviewEnd) {
    if (settings.managerReviewStart > settings.managerReviewEnd) {
      dateError = 'Manager review end date must come on or after the start date.'
    }
  }
  if (!dateError && !fieldErrors.submissionDeadline && !fieldErrors.managerReviewStart) {
    if (settings.managerReviewStart < settings.submissionDeadline) {
      dateError = 'Manager review start date must come on or after the submission deadline.'
    }
  }
  if (!dateError && !fieldErrors.managerReviewEnd && !fieldErrors.hrApprovalReleaseBy) {
    if (settings.hrApprovalReleaseBy < settings.managerReviewEnd) {
      dateError = 'HR approval and release date must come on or after the manager review end date.'
    }
  }

  const noFieldErrors = Object.values(fieldErrors).every((e) => e === null)
  return {
    fieldErrors,
    dateError,
    isValid: noFieldErrors && dateError === null,
  }
}
