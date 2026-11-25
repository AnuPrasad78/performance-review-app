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
    submissionDeadline: '2027-01-15T10:00:00+00:00',
    deadlinePassed: false,
    submittedAt: null,
    employeeSignedAt: null,
    // Open-review wires default to an answerable form: the wizard's Next
    // requires each question answered before it advances, so tests that walk
    // the steps start from a complete draft unless they override these.
    responses: {
      contribution: 'Delivered the intake rewrite.',
      strengths: 'Filled response.',
      development: 'Filled response.',
      support: 'Filled response.',
    },
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
    const steps = await screen.findAllByText('Self Evaluation')
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
    // Q2 opens unanswered so the typed text is the whole value.
    vi.stubGlobal(
      'fetch',
      apiReturning(
        openWire({ responses: { ...EMPTY_RESPONSES, contribution: 'Delivered the intake rewrite.' } }),
      ),
    )

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

  it('resumes on the section the employee last visited, per signed-in identity', async () => {
    window.localStorage.setItem(
      `${RESUME_KEY}:asha_menon@emids.com`,
      JSON.stringify({ lastStepIndex: 1, lastQuestionIndex: 2 }),
    )
    // Another employee's marker must not leak into this session.
    window.localStorage.setItem(
      `${RESUME_KEY}:bilal_khan@emids.com`,
      JSON.stringify({ lastStepIndex: 3, lastQuestionIndex: 0 }),
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

describe('EmployeeDashboardPage — forward gating', () => {
  it('keeps Next blocked until the current question is answered', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      apiReturning(
        openWire({
          responses: { ...EMPTY_RESPONSES },
          overallRating: null,
          overallSummary: '',
        }),
      ),
    )

    render(page())
    await screen.findByLabelText('Employee response *', { selector: '#response-contribution' })
    const next = screen.getByRole('button', { name: 'Next' })
    expect(next).toBeDisabled()
    await user.click(next)
    // The click is a no-op: we are still on Question 1.
    expect(screen.getByText('Question 1 of 4')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Employee response *', { selector: '#response-contribution' }), ' Typed.')
    expect(next).toBeEnabled()
    await user.click(next)
    expect(screen.getByText('Question 2 of 4')).toBeInTheDocument()
  })

  it('lets the employee move across sections in any order from the steps nav', async () => {
    // Section navigation is free: an untouched section is reachable directly.
    vi.stubGlobal(
      'fetch',
      apiReturning(
        openWire({
          responses: { ...EMPTY_RESPONSES, contribution: 'Delivered the intake rewrite.' },
        }),
      ),
    )

    render(page())
    await screen.findByDisplayValue('Delivered the intake rewrite.')
    // The steps-nav buttons carry "N <title>" accessible names and none of
    // them lock.
    expect(screen.getByRole('button', { name: /Self Evaluation/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Overall Rating & Feedback/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Forward Commitments for 2027/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Sign-Off/ })).toBeEnabled()

    // A straight jump to the last section works with nothing answered behind.
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Sign-Off/ }))
    expect(await screen.findByRole('button', { name: 'Submit' })).toBeInTheDocument()
    expect(screen.queryByText('Question 1 of 4')).not.toBeInTheDocument()
  })

  it('unlocks the overall step as soon as a rating and a summary exist, and no POST ever fires early', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      apiReturning(openWire({ overallRating: null, overallSummary: '' })),
    )

    render(page())
    await screen.findByDisplayValue('Delivered the intake rewrite.')
    for (let step = 0; step < 4; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.getByText('Overall Rating & Feedback')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '4' }))
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled() // summary still empty

    await user.type(screen.getByLabelText('Overall comments *'), 'Summary of the year.')
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0)
  })
})

describe('EmployeeDashboardPage — submit gate', () => {
  it('keeps the commitments step optional: Next stays enabled without any commitment', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      apiReturning(openWire({ forwardCommitments: [{ commitment: '', support: '' }] })),
    )

    render(page())
    await screen.findByDisplayValue('Delivered the intake rewrite.')
    for (let step = 0; step < 5; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }

    expect(await screen.findByText('Commitment 1')).toBeInTheDocument()
    // Optional content: the step never blocks navigation, and submission
    // accepts a form with no commitments at all (backend contract).
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('submits through the API, confirms the success popup, and renders the review read-only', async () => {
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

    // The disclaimer gate: nothing ships until the employee confirms.
    const confirmDialog = await screen.findByRole('dialog', { name: 'Confirm submission' })
    expect(within(confirmDialog).getByText(/Once submitted/)).toBeInTheDocument()
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0)

    await user.click(within(confirmDialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Confirm submission' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Submit' }))
    const confirmDialog2 = await screen.findByRole('dialog', { name: 'Confirm submission' })
    await user.click(within(confirmDialog2).getByRole('button', { name: 'OK' }))

    const submitCall = calls.find((call) => call.method === 'POST')
    expect(submitCall?.url).toContain('/api/evaluations/me')
    // The success popup names the outcome; dismissing it reveals the
    // read-only state.
    const successDialog = await screen.findByRole('dialog', { name: 'Submission complete' })
    expect(
      within(successDialog).getByText(/was submitted successfully/),
    ).toBeInTheDocument()
    await user.click(within(successDialog).getByRole('button', { name: 'OK' }))
    expect(screen.queryByRole('dialog', { name: 'Submission complete' })).not.toBeInTheDocument()

    expect(await screen.findByText('Submitted successfully.')).toBeInTheDocument()
    expect(
      await screen.findByText('Your self-evaluation was submitted. The form is read-only now.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save commitments' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
  })

  it('pops the failure state and keeps the form open when the API refuses the submit', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          method: init?.method,
        })
        const method = init?.method ?? 'GET'
        if (method === 'POST') {
          // The server refuses: the envelope flows to the failure popup.
          return {
            ok: false,
            status: 409,
            json: async () => ({
              detail: 'This self-evaluation was already submitted.',
              code: 'already_submitted',
            }),
          } as unknown as Response
        }
        return {
          ok: true,
          status: 200,
          json: async () => openWire(),
        } as unknown as Response
      }) as unknown as typeof fetch,
    )

    render(page())
    await screen.findByDisplayValue('Delivered the intake rewrite.')
    for (let step = 0; step < 6; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Confirm submission' })).getByRole('button', { name: 'OK' }))

    const failureDialog = await screen.findByRole('dialog', { name: 'Submission failed' })
    expect(within(failureDialog).getByText('Your self-evaluation was not submitted. Please try again.')).toBeInTheDocument()
    expect(within(failureDialog).getByText('This self-evaluation was already submitted.')).toBeInTheDocument()
    await user.click(within(failureDialog).getByRole('button', { name: 'OK' }))

    // The form stays open and editable — a refused submit is not a submit.
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument()
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

describe('EmployeeDashboardPage — submission deadline', () => {
  it('shows the closing countdown in the hero while the open form is days from closing', async () => {
    vi.stubGlobal(
      'fetch',
      apiReturning(openWire({ submissionDeadline: '2199-02-01T10:00:00+00:00' })),
    )

    render(page())

    expect(
      await screen.findByText(/^The form will close in \d+ days\. Fill it up soon\.$/),
    ).toBeInTheDocument()
  })

  it('does not show the countdown once the review is submitted', async () => {
    vi.stubGlobal(
      'fetch',
      apiReturning(openWire({ submittedAt: '2027-01-10', commitmentsEditable: true })),
    )

    render(page())
    await screen.findByText(/Your self-evaluation is read-only now\./)

    expect(screen.queryByText(/The form will close in/)).not.toBeInTheDocument()
  })

  it('replaces the whole wizard with the closed state once the deadline passes', async () => {
    vi.stubGlobal('fetch', apiReturning(openWire({ deadlinePassed: true })))

    render(page())

    expect(await screen.findByText('ops time passed')).toBeInTheDocument()
    expect(screen.queryByText('Question 1 of 4')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
  })

  it('keeps the submitted review readable after the deadline — no closed state', async () => {
    vi.stubGlobal(
      'fetch',
      apiReturning(
        openWire({ deadlinePassed: true, submittedAt: '2027-01-10', commitmentsEditable: false }),
      ),
    )

    render(page())

    expect(await screen.findByText(/Your self-evaluation was submitted\. The form is read-only now\./)).toBeInTheDocument()
    expect(screen.queryByText('ops time passed')).not.toBeInTheDocument()
  })
})

describe('EmployeeDashboardPage — rating scale reference', () => {
  it('reveals the 1-to-5 scale from the info icon on Overall self-rating, with no table card', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', apiReturning(openWire()))

    render(page())
    await screen.findByDisplayValue('Delivered the intake rewrite.')
    for (let step = 0; step < 4; step += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }

    // The standalone scale table is gone from the step.
    expect(screen.queryByRole('columnheader', { name: 'Expectation' })).not.toBeInTheDocument()

    const trigger = screen.getByRole('button', { name: 'Rating scale reference' })
    await user.hover(trigger)

    const popover = await screen.findByRole('group', { name: 'Rating scale (1 to 5)' })
    expect(within(popover).getByText('Below expectations')).toBeInTheDocument()
    expect(within(popover).getByText('Exceeds expectations')).toBeInTheDocument()
    // The rows read 1 → 5.
    const order = popover.textContent ?? ''
    expect(order.indexOf('Significantly below expectations')).toBeLessThan(
      order.indexOf('Significantly exceeds expectations'),
    )
  })
})