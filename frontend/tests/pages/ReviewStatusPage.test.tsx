import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { ReviewStatusPage } from '../../src/pages/ReviewStatusPage'
import type { ReviewBoardPage, ReviewStatusWire } from '../../src/lib/types'

const { fetchReviewBoardMock } = vi.hoisted(() => ({ fetchReviewBoardMock: vi.fn() }))
vi.mock('../../src/lib/api', () => ({
  fetchReviewBoard: fetchReviewBoardMock,
  setApiIdentity: vi.fn(),
}))

function wireReview(email: string, name: string, status: ReviewStatusWire['status'], index: number): ReviewStatusWire {
  return {
    employee: {
      employeeId: `EMP-V00${index + 1}`,
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
    },
    status,
  }
}

/** Two board pages (pageSize 2) over an eight-person roster: row slices the
    server decided, so the test only states what the endpoint returns. Rows
    carry display words (the page-facing shape); statusCounts carries raw
    lifecycle words — 4 not-started, 2 in-progress, 2 past-submission. */
const PAGE_ONE: ReviewBoardPage = {
  reviews: [
    wireReview('asha_menon@emids.com', 'Asha Menon', 'in_progress', 0),
    wireReview('bilal_khan@emids.com', 'Bilal Khan', 'not_started', 1),
  ],
  total: 6,
  page: 1,
  pageSize: 2,
  statusCounts: {
    not_started: 4,
    self_evaluation_in_progress: 2,
    self_evaluation_completed: 1,
    in_manager_review: 1,
  },
}
const PAGE_TWO: ReviewBoardPage = {
  reviews: [
    wireReview('cara_fernandes@emids.com', 'Cara Fernandes', 'submitted', 2),
    wireReview('devika_nair@emids.com', 'Devika Nair', 'submitted', 3),
  ],
  total: 2,
  page: 2,
  pageSize: 2,
  statusCounts: {
    not_started: 4,
    self_evaluation_in_progress: 2,
    self_evaluation_completed: 1,
    in_manager_review: 1,
  },
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
  fetchReviewBoardMock.mockReset()
  fetchReviewBoardMock.mockResolvedValue({ ok: true, board: PAGE_ONE })
})

describe('ReviewStatusPage', () => {
  it('renders the whole-roster tiles and pie from the server counts', async () => {
    render(page())
    await screen.findByRole('table')

    expect(screen.getByRole('heading', { name: 'Review form status' })).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Review completion split by status' }),
    ).toBeInTheDocument()
    const titles = [...document.querySelectorAll('.pie-block__chart title')].map((t) => t.textContent)
    // Pie slices come from the collapse of the server's six words.
    expect(titles).toHaveLength(3)
    expect(titles.every((title) => title?.includes(' of 8 ('))).toBe(true)
    const tiles = [...document.querySelectorAll('.tile')].map((tile) => tile.textContent)
    expect(tiles).toHaveLength(4)
    for (const label of ['Total employees', 'Completed', 'In progress', 'Not started']) {
      expect(tiles.some((text) => text?.includes(label))).toBe(true)
    }
  })

  it('opens on Pending — the filtered total for the page heading counts', async () => {
    render(page())
    await screen.findByRole('table')

    expect(fetchReviewBoardMock).toHaveBeenCalledWith({ page: 1, status: 'pending' })
    expect(screen.getByText('Employees · 6 of 8')).toBeInTheDocument()
    // Tile label, pie legend, and this page's pill share each label;
    // submitted rows are absent under the pending filter.
    expect(screen.getAllByText('In progress')).toHaveLength(3)
    expect(screen.getAllByText('Not started')).toHaveLength(3)
    const table = screen.getByRole('table')
    expect(within(table).queryByText('Submitted')).not.toBeInTheDocument()
  })

  it('pager walks server pages and the filter re-opens on page one', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    fetchReviewBoardMock.mockResolvedValue({ ok: true, board: PAGE_TWO })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({ page: 2, status: 'pending' })
    expect(await screen.findByText('Cara Fernandes')).toBeInTheDocument()

    fetchReviewBoardMock.mockResolvedValue({ ok: true, board: { ...PAGE_TWO, total: 8, page: 1, reviews: PAGE_ONE.reviews } })
    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({ page: 1, status: 'all' })
    expect(await screen.findByText('Bilal Khan')).toBeInTheDocument()
  })

  it('states the failure when the board endpoint cannot be reached', async () => {
    fetchReviewBoardMock.mockResolvedValue({
      ok: false,
      detail: 'Could not reach the review API.',
      code: 'network_error',
    })
    render(page())

    expect(await screen.findByText('Could not reach the review API.')).toBeInTheDocument()
  })

  it('shows the empty-roster next move when no employees are loaded', async () => {
    fetchReviewBoardMock.mockResolvedValue({
      ok: true,
      board: { reviews: [], total: 0, page: 1, pageSize: 10, statusCounts: {} },
    })
    render(page())

    expect(
      await screen.findByText('No employees loaded. Upload a roster CSV on the Employee data upload page.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Employees · 0 of 0')).toBeInTheDocument()
  })
})