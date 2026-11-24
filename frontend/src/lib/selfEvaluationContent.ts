import type { AssessmentQuestion, ForwardCommitment } from './types'

/** Static 2026 review form content (the review document this screen implements). The
    backend seam will replace this module's data with API responses; component code
    reads types only. Promotion period: 01-Jan-2026 to 31-Dec-2026. */
export const REVIEW_QUESTIONS: readonly AssessmentQuestion[] = [
  {
    id: 'contribution',
    title: 'Key contributions and achievements',
    question:
      'What were your most significant contributions, deliveries, or achievements during 2026, and what impact did they create?',
    employeeResponse: '',
    managerComment: null,
  },
  {
    id: 'strengths',
    title: 'What are some things you do well?',
    question: 'Describe your key strengths and the parts of your role you perform best.',
    employeeResponse: '',
    managerComment: null,
  },
  {
    id: 'development',
    title: 'Where do you want to get better in 2027?',
    question:
      'Identify the capabilities or areas you (or your manager) see as development areas, and how you plan to grow them in the next cycle.',
    employeeResponse: '',
    managerComment: null,
  },
  {
    id: 'support',
    title: 'What support would help you do your best work in 2027?',
    question:
      'What help do you need from Emids — skills, tools, mentoring, exposure, or role clarity — to perform better in the next cycle?',
    employeeResponse: '',
    managerComment: null,
  },
]

export const EMPTY_COMMITMENTS: readonly ForwardCommitment[] = [{ id: 1, commitment: '', support: '' }]

/** The 2026 form's contractual due date, used until the admin publishes cycle settings. */
export const DEFAULT_SUBMISSION_DEADLINE = '2027-01-15'
