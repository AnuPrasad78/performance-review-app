export type DayPart = 'Morning' | 'Afternoon' | 'Evening'

/** Reads the viewer's own local clock, so the greeting matches the time of
    day wherever in the world they open the page. */
export function dayPartAt(now: Date): DayPart {
  const hour = now.getHours()
  if (hour >= 5 && hour < 12) return 'Morning'
  if (hour >= 12 && hour < 17) return 'Afternoon'
  return 'Evening'
}

export function greetingFor(name: string, now: Date): string {
  return `Good ${dayPartAt(now)}, ${name}`
}
