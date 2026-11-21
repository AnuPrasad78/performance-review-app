import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { EmployeeDashboardPage } from '../../src/pages/EmployeeDashboardPage'

const STORAGE_KEY = 'performance-review.employee.v1'
const ADMIN_STORAGE_KEY = 'performance-review.admin.v1'

function renderPage(): React.ReactElement {
  return (
    <AdminStoreProvider>
      <EmployeeDashboardPage />
    </AdminStoreProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('EmployeeDashboardPage — shell', () => {
  it('renders the review progress meter and employee details on the single page', async () => {
    render(renderPage())

    expect(await screen.findByText('0/7')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'SECTIONS COMPLETED' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Asha Nair')).toBeInTheDocument()
  })

  it('renders the self-evaluation form below the details and highlights the due date', async () => {
    render(renderPage())

    expect(await screen.findByText('Q1 · Assessment question')).toBeInTheDocument()
    const dueDate = screen.getByText('15-Jan-2027')
    expect(dueDate.className).toContain('page-head__due')
  })

  it('uses the admin deadline when cycle settings are published', async () => {
    window.localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify({
      employees: [],
      cycleSettings: {
        submissionDeadline: '2027-02-01',
        managerReviewStart: '2027-02-02',
        managerReviewEnd: '2027-03-01',
        hrApprovalReleaseBy: '2027-03-15',
      },
    }))
    render(renderPage())

    expect(await screen.findByText('01-Feb-2027')).toBeInTheDocument()
  })
})

describe('EmployeeDashboardPage — draft state', () => {
  it('typing in a controlled textarea updates the persisted draft on save', async () => {
    const user = userEvent.setup()
    render(renderPage())
    const q1 = await screen.findByLabelText('Your response *', { selector: '#response-contribution' })
    await user.type(q1, 'Cut ticket backlog 40 percent across 2026.')

    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.draft.questions.find((q: { id: string }) => q.id === 'contribution').employeeResponse).toBe(
      'Cut ticket backlog 40 percent across 2026.',
    )
    expect(stored.submittedAt).toBeNull()
  })

  it('keeps the rest of the draft when a different question is edited', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      draft: {
        employee: { firstName: 'Asha', lastName: 'Nair', email: 'a@emids.com', role: 'Engineer', department: 'Quality', manager: 'Ravi Menon', employeeId: 'EMP-1001', location: 'Bengaluru', deliveryManager: 'Joseph Mathew', deliveryHead: 'Divya Prakash' },
        questions: [
          { id: 'contribution', question: 'Q?', employeeResponse: 'Shipped the feature.', managerComment: null },
          { id: 'strengths', question: 'Q?', employeeResponse: '', managerComment: null },
        ],
        overallRating: null,
        overallSummary: '',
        commitments: [{ id: 1, commitment: '', support: '' }],
        acknowledged: false,
      },
      submittedAt: null,
      employeeSignedAt: null,
    }))
    const user = userEvent.setup()
    render(renderPage())

    const strengths = await screen.findByLabelText('Your response *', { selector: '#response-strengths' })
    await user.type(strengths, 'Clear written explanations.')
    expect(strengths).toHaveValue('Clear written explanations.')
    expect(screen.getByLabelText('Your response *', { selector: '#response-contribution' })).toHaveValue(
      'Shipped the feature.',
    )
  })
})

describe('EmployeeDashboardPage — submit validation', () => {
  it('shows a per-field error and does not submit when a question is empty', async () => {
    const user = userEvent.setup()
    render(renderPage())
    await screen.findByLabelText('Your response *', { selector: '#response-contribution' })

    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(screen.getAllByText('Write your response before submitting.').length).toBeGreaterThan(0)
    expect(screen.getByText('Choose your overall self-rating.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument()
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')
    expect(stored?.submittedAt ?? null).toBeNull()
  })

  it('submits a completed draft and flips the form to a read-only review view', async () => {
    const user = userEvent.setup()
    render(renderPage())

    await user.type(await screen.findByLabelText('Your response *', { selector: '#response-contribution' }), 'Impact one.')
    await user.type(screen.getByLabelText('Your response *', { selector: '#response-strengths' }), 'Strength one.')
    await user.type(screen.getByLabelText('Your response *', { selector: '#response-development' }), 'Growth one.')
    await user.type(screen.getByLabelText('Your response *', { selector: '#response-support' }), 'Support one.')
    const ratingChip4 = screen.getAllByRole('button', { name: '4' })
    await user.click(ratingChip4[0]!)
    await user.type(screen.getByLabelText('Your overall summary comment *'), 'Summary of the year.')

    await user.click(screen.getByRole('button', { name: 'Submit' }))

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.submittedAt).not.toBeNull()
    expect(stored.draft.overallRating).toBe(4)
    expect(await screen.findByText(/submitted on/)).toBeInTheDocument()
    expect(screen.getByLabelText('Your response *', { selector: '#response-contribution' })).toBeDisabled()
  })
})
