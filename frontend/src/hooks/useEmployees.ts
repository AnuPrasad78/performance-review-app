import { useCallback, useEffect, useState } from 'react'
import { fetchEmployees } from '../lib/api'
import type { Employee } from '../lib/types'

/** The employee list, straight from the API on mount and after a refresh —
    the only place pages should take roster data from. Pages own the fetch;
    components below them receive the list via props. */
export function useEmployees(): {
  employees: Employee[]
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchEmployees().then((result) => {
      if (cancelled) return
      setLoading(false)
      if (result.ok) {
        setEmployees(result.employees)
        setError(null)
      } else {
        setError(result.detail)
      }
    })
    return () => {
      cancelled = true
    }
  }, [reloadTick])

  const refresh = useCallback(() => setReloadTick((tick) => tick + 1), [])
  return { employees, loading, error, refresh }
}
