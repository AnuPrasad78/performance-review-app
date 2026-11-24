import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { AuthProvider } from '../../src/state/AuthContext'
import { CycleSettingsPage } from '../../src/pages/CycleSettingsPage'

/** The settings page speaks the admin API (GET/PUT /api/cycle-settings):
    load hydrates the form, save goes to the server, and the server's error
    envelopes surface inline. */
const SETTINGS_WIRE = {
  reviewYear: 2026,
  submissionDeadline: '2027-01-15T10:00:00+00:00',
  managerReviewStart: '2027-01-16',
  managerReviewEnd: '2027-02-15',
  hrApprovalReleaseBy: '2027-03-01',
}

interface TrackedCall {
  url: string
  method?: string
  body?: Record<string, unknown>
}

let requests: TrackedCall[] = []

function apiReturning(payload: unknown, status = 200): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method,
      body: init?.body !== undefined ? (JSON.parse(String(init.body)) as TrackedCall['body']) : undefined,
    })
    const ok = status >= 200 && status < 300
    return {
      ok,
      status,
      json: async () => payload,
    } as unknown as Response
  }) as unknown as typeof fetch
}

function page(): React.ReactElement {
  return (
    <AdminStoreProvider>
      <AuthProvider>
        <CycleSettingsPage />
      </AuthProvider>
    </AdminStoreProvider>
  )
}

type FieldType = 'date' | 'time' | 'number'

function setField(type: FieldType, index: number, value: string): void {
  const inputs = document.querySelectorAll<HTMLInputElement>(`input[type="${type}"]`)
  const input = inputs[index]
  if (!input) throw new Error(`${type} input ${index} not found`)
  fireEvent.change(input, { target: { value } })
}

async function fillCompleteForm(): Promise<void> {
  // The form renders only after the page's GET settles.
  await screen.findByText('Self-evaluation submission deadline (UTC)')
  setField('date', 0, '2027-01-15')
  setField('time', 0, '10:00')
  setField('date', 1, '2027-01-20')
  setField('date', 2, '2027-02-10')
  setField('date', 3, '2027-02-20')
  const yearInput = document.querySelector<HTMLInputElement>('input[type="number"]')
  if (yearInput === null) throw new Error('review year input not found')
  fireEvent.change(yearInput, { target: { value: '2026' } })
  await screen.findByRole('button', { name: 'Save cycle settings' })
}

beforeEach(() => {
  requests = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Input order: deadline date + UTC time (two fields), manager window start
// and end, HR release date, and the year field beside them.

describe('CycleSettingsPage — client validation', () => {
  it('blocks save while the HR release date is missing', async () => {
    vi.stubGlobal('fetch', apiReturning(SETTINGS_WIRE))

    render(page())
    await fillCompleteForm()
    setField('date', 3, '')

    expect(screen.getByText('Choose the HR approval and release date.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save cycle settings' })).toBeDisabled()
  })

  it('shows the date-range error when the HR release date precedes the manager review end', async () => {
    vi.stubGlobal('fetch', apiReturning(SETTINGS_WIRE))

    render(page())
    await fillCompleteForm()
    setField('date', 3, '2027-02-05')

    expect(
      screen.getByText('HR approval and release date must come on or after the manager review end date.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save cycle settings' })).toBeDisabled()
  })

  it('requires a UTC time beside the deadline date', async () => {
    // A missing cycle renders the empty form, so the unset time is really unset.
    vi.stubGlobal(
      'fetch',
      apiReturning({ detail: 'No review cycle is configured yet.', code: 'cycle_missing' }, 404),
    )

    render(page())
    await screen.findByText('Self-evaluation submission deadline (UTC)')
    setField('date', 0, '2027-01-15')
    setField('date', 1, '2027-01-20')
    setField('date', 2, '2027-02-10')
    setField('date', 3, '2027-02-20')
    const yearInput = document.querySelector<HTMLInputElement>('input[type="number"]')
    if (yearInput === null) throw new Error('review year input not found')
    fireEvent.change(yearInput, { target: { value: '2026' } })

    expect(screen.getByText('Choose the submission deadline time, in UTC.')).toBeInTheDocument()
  })

  it('labels the deadline inputs as UTC', async () => {
    vi.stubGlobal('fetch', apiReturning(SETTINGS_WIRE))

    render(page())

    expect(await screen.findByText('Self-evaluation submission deadline (UTC)')).toBeInTheDocument()
    expect(screen.getByText('Deadline time (UTC)')).toBeInTheDocument()
  })
})

describe('CycleSettingsPage — the admin API contract', () => {
  it('saves valid settings through PUT and shows the toast', async () => {
    const user = userEvent.setup()
    // GET, then the PUT echo.
    vi.stubGlobal('fetch', apiReturning(SETTINGS_WIRE))

    render(page())
    await fillCompleteForm()
    await user.click(screen.getByRole('button', { name: 'Save cycle settings' }))

    expect(await screen.findByRole('status')).toHaveTextContent('HR release by 01-Mar-2027')
    expect(requests.some((call) => call.method === 'PUT' && call.url.includes('/api/cycle-settings'))).toBe(true)
    const putCall = requests.find((call) => call.method === 'PUT')
    expect(putCall?.body).toEqual({
      reviewYear: 2026,
      submissionDeadline: '2027-01-15T10:00:00Z',
      managerReviewStart: '2027-01-20',
      managerReviewEnd: '2027-02-10',
      hrApprovalReleaseBy: '2027-02-20',
    })
  })

  it('surfaces the server’s date-order error inline instead of a toast success', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'PUT') {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              detail: "The submission deadline's day must come on or before the manager review start date.",
              code: 'date_order_error',
            }),
          } as unknown as Response
        }
        requests.push({ url: String(input), method: init?.method })
        return {
          ok: true,
          status: 200,
          json: async () => SETTINGS_WIRE,
        } as unknown as Response
      }) as unknown as typeof fetch,
    )

    render(page())
    await fillCompleteForm()
    await user.click(screen.getByRole('button', { name: 'Save cycle settings' }))

    expect(await screen.findByText(/must come on or before the manager review start date/)).toBeInTheDocument()
  })

  it('hydrates the form from GET, splitting the deadline instant into UTC date and time', async () => {
    vi.stubGlobal('fetch', apiReturning(SETTINGS_WIRE))

    render(page())

    expect(await screen.findByDisplayValue('2027-01-15')).toBeInTheDocument()
    expect(document.querySelector<HTMLInputElement>('input[type="time"]')?.value).toBe('10:00')
    expect(document.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe('2026')
  })

  it('opens an empty form when no cycle exists yet (cycle_missing)', async () => {
    vi.stubGlobal(
      'fetch',
      apiReturning({ detail: 'No review cycle is configured yet.', code: 'cycle_missing' }, 404),
    )

    render(page())

    expect(await screen.findByRole('button', { name: 'Save cycle settings' })).toBeDisabled()
  })
})
