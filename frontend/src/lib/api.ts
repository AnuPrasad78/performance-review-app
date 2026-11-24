import type {
  Employee,
  EmployeeListResult,
  RosterApplyResult,
  RosterImportResult,
  ReviewStatusResult,
  ReviewStatusWire,
  SelfEvaluationApiResult,
  SelfEvaluationPartial,
  SelfEvaluationWire,
  SessionApiResult,
  SessionWire,
  TopicResponses,
} from './types'

/** Same-origin /api by default (Vite dev proxy in dev); VITE_API_URL points at
    a direct, absolute API base where the frontend is served separately. */
const API_BASE = import.meta.env.VITE_API_URL !== undefined ? import.meta.env.VITE_API_URL : ''

/** Carries the acting user while the backend runs its stub-identity phase.
    Must match the backend's default stub header (app/core/config.py); when
    SSO lands this becomes an automatic session cookie and both sides of the
    seam are edited to match. */
const STUB_IDENTITY_HEADER = 'X-Stub-User'

const UNSUPPORTED_ENV_ERROR = {
  ok: false as const,
  detail: 'The employee data upload is only available where the review API is running.',
  code: 'unsupported_environment',
  rowErrors: [],
}

const REVIEW_UNAVAILABLE = {
  detail: 'Your review is only available where the review API is running.',
  code: 'unsupported_environment',
}

const NETWORK_UNAVAILABLE = {
  detail: 'Could not reach the review API. Check that the backend is running.',
  code: 'network_error',
}

/** Session-scoped identity: set on sign-in / restore, cleared on sign-out. */
let identityEmail: string | null = null

export function setApiIdentity(email: string | null): void {
  identityEmail = email
}

function identityHeaders(): Record<string, string> {
  return identityEmail !== null ? { [STUB_IDENTITY_HEADER]: identityEmail } : {}
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

/** Both per-topic maps on the wire hold exactly the form's four topic ids. */
function topicResponsesFrom(value: unknown): TopicResponses | null {
  if (!isRecord(value)) return null
  const answer = (key: string): string =>
    typeof value[key] === 'string' ? (value[key] as string) : ''
  return {
    contribution: answer('contribution'),
    strengths: answer('strengths'),
    development: answer('development'),
    support: answer('support'),
  }
}

function sessionFrom(value: unknown): SessionWire | null {
  if (!isRecord(value)) return null
  if (typeof value.employeeId !== 'string') return null
  if (typeof value.name !== 'string' || typeof value.email !== 'string') return null
  if (value.role !== 'admin' && value.role !== 'employee') return null
  return {
    employeeId: value.employeeId,
    name: value.name,
    email: value.email.toLowerCase(),
    role: value.role,
  }
}

function selfEvaluationFrom(value: unknown): SelfEvaluationWire | null {
  if (!isRecord(value)) return null
  const employee = employeeFrom(value.employee)
  if (employee === null) return null
  const responses = topicResponsesFrom(value.responses)
  const managerComments = topicResponsesFrom(value.managerComments)
  if (responses === null || managerComments === null) return null
  if (typeof value.commitmentsEditable !== 'boolean') return null
  if (typeof value.reviewYear !== 'number' || typeof value.submissionDeadline !== 'string') {
    return null
  }
  if (typeof value.overallSummary !== 'string') return null
  if (!(value.overallRating === null || typeof value.overallRating === 'number')) return null
  if (!(value.submittedAt === null || typeof value.submittedAt === 'string')) return null
  if (!(value.employeeSignedAt === null || typeof value.employeeSignedAt === 'string')) return null
  return {
    employee,
    reviewYear: value.reviewYear,
    submissionDeadline: value.submissionDeadline,
    submittedAt: value.submittedAt,
    employeeSignedAt: value.employeeSignedAt,
    responses,
    managerComments,
    overallRating: value.overallRating,
    overallSummary: value.overallSummary,
    forwardCommitments: (Array.isArray(value.forwardCommitments) ? value.forwardCommitments : [])
      .flatMap((entry: unknown) =>
        isRecord(entry) && typeof entry.commitment === 'string' && typeof entry.support === 'string'
          ? [{ commitment: entry.commitment, support: entry.support }]
          : [],
      ),
    commitmentsEditable: value.commitmentsEditable,
  }
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

/** One parser for every self-evaluation read/write response: the same wire
    schema comes back from GET, PATCH, and POST /submit, so the reviewer
    contract only exists once. */
async function selfEvaluationResponse(response: Response): Promise<SelfEvaluationApiResult> {
  const parsed = await envelopeOf(response)
  if (parsed === null) {
    return { ok: false, detail: REVIEW_UNAVAILABLE.detail, code: REVIEW_UNAVAILABLE.code }
  }
  if (!response.ok) return { ok: false, ...envelopeFields(parsed) }
  const data = selfEvaluationFrom(parsed)
  if (data === null) {
    return { ok: false, detail: REVIEW_UNAVAILABLE.detail, code: REVIEW_UNAVAILABLE.code }
  }
  return { ok: true, data }
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
      detail: NETWORK_UNAVAILABLE.detail,
      code: NETWORK_UNAVAILABLE.code,
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
    return { ok: false, detail: NETWORK_UNAVAILABLE.detail, code: NETWORK_UNAVAILABLE.code }
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

const BOARD_STATUSES = ['not_started', 'in_progress', 'submitted', 'signed_off'] as const

function reviewStatusFrom(value: unknown): ReviewStatusWire | null {
  if (!isRecord(value)) return null
  const employee = employeeFrom(value.employee)
  if (employee === null) return null
  const status = value.status as ReviewStatusWire['status']
  if (!BOARD_STATUSES.includes(status)) return null
  return { employee, status }
}

export async function fetchReviewStatuses(): Promise<ReviewStatusResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/evaluations`, { headers: identityHeaders() })
  } catch {
    return { ok: false, detail: NETWORK_UNAVAILABLE.detail, code: NETWORK_UNAVAILABLE.code }
  }
  const parsed = await envelopeOf(response)
  if (parsed === null) {
    return { ok: false, detail: REVIEW_UNAVAILABLE.detail, code: REVIEW_UNAVAILABLE.code }
  }
  if (!response.ok) return { ok: false, ...envelopeFields(parsed) }
  if (!Array.isArray(parsed.reviews)) {
    return { ok: false, detail: REVIEW_UNAVAILABLE.detail, code: REVIEW_UNAVAILABLE.code }
  }
  const reviews = parsed.reviews.flatMap((entry: unknown) => {
    const review = reviewStatusFrom(entry)
    return review !== null ? [review] : []
  })
  return { ok: true, reviews }
}

export async function fetchEmployees(): Promise<EmployeeListResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/employees`)
  } catch {
    return { ok: false, detail: NETWORK_UNAVAILABLE.detail, code: NETWORK_UNAVAILABLE.code }
  }
  const parsed = await envelopeOf(response)
  if (parsed === null) {
    return { ok: false, detail: UNSUPPORTED_ENV_ERROR.detail, code: 'unsupported_environment' }
  }
  if (!response.ok) return { ok: false, ...envelopeFields(parsed) }
  if (!Array.isArray(parsed.employees)) {
    return { ok: false, detail: UNSUPPORTED_ENV_ERROR.detail, code: 'unsupported_environment' }
  }
  return { ok: true, employees: employeesFrom(parsed.employees) }
}

export async function fetchSession(email: string): Promise<SessionApiResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
  } catch {
    return { ok: false, detail: NETWORK_UNAVAILABLE.detail, code: NETWORK_UNAVAILABLE.code }
  }
  const parsed = await envelopeOf(response)
  if (parsed === null) {
    return { ok: false, detail: REVIEW_UNAVAILABLE.detail, code: REVIEW_UNAVAILABLE.code }
  }
  if (!response.ok) return { ok: false, ...envelopeFields(parsed) }
  const session = sessionFrom(parsed)
  if (session === null) {
    return { ok: false, detail: REVIEW_UNAVAILABLE.detail, code: REVIEW_UNAVAILABLE.code }
  }
  return { ok: true, session }
}

export async function fetchSelfEvaluation(): Promise<SelfEvaluationApiResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/evaluations/me`, { headers: identityHeaders() })
  } catch {
    return { ok: false, detail: NETWORK_UNAVAILABLE.detail, code: NETWORK_UNAVAILABLE.code }
  }
  return selfEvaluationResponse(response)
}

export async function saveSelfEvaluation(
  payload: SelfEvaluationPartial,
): Promise<SelfEvaluationApiResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/evaluations/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...identityHeaders() },
      body: JSON.stringify(payload),
    })
  } catch {
    return { ok: false, detail: NETWORK_UNAVAILABLE.detail, code: NETWORK_UNAVAILABLE.code }
  }
  return selfEvaluationResponse(response)
}

export async function submitSelfEvaluation(): Promise<SelfEvaluationApiResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/evaluations/me/submit`, {
      method: 'POST',
      headers: identityHeaders(),
    })
  } catch {
    return { ok: false, detail: NETWORK_UNAVAILABLE.detail, code: NETWORK_UNAVAILABLE.code }
  }
  return selfEvaluationResponse(response)
}
