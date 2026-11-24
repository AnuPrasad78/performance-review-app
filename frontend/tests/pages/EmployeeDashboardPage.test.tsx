import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { AuthProvider } from '../../src/state/AuthContext'
import { EmployeeDashboardPage } from '../../src/pages/EmployeeDashboardPage'

const STORAGE_KEY = 'performance-review.employee.v1'

function renderPage(): React.ReactElement {
  return (
    <MemoryRouter initialEntries={['/dashboard']}>
      <AdminStoreProvider>
        <AuthProvider>
          <EmployeeDashboardPage />
        </AuthProvider>
      </AdminStoreProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('EmployeeDashboardPage — shell', () => {
  it('renders the review progress meter and employee details on the single page', async () => {
    render(renderPage())

    expect(await screen.findByRole('heading', { name: 'Annual Performance Review 2026' })).toBeInTheDocument()
    const steps = await screen.findAllByText('Assessment Questions')
    expect(steps.length).toBeGreaterThan(0)
    expect(document.querySelector('.steps-nav__step.is-active')).not.toBeNull()
  })

  it('renders the assessment question on the first page inside the floating card', async () => {
    render(renderPage())

    expect(await screen.findByText(/^Q1\./)).toBeInTheDocument()
    expect(document.querySelector('.hero-card')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument()
  })

  it('shows the 2026 performance period in the hero band', async () => {
    render(renderPage())

    expect(await screen.findByText('Performance period: 1-Jan-2026 to 31-Dec-2026')).toBeInTheDocument()
  })
})

describe('EmployeeDashboardPage — draft state', () => {
  it('autosaves typed responses without a manual save action', async () => {
    const user = userEvent.setup()
    render(renderPage())
    const q1 = await screen.findByLabelText('Employee response *', { selector: '#response-contribution' })
    await user.type(q1, 'Cut ticket backlog 40 percent across 2026.')

    await vi.waitFor(
      () => {
        const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
        expect(
          stored.draft.questions.find((q: { id: string }) => q.id === 'contribution').employeeResponse,
        ).toBe('Cut ticket backlog 40 percent across 2026.')
      },
      { timeout: 3000 },
    )
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.submittedAt).toBeNull()
  })

  it('resumes on the page the employee last visited', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      draft: {
        employee: { firstName: 'Asha', lastName: 'Nair', email: 'a@emids.com', role: 'Engineer', department: 'Quality', manager: 'Ravi Menon', employeeId: 'EMP-1001', location: 'Bengaluru', deliveryManager: 'Joseph Mathew', deliveryHead: 'Divya Prakash' },
        questions: [{ id: 'contribution', question: 'Q?', title: 'T?', employeeResponse: '', managerComment: null }],
        overallRating: null,
        overallSummary: '',
        commitments: [{ id: 1, commitment: '', support: '' }],
        acknowledged: false,
      },
      submittedAt: null,
      employeeSignedAt: null,
      lastStepIndex: 1,
      lastQuestionIndex: 2,
    }))
    render(renderPage())

    expect((await screen.findAllByText('Overall Rating & Feedback')).length).toBeGreaterThan(0)
    expect(document.querySelector('.steps-nav__step.is-active')?.textContent).toContain('Overall Rating & Feedback')
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

    await user.click(await screen.findByRole('button', { name: 'Next' }))
    const strengths = await screen.findByLabelText('Employee response *', { selector: '#response-strengths' })
    await user.type(strengths, 'Clear written explanations.')
    expect(strengths).toHaveValue('Clear written explanations.')
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByLabelText('Employee response *', { selector: '#response-contribution' })).toHaveValue(
      'Shipped the feature.',
    )
  })
})

describe('EmployeeDashboardPage — submit validation', () => {
  it('shows a per-field error and does not submit when a question is empty', async () => {
    const user = userEvent.setup()
    render(renderPage())
    await screen.findByLabelText('Employee response *', { selector: '#response-contribution' })
    for (let page = 0; page < 6; page += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }

    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(screen.getAllByText('Write your response before submitting.').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')
    expect(stored?.submittedAt ?? null).toBeNull()
  })

  it('submits a completed draft and flips the form to a read-only review view', async () => {
    const user = userEvent.setup()
    render(renderPage())

    await user.type(await screen.findByLabelText('Employee response *', { selector: '#response-contribution' }), 'Impact one.')
    const continueToNext = async (): Promise<void> => {
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }
    await continueToNext()
    await user.type(await screen.findByLabelText('Employee response *', { selector: '#response-strengths' }), 'Strength one.')
    await continueToNext()
    await user.type(await screen.findByLabelText('Employee response *', { selector: '#response-development' }), 'Growth one.')
    await continueToNext()
    await user.type(await screen.findByLabelText('Employee response *', { selector: '#response-support' }), 'Support one.')
    await continueToNext()
    const ratingChip4 = await screen.findAllByRole('button', { name: '4' })
    await user.click(ratingChip4[0]!)
    await user.type(screen.getByLabelText('Overall comments *'), 'Summary of the year.')
    await continueToNext()
    await user.type(await screen.findByLabelText('Commitment 1'), 'Own an end-to-end service in 2027.')
    await user.type(screen.getByLabelText('Agreed support / conditions'), 'A service-ownership stretch assignment.')
    await continueToNext()

    await user.click(screen.getByRole('button', { name: 'Submit' }))

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.submittedAt).not.toBeNull()
    expect(stored.draft.overallRating).toBe(4)
    expect(await screen.findByText(/submitted on/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })

  it('blocks submit when the compulsory first commitment is empty and jumps back to it', async () => {
    const user = userEvent.setup()
    render(renderPage())

    const responses = ['#response-contribution', '#response-strengths', '#response-development', '#response-support']
    for (let page = 0; page < 4; page += 1) {
      const selector = responses[page]
      if (selector === undefined) throw new Error('missing response selector')
      await user.type(await screen.findByLabelText('Employee response *', { selector }), 'Filled response.')
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }
    const ratingChip3 = await screen.findAllByRole('button', { name: '3' })
    await user.click(ratingChip3[0]!)
    await user.type(screen.getByLabelText('Overall comments *'), 'Summary of the year.')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(screen.getByText('Write at least one commitment for 2027.')).toBeInTheDocument()
    expect(document.querySelector('.steps-nav__step.is-active')?.textContent).toContain('Forward Commitments')
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')
    expect(stored?.submittedAt ?? null).toBeNull()
  })

  it('adds and removes optional commitments but never leaves the page empty', async () => {
    const user = userEvent.setup()
    render(renderPage())
    await screen.findByLabelText('Employee response *', { selector: '#response-contribution' })
    for (let page = 0; page < 5; page += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }

    expect(await screen.findByText('Commitment 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove commitment 1' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add commitment' }))
    expect(screen.getByText('Commitment 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove commitment 2' }))
    expect(screen.queryByText('Commitment 2')).not.toBeInTheDocument()
    expect(screen.getByText('Commitment 1')).toBeInTheDocument()
  })
})
