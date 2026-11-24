import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Toast } from '../components/atoms/Toast'
import { loadAdminSnapshot, saveCycleSettings as persistCycleSettings } from '../lib/settingsStore'
import type { CycleSettings } from '../lib/types'

const TOAST_DURATION_MS = 4200

export interface ToastState {
  tone: 'success' | 'error'
  message: string
}

interface AdminStore {
  cycleSettings: CycleSettings | null
  notify: (tone: ToastState['tone'], message: string) => void
  saveCycleSettings: (settings: CycleSettings) => void
}

const AdminStoreContext = createContext<AdminStore | null>(null)

/** Global session state and its notification surface only — roster data lives
    in the API (see hooks/useEmployees), never mirrored in here. */
export function AdminStoreProvider({ children }: { children: ReactNode }) {
  const [cycleSettings, setCycleSettings] = useState<CycleSettings | null>(loadAdminSnapshot)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current)
    }
  }, [])

  function notify(tone: ToastState['tone'], message: string): void {
    if (toastTimer.current !== null) clearTimeout(toastTimer.current)
    setToast({ tone, message })
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS)
  }

  function saveCycleSettings(settings: CycleSettings): void {
    persistCycleSettings(settings)
    setCycleSettings(settings)
    notify(
      'success',
      `Review cycle saved — deadline ${settings.submissionDeadline}, manager review ${settings.managerReviewStart} to ${settings.managerReviewEnd}, HR release by ${settings.hrApprovalReleaseBy}.`,
    )
  }

  return (
    <AdminStoreContext.Provider value={{ cycleSettings, notify, saveCycleSettings }}>
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
