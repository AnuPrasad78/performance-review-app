import { seedRoster } from './seedRoster'
import type { CycleSettings, Employee } from './types'

interface AdminSnapshot {
  employees: Employee[]
  cycleSettings: CycleSettings | null
}

const STORAGE_KEY = 'performance-review.admin.v1'

function employeeShape(value: unknown): Employee | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.firstName !== 'string' || typeof candidate.lastName !== 'string') return null
  if (typeof candidate.email !== 'string') return null
  return {
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    role: typeof candidate.role === 'string' ? candidate.role : '',
    department: typeof candidate.department === 'string' ? candidate.department : '',
    manager: typeof candidate.manager === 'string' ? candidate.manager : '',
  }
}

function readSnapshot(): AdminSnapshot {
  const fallback: AdminSnapshot = { employees: seedRoster, cycleSettings: null }
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return fallback
  }
  if (raw === null) return fallback
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fallback
  }
  if (typeof parsed !== 'object' || parsed === null) return fallback
  const snapshot = parsed as Record<string, unknown>
  const employees = Array.isArray(snapshot.employees)
    ? snapshot.employees.map(employeeShape).filter((e): e is Employee => e !== null)
    : seedRoster
  const cycleSettings =
    snapshot.cycleSettings !== null && typeof snapshot.cycleSettings === 'object'
      ? (snapshot.cycleSettings as CycleSettings)
      : null
  return { employees, cycleSettings }
}

function writeSnapshot(patch: Partial<AdminSnapshot>): void {
  const current = readSnapshot()
  const next: AdminSnapshot = { ...current, ...patch }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Persistence is a mock concern; the page keeps its in-memory state working without it.
  }
}

export function loadAdminSnapshot(): AdminSnapshot {
  return readSnapshot()
}

export function saveEmployees(employees: Employee[]): void {
  writeSnapshot({ employees })
}

export function saveCycleSettings(cycleSettings: CycleSettings): void {
  writeSnapshot({ cycleSettings })
}
