import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Toast } from '../components/atoms/Toast'
import { mergeRoster, parseRosterCsv } from '../lib/csv'
import { loadAdminSnapshot, saveCycleSettings as persistCycleSettings, saveEmployees } from '../lib/settingsStore'
import type { CycleSettings, Employee, RosterMergeResult } from '../lib/types'

const MOCK_DELAY_MS = 600
const TOAST_DURATION_MS = 4200

export interface ToastState {
  tone: 'success' | 'error'
  message: string
}

interface AdminStore {
  employees: readonly Employee[]
  cycleSettings: CycleSettings | null
  importInFlight: boolean
  importRoster: (file: File) => void
  saveCycleSettings: (settings: CycleSettings) => void
}

const AdminStoreContext = createContext<AdminStore | null>(null)

function describeMergeReport(addedCount: number, duplicatesCount: number): string {
  if (addedCount === 0) {
    return `All ${duplicatesCount} emails already in the roster — nothing loaded.`
  }
  const employeeWord = addedCount === 1 ? 'employee' : 'employees'
  const duplicateWord = duplicatesCount === 1 ? 'duplicate email' : 'duplicate emails'
  const suffix = duplicatesCount > 0 ? ` — ${duplicatesCount} ${duplicateWord} skipped.` : '.'
  return `${addedCount} ${employeeWord} loaded${suffix}`
}

export function AdminStoreProvider({ children }: { children: ReactNode }) {
  const [snapshot] = useState(loadAdminSnapshot)
  const [employees, setEmployees] = useState<Employee[]>(snapshot.employees)
  const [cycleSettings, setCycleSettings] = useState<CycleSettings | null>(snapshot.cycleSettings)
  const [importInFlight, setImportInFlight] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current)
    }
  }, [])

  function showToast(tone: ToastState['tone'], message: string): void {
    if (toastTimer.current !== null) clearTimeout(toastTimer.current)
    setToast({ tone, message })
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS)
  }

  function importRoster(file: File): void {
    setImportInFlight(true)
    void Promise.all([
      file.text(),
      new Promise<void>((resolve) => setTimeout(resolve, MOCK_DELAY_MS)),
    ]).then(([text]) => {
      const parsed = parseRosterCsv(text)
      if (!parsed.ok) {
        setImportInFlight(false)
        showToast('error', parsed.error)
        return
      }
      setEmployees((current) => {
        const report: RosterMergeResult = mergeRoster(current, parsed.employees)
        saveEmployees(report.roster)
        showToast('success', describeMergeReport(report.added, report.duplicates))
        return report.roster
      })
      setImportInFlight(false)
    })
  }

  function saveCycleSettings(settings: CycleSettings): void {
    persistCycleSettings(settings)
    setCycleSettings(settings)
    showToast(
      'success',
      `Review cycle saved — deadline ${settings.submissionDeadline}, manager review ${settings.managerReviewStart} to ${settings.managerReviewEnd}, HR release by ${settings.hrApprovalReleaseBy}.`,
    )
  }

  return (
    <AdminStoreContext.Provider
      value={{ employees, cycleSettings, importInFlight, importRoster, saveCycleSettings }}
    >
      {children}
      {toast ? <Toast tone={toast.tone} message={toast.message} /> : null}
    </AdminStoreContext.Provider>
  )
}

export function useAdminStore(): AdminStore {
  const store = useContext(AdminStoreContext)
  if (store === null) {
    throw new Error('useAdminStore must be used inside AdminStoreProvider')
  }
  return store
}
