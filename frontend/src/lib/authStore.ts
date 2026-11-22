import type { AuthRole } from './authUsers'

export interface AuthSession {
  email: string
  name: string
  role: AuthRole
}

const STORAGE_KEY = 'performance-review.session.v1'

function sessionShape(value: unknown): AuthSession | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.email !== 'string' || typeof candidate.name !== 'string') return null
  if (candidate.role !== 'admin' && candidate.role !== 'employee') return null
  return { email: candidate.email, name: candidate.name, role: candidate.role }
}

export function loadSession(): AuthSession | null {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    return sessionShape(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveSession(session: AuthSession): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Persistence is a mock concern; the in-memory session keeps the session alive.
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to reset if storage is unavailable.
  }
}
