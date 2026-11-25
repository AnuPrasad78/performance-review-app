/** The two admin toolbars' bulk-download state: the backend's count of
    completed reviews under the composed roster query — re-read whenever the
    query's content changes, the page never rides it — plus one click that
    streams the whole ZIP and carries the failure back to the page's toast. */

import { useEffect, useState } from 'react'
import { fetchCompletedCount } from '../lib/api'
import { downloadCompletedReviewZip } from '../lib/reviewDownloads'
import type { RosterQuery } from '../lib/types'

export interface CompletedReviews {
  /** The matched completed count, null until the read lands (and on read
      failure — the button renders without a number then). */
  count: number | null
  busy: boolean
  download: () => Promise<{ ok: true; count: number } | { ok: false; detail: string; code: string }>
}

export function useCompletedReviews(query: RosterQuery): CompletedReviews {
  const [count, setCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  // The effect rides the query's content, not its identity.
  const serialized = JSON.stringify(query)

  useEffect(() => {
    let cancelled = false
    void fetchCompletedCount(JSON.parse(serialized) as RosterQuery).then((result) => {
      if (!cancelled) setCount(result.ok ? result.count : null)
    })
    return () => {
      cancelled = true
    }
  }, [serialized])

  async function download(): Promise<
    { ok: true; count: number } | { ok: false; detail: string; code: string }
  > {
    setBusy(true)
    try {
      return await downloadCompletedReviewZip(JSON.parse(serialized) as RosterQuery)
    } finally {
      setBusy(false)
    }
  }

  return { count, busy, download }
}
