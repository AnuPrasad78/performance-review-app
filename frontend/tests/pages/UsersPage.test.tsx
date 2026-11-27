import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { AuthProvider } from '../../src/state/AuthContext'
import { UsersPage } from '../../src/pages/UsersPage'
import type { Employee, RosterFacets, SelfEvaluationWire } from '../../src/lib/types'

const {
  fetchEmployeesMock,
  fetchEmployeeFacetsMock,
  fetchRosterCsvExportMock,
  fetchEmployeeFormStatusMock,
  fetchEmployeeEvaluationMock,
  patchEmployeeMock,
  saveCsvBlobMock,
  saveReviewPdfMock,
} = vi.hoisted(() => ({
  fetchEmployeesMock: vi.fn(),
  fetchEmployeeFacetsMock: vi.fn(),
  fetchRosterCsvExportMock: vi.fn(),
  fetchEmployeeFormStatusMock: vi.fn(),
  fetchEmployeeEvaluationMock: vi.fn(),
  patchEmployeeMock: vi.fn(),
  saveCsvBlobMock: vi.fn(),
  saveReviewPdfMock: vi.fn(),
}))
vi.mock('../../src/lib/api', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchEmployees: fetchEmployeesMock,
  fetchEmployeeFacets: fetchEmployeeFacetsMock,
  fetchRosterCsvExport: fetchRosterCsvExportMock,
  fetchEmployeeFormStatus: fetchEmployeeFormStatusMock,
  fetchEmployeeEvaluation: fetchEmployeeEvaluationMock,
  patchEmployee: patchEmployeeMock,
  setApiIdentity: vi.fn(),
}))
vi.mock('../../src/lib/csvDownload', () => ({
  saveCsvBlob: saveCsvBlobMock,
}))
vi.mock('../../src/lib/reviewDownloads', () => ({
  saveReviewPdf: saveReviewPdfMock,
}))

function employee(employeeId: string, name: string, email: string): Employee {
  return {
    employeeId,
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
  }
}

const ASHA = employee('EMP-V001', 'Asha Menon', 'asha_menon@emids.com')
const BILAL = employee('EMP-V002', 'Bilal Khan', 'bilal.khan@emids.com')

const FACETS: RosterFacets = {
  designations: ['Engineer', 'Product Manager'],
  locations: ['India', 'Singapore'],
  orgs: ['Delivery', 'Quality'],
  businessUnits: ['Payer Digital', 'Provider Solutions'],
  businessPartners: ['John D'],
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

/** The wire document one employee's download reads (the backend /evaluations
    record the profile card's PDF is built from). */
function wireEvaluation(employee: Employee): SelfEvaluationWire {
  return {
    employee,
    reviewYear: 2026,
    submissionDeadline: '2027-01-15T10:00:00+00:00',
    deadlinePassed: false,
    submittedAt: '2026-11-01',
    employeeSignedAt: '2026-11-01',
    responses: {
      contribution: 'Led the intake rewrite.',
      strengths: 'Data modelling.',
      development: 'Stakeholder reviews.',
      support: 'Mentoring.',
    },
    managerComments: { contribution: '', strengths: '', development: '', support: '' },
    overallRating: 4,
    overallSummary: 'A steady year.',
    forwardCommitments: [],
    commitmentsEditable: false,
  lastSavedAt: '2026-11-24T16:05:00Z',
  }
}

beforeEach(() => {
  window.localStorage.clear()
  fetchEmployeesMock.mockReset()
  fetchEmployeeFacetsMock.mockReset()
  fetchRosterCsvExportMock.mockReset()
  saveCsvBlobMock.mockReset()
  fetchEmployeeFormStatusMock.mockReset()
  fetchEmployeeEvaluationMock.mockReset()
  patchEmployeeMock.mockReset()
  saveReviewPdfMock.mockReset()
  fetchEmployeeFacetsMock.mockResolvedValue({ ok: true, facets: FACETS })
  // The default card probe: a pending review answers 200 — the Download
  // review button stays hidden unless the test opts into a completed one.
  fetchEmployeeFormStatusMock.mockResolvedValue({ ok: true, formStatus: 'pending' })
})

/** Opens the export menu and picks one format — the download only starts
    once a format is chosen. */
async function exportAs(user: ReturnType<typeof userEvent.setup>, format: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Employee Master Data View' }))
  await user.click(screen.getByRole('menuitem', { name: format }))
}

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

  it('sort choices ride the column headers onto the wire', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    // First click of a new column starts ascending…
    await user.click(screen.getByRole('button', { name: 'Sort by Email' }))
    await waitFor(() => {
      expect(fetchEmployeesMock).toHaveBeenLastCalledWith({ page: 1, sortBy: 'email', sortOrder: 'asc' })
    })

    // …and the same header's second click reverses it.
    await user.click(screen.getByRole('button', { name: 'Sort by Email' }))
    await waitFor(() => {
      expect(fetchEmployeesMock).toHaveBeenLastCalledWith({ page: 1, sortBy: 'email', sortOrder: 'desc' })
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

  it('filters by the lifecycle status word the review board uses', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await openQueryControls(user)
    // The form-status options are the six stored lifecycle words now — the
    // word travels verbatim, no bucket noun in between.
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by Form status' }),
      'self_evaluation_completed',
    )

    expect(fetchEmployeesMock).toHaveBeenLastCalledWith({ page: 1, status: 'self_evaluation_completed' })

    // Choosing All resets the read to the filterless query; the word drops
    // from the encoded wire in the api layer, like the board's does.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by Form status' }), 'all')

    expect(fetchEmployeesMock).toHaveBeenLastCalledWith({ page: 1, status: 'all' })
  })

  it('filters by location from the facet list', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await openQueryControls(user)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by Location' }), 'Singapore')

    expect(fetchEmployeesMock).toHaveBeenLastCalledWith({ page: 1, location: 'Singapore' })
  })

  it('shows the business unit column in place of location', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    render(page())
    await screen.findByText('Roster · 1 employee')

    expect(screen.getByRole('columnheader', { name: /Business unit/ })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /^Location/ })).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Payer Digital' })).toBeInTheDocument()
  })

  it('the Business unit column funnel narrows the roster without the pop-up', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await user.click(screen.getByRole('button', { name: 'Filter by Business unit' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Filter by Business unit' })).getByRole('button', {
        name: 'Provider Solutions',
      }),
    )

    expect(fetchEmployeesMock).toHaveBeenLastCalledWith({ page: 1, businessUnit: 'Provider Solutions' })
  })

  it('the Status column funnel narrows by the employment word', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await user.click(screen.getByRole('button', { name: 'Filter by Status' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Filter by Status' })).getByRole('button', { name: 'Active' }),
    )

    expect(fetchEmployeesMock).toHaveBeenLastCalledWith({ page: 1, employmentStatus: 'Active' })
  })

  it('downloads the server CSV of every matched employee, not the page slice', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 42, 1))
    fetchRosterCsvExportMock.mockResolvedValue({ ok: true, blob: new Blob(['csv']) })
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await exportAs(user, 'CSV (.csv)')

    await waitFor(() => {
      expect(fetchRosterCsvExportMock).toHaveBeenCalledWith({ page: 1 })
      expect(saveCsvBlobMock).toHaveBeenCalledWith(
        new Blob(['csv']),
        expect.stringMatching(/^employee-master-data_all-employees_\d{4}-\d{2}-\d{2}\.csv$/),
      )
    })
  })

  it('downloads with the composed search and filters in force', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    fetchRosterCsvExportMock.mockResolvedValue({ ok: true, blob: new Blob(['csv']) })
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await openQueryControls(user)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by Org' }), 'Quality')
    await user.type(screen.getByRole('searchbox', { name: 'Search by employee name or designation' }), 'ash')
    // Let the search's debounce land before the export reads the query.
    await waitFor(() => {
      expect(fetchEmployeesMock).toHaveBeenLastCalledWith({ page: 1, org: 'Quality', search: 'ash' })
    })

    await exportAs(user, 'Excel (.xlsx)')

    await waitFor(() => {
      expect(fetchRosterCsvExportMock).toHaveBeenLastCalledWith({ page: 1, org: 'Quality', search: 'ash' })
      // The file name carries the filters in force; the blob is a workbook.
      expect(saveCsvBlobMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        expect.stringMatching(/^employee-master-data_search-ash_org-quality_\d{4}-\d{2}-\d{2}\.xlsx$/),
      )
    })
  })

  it('surfaces a failed export as a toast', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    fetchRosterCsvExportMock.mockResolvedValue({
      ok: false,
      detail: 'The roster export failed.',
      code: 'request_failed',
    })
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await exportAs(user, 'PDF (.pdf)')

    expect(await screen.findByRole('status')).toHaveTextContent('The roster export failed.')
    expect(saveCsvBlobMock).not.toHaveBeenCalled()
  })

  it('the export menu offers CSV, Excel and PDF under the filters note', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    const trigger = screen.getByRole('button', { name: 'Employee Master Data View' })
    expect(trigger).toHaveAccessibleDescription(
      'Downloads include only the employees matching the search and filters currently applied.',
    )
    await user.click(trigger)
    const menu = screen.getByRole('menu', { name: 'Employee Master Data View formats' })
    expect(within(menu).getByText(/matching the search and filters currently applied/)).toBeInTheDocument()
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'CSV (.csv)',
      'Excel (.xlsx)',
      'PDF (.pdf)',
    ])
    expect(fetchRosterCsvExportMock).not.toHaveBeenCalled()
  })

  it('the toolbar carries the export menu alone — no bulk review trigger', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    render(page())

    expect(await screen.findByText('Roster · 1 employee')).toBeInTheDocument()
    // The completed-reviews trigger lives on the review board alone.
    expect(screen.queryByRole('button', { name: /Download submitted reviews/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Employee Master Data View' })).toBeInTheDocument()
  })

  it("shows Download review on a completed employee's card and saves one PDF on click", async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    fetchEmployeeFormStatusMock.mockResolvedValue({ ok: true, formStatus: 'completed' })
    fetchEmployeeEvaluationMock.mockResolvedValue({ ok: true, data: wireEvaluation(ASHA) })
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await user.click(screen.getByText('asha_menon@emids.com'))
    const dialog = screen.getByRole('dialog', { name: 'More about Asha Menon' })
    const button = await within(dialog).findByRole('button', { name: 'Download review' })
    await user.click(button)

    await waitFor(() => {
      expect(saveReviewPdfMock).toHaveBeenCalledWith(
        expect.objectContaining({ reviewYear: 2026 }),
      )
    })
    expect(fetchEmployeeEvaluationMock).toHaveBeenCalledWith('EMP-V001')
  })

  it('hides Download review while the review is still in the employee hands', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    fetchEmployeeFormStatusMock.mockResolvedValue({ ok: true, formStatus: 'pending' })
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await user.click(screen.getByText('asha_menon@emids.com'))
    const dialog = await screen.findByRole('dialog', { name: 'More about Asha Menon' })

    expect(
      within(dialog).queryByRole('button', { name: 'Download review' }),
    ).not.toBeInTheDocument()
  })

  it('the card states no Form status — the pop-up holds the roster record alone', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    fetchEmployeeFormStatusMock.mockResolvedValue({
      ok: false,
      detail: 'Could not reach the review API.',
      code: 'network_error',
    })
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await user.click(screen.getByText('asha_menon@emids.com'))
    const dialog = await screen.findByRole('dialog', { name: 'More about Asha Menon' })

    // The review nouns live on the review board's card; the roster popup
    // keeps the Download review driver (the probe completes or the button
    // would never show) without printing the status itself.
    expect(within(dialog).queryByText('Form status')).not.toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: 'Download review' }),
    ).not.toBeInTheDocument()
  })

  it('deactivating asks first and the confirmed flip patches the row', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    patchEmployeeMock.mockResolvedValue({
      ok: true,
      employee: { ...ASHA, status: 'Inactive' },
    })
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await user.click(
      within(screen.getByRole('row', { name: /Asha Menon/ })).getByRole('button', { name: 'Deactivate Asha Menon' }),
    )

    // The confirm popup holds the patch — nothing moves until the answer.
    const popup = await screen.findByRole('dialog', { name: 'Deactivate Asha Menon' })
    expect(screen.getByText('Are you sure you want to deactivate the user?')).toBeInTheDocument()
    expect(patchEmployeeMock).not.toHaveBeenCalled()

    await user.click(within(popup).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => {
      expect(patchEmployeeMock).toHaveBeenCalledWith('EMP-V001', { status: 'Inactive' })
      // The re-read keeps the same query — the page never moves.
      expect(fetchEmployeesMock).toHaveBeenLastCalledWith({ page: 1 })
    })
    // The flip's confirms stay clear of the row's card open.
    expect(screen.queryByRole('dialog', { name: 'More about Asha Menon' })).not.toBeInTheDocument()
  })

  it('a failed status flip surfaces as a toast and skips the re-read', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    patchEmployeeMock.mockResolvedValue({
      ok: false,
      detail: 'Could not reach the review API.',
      code: 'network_error',
    })
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await user.click(
      within(screen.getByRole('row', { name: /Asha Menon/ })).getByRole('button', { name: 'Deactivate Asha Menon' }),
    )
    const popup = await screen.findByRole('dialog', { name: 'Deactivate Asha Menon' })
    await user.click(within(popup).getByRole('button', { name: 'Deactivate' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Could not reach the review API.',
    )
    expect(fetchEmployeesMock).toHaveBeenCalledTimes(1)
  })

  it('the card carries an Edit form and the save patches the changed fields only', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    patchEmployeeMock.mockResolvedValue({
      ok: true,
      employee: { ...ASHA, designation: 'Senior Engineer' },
    })
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await user.click(screen.getByText('asha_menon@emids.com'))
    const dialog = await screen.findByRole('dialog', { name: 'More about Asha Menon' })

    await user.click(within(dialog).getByRole('button', { name: 'Edit' }))
    expect(within(dialog).getByText('More about')).toBeInTheDocument()

    await user.clear(within(dialog).getByLabelText('Designation'))
    await user.type(within(dialog).getByLabelText('Designation'), 'Senior Engineer')

    const save = within(dialog).getByRole('button', { name: 'Save' })
    await user.click(save)

    await waitFor(() => {
      expect(patchEmployeeMock).toHaveBeenCalledWith('EMP-V001', {
        designation: 'Senior Engineer',
      })
      // The edit folds away and the roster re-reads its page.
      expect(within(dialog).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
      expect(fetchEmployeesMock).toHaveBeenLastCalledWith({ page: 1 })
    })
  })

  it('a failed save says so through the toast and keeps the edit form open', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    patchEmployeeMock.mockResolvedValue({
      ok: false,
      detail: 'That email already belongs to another employee.',
      code: 'email_taken',
    })
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await user.click(screen.getByText('asha_menon@emids.com'))
    const dialog = await screen.findByRole('dialog', { name: 'More about Asha Menon' })
    await user.click(within(dialog).getByRole('button', { name: 'Edit' }))

    await user.clear(within(dialog).getByLabelText(/Email/))
    await user.type(within(dialog).getByLabelText(/Email/), 'bilal.khan@emids.com')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'That email already belongs to another employee.',
    )
    // No save landed, so the form stays open over the unchanged row.
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(fetchEmployeesMock).toHaveBeenCalledTimes(1)
  })

  it('a save that moved the employee id keeps the card on the row', async () => {
    fetchEmployeesMock.mockResolvedValue(pageResult([ASHA], 1))
    patchEmployeeMock.mockResolvedValue({
      ok: true,
      employee: { ...ASHA, employeeId: 'EMP-V999' },
    })
    render(page())
    const user = userEvent.setup()
    await screen.findByText('Roster · 1 employee')

    await user.click(screen.getByText('asha_menon@emids.com'))
    const dialog = await screen.findByRole('dialog', { name: 'More about Asha Menon' })
    await user.click(within(dialog).getByRole('button', { name: 'Edit' }))

    await user.clear(within(dialog).getByLabelText(/Employee ID/))
    await user.type(within(dialog).getByLabelText(/Employee ID/), 'EMP-V999')

    // On the refresh the roster answers with the row's moved identity.
    fetchEmployeesMock.mockResolvedValue(
      pageResult([{ ...ASHA, employeeId: 'EMP-V999' }], 1),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(patchEmployeeMock).toHaveBeenCalledWith('EMP-V001', { employeeId: 'EMP-V999' })
    })
    await waitFor(() => {
      expect(fetchEmployeesMock).toHaveBeenLastCalledWith({ page: 1 })
    })
    // The selection followed the row: the card is still open, edit closed.
    expect(screen.getByRole('dialog', { name: 'More about Asha Menon' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })
})
