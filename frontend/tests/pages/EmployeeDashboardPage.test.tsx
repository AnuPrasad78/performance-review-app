import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'
import { AuthProvider } from '../../src/state/AuthContext'
import { EmployeeDashboardPage } from '../../src/pages/EmployeeDashboardPage'

const EMPTY_RESPONSES = { contribution: '', strengths: '', development: '', support: '' }

const SESSION_KEY = 'performance-review.session.v1'
const SESSION = { email: 'asha_menon@emids.com', name: 'Asha Menon', role: 'employee' }

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

describe('EmployeeDashboardPage reading and writing the review API', () => {
  it('greets the signed-in user, renders the roster profile, and offers save/submit', async () => {
    vi.stubGlobal('fetch', apiReturning(openWire()))

    render(page())

    expect(await screen.findByText('Hi Asha')).toBeInTheDocument()
    // Profile fields come from the API's employee row, rendered read-only.
    expect(screen.getByDisplayValue('Software Engineer')).toBeInTheDocument()
    expect(screen.getAllByDisplayValue('Priya Raghavan')).toHaveLength(2)
    expect(screen.getByDisplayValue('Delivered the intake rewrite.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Q1. Key contributions and achievements' })).toBeInTheDocument()
    // The answer fields are live editing surfaces again.
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument()
  })

  it('falls back to the loading state before the API answers', () => {
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

  it('memorizes a draft through the partial-save PATCH', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', apiReturning(openWire()))

    render(page())
    // The editable answer box renders under the shared FormField label (there
    // are four "Employee response" labels), so address Q1 by its loaded value.
    await screen.findByDisplayValue('Delivered the intake rewrite.')
    const answer = screen.getByDisplayValue('Delivered the intake rewrite.')
    await user.type(answer, ' — for the Cigna One migration')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByText('Draft saved.')).toBeInTheDocument()
    const patched = calls.find((call) => call.method === 'PATCH')
    expect(patched?.url).toContain('/api/evaluations/me')
  })

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
  })

  it('auto-saves the chosen self-rating under the patch contract key', async () => {
    // Regression: the payload once carried the GET's key (overallRating),
    // which the backend silently ignored — the submit check then reported
    // a missing self rating on a "complete" form.
    vi.stubGlobal('fetch', apiReturning(openWire()))

    render(page())
    await screen.findByText('Hi Asha')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '4' }))

    await new Promise((resolve) => setTimeout(resolve, 1600))

    const ratingCall = calls.find(
      (call) => call.method === 'PATCH' && call.body?.selfRating === 4,
    )
    expect(ratingCall).toBeDefined()
  })

  it('blocks submit while the review is incomplete, without calling the API', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', apiReturning(openWire()))

    render(page())
    await screen.findByRole('button', { name: 'Submit' })
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('Complete the flagged fields before submitting.')).toBeInTheDocument()
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0)
  })

  it('renders a submitted review read-only, without any save control', async () => {
    vi.stubGlobal(
      'fetch',
      apiReturning(openWire({ submittedAt: '2026-11-20', commitmentsEditable: false })),
    )

    render(page())

    expect(await screen.findByText('Your self-evaluation was submitted. The form is read-only now.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save commitments' })).not.toBeInTheDocument()
  })

  it('keeps commitments editable after submission while the window is open', async () => {
    vi.stubGlobal(
      'fetch',
      apiReturning(openWire({ submittedAt: '2026-11-20', commitmentsEditable: true })),
    )

    render(page())

    expect(
      await screen.findByText(/Your self-evaluation is read-only now/),
    ).toBeInTheDocument()
    const commitments = screen.getAllByDisplayValue('Own the intake rewrite')
    expect(commitments).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Save commitments' })).toBeInTheDocument()
  })
})
