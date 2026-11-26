import { useEffect, useState } from 'react'
import { CycleSettingsForm } from '../components/organisms/CycleSettingsForm'
import { AdminTemplate } from '../components/templates/AdminTemplate'
import { Skeleton } from '../components/atoms/Skeleton'
import { useDelaySkeleton } from '../hooks/useDelaySkeleton'
import { fetchCycleSettings, saveCycleSettings } from '../lib/api'
import { draftToDeadlineLabel } from '../lib/cycleValidation'
import { formatIsoDate } from '../lib/dates'
import type { CycleSettings } from '../lib/types'
import { useAdminStore } from '../state/AdminContext'

export function CycleSettingsPage() {
  const { notify } = useAdminStore()
  const [settings, setSettings] = useState<CycleSettings | null>(null)
  const [settled, setSettled] = useState(false)
  /** Placeholder bands wait 180ms before showing — fast answers never flash. */
  const skeletonVisible = useDelaySkeleton(!settled)

  useEffect(() => {
    let cancelled = false
    void fetchCycleSettings().then((result) => {
      if (cancelled) return
      if (result.ok) {
        setSettings(result.settings)
      } else if (result.code === 'cycle_missing') {
        // The first cycle does not exist yet: the form opens empty on purpose.
      } else {
        notify('error', result.detail)
      }
      setSettled(true)
    })
    return () => {
      cancelled = true
    }
  }, [notify])

  async function save(next: CycleSettings): Promise<{ ok: true } | { ok: false; detail: string }> {
    const result = await saveCycleSettings(next)
    if (result.ok) {
      setSettings(result.settings)
      notify(
        'success',
        `Review cycle saved — submission deadline ${draftToDeadlineLabel(result.settings.submissionDeadline)} UTC, manager review ${formatIsoDate(result.settings.managerReviewStart)} to ${formatIsoDate(result.settings.managerReviewEnd)}, HR release by ${formatIsoDate(result.settings.hrApprovalReleaseBy)}.`,
      )
      return { ok: true }
    }
    return { ok: false, detail: result.detail }
  }

  return (
    <AdminTemplate
      eyebrow="Admin · Cycle"
      title="Review cycle settings"
      lead="Configure the employee submission deadline, manager review period, and HR result release date. All deadlines are based on UTC to ensure consistent timing across time zones."
    >
      {settled ? (
        <CycleSettingsForm initial={settings} onSave={save} />
      ) : (
        <div role="status" aria-label="Loading the review cycle">
          <span className="sr-only">Loading the review cycle.</span>
          {skeletonVisible ? (
            <div className="card card--padded">
              <div className="skeleton-row" style={{ gap: '18px' }}>
                <Skeleton height="40px" width="220px" />
                <Skeleton height="40px" width="220px" />
              </div>
              <div className="skeleton-row" style={{ gap: '18px' }}>
                <Skeleton height="40px" width="220px" />
                <Skeleton height="40px" width="220px" />
              </div>
              <div className="skeleton-row" style={{ gap: '18px' }}>
                <Skeleton height="40px" width="220px" />
                <Skeleton height="40px" width="120px" />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </AdminTemplate>
  )
}
