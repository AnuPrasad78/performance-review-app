import type { CycleSettings } from './types'

const STORAGE_KEY = 'performance-review.admin.v1'

function readSnapshot(): CycleSettings | null {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const snapshot = parsed as Record<string, unknown>
  return snapshot.cycleSettings !== null && typeof snapshot.cycleSettings === 'object'
    ? (snapshot.cycleSettings as CycleSettings)
    : null
}

function writeSnapshot(cycleSettings: CycleSettings | null): void {
  const next = { cycleSettings }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Persistence is a mock concern; the page keeps its in-memory state working without it.
  }
}

export function loadAdminSnapshot(): CycleSettings | null {
  return readSnapshot()
}

export function saveCycleSettings(cycleSettings: CycleSettings): void {
  writeSnapshot(cycleSettings)
}
