import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { AdminStoreProvider } from '../src/state/AdminContext'
import { AuthProvider } from '../src/state/AuthContext'
import { AppRoutes } from '../src/App'
import type { AuthSession } from '../src/lib/authStore'
import type { RosterImportResult } from '../src/lib/types'

const { applyRosterImportMock, fetchEmployeesMock, importRosterCsvMock } = vi.hoisted(() => ({
  applyRosterImportMock: vi.fn(),
  fetchEmployeesMock: vi.fn(),
  importRosterCsvMock: vi.fn(),
}))
vi.mock('../src/lib/api', () => ({
  applyRosterImport: applyRosterImportMock,
  fetchEmployees: fetchEmployeesMock,
  importRosterCsv: importRosterCsvMock,
}))

const SESSION_KEY = 'performance-review.session.v1'
const ADMIN_SESSION: AuthSession = {
  email: 'admin@emids.com',
  name: 'Review Administrator',
  role: 'admin',
}
const EMPLOYEE_SESSION: AuthSession = {
  email: 'asha_menon@emids.com',
  name: 'Asha Menon',
  role: 'employee',
}

function signOutBeforeRender(): void {
  window.localStorage.clear()
  window.localStorage.removeItem(SESSION_KEY)
}

function renderApp(initial: string[] = ['/']): React.ReactElement {
  return (
    <AdminStoreProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={initial}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </AdminStoreProvider>
  )
}

function renderSignedInAsAdmin(initial: string[] = ['/']): React.ReactElement {
  signOutBeforeRender()
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(ADMIN_SESSION))
  return renderApp(initial)
}

function renderSignedInAsEmployee(initial: string[] = ['/']): React.ReactElement {
  signOutBeforeRender()
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(EMPLOYEE_SESSION))
  return renderApp(initial)
}

describe('App — routed pages', () => {
  beforeEach(() => {
    fetchEmployeesMock.mockResolvedValue({ ok: true, employees: [] })
  })
  it('lands on the Review form status page', () => {
    render(renderSignedInAsAdmin())
    expect(screen.getByRole('heading', { name: 'Review form status', level: 1 })).toBeInTheDocument()
  })

  it('serves the employee side as a single page without a sidebar', async () => {
    render(renderSignedInAsEmployee())

    expect(await screen.findByRole('heading', { name: 'Hi Asha', level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument()
    expect(document.querySelector('.drawer')).toBeNull()
    expect(await screen.findByText('Q1. Key contributions and achievements')).toBeInTheDocument()
  })

  it('navigates from Users to review status, the upload page and Cycle settings through the drawer', async () => {
    render(renderSignedInAsAdmin())
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const drawer = document.querySelector('.drawer')
    if (!(drawer instanceof HTMLElement)) throw new Error('drawer not found')
    expect(within(drawer).getAllByRole('link')).toHaveLength(4)

    await user.click(within(drawer).getByRole('link', { name: 'Review status' }))
    expect(screen.getByRole('heading', { name: 'Review form status' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const drawerAgain = document.querySelector('.drawer')
    if (!(drawerAgain instanceof HTMLElement)) throw new Error('drawer not found')
    await user.click(within(drawerAgain).getByRole('link', { name: 'Employee data upload' }))
    expect(screen.getByRole('heading', { name: 'Employee data upload' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const drawerThird = document.querySelector('.drawer')
    if (!(drawerThird instanceof HTMLElement)) throw new Error('drawer not found')
    await user.click(within(drawerThird).getByRole('link', { name: 'Cycle settings' }))
    expect(screen.getByRole('heading', { name: 'Review cycle settings', level: 1 })).toBeInTheDocument()
  })

  it('redirects unknown paths to the admin home', () => {
    render(renderSignedInAsAdmin(['/nope']))
    expect(screen.getByRole('heading', { name: 'Review form status', level: 1 })).toBeInTheDocument()
  })

  it('applies an upload and the Users page reads the roster straight from the API', async () => {
    const priya = {
      employeeId: 'EMP-V900',
      name: 'Priya Raj',
      email: 'priya.raj@emids.com',
      designation: 'Engineer',
      location: 'India',
      org: 'Delivery',
      project: 'Cigna One',
      deliveryHead: 'Arumugam Thiraviam',
      deliveryManager: 'Priya Raghavan',
      businessPartner: 'John D',
      reportingManager: 'Priya Raghavan',
      status: 'Active',
    } as const
    importRosterCsvMock.mockResolvedValue({
      ok: true,
      report: {
        importedCount: 1,
        duplicatesSkipped: 0,
        conflicts: [],
        employees: [priya],
      },
    } satisfies RosterImportResult)
    applyRosterImportMock.mockResolvedValue({ ok: true, importedCount: 1, updatedCount: 0 })
    fetchEmployeesMock.mockResolvedValue({ ok: true, employees: [priya] })

    const { container } = render(renderSignedInAsAdmin())
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const drawer = document.querySelector('.drawer')
    if (!(drawer instanceof HTMLElement)) throw new Error('drawer not found')
    await user.click(within(drawer).getByRole('link', { name: 'Employee data upload' }))

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('file input not found')
    await user.upload(input, new File(['Employee Name,Employee ID,Email'], 'roster.csv', { type: 'text/csv' }))
    await screen.findByRole('status', {}, { timeout: 3000 })

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const drawerBack = document.querySelector('.drawer')
    if (!(drawerBack instanceof HTMLElement)) throw new Error('drawer not found')
    await user.click(within(drawerBack).getByRole('link', { name: 'Users' }))

    expect(await screen.findByText('Roster · 1 employee')).toBeInTheDocument()
    expect(screen.getByText('priya.raj@emids.com')).toBeInTheDocument()
  })
})

describe('App — signed-out users are routed to sign-in', () => {
  beforeEach(() => {
    signOutBeforeRender()
  })

  it('shows the sign-in page when no session exists', async () => {
    render(renderApp(['/users']))
    expect(await screen.findByRole('heading', { name: 'Sign in', level: 1 })).toBeInTheDocument()
  })

  it('returns to the guarded route after a successful sign-in', async () => {
    render(renderApp(['/dashboard']))
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'asha_menon@emids.com')
    await user.type(screen.getByLabelText('Password'), 'Portal@2026')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Hi Asha', level: 1 })).toBeInTheDocument()
  })
})
