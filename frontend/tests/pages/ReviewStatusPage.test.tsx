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
    carry the lifecycle words verbatim (no display collapse); the
    distribution carries all six, 2+2+1+1+1+1 = 8. The page reads the
    endpoint twice per shape — a pie query for the tiles/pie and a table
    query for the rows — so the default mock serves both. */
const PAGE_ONE: ReviewBoardPage = {
  reviews: [
    wireReview('asha_menon@emids.com', 'Asha Menon', 'self_evaluation_in_progress', 0),
    wireReview('bilal_khan@emids.com', 'Bilal Khan', 'not_started', 1),
  ],
  total: 8,
  page: 1,
  pageSize: 2,
  statusCounts: {
    not_started: 2,
    self_evaluation_in_progress: 2,
    self_evaluation_completed: 1,
    in_manager_review: 1,
    manager_evaluation_in_progress: 1,
    manager_evaluation_completed: 1,
  },
}
const PAGE_TWO: ReviewBoardPage = {
  reviews: [
    wireReview('cara_fernandes@emids.com', 'Cara Fernandes', 'self_evaluation_completed', 2),
    wireReview('devika_nair@emids.com', 'Devika Nair', 'manager_evaluation_in_progress', 3),
  ],
  total: 8,
  page: 2,
  pageSize: 2,
  statusCounts: PAGE_ONE.statusCounts,
}

/** The distribution the pie read answers under a search word: two members
    match — one never-opened, one mid self-eval. */
const PIE_SEARCHED: ReviewBoardPage = {
  ...PAGE_ONE,
  statusCounts: { not_started: 1, self_evaluation_in_progress: 1 },
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
    facets: { designations: ['Engineer'], locations: ['India'], orgs: ['Delivery', 'Quality'], businessUnits: ['Payer Digital'], businessPartners: ['John D'], reportingManagers: ['Priya Raghavan'], employmentStatuses: ['Active'] },
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

/** Narrows the table through its toolbar pop-up — the table's remaining
    roster filters live there now that only Evaluation status has a funnel. */
async function chooseTableBusinessUnit(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const tableCard = screen.getByRole('table').closest('.card') as HTMLElement
  await user.click(within(tableCard).getByRole('button', { name: /Search, filter and sort/ }))
  await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by Business unit' }), 'Payer Digital')
}

describe('ReviewStatusPage', () => {
  it('renders the whole-roster tiles and pie from the server counts', async () => {
    render(page())
    await screen.findByRole('table')

    expect(screen.getByRole('heading', { name: 'Performance Review Progress' })).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Review completion split by status' }),
    ).toBeInTheDocument()
    const titles = [...document.querySelectorAll('.pie-block__chart title')].map((t) => t.textContent)
    // The pie speaks all six lifecycle words — one slice each, nothing merged.
    expect(titles).toHaveLength(6)
    expect(titles.every((title) => title?.includes(' of 8 ('))).toBe(true)
    // Tiles mirror their same-named pie slices exactly: Total 8;
    // Self-evaluation completed 1 → 12.5%; in progress 2 → 25.0%;
    // not started 2 → 25.0%. Manager-phase words stay in the pie alone.
    const tiles = [...document.querySelectorAll('.tile')].map((tile) => tile.textContent ?? '')
    expect(tiles).toHaveLength(4)
    const tileFor = (label: string): string => tiles.find((text) => text.includes(label)) ?? ''
    expect(tileFor('Total employees')).toContain('8')
    expect(tileFor('Self-evaluation completed')).toContain('12.5% completion')
    expect(tileFor('Self-evaluation in progress')).toContain('25.0% of employees')
    expect(tileFor('Self-evaluation not started')).toContain('25.0% of employees')
    for (const status of ['completed', 'in progress', 'not started']) {
      expect(titles.some((title) => title?.startsWith(`Self-evaluation ${status}: `))).toBe(true)
    }
    // Two scopes, two reads of the same endpoint on boot: the pie query and
    // the table query each fetch once.
    expect(fetchReviewBoardMock).toHaveBeenCalledTimes(2)
  })

  it('each card owns its own Search & Filter trigger', async () => {
    render(page())
    await screen.findByRole('table')

    // The pie card keeps one trigger; the table card keeps its own — two
    // scopes, two toolbars, one endpoint.
    const pie = screen.getByRole('img', { name: 'Review completion split by status' })
    const pieCard = pie.closest('.card') as HTMLElement
    expect(within(pieCard).getByRole('button', { name: /Search, filter and sort/ })).toBeInTheDocument()
    expect(within(pieCard).queryByRole('button', { name: /Download submitted reviews/ })).not.toBeInTheDocument()

    const tableCard = screen.getByRole('table').closest('.card') as HTMLElement
    expect(within(tableCard).getByRole('button', { name: /Search, filter and sort/ })).toBeInTheDocument()
    expect(within(tableCard).getByRole('button', { name: /Download submitted reviews/ })).toBeInTheDocument()
  })

  it('pins only the Name column while the table scrolls sideways', async () => {
    render(page())
    const table = await screen.findByRole('table')

    const nameHeader = screen.getByRole('button', { name: 'Sort by Name' }).closest('th') as HTMLElement
    expect(nameHeader).toHaveClass('table__cell--sticky')
    const firstRow = within(table).getAllByRole('row')[1] as HTMLElement
    const [nameCell, ...rest] = within(firstRow).getAllByRole('cell')
    expect(nameCell).toHaveClass('table__cell--sticky')
    for (const cell of rest) expect(cell).not.toHaveClass('table__cell--sticky')
  })

  it('opens on All — the whole roster, every word at its own stage', async () => {
    render(page())
    await screen.findByRole('table')

    expect(screen.getByText('Employees · 8 of 8')).toBeInTheDocument()
    // Tile label, pie legend, and this page's pill share each lifecycle
    // label verbatim: the row's pill, the pie legend, and the tile.
    expect(screen.getAllByText('Self-evaluation in progress')).toHaveLength(3)
    expect(screen.getAllByText('Self-evaluation not started')).toHaveLength(3)
  })

it('the pie toolbar has no Search and its filters drive the pie, never the table', async () => {
  fetchReviewBoardMock.mockImplementation((query: { businessPartner?: string }) =>
    Promise.resolve({
      ok: true as const,
      board: query.businessPartner !== undefined ? PIE_SEARCHED : PAGE_ONE,
    }),
  )

  render(page())
  const user = userEvent.setup()
  await screen.findByRole('table')

  const pieCard = (
    screen.getByRole('img', { name: 'Review completion split by status' }).closest('.card') ?? null
  ) as HTMLElement

  await user.click(within(pieCard).getByRole('button', { name: /Search, filter and sort/ }))

  const pieDialog = within(pieCard).getByRole('dialog', { name: 'Search, filter and sort' })

  expect(
    within(pieDialog).queryByRole('searchbox', {
      name: 'Search by employee name or designation',
    }),
  ).not.toBeInTheDocument()

  await user.selectOptions(
    within(pieDialog).getByRole('combobox', { name: 'Filter by Business partner' }),
    'John D',
  )

  await waitFor(() => {
    expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({
      page: 1,
      status: 'all',
      businessPartner: 'John D',
    })
  })

  // The tiles reflect the pie query's filtered distribution.
  const tiles = [...document.querySelectorAll('.tile')].map((tile) => tile.textContent)
  expect(tiles.some((text) => text?.includes('25.0% of employees'))).toBe(false)
  expect(tiles.filter((text) => text?.includes('50.0% of employees')).length).toBeGreaterThanOrEqual(2)

  // The table remains untouched.
  expect(screen.getByText('Bilal Khan')).toBeInTheDocument()
  expect(screen.getByText('Employees · 8 of 8')).toBeInTheDocument()
})

  it('the pie toolbar filters by business partner, the table never hears it', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    const pieCard = screen
      .getByRole('img', { name: 'Review completion split by status' })
      .closest('.card') as HTMLElement
    await user.click(within(pieCard).getByRole('button', { name: /Search, filter and sort/ }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by Business partner' }), 'John D')

    // The pie scope's own word rides out; the table read is untouched
    // (its call stays the default composed query).
    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({
        page: 1,
        status: 'all',
        businessPartner: 'John D',
      })
    })
    expect(screen.getByText('Bilal Khan')).toBeInTheDocument()
  })

it('the pie card veils its stale numbers while a filtered read is in flight', async () => {
  fetchReviewBoardMock.mockImplementation((query: { businessPartner?: string }) =>
    query.businessPartner === undefined
      ? Promise.resolve({ ok: true as const, board: PAGE_ONE })
      : new Promise(() => undefined),
  )

  render(page())
  const user = userEvent.setup()
  await screen.findByRole('table')

  const pieCard = screen
    .getByRole('img', { name: 'Review completion split by status' })
    .closest('.card') as HTMLElement

  await user.click(within(pieCard).getByRole('button', { name: /Search, filter and sort/ }))

  await user.selectOptions(
    within(pieCard).getByRole('combobox', { name: 'Filter by Business partner' }),
    'John D',
  )

  expect(
    await within(pieCard).findByRole('status', { name: 'Loading the status split' }),
  ).toBeInTheDocument()

  expect(pieCard.querySelector('.pie-card__body')?.getAttribute('aria-busy')).toBe('true')
  expect(document.querySelector('.tiles--dimmed')).not.toBeNull()
})

  it('the table veils its rows while its own filtered read is in flight', async () => {
    fetchReviewBoardMock.mockImplementation((query: { status?: string }) =>
      query.status === undefined || query.status === 'all'
        ? Promise.resolve({ ok: true as const, board: PAGE_ONE })
        : new Promise(() => undefined),
    )
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Filter by Evaluation status' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Filter by Evaluation status' })).getByRole('button', {
        name: 'In manager review',
      }),
    )

    const tableCard = screen.getByRole('table').closest('.card') as HTMLElement
    expect(await within(tableCard).findByRole('status', { name: 'Loading the employee list' })).toBeInTheDocument()
    expect(tableCard.querySelector('.table-region')?.getAttribute('aria-busy')).toBe('true')
  })

  it('pager walks server pages and Query changes land back on page one', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    fetchReviewBoardMock.mockResolvedValue({ ok: true, board: PAGE_TWO })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({ page: 2, status: 'all' })
    expect(await screen.findByText('Cara Fernandes')).toBeInTheDocument()

    // The status filter hangs off the Evaluation status column's funnel: picking
    // one lifecycle word rides it, and the query change hands the read back
    // to page one.
    fetchReviewBoardMock.mockResolvedValue({ ok: true, board: { ...PAGE_ONE, page: 1, reviews: PAGE_ONE.reviews, total: 2 } })
    await user.click(screen.getByRole('button', { name: 'Filter by Evaluation status' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Filter by Evaluation status' })).getByRole('button', {
        name: 'Self-evaluation in progress',
      }),
    )
    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({
        page: 1,
        status: 'self_evaluation_in_progress',
      })
    })
    expect(await screen.findByText('Asha Menon')).toBeInTheDocument()
  })

  it('click-to-sort headers toggle the wire order on the board call', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Sort by Reporting manager' }))
    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({
        page: 1,
        status: 'all',
        sortBy: 'reportingManager',
        sortOrder: 'asc',
      })
    })

    // The same header's second click reverses the direction.
    await user.click(screen.getByRole('button', { name: 'Sort by Reporting manager' }))
    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({
        page: 1,
        status: 'all',
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
        status: 'all',
        sortBy: 'employeeName',
        sortOrder: 'asc',
      })
    })
    await user.click(screen.getByRole('button', { name: 'Sort by Name' }))
    await waitFor(() => {
      expect(nameHeader).toHaveAttribute('aria-sort', 'descending')
    })
  })

  it('the Evaluation status funnel offers the exact not-started stage', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Filter by Evaluation status' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Filter by Evaluation status' })).getByRole('button', { name: 'Self-evaluation not started' }),
    )

    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({ page: 1, status: 'not_started' })
    })
  })

  it('the Evaluation status funnel narrows to a manager-phase word too', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Filter by Evaluation status' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Filter by Evaluation status' })).getByRole('button', {
        name: 'In manager review',
      }),
    )

    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({ page: 1, status: 'in_manager_review' })
    })
  })

  it('only the Evaluation status column carries a filter funnel', async () => {
    render(page())
    await screen.findByRole('table')

    expect(screen.getByRole('button', { name: 'Filter by Evaluation status' })).toBeInTheDocument()
    const funnels = screen.getAllByRole('button', { name: /^Filter by / })
    expect(funnels).toHaveLength(1)
  })

  it('every column sorts except Email and Evaluation status', async () => {
    render(page())
    await screen.findByRole('table')

    for (const header of [
      'Name',
      'Submitted date',
      'Reporting manager',
      'Location',
      'Org',
      'Employee ID',
      'Designation',
      'Business unit',
      'Current account / project',
      'Delivery head',
      'Delivery manager',
      'Business partner',
      'Status',
      'Date of joining',
    ]) {
      expect(screen.getByRole('button', { name: `Sort by ${header}` })).toBeInTheDocument()
    }
    for (const header of ['Email', 'Evaluation status']) {
      expect(screen.queryByRole('button', { name: `Sort by ${header}` })).not.toBeInTheDocument()
    }
  })

  it('keeps the board columns first, then the rest of the upload CSV fields in its order', async () => {
    render(page())
    await screen.findByRole('table')

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual([
      'Name',
      'Email',
      'Evaluation status',
      'Submitted date',
      'Reporting manager',
      'Location',
      'Org',
      'Employee ID',
      'Designation',
      'Business unit',
      'Current account / project',
      'Delivery head',
      'Delivery manager',
      'Business partner',
      'Status',
      'Date of joining',
    ])
  })

  it('sorting by Date of joining sends the joiningDate sort word', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Sort by Date of joining' }))
    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: 'joiningDate', sortOrder: 'asc' }),
      )
    })
  })

  it('sorting by Submitted date sends the submittedAt sort word', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Sort by Submitted date' }))
    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: 'submittedAt', sortOrder: 'asc' }),
      )
    })
  })

  it('the table toolbar search and the Evaluation status funnel compose into the table call', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    const tableCard = screen.getByRole('table').closest('.card') as HTMLElement
    await user.click(within(tableCard).getByRole('button', { name: 'Filter by Evaluation status' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Filter by Evaluation status' })).getByRole('button', {
        name: 'Self-evaluation not started',
      }),
    )

    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({ page: 1, status: 'not_started' })
    })

    // Search lives in the table card's toolbar pop-up; the status word came
    // from the column funnel — the one table call composes both.
    await user.click(within(tableCard).getByRole('button', { name: /Search, filter and sort/ }))
    await user.type(screen.getByRole('searchbox', { name: 'Search by employee name or designation' }), 'ash')
    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({ page: 1, status: 'not_started', search: 'ash' })
    })
  })

  it('narrows the table by business unit', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    const tableCard = screen.getByRole('table').closest('.card') as HTMLElement
    await user.click(within(tableCard).getByRole('button', { name: /Search, filter and sort/ }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by Business unit' }), 'Payer Digital')

    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({ page: 1, status: 'all', businessUnit: 'Payer Digital' })
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

  it('the status export saves the chosen format under a filter-named file', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    await chooseTableBusinessUnit(user)
    await waitFor(() => {
      expect(fetchReviewBoardMock).toHaveBeenLastCalledWith({ page: 1, status: 'all', businessUnit: 'Payer Digital' })
    })

    await user.click(screen.getByRole('button', { name: 'Download status' }))
    await user.click(screen.getByRole('menuitem', { name: 'CSV (.csv)' }))
    await waitFor(() => {
      expect(fetchReviewStatusCsvExportMock).toHaveBeenLastCalledWith({
        page: 1,
        status: 'all',
        businessUnit: 'Payer Digital',
      })
    })
    expect(saveCsvBlobMock).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.stringMatching(/^review-status_business-unit-payer-digital_\d{4}-\d{2}-\d{2}\.csv$/),
    )

    saveCsvBlobMock.mockClear()
    fetchReviewStatusCsvExportMock.mockClear()
    fetchReviewStatusCsvExportMock.mockResolvedValue({
      ok: false,
      detail: 'The export endpoint is unavailable.',
      code: 'network_error',
    })
    await user.click(screen.getByRole('button', { name: 'Download status' }))
    await user.click(screen.getByRole('menuitem', { name: 'PDF (.pdf)' }))
    expect(await screen.findByRole('status')).toHaveTextContent('The export endpoint is unavailable.')
    expect(saveCsvBlobMock).not.toHaveBeenCalled()
  })

  it('announces the matched completed count and streams the ZIP on click', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    const button = await screen.findByRole('button', { name: 'Download submitted reviews (2)' })
    await user.click(button)

    await waitFor(() => {
      expect(downloadCompletedReviewZipMock).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, status: 'all' }),
      )
    })
  })

  it('the completed-count read follows the composed table filters, not the status word', async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    expect(fetchCompletedCountMock).toHaveBeenCalledWith({ page: 1, status: 'all' })

    await chooseTableBusinessUnit(user)

    await waitFor(() => {
      expect(fetchCompletedCountMock).toHaveBeenLastCalledWith({
        page: 1,
        status: 'all',
        businessUnit: 'Payer Digital',
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
    await chooseTableBusinessUnit(user)
    const armed = await screen.findByRole('button', { name: 'Download submitted reviews (3)' })

    downloadCompletedReviewZipMock.mockResolvedValue({ ok: false, detail: 'The ZIP failed.', code: 'request_failed' })
    await user.click(armed)

    expect(await screen.findByRole('status')).toHaveTextContent('The ZIP failed.')
  })

  it("a past-submission row's card carries Download review, an open row's does not", async () => {
    render(page())
    const user = userEvent.setup()
    await screen.findByRole('table')

    // Hours the board's own pill decides: an open (self_evaluation_in_progress)
    // row hides the button, and so does the never-opened one.
    await user.click(screen.getByText('Bilal Khan'))
    await screen.findByRole('dialog', { name: 'More about Bilal Khan' })
    expect(screen.queryByRole('button', { name: 'Download review' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))

    // PAGE_ONE holds no finished row... but the board serves one once the
    // funnel narrows to the self-evaluation-completed stage.
    fetchReviewBoardMock.mockResolvedValue({
      ok: true,
      board: {
        ...PAGE_ONE,
        page: 1,
        total: 1,
        reviews: PAGE_TWO.reviews.slice(0, 1),
      },
    })
    await user.click(screen.getByRole('button', { name: 'Filter by Evaluation status' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Filter by Evaluation status' })).getByRole('button', {
        name: 'Self-evaluation completed',
      }),
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
