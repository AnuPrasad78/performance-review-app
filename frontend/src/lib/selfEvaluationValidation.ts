import type { SelfEvaluationDraft, SelfEvaluationValidation } from './types'

/** Single source of truth for self-evaluation submission rules. When backend validation
    arrives, it must cross-reference this module and be authoritative at the boundary.
    Forward commitments are deliberately absent: they are optional content — the
    backend caps them at 3 and never requires one (service _submission_missing_parts). */
export function validateSelfEvaluation(draft: SelfEvaluationDraft): SelfEvaluationValidation {
  const questionErrors: SelfEvaluationValidation['fieldErrors']['questionErrors'] = {}
  let hasQuestionErrors = false

  for (const question of draft.questions) {
    if (question.employeeResponse.trim() === '') {
      questionErrors[question.id] = 'Mandatory field — write your response before submitting.'
      hasQuestionErrors = true
    }
  }

  const overallRating =
    draft.overallRating === null ? 'Mandatory field — choose your overall self-rating.' : null
  const overallSummary =
    draft.overallSummary.trim() === '' ? 'Mandatory field — write your overall summary comment.' : null

  return {
    fieldErrors: { questionErrors, overallRating, overallSummary },
    isValid: !hasQuestionErrors && overallRating === null && overallSummary === null,
  }
}
