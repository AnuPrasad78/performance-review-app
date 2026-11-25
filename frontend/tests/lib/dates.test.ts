import { describe, expect, it } from 'vitest'
import { daysUntilDeadlineUtc } from '../../src/lib/dates'

/** The countdown is judged on the UTC clock so every timezone sees the same
    number; these cases pin the rounding rules in UTC terms. */
const NOW = new Date('2027-01-10T12:00:00Z')

describe('daysUntilDeadlineUtc', () => {
  it('counts whole days up', () => {
    expect(daysUntilDeadlineUtc('2027-01-11T12:00:00Z', NOW)).toBe(1)
    expect(daysUntilDeadlineUtc('2027-01-15T12:00:00Z', NOW)).toBe(5)
  })

  it('rounds a partial day up to the next whole day', () => {
    // Three hours remain — still phrased as one closing day.
    expect(daysUntilDeadlineUtc('2027-01-10T15:00:00Z', NOW)).toBe(1)
  })

  it('reads an already passed deadline as 0 (the flag decides the screen, not this number)', () => {
    expect(daysUntilDeadlineUtc('2027-01-09T00:00:00Z', NOW)).toBe(0)
  })

  it('reads an unparseable deadline as 0', () => {
    expect(daysUntilDeadlineUtc('not-a-date', NOW)).toBe(0)
  })
})
