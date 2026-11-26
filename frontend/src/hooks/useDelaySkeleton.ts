import { useEffect, useRef, useState } from 'react'

/** The skeleton shows only after `delayMs` of still-not-loaded data, so a
    fast answer never flashes placeholder bands; on success the flag drops
    immediately and content takes over. */
export function useDelaySkeleton(loading: boolean, delayMs = 180): boolean {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!loading) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setVisible(false)
      return
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      setVisible(true)
    }, delayMs)
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [loading, delayMs])

  return visible
}
