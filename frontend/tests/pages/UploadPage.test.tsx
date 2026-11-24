import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, beforeEach } from 'vitest'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { AuthProvider } from '../../src/state/AuthContext'
import { UploadPage } from '../../src/pages/UploadPage'
import { applyRosterImport, importRosterCsv } from '../../src/lib/api'
import type { Employee, RosterConflict, RosterImportResult } from '../../src/lib/types'

const { applyRosterImportMock, fetchEmployeesMock, importRosterCsvMock } = vi.hoisted(() => ({
  applyRosterImportMock: vi.fn(),
  fetchEmployeesMock: vi.fn(),
  importRosterCsvMock: vi.fn(),
}))
vi.mock('../../src/lib/api', () => ({
  applyRosterImport: applyRosterImportMock,
  fetchEmployees: fetchEmployeesMock,
  importRosterCsv: importRosterCsvMock,
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

const PRIYA = employee('EMP-V900', 'Priya Raj', 'priya.raj@emids.com')
const ASHA = employee('EMP-V001', 'Asha Menon', 'asha_menon@emids.com')

function importResult(rec: Omit<Extract<RosterImportResult, { ok: true }>['report'], 'conflicts'> & {
  conflicts?: RosterConflict[]
}): RosterImportResult {
  return { ok: true, report: { conflicts: rec.conflicts ?? [], ...rec } }
}

const IMPORTS_ALL_NEW = importResult({
  importedCount: 1,
  duplicatesSkipped: 0,
  employees: [PRIYA],
})

const ASHA_INCOMING = employee('EMP-V001', 'Asha Menon', 'asha.new@emids.com')
const IMPORTS_ONE_CONFLICT = importResult({
  importedCount: 1,
  duplicatesSkipped: 0,
  employees: [ASHA],
  conflicts: [
    {
      employeeId: ASHA.employeeId,
      existing: ASHA,
      incoming: ASHA_INCOMING,
      changedFields: [],
    },
  ],
})

const UPLOAD_RESULT_BAD_HEADER: RosterImportResult = {
  ok: false,
  detail: 'The header row must list: Employee Name, Employee ID, Email.',
  code: 'roster_header_invalid',
  rowErrors: [],
}

function page(): React.ReactElement {
  return (
    <AdminStoreProvider>
      <AuthProvider>
        <UploadPage />
      </AuthProvider>
    </AdminStoreProvider>
  )
}

async function uploadCsv() {
  const user = userEvent.setup()
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('file input not found')
  await user.upload(input, new File(['Employee Name,Employee ID,Email'], 'roster.csv', { type: 'text/csv' }))
  return user
}

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(importRosterCsv).mockReset()
  vi.mocked(applyRosterImport).mockReset()
  fetchEmployeesMock.mockReset()
  fetchEmployeesMock.mockResolvedValue({ ok: true, employees: [] })
})

describe('UploadPage', () => {
  it('applies a conflict-free import straight away and reads back the stored roster', async () => {
    importRosterCsvMock.mockResolvedValue(IMPORTS_ALL_NEW)
    applyRosterImportMock.mockResolvedValue({ ok: true, importedCount: 1, updatedCount: 0 })
    fetchEmployeesMock.mockResolvedValueOnce({ ok: true, employees: [] }).mockResolvedValueOnce({
      ok: true,
      employees: [PRIYA],
    })
    render(page())

    expect(await screen.findByText('ROSTER NOW · 0 EMPLOYEES')).toBeInTheDocument()
    await uploadCsv()

    expect(await screen.findByRole('status', {}, { timeout: 3000 })).toHaveTextContent(
      'Roster updated: 1 employee added.',
    )
    expect(applyRosterImportMock).toHaveBeenCalledWith({ inserts: [PRIYA], updates: [] })
    expect(await screen.findByText('ROSTER NOW · 1 EMPLOYEE')).toBeInTheDocument()
  })

  it('pops every validation error in a dialog and changes nothing', async () => {
    importRosterCsvMock.mockResolvedValue(UPLOAD_RESULT_BAD_HEADER)
    render(page())
    await uploadCsv()

    const dialog = await screen.findByRole('dialog', { name: 'Import failed' }, { timeout: 3000 })
    expect(dialog).toHaveTextContent('The header row must list')
    expect(fetchEmployeesMock).toHaveBeenCalledTimes(1)
    expect(applyRosterImportMock).not.toHaveBeenCalled()
  })

  it('previews collided rows and applies only the decided updates', async () => {
    importRosterCsvMock.mockResolvedValue(IMPORTS_ONE_CONFLICT)
    applyRosterImportMock.mockResolvedValue({ ok: true, importedCount: 1, updatedCount: 1 })
    render(page())
    const user = await uploadCsv()

    const dialog = await screen.findByRole('dialog', { name: 'Employees already exist' })
    expect(dialog).toHaveTextContent('1 new employee will be added')
    expect(dialog).toHaveTextContent('1 employee already exists')

    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    // Keep is the default decision, so nothing was sent for update.
    expect(applyRosterImportMock).toHaveBeenCalledWith({ inserts: [], updates: [] })
  })

  it('sends the update decision only for rows the admin flipped to Update', async () => {
    importRosterCsvMock.mockResolvedValue(IMPORTS_ONE_CONFLICT)
    applyRosterImportMock.mockResolvedValue({ ok: true, importedCount: 0, updatedCount: 1 })
    render(page())
    const user = await uploadCsv()

    await screen.findByRole('dialog', { name: 'Employees already exist' })
    await user.click(screen.getByRole('button', { name: 'Update' }))
    expect(await screen.findByText('0 rows stay, 1 employee is updated.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Apply changes' }))
    await vi.waitFor(() => {
      expect(applyRosterImportMock).toHaveBeenCalledWith({ inserts: [], updates: [ASHA_INCOMING] })
    })
    expect(await screen.findByRole('status', {}, { timeout: 3000 })).toHaveTextContent(
      'Roster updated: 1 employee updated.',
    )
  })

  it('keeps the button disabled with the in-flight label while the import runs', async () => {
    importRosterCsvMock.mockReturnValue(new Promise(() => undefined))
    render(page())
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('file input not found')
    const user = userEvent.setup()
    await user.upload(input, new File(['Employee Name,Employee ID,Email'], 'roster.csv', { type: 'text/csv' }))

    expect(await screen.findByRole('button', { name: 'Loading roster' })).toBeDisabled()
  })
})
