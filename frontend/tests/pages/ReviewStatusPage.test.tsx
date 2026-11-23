import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { ReviewStatusPage } from '../../src/pages/ReviewStatusPage'
import type { Employee } from '../../src/lib/types'

const { fetchEmployeesMock } = vi.hoisted(() => ({ fetchEmployeesMock: vi.fn() }))
vi.mock('../../src/lib/api', () => ({ fetchEmployees: fetchEmployeesMock }))

/** The seed roster's real emails — review statuses derive from the email hash,
    so this exact list keeps the fixture's 2 pending / 6 completed split. */
const SEED_EMAILS = [
  'asha_menon@emids.com',
  'bilal_khan@emids.com',
  'cara_fernandes@emids.com',
  'devika_nair@emids.com',
  'eshan_gupta@emids.com',
  'farah_sheikh@emids.com',
  'gaurav_bhatt@emids.com',
  'heena_roy@emids.com',
]

function roster(): Employee[] {
  return SEED_EMAILS.map((email, index) => ({
    employeeId: `EMP-V00${index + 1}`,
    name: `Employee ${index + 1}`,
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
  }))
}

function page(): React.ReactElement {
  return (
    <AdminStoreProvider>
      <ReviewStatusPage />
    </AdminStoreProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  fetchEmployeesMock.mockReset()
  fetchEmployeesMock.mockResolvedValue({ ok: true, employees: roster() })
})

function dataRows(): HTMLElement[] {
  const table = screen.getByRole('table')
  const body = within(table).getAllByRole('rowgroup')[1]
  return within(body ?? table).queryAllByRole('row')
}

describe('ReviewStatusPage', () => {
  it('shows every employee with their form status and a completion meter per status', async () => {
    render(page())
    await screen.findByRole('table')

    expect(screen.getByRole('heading', { name: 'Review form status' })).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Review completion split by status' }),
    ).toBeInTheDocument()
    const titles = [...document.querySelectorAll('.pie-block__chart title')].map((t) => t.textContent)
    // The pie only renders non-zero slices; this roster has no in-progress reviews.
    expect(titles).toHaveLength(3)
    expect(titles.every((title) => title?.includes(' of 8 ('))).toBe(true)
    const tiles = [...document.querySelectorAll('.tile')].map((tile) => tile.textContent)
    expect(tiles).toHaveLength(4)
    for (const label of ['Total employees', 'Completed', 'In progress', 'Not started']) {
      expect(tiles.some((text) => text?.includes(label))).toBe(true)
    }
    for (const status of ['Not started', 'Submitted', 'Signed off']) {
      expect(dataRows().some((row) => within(row).queryByText(status))).toBe(true)
    }
    expect(screen.getByText('Employees · 8 of 8')).toBeInTheDocument()
  })

  it('filters the roster to pending reviews when Pending is selected', async () => {
    const user = userEvent.setup()
    render(page())
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Pending' }))

    expect(screen.getByText('Employees · 2 of 8')).toBeInTheDocument()
    const statuses = dataRows().map((row) => row.textContent)
    expect(statuses.some((text) => text?.includes('Not started'))).toBe(true)
    expect(statuses.some((text) => text?.includes('In progress'))).toBe(false)
    expect(statuses.some((text) => text?.includes('Submitted'))).toBe(false)
    expect(statuses.some((text) => text?.includes('Signed off'))).toBe(false)
  })

  it('filters the roster to completed reviews when Completed is selected', async () => {
    const user = userEvent.setup()
    render(page())
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Completed' }))

    expect(screen.getByText('Employees · 6 of 8')).toBeInTheDocument()
    const statuses = dataRows().map((row) => row.textContent)
    expect(statuses.some((text) => text?.includes('Submitted'))).toBe(true)
    expect(statuses.some((text) => text?.includes('Signed off'))).toBe(true)
    expect(statuses.some((text) => text?.includes('Not started'))).toBe(false)
    expect(statuses.some((text) => text?.includes('In progress'))).toBe(false)
  })

  it('shows the empty-roster next move when no employees are loaded', async () => {
    fetchEmployeesMock.mockResolvedValue({ ok: true, employees: [] })
    render(page())

    expect(
      await screen.findByText('No employees loaded. Upload a roster CSV on the Employee data upload page.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Employees · 0 of 0')).toBeInTheDocument()
  })
})
