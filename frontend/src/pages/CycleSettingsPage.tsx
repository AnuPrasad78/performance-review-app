import { useEffect, useState } from 'react'
import { CycleSettingsForm } from '../components/organisms/CycleSettingsForm'
import { AdminTemplate } from '../components/templates/AdminTemplate'
import { fetchCycleSettings, saveCycleSettings } from '../lib/api'
import { draftToDeadlineLabel } from '../lib/cycleValidation'
import { formatIsoDate } from '../lib/dates'
import type { CycleSettings } from '../lib/types'
import { useAdminStore } from '../state/AdminContext'

export function CycleSettingsPage() {
  const { notify } = useAdminStore()
  const [settings, setSettings] = useState<CycleSettings | null>(null)
  const [settled, setSettled] = useState(false)

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
      lead="Set the self-evaluation submission deadline (date and UTC time), the manager review window, and the date HR releases the results. The deadline is the exact instant the employee form closes, for every timezone."
    >
      {settled ? (
        <CycleSettingsForm initial={settings} onSave={save} />
      ) : (
        <p className="muted">Loading the review cycle.</p>
      )}
    </AdminTemplate>
  )
}
