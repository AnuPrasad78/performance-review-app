import type {
  Employee,
  EmployeeListResult,
  RosterApplyResult,
  RosterImportResult,
} from './types'

/** Same-origin /api by default (Vite dev proxy in dev); VITE_API_URL points at
    a direct, absolute API base where the frontend is served separately. */
const API_BASE = import.meta.env.VITE_API_URL !== undefined ? import.meta.env.VITE_API_URL : ''

const UNSUPPORTED_ENV_ERROR = {
  ok: false as const,
  detail: 'The employee data upload is only available where the review API is running.',
  code: 'unsupported_environment',
  rowErrors: [],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Cross-shape boundary: the wire payload is only trusted field by field. */
function employeeFrom(value: unknown): Employee | null {
  if (!isRecord(value)) return null
  if (typeof value.employeeId !== 'string' || typeof value.name !== 'string') return null
  if (typeof value.email !== 'string') return null
  const stringField = (key: string): string =>
    typeof value[key] === 'string' ? (value[key] as string) : ''
  return {
    employeeId: value.employeeId,
    name: value.name,
    email: value.email.toLowerCase(),
    designation: stringField('designation'),
    location: stringField('location'),
    org: stringField('org'),
    project: stringField('project'),
    deliveryHead: stringField('deliveryHead'),
    deliveryManager: stringField('deliveryManager'),
    businessPartner: stringField('businessPartner'),
    reportingManager: stringField('reportingManager'),
    status: value.status === 'Inactive' ? 'Inactive' : 'Active',
  }
}

function employeesFrom(list: unknown): Employee[] {
  return (Array.isArray(list) ? list : [])
    .map((value) => employeeFrom(value))
    .filter((employee): employee is Employee => employee !== null)
}

async function envelopeOf(response: Response): Promise<Record<string, unknown> | null> {
  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    return null
  }
  return isRecord(parsed) ? parsed : null
}

function envelopeFields(parsed: Record<string, unknown>): { detail: string; code: string } {
  return {
    detail: typeof parsed.detail === 'string' ? parsed.detail : 'Request failed.',
    code: typeof parsed.code === 'string' ? parsed.code : 'request_failed',
  }
}

/** The wire form of the roster contract — camelCase keys of POST/apply bodies. */
function employeeToWire(employee: Employee): Record<string, string> {
  return {
    employeeId: employee.employeeId,
    name: employee.name,
    email: employee.email,
    designation: employee.designation,
    location: employee.location,
    org: employee.org,
    project: employee.project,
    deliveryHead: employee.deliveryHead,
    deliveryManager: employee.deliveryManager,
    businessPartner: employee.businessPartner,
    reportingManager: employee.reportingManager,
    status: employee.status,
  }
}

/** Diff-then-decide upload: reports new rows and per-row conflicts; nothing is
    written until the admin confirms through applyRosterImport. */
export async function importRosterCsv(file: File): Promise<RosterImportResult> {
  const body = new FormData()
  body.append('file', file, file.name)
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/employees/import`, { method: 'POST', body })
  } catch {
    return {
      ok: false,
      detail: 'Could not reach the review API. Check that the backend is running.',
      code: 'network_error',
      rowErrors: [],
    }
  }
  const parsed = await envelopeOf(response)
  if (parsed === null) return UNSUPPORTED_ENV_ERROR

  if (!response.ok) {
    const rowErrors = Array.isArray(parsed.errors) ? parsed.errors : []
    return {
      ok: false,
      ...envelopeFields(parsed),
      rowErrors: rowErrors.flatMap((error: unknown) =>
        isRecord(error) && typeof error.line === 'number' && typeof error.message === 'string'
          ? [{ line: error.line, message: error.message }]
          : [],
      ),
    }
  }

  if (typeof parsed.importedCount !== 'number' || !Array.isArray(parsed.conflicts)) {
    return UNSUPPORTED_ENV_ERROR
  }
  return {
    ok: true,
    report: {
      importedCount: parsed.importedCount,
      duplicatesSkipped: typeof parsed.duplicatesSkipped === 'number' ? parsed.duplicatesSkipped : 0,
      employees: employeesFrom(parsed.employees),
      conflicts: parsed.conflicts.flatMap((conflict: unknown) => {
        if (!isRecord(conflict)) return []
        const existing = employeeFrom(conflict.existing)
        const incoming = employeeFrom(conflict.incoming)
        if (existing === null || incoming === null) return []
        return [
          {
            employeeId: incoming.employeeId,
            existing,
            incoming,
            changedFields: (Array.isArray(conflict.changedFields)
              ? conflict.changedFields
              : []
            ).filter((field): field is string => typeof field === 'string'),
          },
        ]
      }),
    },
  }
}

export async function applyRosterImport(payload: {
  inserts: Employee[]
  updates: Employee[]
}): Promise<RosterApplyResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/employees/import/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inserts: payload.inserts.map(employeeToWire),
        updates: payload.updates.map(employeeToWire),
      }),
    })
  } catch {
    return {
      ok: false,
      detail: 'Could not reach the review API. Check that the backend is running.',
      code: 'network_error',
    }
  }
  const parsed = await envelopeOf(response)
  if (parsed === null) {
    return { ok: false, ...{ detail: UNSUPPORTED_ENV_ERROR.detail, code: 'unsupported_environment' } }
  }
  if (!response.ok) return { ok: false, ...envelopeFields(parsed) }
  if (typeof parsed.importedCount !== 'number' || typeof parsed.updatedCount !== 'number') {
    return { ok: false, ...{ detail: UNSUPPORTED_ENV_ERROR.detail, code: 'unsupported_environment' } }
  }
  return { ok: true, importedCount: parsed.importedCount, updatedCount: parsed.updatedCount }
}

export async function fetchEmployees(): Promise<EmployeeListResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/employees`)
  } catch {
    return {
      ok: false,
      detail: 'Could not reach the review API. Check that the backend is running.',
      code: 'network_error',
    }
  }
  const parsed = await envelopeOf(response)
  if (parsed === null) {
    return {
      ok: false,
      detail: UNSUPPORTED_ENV_ERROR.detail,
      code: 'unsupported_environment',
    }
  }
  if (!response.ok) return { ok: false, ...envelopeFields(parsed) }
  if (!Array.isArray(parsed.employees)) {
    return { ok: false, detail: UNSUPPORTED_ENV_ERROR.detail, code: 'unsupported_environment' }
  }
  return { ok: true, employees: employeesFrom(parsed.employees) }
}
