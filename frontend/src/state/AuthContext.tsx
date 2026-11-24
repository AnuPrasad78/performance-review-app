import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { clearSession, saveSession, loadSession, type AuthSession } from '../lib/authStore'
import { authenticate, type AuthResult } from '../lib/authUsers'

interface AuthState {
  session: AuthSession | null
  signIn: (email: string, password: string) => Promise<AuthResult>
  signOut: () => void
}

const AuthContext = createContext<AuthState | null>(null)

const FAKE_HANDSHAKE_MS = 450

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(loadSession)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      session,
      signIn: (email, password) =>
        new Promise<AuthResult>((resolve) => {
          timer.current = setTimeout(() => {
            const result = authenticate(email, password)
            if (result.ok) {
              const next: AuthSession = {
                email: result.account.email,
                name: result.account.name,
                role: result.account.role,
              }
              saveSession(next)
              setSession(next)
            }
            resolve(result)
          }, FAKE_HANDSHAKE_MS)
        }),
      signOut: () => {
        clearSession()
        setSession(null)
      },
    }),
    [session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext)
  if (state === null) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return state
}
