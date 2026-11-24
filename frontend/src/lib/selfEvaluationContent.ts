import type { AssessmentQuestion, ForwardCommitment, RatingScaleEntry } from './types'

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

/** The published rating definition (the review document's scale reference). */
export const RATING_SCALE_REFERENCE: readonly RatingScaleEntry[] = [
  {
    value: 5,
    name: 'Significantly exceeds expectations',
    description: 'Significantly exceeded targets; contributed to process improvement.',
  },
  {
    value: 4,
    name: 'Exceeds expectations',
    description: 'Delivered and exceeded targets and results.',
  },
  {
    value: 3,
    name: 'Meets expectations',
    description: 'Meets expected targets; achieved intended results.',
  },
  {
    value: 2,
    name: 'Below expectations',
    description: 'The employee needs improvement.',
  },
  {
    value: 1,
    name: 'Significantly below expectations',
    description: 'The employee significantly needs improvement.',
  },
]
