import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Toast } from '../components/atoms/Toast'

const TOAST_DURATION_MS = 4200

export interface ToastState {
  tone: 'success' | 'error'
  message: string
}

interface AdminStore {
  notify: (tone: ToastState['tone'], message: string) => void
}

const AdminStoreContext = createContext<AdminStore | null>(null)

/** The admin session's notification surface only — cycle settings live in the
    API (their page owns the fetch, like every other data page), never mirrored
    in here. */
export function AdminStoreProvider({ children }: { children: ReactNode }) {
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

  return (
    <AdminStoreContext.Provider value={{ notify }}>
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
