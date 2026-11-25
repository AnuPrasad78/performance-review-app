import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { AuthProvider } from '../../src/state/AuthContext'
import { UsersPage } from '../../src/pages/UsersPage'
import type { Employee, RosterFacets } from '../../src/lib/types'

const { fetchEmployeesMock, fetchEmployeeFacetsMock } = vi.hoisted(() => ({
  fetchEmployeesMock: vi.fn(),
  fetchEmployeeFacetsMock: vi.fn(),
}))
vi.mock('../../src/lib/api', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchEmployees: fetchEmployeesMock,
  fetchEmployeeFacets: fetchEmployeeFacetsMock,
  setApiIdentity: vi.fn(),
}))
  fetchEmployees: fetchEmployeesMock,
  fetchEmployeeFacets: fetchEmployeeFacetsMock,
  setApiIdentity: vi.fn(),
}))

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

const ASHA = employee('EMP-V001', 'Asha Menon', 'asha_menon@emids.com')
const BILAL = employee('EMP-V002', 'Bilal Khan', 'bilal.khan@emids.com')

const FACETS: RosterFacets = {
  designations: ['Engineer', 'Product Manager'],
  locations: ['India', 'Singapore'],
  orgs: ['Delivery', 'Quality'],
  reportingManagers: ['Priya Raghavan'],
  employmentStatuses: ['Active'],
}

/** One server page result: rows on the page, `total` the whole roster. */
function pageResult(employees: Employee[], total: number, pageSize = 10) {
  return { ok: true, employees, total, page: 1, pageSize }
}

async function openQueryControls(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /Search, filter and sort/ }))
}

function page(): React.ReactElement {
  return (
    <AdminStoreProvider>
      <AuthProvider>
        <UsersPage />
      </AuthProvider>
    </AdminStoreProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  fetchEmployeesMock.mockReset()
  fetchEmployeeFacetsMock.mockReset()
  fetchEmployeeFacetsMock.mockResolvedValue({ ok: true, facets: FACETS })
})

describe('UsersPage', () => {
  it('renders the API roster with its count', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA, BILAL], 2))
    render(page())
    expect(await screen.findByText('Roster · 2 employees')).toBeInTheDocument()
    expect(screen.getByText(ASHA.email)).toBeInTheDocument()
    expect(fetchEmployeesMock).toHaveBeenCalledWith({ page: 1 })
  })

  it('pays out one page of rows per server call and pagers through them', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 2, 1))
    render(page())
    const user = userEvent.setup()
    expect(await screen.findByText('Roster · 1 employee')).toBeInTheDocument()
    expect(screen.getByText('asha_menon@emids.com')).toBeInTheDocument()
    fetchEmployeesMock.mockResolvedValue(pageResult([BILAL], 2, 1))

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('bilal.khan@emids.com')).toBeInTheDocument()
    expect(screen.getByText('PAGE 2 OF 2')).toBeInTheDocument()
    expect(fetchEmployeesMock).toHaveBeenLastCalledWith({ page: 2 })
  })

  it('shows the next-move empty state when the API roster is empty', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([], 0))
    render(page())
    expect(
      await screen.findByText('No employees loaded. Upload a roster CSV to get started.'),
    ).toBeInTheDocument()
    // A single page hides the pager.
    expect(screen.queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument()
  })

  it("reveals the employee's remaining roster data as a popup when their row is clicked", async () => {
    const user = userEvent.setup()
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    render(page())
    expect(await screen.findByText('Roster · 1 employee')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'More about Asha Menon' })).not.toBeInTheDocument()

    await user.click(screen.getByText('asha_menon@emids.com'))

    const dialog = screen.getByRole('dialog', { name: 'More about Asha Menon' })
    expect(dialog).toBeInTheDocument()
    // The popup carries the whole roster record minus the identity block.
    for (const title of [
      'Employee ID',
      'Designation',
      'Location',
      'Org',
      'Current Account / Project',
      'Delivery Head',
      'Delivery Manager',
      'Business Partner',
      'Reporting Manager',
      'Status',
    ]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0)
    }

    // Close folds the popup away.
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'More about Asha Menon' })).not.toBeInTheDocument()
  })

  it('search at the pop-up composes with a dropdown filter into one call', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await openQueryControls(user)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by Org' }), 'Quality')

    await waitFor(() => {
      expect(fetchEmployeesMock).toHaveBeenLastCalledWith({
        page: 1,
        org: 'Quality',
      })
    })

    await user.type(
      screen.getByRole('searchbox', { name: 'Search by employee name or designation' }),
      'ash',
    )
    await waitFor(() => {
      expect(fetchEmployeesMock).toHaveBeenLastCalledWith({
        page: 1,
        org: 'Quality',
        search: 'ash',
      })
    })
  })

  it('sort choices land on the wire untouched from the pop-up', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await openQueryControls(user)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'employeeName')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort direction' }), 'desc')

    expect(fetchEmployeesMock).toHaveBeenLastCalledWith({
      page: 1,
      sortBy: 'employeeName',
      sortOrder: 'desc',
    })
  })

  it('clear all strips every word back to the plain page read', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await openQueryControls(user)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by Org' }), 'Quality')
    await waitFor(() => {
      expect(fetchEmployeesMock).toHaveBeenLastCalledWith({ page: 1, org: 'Quality' })
    })

    await user.click(screen.getByRole('button', { name: 'Clear all' }))

    expect(fetchEmployeesMock).toHaveBeenLastCalledWith({ page: 1 })
  })

  it('states the failure when the API is unreachable', async () => {
    fetchEmployeesMock.mockResolvedValue({
      ok: false,
      detail: 'Could not reach the review API.',
      code: 'network_error',
    })
    render(page())
    expect(await screen.findByText('Could not reach the review API.')).toBeInTheDocument()
  })
})
