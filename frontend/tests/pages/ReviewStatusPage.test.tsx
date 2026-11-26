import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { ReviewStatusPage } from '../../src/pages/ReviewStatusPage'
import type { ReviewBoardPage, ReviewStatusWire } from '../../src/lib/types'

const {
  fetchReviewBoardMock,
  fetchEmployeeFacetsMock,
  fetchCompletedCountMock,
  downloadCompletedReviewZipMock,
  fetchReviewStatusCsvExportMock,
  saveCsvBlobMock,
} = vi.hoisted(() => ({
  fetchReviewBoardMock: vi.fn(),
  fetchEmployeeFacetsMock: vi.fn(),
  fetchCompletedCountMock: vi.fn(),
  downloadCompletedReviewZipMock: vi.fn(),
  fetchReviewStatusCsvExportMock: vi.fn(),
  saveCsvBlobMock: vi.fn(),
}))
vi.mock('../../src/lib/api', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchReviewBoard: fetchReviewBoardMock,
  fetchEmployeeFacets: fetchEmployeeFacetsMock,
  fetchCompletedCount: fetchCompletedCountMock,
  fetchReviewStatusCsvExport: fetchReviewStatusCsvExportMock,
  setApiIdentity: vi.fn(),
}))
vi.mock('../../src/lib/reviewDownloads', () => ({
  downloadCompletedReviewZip: downloadCompletedReviewZipMock,
  saveReviewPdf: vi.fn(),
}))
vi.mock('../../src/lib/csvDownload', () => ({
  saveCsvBlob: saveCsvBlobMock,
  downloadCsv: vi.fn(),
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
      businessUnit: 'Payer Digital',
      project: 'Cigna One',
      deliveryHead: 'Arumugam Thiraviam',
      deliveryManager: 'Priya Raghavan',
      businessPartner: 'John D',
      reportingManager: 'Priya Raghavan',
     status: 'Active',
     joiningDate: '',
    },
    status,
    submittedAt: null,
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
  fetchEmployeeFacetsMock.mockReset()
  fetchEmployeeFacetsMock.mockResolvedValue({
    ok: true,
    facets: { designations: ['Engineer'], locations: ['India'], orgs: ['Delivery', 'Quality'], businessUnits: ['Payer Digital'], reportingManagers: ['Priya Raghavan'], employmentStatuses: ['Active'] },
  })
  fetchCompletedCountMock.mockReset()
  fetchCompletedCountMock.mockResolvedValue({ ok: true, count: 2 })
  downloadCompletedReviewZipMock.mockReset()
  downloadCompletedReviewZipMock.mockResolvedValue({ ok: true, count: 2 })
  fetchReviewStatusCsvExportMock.mockReset()
  fetchReviewStatusCsvExportMock.mockResolvedValue({
    ok: true,
    blob: new Blob(['csv'], { type: 'text/csv' }),
  })
  saveCsvBlobMock.mockReset()
})

describe('ReviewStatusPage', () => {
  it('renders the whole-roster tiles and pie from the server counts', async () => {
    render(page())
    await screen.findByRole('table')

    expect(screen.getByRole('heading', { name: 'Performance Review Progress' })).toBeInTheDocument()
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

  it('pager walks server pages and Query changes land back on page one', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    fetchReviewBoardMock.mockResolvedValue({ ok: true, board: PAGE_TWO })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({ page: 2, status: 'pending' })
    expect(await screen.findByText('Cara Fernandes')).toBeInTheDocument()

    // The status filter hangs off the Form status column's funnel now:
    // switching to All rides it, and the query change hands the read back
    // to page one.
    fetchReviewBoardMock.mockResolvedValue({ ok: true, board: { ...PAGE_TWO, page: 1, reviews: PAGE_ONE.reviews } })
    await user.click(screen.getByRole('button', { name: 'Filter by Form status' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Filter by Form status' })).getByRole('button', { name: 'All' }),
    )
    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({ page: 1, status: 'all' })
    })
    expect(await screen.findByText('Bilal Khan')).toBeInTheDocument()
  })

  it('click-to-sort headers toggle the wire order on the board call', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Sort by Reporting manager' }))
    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({
        page: 1,
        status: 'pending',
        sortBy: 'reportingManager',
        sortOrder: 'asc',
      })
    })

    // The same header's second click reverses the direction.
    await user.click(screen.getByRole('button', { name: 'Sort by Reporting manager' }))
    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({
        page: 1,
        status: 'pending',
        sortBy: 'reportingManager',
        sortOrder: 'desc',
      })
    })
  })

  it('the active sort announces itself on the sorted column header', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    const nameHeader = screen.getByRole('button', { name: 'Sort by Name' }).closest('th') as HTMLElement
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending')

    await user.click(screen.getByRole('button', { name: 'Sort by Name' }))
    // Barrier between the clicks: the first click's read is committed when
    // its wire answer lands, so the second click's toggle reads fresh order.
    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({
        page: 1,
        status: 'pending',
        sortBy: 'employeeName',
        sortOrder: 'asc',
      })
    })
    await user.click(screen.getByRole('button', { name: 'Sort by Name' }))
    await waitFor(() => {
      expect(nameHeader).toHaveAttribute('aria-sort', 'descending')
    })
  })

  it('the Form status funnel offers the exact not-started stage', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Filter by Form status' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Filter by Form status' })).getByRole('button', { name: 'Not started' }),
    )

    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({ page: 1, status: 'not_started' })
    })
  })

  it('the Location column funnel narrows the board without the pop-up', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Filter by Location' }))
    const dialog = screen.getByRole('dialog', { name: 'Filter by Location' })
    await user.click(within(dialog).getByRole('button', { name: 'India' }))

    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({
        page: 1,
        status: 'pending',
        location: 'India',
      })
    })
    // The choice folds its own pop-up away — no Apply step.
    expect(screen.queryByRole('dialog', { name: 'Filter by Location' })).not.toBeInTheDocument()
  })

  it('the reporting manager funnel narrows the board from the facet list', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Filter by Reporting manager' }))
    const dialog = screen.getByRole('dialog', { name: 'Filter by Reporting manager' })
    await user.click(within(dialog).getByRole('button', { name: 'Priya Raghavan' }))

    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({
        page: 1,
        status: 'pending',
        reportingManager: 'Priya Raghavan',
      })
    })
  })

  it('search and the org filter compose into the one board call', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Filter by Org' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Filter by Org' })).getByRole('button', { name: 'Quality' }),
    )

    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({ page: 1, status: 'pending', org: 'Quality' })
    })

    // Search lives in the toolbar pop-up; the org word came from the column
    // funnel — the one board call composes both.
    await user.click(screen.getByRole('button', { name: /Search, filter and sort/ }))
    await user.type(screen.getByRole('searchbox', { name: 'Search by employee name or designation' }), 'ash')
    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({ page: 1, status: 'pending', org: 'Quality', search: 'ash' })
    })
  })

  it('narrows the board by business unit', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: /Search, filter and sort/ }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by Business unit' }), 'Payer Digital')

    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({ page: 1, status: 'pending', businessUnit: 'Payer Digital' })
    })
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

  it('Download CSV exports the whole matched set with the composed query', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Filter by Location' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Filter by Location' })).getByRole('button', { name: 'India' }),
    )
    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({ page: 1, status: 'pending', location: 'India' })
    })

    await user.click(screen.getByRole('button', { name: 'Download status' }))
    await waitFor(() => {
      expect(fetchReviewStatusCsvExportMock).toHaveBeenLastCalledWith({
        page: 1,
        status: 'pending',
        location: 'India',
      })
    })
    expect(saveCsvBlobMock).toHaveBeenCalledWith(expect.any(Blob), 'review-status.csv')

    saveCsvBlobMock.mockClear()
    fetchReviewStatusCsvExportMock.mockClear()
    fetchReviewStatusCsvExportMock.mockResolvedValue({
      ok: false,
      detail: 'The export endpoint is unavailable.',
      code: 'network_error',
    })
    await user.click(screen.getByRole('button', { name: 'Download status' }))
    expect(await screen.findByRole('status')).toHaveTextContent('The export endpoint is unavailable.')
  })

  it('announces the matched completed count and streams the ZIP on click', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    const button = await screen.findByRole('button', { name: 'Download submitted reviews (2)' })
    await user.click(button)

    await waitFor(() => {
      expect(downloadCompletedReviewZipMock).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, status: 'pending' }),
      )
    })
  })

  it('the completed-count read follows the composed roster filters, not the status word', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    expect(fetchCompletedCountMock).toHaveBeenCalledWith({ page: 1, status: 'pending' })

    await user.click(screen.getByRole('button', { name: 'Filter by Location' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Filter by Location' })).getByRole('button', { name: 'India' }),
    )

    await waitFor(() => {
      expect(fetchCompletedCountMock).toHaveBeenLastCalledWith({
        page: 1,
        status: 'pending',
        location: 'India',
      })
    })
  })

  it('a failed count read stays disabled until the next query, and a failed ZIP becomes a toast', async () => {
    fetchCompletedCountMock.mockResolvedValue({ ok: true, count: 0 })
    render(page())
    const user = userEvent.setup()

    expect(
      await screen.findByRole('button', { name: 'Download submitted reviews' }),
    ).toBeDisabled()

    // Any query change re-reads the count; a real number arms the trigger.
    fetchCompletedCountMock.mockResolvedValue({ ok: true, count: 3 })
    await user.click(screen.getByRole('button', { name: 'Filter by Location' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Filter by Location' })).getByRole('button', { name: 'India' }),
    )
    const armed = await screen.findByRole('button', { name: 'Download submitted reviews (3)' })

    downloadCompletedReviewZipMock.mockResolvedValue({ ok: false, detail: 'The ZIP failed.', code: 'request_failed' })
    await user.click(armed)

    expect(await screen.findByRole('status')).toHaveTextContent('The ZIP failed.')
  })

  it("a submitted row's card carries Download review, an open row's does not", async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    // Hours the board's own pill decides: a pending row hides the button.
    await user.click(screen.getByText('Bilal Khan'))
    await screen.findByRole('dialog', { name: 'More about Bilal Khan' })
    expect(screen.queryByRole('button', { name: 'Download review' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))

    // PAGE_ONE's table has no submitted row... but the board serves one once
    // the pending filter drops: switch to All, where Cara's row reads submitted.
    fetchReviewBoardMock.mockResolvedValue({
      ok: true,
      board: { ...PAGE_ONE, page: 1, total: 2, reviews: PAGE_TWO.reviews },
    })
    await user.click(screen.getByRole('button', { name: 'Filter by Form status' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Filter by Form status' })).getByRole('button', { name: 'All' }),
    )
    await screen.findByText('Cara Fernandes')

    await user.click(screen.getByText('Cara Fernandes'))
    const dialog = await screen.findByRole('dialog', { name: 'More about Cara Fernandes' })
    expect(within(dialog).getByRole('button', { name: 'Download review' })).toBeInTheDocument()
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