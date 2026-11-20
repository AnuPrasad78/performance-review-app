import { useAdminStore } from '../state/AdminContext'
import { CycleSettingsForm } from '../components/organisms/CycleSettingsForm'
import { AdminTemplate } from '../components/templates/AdminTemplate'

export function CycleSettingsPage() {
  const { cycleSettings, saveCycleSettings } = useAdminStore()
  return (
    <AdminTemplate
      eyebrow="Admin · Cycle"
      title="Review cycle settings"
      lead="Set the self-evaluation deadline, the manager review window, and the date HR releases the results."
    >
      <CycleSettingsForm initial={cycleSettings} onSave={saveCycleSettings} />
    </AdminTemplate>
  )
}
