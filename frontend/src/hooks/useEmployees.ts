import { useCallback, useEffect, useState } from 'react'
import { fetchEmployees } from '../lib/api'
import type { Employee } from '../lib/types'

/** One server page of the roster, fetched fresh per `page` and after a
    refresh — the only place pages should take roster data from. Pages own
    the fetch; components below them receive rows via props. */
export function useEmployees(page: number): {
  employees: readonly Employee[]
  total: number
  pageSize: number
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const [pageState, setPageState] = useState({ employees: [] as readonly Employee[], total: 0, pageSize: 10 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchEmployees(page).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (result.ok) {
        setPageState({ employees: result.employees, total: result.total, pageSize: result.pageSize })
        setError(null)
      } else {
        setError(result.detail)
      }
    })
    return () => {
      cancelled = true
    }
  }, [page, reloadTick])

  const refresh = useCallback(() => setReloadTick((tick) => tick + 1), [])
  return { employees: pageState.employees, total: pageState.total, pageSize: pageState.pageSize, loading, error, refresh }
}
