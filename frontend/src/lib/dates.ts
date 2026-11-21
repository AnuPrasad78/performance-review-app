/** Whole days from today until the given ISO date (YYYY-MM-DD). Negative when past. */
export function daysUntil(isoDate: string): number {
  const deadline = new Date(isoDate + 'T00:00:00')
  if (Number.isNaN(deadline.getTime())) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  deadline.setHours(0, 0, 0, 0)
  return Math.round((deadline.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
}

/** ISO date (YYYY-MM-DD) of today, local. */
export function todayIsoDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** "2027-01-15" → "15-Jan-2027". Falls back to the raw input when not a date. */
export function formatIsoDate(isoDate: string): string {
  const parsed = new Date(isoDate + 'T00:00:00')
  if (Number.isNaN(parsed.getTime())) return isoDate
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${day}-${MONTHS[parsed.getMonth()]}-${parsed.getFullYear()}`
}
