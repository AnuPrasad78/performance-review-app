import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../src/state/AuthContext'
import { EmployeeDashboardPage } from '../../src/pages/EmployeeDashboardPage'

const SESSION_KEY = 'performance-review.session.v1'
const SESSION = { email: 'asha_menon@emids.com', name: 'Asha Menon', role: 'employee' }
/** The wizard's client-only resume position; nothing else of the review is
    stored client-side — every draft value lives behind the API. */
const RESUME_KEY = 'performance-review.employee.resume.v1'

const EMPTY_RESPONSES = { contribution: '', strengths: '', development: '', support: '' }

interface FetchCall {
  url: string
  method?: string
  /** Parsed JSON bodies; Array responses would also need access, so this is
      kept as the narrow Record shape our PATCH/POST tests inspect. */
  body?: Record<string, unknown>
}

let calls: FetchCall[] = []

function apiReturning(payload: unknown): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method,
      body:
        init?.body !== undefined
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : undefined,
    })
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    } as unknown as Response
  }) as unknown as typeof fetch
}

function profileWire(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    employeeId: 'EMP-V001',
    name: 'Asha Menon',
    email: 'asha_menon@emids.com',
    designation: 'Software Engineer',
    location: 'India',
    org: 'Delivery',
    project: 'Cigna One',
    deliveryHead: 'Arumugam Thiraviam',
    deliveryManager: 'Priya Raghavan',
    businessPartner: 'John D',
    reportingManager: 'Priya Raghavan',
    status: 'Active',
    ...overrides,
  }
}

function openWire(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    employee: profileWire(),
    reviewYear: 2026,
    submissionDeadline: '2027-01-15',
    submittedAt: null,
    employeeSignedAt: null,
    responses: { ...EMPTY_RESPONSES, contribution: 'Delivered the intake rewrite.' },
    managerComments: EMPTY_RESPONSES,
    overallRating: 4,
    overallSummary: 'Strong year.',
    forwardCommitments: [{ commitment: 'Own the intake rewrite', support: 'Lead mentoring' }],
    commitmentsEditable: true,
    ...overrides,
  }
}

function page(): React.ReactElement {
  return (
    <AuthProvider>
      <EmployeeDashboardPage />
    </AuthProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(SESSION))
  calls = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EmployeeDashboardPage — shell', () => {
  it('renders the hero band, the progress meter, and the session popover profile', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', apiReturning(openWire()))

    render(page())

    expect(await screen.findByRole('heading', { name: 'Annual Performance Review 2026' })).toBeInTheDocument()
    expect(await screen.findByText('Performance period: 1-Jan-2026 to 31-Dec-2026')).toBeInTheDocument()
    const steps = await screen.findAllByText('Assessment Questions')
    expect(steps.length).toBeGreaterThan(0)
    expect(document.querySelector('.steps-nav__step.is-active')).not.toBeNull()

    // The profile lives in the session menu popover, sourced from the API's
    // employee row (not the mock lookup).
    await user.click(screen.getByRole('button', { name: 'Session details' }))
    const popover = await screen.findByRole('dialog', { name: 'Session details' })
    expect(within(popover).getByText('Software Engineer')).toBeInTheDocument()
    expect(within(popover).getAllByText('Priya Raghavan')).toHaveLength(2)
  })

  it('renders the first assessment question inside the floating card', async () => {
    vi.stubGlobal('fetch', apiReturning(openWire()))

    render(page())

    expect(await screen.findByText(/^Q1\./)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Q1\. / })).toBeInTheDocument()
    expect(document.querySelector('.hero-card')).not.toBeNull()
    expect(await screen.findByDisplayValue('Delivered the intake rewrite.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument()
  })

  it('shows the loading state before the API answers', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => null)))

    render(page())

    expect(screen.getByText('Loading your review.')).toBeInTheDocument()
  })

  it('renders the API failure message when the endpoint cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('unreachable')
      }),
    )

    render(page())

    expect(
      await screen.findByText('Could not reach the review API. Check that the backend is running.'),
    ).toBeInTheDocument()
  })
})

describe('EmployeeDashboardPage — draft state over the API', () => {
  it('auto-saves an edited answer during the typing pause, without any button click', async () => {
    vi.stubGlobal('fetch', apiReturning(openWire()))

    render(page())
    await screen.findByDisplayValue('Delivered the intake rewrite.')
    const answer = screen.getByDisplayValue('Delivered the intake rewrite.')
    const user = userEvent.setup()
    await user.type(answer, ' — see the goals doc')

    // A real pause slightly past the 1200ms debounce; nothing was clicked.
    await new Promise((resolve) => setTimeout(resolve, 1600))

    expect(calls.some((call) => call.method === 'PATCH')).toBe(true)
    expect(await screen.findByText('Draft saved.')).toBeInTheDocument()
  })

  it('memorizes a draft through the manual Save-draft PATCH', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', apiReturning(openWire()))

    render(page())
    await user.type(await screen.findByDisplayValue('Delivered the intake rewrite.'), ' — for the Cigna One migration')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByText('Draft saved.')).toBeInTheDocument()
    const patched = calls.find((call) => call.method === 'PATCH')
    expect(patched?.url).toContain('/api/evaluations/me')
  })

  it('keeps the rest of the draft when a different question is edited', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', apiReturning(openWire()))

    render(page())
    await screen.findByDisplayValue('Delivered the intake rewrite.')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    const strengths = screen.getByLabelText('Employee response *', { selector: '#response-strengths' })
    await user.type(strengths, 'Clear written explanations.')
    expect(strengths).toHaveValue('Clear written explanations.')
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByLabelText('Employee response *', { selector: '#response-contribution' })).toHaveValue(
      'Delivered the intake rewrite.',
    )
  })

  it('resumes on the section the employee last visited', async () => {
    window.localStorage.setItem(
      RESUME_KEY,
      JSON.stringify({ lastStepIndex: 1, lastQuestionIndex: 2 }),
    )
    vi.stubGlobal('fetch', apiReturning(openWire()))

    render(page())

    expect((await screen.findAllByText('Overall Rating & Feedback')).length).toBeGreaterThan(0)
    expect(document.querySelector('.steps-nav__step.is-active')?.textContent).toContain(
      'Overall Rating & Feedback',
    )
  })
})

describe('EmployeeDashboardPage — the API save contract', () => {
  it('auto-saves the chosen self-rating under the patch contract key', async () => {
    // Regression: the payload once carried the GET's key (overallRating),
    // which the backend silently ignored — the submit check then reported
    // a missing self rating on a "complete" form. The wire opens unrated so
    // clicking chip 4 is a fresh selection, not a deselect.
    const user = userEvent.setup()
    vi.stubGlobal('fetch', apiReturning(openWire({ overallRating: null })))

    render(page())
    await screen.findByDisplayValue('Delivered the intake rewrite.')
    for (let step = 0; step < 4; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }
    await user.click(screen.getByRole('button', { name: '4' }))

    await new Promise((resolve) => setTimeout(resolve, 1600))

    const ratingCall = calls.find(
      (call) => call.method === 'PATCH' && call.body?.selfRating === 4,
    )
    expect(ratingCall).toBeDefined()
  })
})

describe('EmployeeDashboardPage — submit gate', () => {
  it('blocks submit while the review is incomplete, without calling the API', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', apiReturning(openWire()))

    render(page())
    await screen.findByDisplayValue('Delivered the intake rewrite.')
    for (let step = 0; step < 6; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('Complete the flagged fields before submitting.')).toBeInTheDocument()
    // Validation jumps back to the first unanswered question…
    expect(document.querySelector('.steps-nav__step.is-active')?.textContent).toContain(
      'Assessment Questions',
    )
    // …flag it inline, and no submit request ever left the page.
    expect(screen.getAllByText('Write your response before submitting.').length).toBeGreaterThan(0)
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0)
  })

  it('blocks submit when the compulsory first commitment is empty and jumps back to it', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      apiReturning(
        openWire({
          responses: {
            contribution: 'Filled response.',
            strengths: 'Filled response.',
            development: 'Filled response.',
            support: 'Filled response.',
          },
          forwardCommitments: [{ commitment: '', support: '' }],
        }),
      ),
    )

    render(page())
    await screen.findByDisplayValue('Filled response.')
    for (let step = 0; step < 6; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('Write at least one commitment for 2027.')).toBeInTheDocument()
    expect(document.querySelector('.steps-nav__step.is-active')?.textContent).toContain(
      'Forward Commitments',
    )
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0)
  })

  it('submits through the API and renders the review read-only', async () => {
    const user = userEvent.setup()
    // The endpoint's lifecycle: GET returns the open review; the PATCH preamble
    // echoes it; POST /submit returns the frozen server state.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          method: init?.method,
          body:
            init?.body !== undefined
              ? (JSON.parse(String(init.body)) as Record<string, unknown>)
              : undefined,
        })
        const method = init?.method ?? 'GET'
        // The GET/PATCH wire is complete (every answer filled) so the form
        // validates; POST /submit returns the frozen server state.
        const complete = openWire({
          responses: {
            contribution: 'Delivered the intake rewrite.',
            strengths: 'Filled response.',
            development: 'Filled response.',
            support: 'Filled response.',
          },
        })
        const payload =
          method === 'POST'
            ? openWire({ submittedAt: '2026-11-20', commitmentsEditable: false })
            : complete
        return {
          ok: true,
          status: 200,
          json: async () => payload,
        } as unknown as Response
      }) as unknown as typeof fetch,
    )

    render(page())
    await screen.findByDisplayValue('Delivered the intake rewrite.')
    for (let step = 0; step < 6; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('Submitted.')).toBeInTheDocument()
    expect(
      await screen.findByText('Your self-evaluation was submitted. The form is read-only now.'),
    ).toBeInTheDocument()
    const submitCall = calls.find((call) => call.method === 'POST')
    expect(submitCall?.url).toContain('/api/evaluations/me')
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save commitments' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
  })
})

describe('EmployeeDashboardPage — forward commitments', () => {
  it('adds and removes optional commitments but never leaves the list empty', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', apiReturning(openWire()))

    render(page())
    await screen.findByDisplayValue('Delivered the intake rewrite.')
    for (let step = 0; step < 5; step += 1) {
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

  it('keeps commitments editable after submission while the window is open', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      apiReturning(openWire({ submittedAt: '2026-11-20', commitmentsEditable: true })),
    )

    render(page())
    // The frozen state is already in the initial GET; it must render before
    // any navigation is possible.
    expect(await screen.findByText(/Your self-evaluation is read-only now/)).toBeInTheDocument()
    for (let step = 0; step < 5; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }

    const commitments = screen.getAllByDisplayValue('Own the intake rewrite')
    expect(commitments).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Save commitments' })).toBeInTheDocument()
  })
})
