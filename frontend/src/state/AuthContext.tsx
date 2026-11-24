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

// Identity must exist before the first page effect can fetch: a child's
// effects run before its provider's, so a dashboard mounted under a restored
// session would otherwise fire GET /me with no identity header (the 401
// race). This one statement executes at import time, before any component
// renders; the effect below keeps it true across sign-in and sign-out.
setApiIdentity(loadSession()?.email ?? null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(loadSession)

  // One effect owns the API identity for every phase of the session:
  // freshly signed-in, and signed-out (null clears it). The restored-on-
  // reload phase is covered by the identity set at module import.
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
