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

/** Whole days left before the deadline instant, UTC-clock based so every
    timezone sees the same number. `nowUtc` is injected so the caller (and
    tests) control the reading; the clock hook supplies a live value. A
    deadline later today still rounds up to 1 — "the form will close in
    0 days" is never a useful sentence, and open-vs-closed comes from the
    server's deadlinePassed flag, not this number. */
export function daysUntilDeadlineUtc(deadlineInstant: string, nowUtc: Date): number {
  const deadline = new Date(deadlineInstant)
  if (Number.isNaN(deadline.getTime())) return 0
  const msRemaining = deadline.getTime() - nowUtc.getTime()
  if (msRemaining <= 0) return 0
  return Math.max(1, Math.ceil(msRemaining / 86_400_000))
}

/** Wire acceptance: the deadline must be an instant with a time part, not a
    bare date — a bare date is a legacy/unparsed value, not a close moment. */
export function isIsoInstant(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}/.test(value) && !Number.isNaN(new Date(value).getTime())
}

/** An ISO instant to "26-Nov-2026, 10:42 AM" in local time — the single
    formatter for the "Draft saved at / Auto saved at" copy. Falls back to
    the raw input when not parseable, like formatIsoDate does. */
export function formatInstant(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  const day = String(parsed.getDate()).padStart(2, '0')
  const clock = parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${day}-${MONTHS[parsed.getMonth()]}-${parsed.getFullYear()}, ${clock}`
}
