import { describe, expect, it } from 'vitest'
import { dayPartAt, greetingFor } from '../../src/lib/greeting'

function at(hour: number, minute = 0): Date {
  return new Date(2026, 10, 27, hour, minute)
}

describe('dayPartAt', () => {
  it('is morning from 05:00 up to noon', () => {
    expect(dayPartAt(at(5))).toBe('Morning')
    expect(dayPartAt(at(11, 59))).toBe('Morning')
  })

  it('is afternoon from noon up to 17:00', () => {
    expect(dayPartAt(at(12))).toBe('Afternoon')
    expect(dayPartAt(at(16, 59))).toBe('Afternoon')
  })

  it('is evening from 17:00 through the night until 05:00', () => {
    expect(dayPartAt(at(17))).toBe('Evening')
    expect(dayPartAt(at(23, 30))).toBe('Evening')
    expect(dayPartAt(at(4, 59))).toBe('Evening')
  })
})

describe('greetingFor', () => {
  it('pairs the day part with the name', () => {
    expect(greetingFor('Asha Menon', at(9))).toBe('Good Morning, Asha Menon')
  })
})
