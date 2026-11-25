import type {
  CycleSettings,
  CycleSettingsResult,
  Employee,
  EmployeeListResult,
  RosterApplyResult,
  RosterCsvExportResult,
  RosterFacets,
  RosterFacetsResult,
  RosterImportResult,
  RosterQuery,
  RawReviewStatus,
  ReviewBoardPage,
  ReviewBoardQuery,
  ReviewBoardResult,
  ReviewStatusWire,
  SelfEvaluationApiResult,
  SelfEvaluationPartial,
  SelfEvaluationWire,
  SessionApiResult,
  SessionWire,
  TopicResponses,
} from './types'
import { isIsoInstant } from './dates'
import { RAW_TO_DISPLAY } from './reviewStatusStore'

/** Same-origin /api by default (Vite dev proxy in dev); VITE_API_URL points at
    a direct, absolute API base where the frontend is served separately. */
const API_BASE = import.meta.env.VITE_API_URL !== undefined ? import.meta.env.VITE_API_URL : ''

/** Carries the acting user while the backend runs its stub-identity phase.
    Must match the backend's default stub header (app/core/config.py); with
    SSO enabled the server-side session cookie is what the backend reads,
    which 'include' makes the browser send on every call. */
const STUB_IDENTITY_HEADER = 'X-Stub-User'
const CREDENTIALS: RequestCredentials = 'include'

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

const SUPPORT_UNAVAILABLE = {
  detail: 'Cycle settings are only available where the review API is running.',
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
    businessUnit: stringField('businessUnit'),
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
  if (typeof value.deadlinePassed !== 'boolean') return null
  if (typeof value.reviewYear !== 'number' || typeof value.submissionDeadline !== 'string') {
    return null
  }
  if (!isIsoInstant(value.submissionDeadline)) return null
  if (typeof value.overallSummary !== 'string') return null
  if (!(value.overallRating === null || typeof value.overallRating === 'number')) return null
  if (!(value.submittedAt === null || typeof value.submittedAt === 'string')) return null
  if (!(value.employeeSignedAt === null || typeof value.employeeSignedAt === 'string')) return null
  return {
    employee,
    reviewYear: value.reviewYear,
    submissionDeadline: value.submissionDeadline,
    deadlinePassed: value.deadlinePassed,
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
    businessUnit: employee.businessUnit,
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
    response = await fetch(`${API_BASE}/api/employees/import`, { method: 'POST', body, credentials: CREDENTIALS })
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
        if (typeof conflict.email !== 'string') return []
        return [
          {
            email: conflict.email,
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
      credentials: CREDENTIALS,
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

/** The board parse trusts exactly the backend's six wire words — the keys of
    RAW_TO_DISPLAY — and reuses that module's collapse, so the display
    mapping exists once (lib/reviewStatusStore), never re-coded here. */
const BOARD_STATUSES = Object.keys(RAW_TO_DISPLAY) as RawReviewStatus[]

function reviewStatusFrom(value: unknown): ReviewStatusWire | null {
  if (!isRecord(value)) return null
  const employee = employeeFrom(value.employee)
  if (employee === null) return null
  const wireStatus = value.status as RawReviewStatus
  if (!BOARD_STATUSES.includes(wireStatus)) return null
  return { employee, status: RAW_TO_DISPLAY[wireStatus] }
}

/** Wire words the backend treats as defaults — omitting them keeps the query
    string honest about what the admin actually chose. */
const QUERY_OMITTED_WORDS: Record<string, string | undefined> = {
  sortBy: 'employeeName',
  sortOrder: 'asc',
  status: 'all',
}

/** One encoder for both admin tables' composed reads: blank words and the
    backend's default words are dropped, everything else stays camelCase. */
function tableQueryParams(query: object): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== 'string' && typeof value !== 'number') continue
    if (value === '' || QUERY_OMITTED_WORDS[key] === value) continue
    params.set(key, String(value))
  }
  return params.toString()
}

function boardPageFrom(parsed: Record<string, unknown>): ReviewBoardPage | null {
  if (!Array.isArray(parsed.reviews)) return null
  const isCount = (value: unknown): value is number => typeof value === 'number'
  const counts: Partial<Record<RawReviewStatus, number>> = {}
  if (isRecord(parsed.statusCounts)) {
    for (const [key, value] of Object.entries(parsed.statusCounts)) {
      const word = key as RawReviewStatus
      if (BOARD_STATUSES.includes(word) && isCount(value)) counts[word] = value
    }
  }
  const reviews = parsed.reviews.flatMap((entry: unknown) => {
    const review = reviewStatusFrom(entry)
    return review !== null ? [review] : []
  })
  if (!isCount(parsed.total) || !isCount(parsed.page) || !isCount(parsed.pageSize)) return null
  return {
    reviews,
    total: parsed.total,
    page: parsed.page,
    pageSize: parsed.pageSize,
    statusCounts: counts,
  }
}

export async function fetchReviewBoard(query: ReviewBoardQuery): Promise<ReviewBoardResult> {
  let response: Response
  try {
    response = await fetch(
      `${API_BASE}/api/evaluations?${tableQueryParams(query)}`,
      { headers: identityHeaders(), credentials: CREDENTIALS },
    )
  } catch {
    return { ok: false, detail: NETWORK_UNAVAILABLE.detail, code: NETWORK_UNAVAILABLE.code }
  }
  const parsed = await envelopeOf(response)
  if (parsed === null) {
    return { ok: false, detail: REVIEW_UNAVAILABLE.detail, code: REVIEW_UNAVAILABLE.code }
  }
  if (!response.ok) return { ok: false, ...envelopeFields(parsed) }
  const board = boardPageFrom(parsed)
  if (board === null) {
    return { ok: false, detail: REVIEW_UNAVAILABLE.detail, code: REVIEW_UNAVAILABLE.code }
  }
  return { ok: true, board }
}

export async function fetchEmployees(query: RosterQuery & { page: number }): Promise<EmployeeListResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/employees?${tableQueryParams(query)}`, {
      credentials: CREDENTIALS,
    })
  } catch {
    return { ok: false, detail: NETWORK_UNAVAILABLE.detail, code: NETWORK_UNAVAILABLE.code }
  }
  const parsed = await envelopeOf(response)
  if (parsed === null) {
    return { ok: false, detail: UNSUPPORTED_ENV_ERROR.detail, code: 'unsupported_environment' }
  }
  if (!response.ok) return { ok: false, ...envelopeFields(parsed) }
  if (!Array.isArray(parsed.employees) || typeof parsed.total !== 'number' || typeof parsed.page !== 'number' || typeof parsed.pageSize !== 'number') {
    return { ok: false, detail: UNSUPPORTED_ENV_ERROR.detail, code: 'unsupported_environment' }
  }
  return { ok: true, employees: employeesFrom(parsed.employees), total: parsed.total, page: parsed.page, pageSize: parsed.pageSize }
}

export async function fetchRosterCsvExport(
  query: RosterQuery,
): Promise<RosterCsvExportResult> {
  let response: Response
  try {
    // The export covers the whole matched set — the page slice never rides it.
    const { page: _page, ...matched } = query as Record<string, string | number | undefined>
    response = await fetch(
      `${API_BASE}/api/employees/export?${tableQueryParams(matched)}`,
      { headers: identityHeaders() },
    )
  } catch {
    return { ok: false, detail: NETWORK_UNAVAILABLE.detail, code: NETWORK_UNAVAILABLE.code }
  }
  if (!response.ok) {
    const parsed = await envelopeOf(response)
    if (parsed === null) {
      return { ok: false, detail: UNSUPPORTED_ENV_ERROR.detail, code: 'unsupported_environment' }
    }
    return { ok: false, ...envelopeFields(parsed) }
  }
  if (!(response.headers.get('content-type') ?? '').startsWith('application/csv')) {
    return { ok: false, detail: UNSUPPORTED_ENV_ERROR.detail, code: 'unsupported_environment' }
  }
  return { ok: true, blob: await response.blob() }
}

function facetsFrom(parsed: Record<string, unknown>): RosterFacets | null {
  const wordList = (key: string): string[] | null => {
    if (!Array.isArray(parsed[key])) return null
    if (!parsed[key].every((word) => typeof word === 'string')) return null
    return parsed[key] as string[]
  }
  const designations = wordList('designations')
  const locations = wordList('locations')
  const orgs = wordList('orgs')
  const businessUnits = wordList('businessUnits')
  const reportingManagers = wordList('reportingManagers')
  const employmentStatuses = wordList('employmentStatuses')
  if (
    designations === null ||
    locations === null ||
    orgs === null ||
    businessUnits === null ||
    reportingManagers === null ||
    employmentStatuses === null
  ) {
    return null
  }
  return { designations, locations, orgs, businessUnits, reportingManagers, employmentStatuses }
}

export async function fetchEmployeeFacets(): Promise<RosterFacetsResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/employees/facets`, { headers: identityHeaders() })
  } catch {
    return { ok: false, detail: NETWORK_UNAVAILABLE.detail, code: NETWORK_UNAVAILABLE.code }
  }
  const parsed = await envelopeOf(response)
  if (parsed === null) {
    return { ok: false, detail: UNSUPPORTED_ENV_ERROR.detail, code: 'unsupported_environment' }
  }
  if (!response.ok) return { ok: false, ...envelopeFields(parsed) }
  const facets = facetsFrom(parsed)
  if (facets === null) {
    return { ok: false, detail: UNSUPPORTED_ENV_ERROR.detail, code: 'unsupported_environment' }
  }
  return { ok: true, facets }
}

export async function fetchSession(email: string): Promise<SessionApiResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/auth/session`, {
      method: 'POST',
      credentials: CREDENTIALS,
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

/** Identify the holder of the server-side session cookie: what the SPA calls
    on boot to adopt a completed SSO login (backend GET /api/auth/session). */
export async function fetchCookieSession(): Promise<SessionApiResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/auth/session`, { credentials: CREDENTIALS })
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

/** Tell the backend to drop its session cookie (backend POST /api/auth/logout). */
export async function closeServerSession(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: CREDENTIALS,
    })
  } catch {
    // Sign-out succeeds for the local session regardless; the cookie drop is
    // the server's half and is retried on the next sign-in attempt.
  }
}

/** Full-page navigation to the backend's Entra ID hand-off; the SSO callback
    (backend routers/auth.py) eventually bounces the browser back here with
    the session cookie set. */
export function startSsoLogin(): void {
  window.location.assign(`${API_BASE}/api/auth/sso/login`)
}

export async function fetchSelfEvaluation(): Promise<SelfEvaluationApiResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/evaluations/me`, { headers: identityHeaders(), credentials: CREDENTIALS })
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
      credentials: CREDENTIALS,
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
      credentials: CREDENTIALS,
      headers: identityHeaders(),
    })
  } catch {
    return { ok: false, detail: NETWORK_UNAVAILABLE.detail, code: NETWORK_UNAVAILABLE.code }
  }
  return selfEvaluationResponse(response)
}

const CYCLE_DATE_KEYS = [
  'submissionDeadline',
  'managerReviewStart',
  'managerReviewEnd',
  'hrApprovalReleaseBy',
] as const

function cycleSettingsFrom(value: unknown): CycleSettings | null {
  if (!isRecord(value)) return null
  if (typeof value.reviewYear !== 'number') return null
  const dateField = (key: (typeof CYCLE_DATE_KEYS)[number]): string =>
    typeof value[key] === 'string' ? (value[key] as string) : ''
  if (CYCLE_DATE_KEYS.some((key) => dateField(key) === '')) return null
  const submissionDeadline = dateField('submissionDeadline')
  if (!isIsoInstant(submissionDeadline)) return null
  return {
    reviewYear: value.reviewYear,
    submissionDeadline,
    managerReviewStart: dateField('managerReviewStart'),
    managerReviewEnd: dateField('managerReviewEnd'),
    hrApprovalReleaseBy: dateField('hrApprovalReleaseBy'),
  }
}

export async function fetchCycleSettings(): Promise<CycleSettingsResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/cycle-settings`, { headers: identityHeaders(), credentials: CREDENTIALS })
  } catch {
    return { ok: false, detail: NETWORK_UNAVAILABLE.detail, code: NETWORK_UNAVAILABLE.code }
  }
  const parsed = await envelopeOf(response)
  if (parsed === null) {
    return { ok: false, detail: SUPPORT_UNAVAILABLE.detail, code: SUPPORT_UNAVAILABLE.code }
  }
  if (!response.ok) return { ok: false, ...envelopeFields(parsed) }
  const settings = cycleSettingsFrom(parsed)
  if (settings === null) {
    return { ok: false, detail: SUPPORT_UNAVAILABLE.detail, code: SUPPORT_UNAVAILABLE.code }
  }
  return { ok: true, settings }
}

export async function saveCycleSettings(
  settings: CycleSettings,
): Promise<CycleSettingsResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/cycle-settings`, {
      method: 'PUT',
      credentials: CREDENTIALS,
      headers: { 'Content-Type': 'application/json', ...identityHeaders() },
      body: JSON.stringify(settings),
    })
  } catch {
    return { ok: false, detail: NETWORK_UNAVAILABLE.detail, code: NETWORK_UNAVAILABLE.code }
  }
  const parsed = await envelopeOf(response)
  if (parsed === null) {
    return { ok: false, detail: SUPPORT_UNAVAILABLE.detail, code: SUPPORT_UNAVAILABLE.code }
  }
  if (!response.ok) return { ok: false, ...envelopeFields(parsed) }
  const saved = cycleSettingsFrom(parsed)
  if (saved === null) {
    return { ok: false, detail: SUPPORT_UNAVAILABLE.detail, code: SUPPORT_UNAVAILABLE.code }
  }
  return { ok: true, settings: saved }
}