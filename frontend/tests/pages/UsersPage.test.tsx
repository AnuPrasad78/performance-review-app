import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { AuthProvider } from '../../src/state/AuthContext'
import { UsersPage } from '../../src/pages/UsersPage'
import type { Employee } from '../../src/lib/types'

const { fetchEmployeesMock } = vi.hoisted(() => ({ fetchEmployeesMock: vi.fn() }))
vi.mock('../../src/lib/api', () => ({ fetchEmployees: fetchEmployeesMock }))

function employee(employeeId: string, name: string, email: string): Employee {
  return {
    employeeId,
    name,
    email,
    designation: 'Engineer',
    location: 'India',
    org: 'Delivery',
    project: 'Cigna One',
    deliveryHead: 'Arumugam Thiraviam',
    deliveryManager: 'Priya Raghavan',
    businessPartner: 'John D',
    reportingManager: 'Priya Raghavan',
    status: 'Active',
  }
}

beforeEach(() => {
  window.localStorage.clear()
  fetchEmployeesMock.mockReset()
})

describe('UsersPage', () => {
  it('renders the API roster with its count', async () => {
    fetchEmployeesMock.mockResolvedValue({
      ok: true,
      employees: [
        employee('EMP-V001', 'Asha Menon', 'asha_menon@emids.com'),
        employee('EMP-V002', 'Bilal Khan', 'bilal_khan@emids.com'),
      ],
    })
    render(
      <AdminStoreProvider>
        <AuthProvider>
          <UsersPage />
        </AuthProvider>
      </AdminStoreProvider>,
    )
    expect(await screen.findByText('Roster · 2 employees')).toBeInTheDocument()
    expect(screen.getByText('asha_menon@emids.com')).toBeInTheDocument()
  })

  it('shows the next-move empty state when the API roster is empty', async () => {
    fetchEmployeesMock.mockResolvedValue({ ok: true, employees: [] })
    render(
      <AdminStoreProvider>
        <AuthProvider>
          <UsersPage />
        </AuthProvider>
      </AdminStoreProvider>,
    )
    expect(
      await screen.findByText('No employees loaded. Upload a roster CSV to get started.'),
    ).toBeInTheDocument()
  })

  it('states the failure when the API is unreachable', async () => {
    fetchEmployeesMock.mockResolvedValue({
      ok: false,
      detail: 'Could not reach the review API.',
      code: 'network_error',
    })
    render(
      <AdminStoreProvider>
        <AuthProvider>
          <UsersPage />
        </AuthProvider>
      </AdminStoreProvider>,
    )
    expect(await screen.findByText('Could not reach the review API.')).toBeInTheDocument()
  })
})
