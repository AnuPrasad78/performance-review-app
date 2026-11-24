import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearSession, saveSession, loadSession, type AuthSession } from '../lib/authStore'
import { authenticate, type AuthResult } from '../lib/authUsers'
import { setApiIdentity } from '../lib/api'

interface AuthState {
  session: AuthSession | null
  /** The password parameter stays in the contract (and its field in the form)
      so the SSO swap later touches no page code; the backend ignores it in
      this stub phase. */
  signIn: (email: string, password: string) => Promise<AuthResult>
  signOut: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(loadSession)

  // One effect owns the API identity for every phase of the session:
  // restored-on-reload, freshly signed-in, and signed-out (null clears it).
  useEffect(() => {
    setApiIdentity(session?.email ?? null)
  }, [session])

  const value = useMemo<AuthState>(
    () => ({
      session,
      signIn: async (email) => {
        const result = await authenticate(email)
        if (result.ok) {
          const next: AuthSession = {
            email: result.account.email,
            name: result.account.name,
            role: result.account.role,
          }
          saveSession(next)
          setSession(next)
        }
        return result
      },
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
