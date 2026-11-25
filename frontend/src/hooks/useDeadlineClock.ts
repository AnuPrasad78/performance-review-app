import { useEffect, useState } from 'react'

const TICK_MS = 60_000

/** The countdown text's tick: a fresh UTC-reading so the banner can never sit
    on a stale day count while the page is open. It only refreshes the number —
    open-vs-closed decisions always come from the server's deadlinePassed flag
    on the next fetch, never from client clock math. */
export function useDeadlineClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(timer)
  }, [])
  return now
}
