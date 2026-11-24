import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { AuthProvider } from '../../src/state/AuthContext'
import { AppRoutes } from '../../src/App'
import type { SelfEvaluationWire, SessionApiResult, SessionWire } from '../../src/lib/types'

const {
  fetchEmployeesMock,
  fetchReviewStatusesMock,
  fetchSelfEvaluationMock,
  fetchSessionMock,
  saveSelfEvaluationMock,
  submitSelfEvaluationMock,
} = vi.hoisted(() => ({
  fetchEmployeesMock: vi.fn(),
  fetchReviewStatusesMock: vi.fn(),
  fetchSelfEvaluationMock: vi.fn(),
  fetchSessionMock: vi.fn(),
  saveSelfEvaluationMock: vi.fn(),
  submitSelfEvaluationMock: vi.fn(),
}))
vi.mock('../../src/lib/api', () => ({
  fetchEmployees: fetchEmployeesMock,
  fetchReviewStatuses: fetchReviewStatusesMock,
  fetchSelfEvaluation: fetchSelfEvaluationMock,
  fetchSession: fetchSessionMock,
  saveSelfEvaluation: saveSelfEvaluationMock,
  submitSelfEvaluation: submitSelfEvaluationMock,
  setApiIdentity: vi.fn(),
}))

function session(employeeId: string, name: string, email: string, role: 'admin' | 'employee'): SessionApiResult {
  const payload: SessionWire = { employeeId, name, email, role }
  return { ok: true, session: payload }
}

function openEvaluation(name: string, email: string): SelfEvaluationWire {
  return {
    employee: {
      employeeId: 'EMP-V001',
      name,
      email,
      designation: 'Software Engineer',
      location: 'India',
      org: 'Delivery',
      project: 'Cigna One',
      deliveryHead: 'Arumugam Thiraviam',
      deliveryManager: 'Priya Raghavan',
      businessPartner: 'John D',
      reportingManager: 'Priya Raghavan',
      status: 'Active',
    },
    reviewYear: 2026,
    submissionDeadline: '2027-01-15',
    submittedAt: null,
    employeeSignedAt: null,
    responses: { contribution: '', strengths: '', development: '', support: '' },
    managerComments: { contribution: '', strengths: '', development: '', support: '' },
    overallRating: null,
    overallSummary: '',
    forwardCommitments: [],
    commitmentsEditable: true,
  }
}

beforeEach(() => {
  window.localStorage.clear()
  fetchSelfEvaluationMock.mockReset()
  fetchSessionMock.mockReset()
  fetchEmployeesMock.mockReset()
  fetchReviewStatusesMock.mockReset()
  fetchSelfEvaluationMock.mockResolvedValue({
    ok: true,
    data: openEvaluation('Asha Menon', 'asha_menon@emids.com'),
  })
  fetchEmployeesMock.mockResolvedValue({ ok: true, employees: [] })
  fetchReviewStatusesMock.mockResolvedValue({ ok: true, reviews: [] })
})

function renderApp(): React.ReactElement {
  return (
    <AdminStoreProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </AdminStoreProvider>
  )
}

describe('LoginPage', () => {
  it('renders the sign-in form and keeps SSO as the visible primary option', () => {
    render(renderApp())
    expect(screen.getByRole('heading', { name: 'Sign in', level: 1 })).toBeInTheDocument()
    const sso = screen.getByRole('button', { name: 'Sign in with Microsoft' })
    expect(sso).toBeEnabled()
  })

  it('explains that SSO is not wired for this release when it is clicked', async () => {
    const user = userEvent.setup()
    render(renderApp())
    await user.click(screen.getByRole('button', { name: 'Sign in with Microsoft' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'SSO is not enabled for this release — sign in with your email.',
    )
  })

  it('surfaces the roster rejection for an unknown email', async () => {
    fetchSessionMock.mockResolvedValue({
      ok: false,
      detail: 'This address is not on the review roster.',
      code: 'auth_unknown_email',
    })
    render(renderApp())
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'nobody@emids.com')
    await user.type(screen.getByLabelText('Password'), 'Portal@2026')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This address is not on the review roster.')
    expect(screen.getByRole('heading', { name: 'Sign in', level: 1 })).toBeInTheDocument()
  })

  it('signs the admin in to the admin console', async () => {
    fetchSessionMock.mockResolvedValue(
      session('ADMIN-1', 'Review Administrator', 'admin@emids.com', 'admin'),
    )
    render(renderApp())
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'admin@emids.com')
    await user.type(screen.getByLabelText('Password'), 'Portal@2026')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Review form status', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument()
  })

  it('signs a roster employee in to the dashboard that greets them by name', async () => {
    fetchSessionMock.mockResolvedValue(
      session('EMP-V001', 'Asha Menon', 'asha_menon@emids.com', 'employee'),
    )
    render(renderApp())
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'asha_menon@emids.com')
    await user.type(screen.getByLabelText('Password'), 'Portal@2026')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Annual Performance Review 2026', level: 1 })).toBeInTheDocument()
  })
})
