/** The profile cards' review seam: the employee's form status (whether the
    card may serve its Download review button and can state the status at
    all) and the busy state of the card's actions. The page owns the actual
    reads; the card organisms wire this into EmployeeDetailCard. */

import { useEffect, useRef, useState } from 'react'
import type { Employee, FormStatus } from '../lib/types'

export interface ProfileReviewActions {
  /** This employee's form status — completed, pending, or unreadable (null).
      Omitted when the caller already knows the answer client-side — the
      review board's row carries the status pill. */
  load?: (employee: Employee) => Promise<FormStatus | null>
  /** Fetches the employee's review document and saves the PDF. */
  download: (employee: Employee) => Promise<void>
}

export function useProfileReview(
  employee: Employee | null,
  actions: ProfileReviewActions | undefined,
): {
  formStatus: FormStatus | null
  reviewCompleted: boolean
  reviewBusy: boolean
  onDownloadReview: () => Promise<void>
} {
  const [formStatus, setFormStatus] = useState<FormStatus | null>(null)
  const [reviewBusy, setReviewBusy] = useState(false)
  // The actions' closures win no identity stability between renders: the ref
  // keeps the selection effect keyed on the employee content alone.
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  useEffect(() => {
    const load = actionsRef.current?.load
    if (employee === null || load === undefined) {
      setFormStatus(null)
      return
    }
    let cancelled = false
    setFormStatus(null)
    void load(employee).then((result) => {
      if (!cancelled) setFormStatus(result)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps — the employee's
    // identity keys the load; a re-rendered closure must not re-read it.
  }, [employee?.employeeId])

  async function onDownloadReview(): Promise<void> {
    if (employee === null) return
    setReviewBusy(true)
    try {
      await actionsRef.current?.download(employee)
    } finally {
      setReviewBusy(false)
    }
  }

  return { formStatus, reviewCompleted: formStatus === 'completed', reviewBusy, onDownloadReview }
}
