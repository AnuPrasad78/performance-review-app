import type { SelfEvaluationDraft, SelfEvaluationValidation } from './types'

const FIRST_COMMITMENT_ERROR = 'Write at least one commitment for 2027.'

/** Single source of truth for self-evaluation submission rules. When backend validation
    arrives, it must cross-reference this module and be authoritative at the boundary. */
export function validateSelfEvaluation(draft: SelfEvaluationDraft): SelfEvaluationValidation {
  const questionErrors: SelfEvaluationValidation['fieldErrors']['questionErrors'] = {}
  let hasQuestionErrors = false

  for (const question of draft.questions) {
    if (question.employeeResponse.trim() === '') {
      questionErrors[question.id] = 'Write your response before submitting.'
      hasQuestionErrors = true
    }
  }

  const overallRating = draft.overallRating === null ? 'Choose your overall self-rating.' : null
  const overallSummary = draft.overallSummary.trim() === '' ? 'Write your overall summary comment.' : null
  const firstCommitment = draft.commitments[0]
  const commitments =
    firstCommitment === undefined || firstCommitment.commitment.trim() === '' ? FIRST_COMMITMENT_ERROR : null

  return {
    fieldErrors: { questionErrors, overallRating, overallSummary, commitments },
    isValid: !hasQuestionErrors && overallRating === null && overallSummary === null && commitments === null,
  }
}
