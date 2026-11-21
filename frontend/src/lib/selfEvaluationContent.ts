import type { AssessmentQuestion, ForwardCommitment } from './types'

/** Static 2026 review form content (Appendix sections 2 and 5). The backend seam will
    replace this module's data with API responses; component code reads types only. */
export const REVIEW_QUESTIONS: readonly AssessmentQuestion[] = [
  {
    id: 'contribution',
    question:
      'Describe your key contributions and achievements during 2026 and the impact they had. State your own work — objectives and numbers over words.',
    employeeResponse: '',
    managerComment: null,
  },
  {
    id: 'strengths',
    question: 'What do you do well?',
    employeeResponse: '',
    managerComment: null,
  },
  {
    id: 'development',
    question: 'Where do you want to improve in 2027?',
    employeeResponse: '',
    managerComment: null,
  },
  {
    id: 'support',
    question: 'What support from Emids do you need in 2027?',
    employeeResponse: '',
    managerComment: null,
  },
]

export const EMPTY_COMMITMENTS: readonly ForwardCommitment[] = [
  { id: 1, commitment: '', support: '' },
  { id: 2, commitment: '', support: '' },
  { id: 3, commitment: '', support: '' },
]

/** The 2026 form's contractual due date, used until the admin publishes cycle settings. */
export const DEFAULT_SUBMISSION_DEADLINE = '2027-01-15'
