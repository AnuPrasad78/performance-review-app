import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchEmployees } from '../lib/api'
import type { Employee, RosterQuery } from '../lib/types'

export interface EmployeeRead {
  employees: readonly Employee[]
  total: number
  pageSize: number
  /** True once the first successful read landed; later reads keep the stale
      rows on screen under it so a reload never tears the table (and its open
      pop-up) away while the user is mid-query. */
  loaded: boolean
  loading: boolean
  error: string | null
  refresh: () => void
}

/** One server page of the roster under the composed `query` (search, filters
    and sort included — the server slices), fetched fresh per query and after
    a refresh — the only place pages should take roster data from. Pages own
    the fetch; components below them receive rows via props. */
export function useEmployees(query: RosterQuery & { page: number }): EmployeeRead {
  const [pageState, setPageState] = useState({ employees: [] as readonly Employee[], total: 0, pageSize: 10 })
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  // The effect rides the query's content, not its object identity: a select
  // that re-sets the same word must not re-fetch (and thereby reset anything).
  const queryRef = useRef(query)
  queryRef.current = query
  const queryKey = JSON.stringify(query)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchEmployees(queryRef.current).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (result.ok) {
        setLoaded(true)
        setPageState({ employees: result.employees, total: result.total, pageSize: result.pageSize })
        setError(null)
      } else {
        setError(result.detail)
      }
    })
    return () => {
      cancelled = true
    }
  }, [queryKey, reloadTick])

  const refresh = useCallback(() => setReloadTick((tick) => tick + 1), [])
  return { employees: pageState.employees, total: pageState.total, pageSize: pageState.pageSize, loaded, loading, error, refresh }
}
