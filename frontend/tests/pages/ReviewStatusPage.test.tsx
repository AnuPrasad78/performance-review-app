import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { ReviewStatusPage } from '../../src/pages/ReviewStatusPage'
import type { ReviewStatus } from '../../src/lib/types'

const { fetchReviewStatusesMock } = vi.hoisted(() => ({ fetchReviewStatusesMock: vi.fn() }))
vi.mock('../../src/lib/api', () => ({
  fetchReviewStatuses: fetchReviewStatusesMock,
  setApiIdentity: vi.fn(),
}))

/** Statuses come from the backend now, so the fixture states them outright:
    1 not started, 1 in progress, 6 submitted over an eight-person roster. */
const SEED: readonly { email: string; status: ReviewStatus }[] = [
  { email: 'bilal_khan@emids.com', status: 'not_started' },
  { email: 'asha_menon@emids.com', status: 'in_progress' },
  { email: 'cara_fernandes@emids.com', status: 'submitted' },
  { email: 'devika_nair@emids.com', status: 'submitted' },
  { email: 'eshan_gupta@emids.com', status: 'submitted' },
  { email: 'farah_sheikh@emids.com', status: 'submitted' },
  { email: 'gaurav_bhatt@emids.com', status: 'submitted' },
  { email: 'heena_roy@emids.com', status: 'submitted' },
]

function page(): React.ReactElement {
  return (
    <AdminStoreProvider>
      <ReviewStatusPage />
    </AdminStoreProvider>
  )
}

function wireReview(seed: { email: string; status: ReviewStatus }, index: number) {
  return {
    employee: {
      employeeId: `EMP-V00${index + 1}`,
      name: `Employee ${index + 1}`,
      email: seed.email,
      designation: 'Engineer',
      location: 'India',
      org: 'Delivery',
      project: 'Cigna One',
      deliveryHead: 'Arumugam Thiraviam',
      deliveryManager: 'Priya Raghavan',
      businessPartner: 'John D',
      reportingManager: 'Priya Raghavan',
      status: 'Active',
    },
    status: seed.status,
  }
}

beforeEach(() => {
  window.localStorage.clear()
  fetchReviewStatusesMock.mockReset()
  fetchReviewStatusesMock.mockResolvedValue({
    ok: true,
    reviews: SEED.map((seed, index) => wireReview(seed, index)),
  })
})

function dataRows(): HTMLElement[] {
  const table = screen.getByRole('table')
  const body = within(table).getAllByRole('rowgroup')[1]
  return within(body ?? table).queryAllByRole('row')
}

describe('ReviewStatusPage', () => {
  it('shows every employee with their form status and a completion meter per status', async () => {
    const user = userEvent.setup()
    render(page())
    await screen.findByRole('table')

    // Pending opens the board by default; All reveals the full roster.
    await user.click(screen.getByRole('button', { name: 'All' }))

    expect(screen.getByRole('heading', { name: 'Review form status' })).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Review completion split by status' }),
    ).toBeInTheDocument()
    const titles = [...document.querySelectorAll('.pie-block__chart title')].map((t) => t.textContent)
    // Every slice of this fixture is non-zero.
    expect(titles).toHaveLength(3)
    expect(titles.every((title) => title?.includes(' of 8 ('))).toBe(true)
    const tiles = [...document.querySelectorAll('.tile')].map((tile) => tile.textContent)
    expect(tiles).toHaveLength(4)
    for (const label of ['Total employees', 'Completed', 'In progress', 'Not started']) {
      expect(tiles.some((text) => text?.includes(label))).toBe(true)
    }
    for (const status of ['Not started', 'In progress', 'Submitted']) {
      expect(dataRows().some((row) => within(row).queryByText(status))).toBe(true)
    }
    expect(screen.getByText('Employees · 8 of 8')).toBeInTheDocument()
  })

  it('filters the roster to pending reviews when Pending is selected', async () => {
    const user = userEvent.setup()
    render(page())
    await screen.findByRole('table')

    expect(screen.getByText('Employees · 2 of 8')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pending' }))

    expect(screen.getByText('Employees · 2 of 8')).toBeInTheDocument()
    const statuses = dataRows().map((row) => row.textContent)
    expect(statuses.some((text) => text?.includes('Not started'))).toBe(true)
    expect(statuses.some((text) => text?.includes('In progress'))).toBe(true)
    expect(statuses.some((text) => text?.includes('Submitted'))).toBe(false)
  })

  it('filters the roster to completed reviews when Completed is selected', async () => {
    const user = userEvent.setup()
    render(page())
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Completed' }))

    expect(screen.getByText('Employees · 6 of 8')).toBeInTheDocument()
    const statuses = dataRows().map((row) => row.textContent)
    expect(statuses.some((text) => text?.includes('Submitted'))).toBe(true)
    expect(statuses.some((text) => text?.includes('Not started'))).toBe(false)
    expect(statuses.some((text) => text?.includes('In progress'))).toBe(false)
  })

  it('states the failure when the status endpoint cannot be reached', async () => {
    fetchReviewStatusesMock.mockResolvedValue({
      ok: false,
      detail: 'Could not reach the review API.',
      code: 'network_error',
    })
    render(page())

    expect(await screen.findByText('Could not reach the review API.')).toBeInTheDocument()
  })

  it('shows the empty-roster next move when no employees are loaded', async () => {
    fetchReviewStatusesMock.mockResolvedValue({ ok: true, reviews: [] })
    render(page())

    expect(
      await screen.findByText('No employees loaded. Upload a roster CSV on the Employee data upload page.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Employees · 0 of 0')).toBeInTheDocument()
  })
})
