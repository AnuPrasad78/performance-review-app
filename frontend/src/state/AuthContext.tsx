import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearSession, saveSession, loadSession, type AuthSession } from '../lib/authStore'
import { authenticate, type AuthResult } from '../lib/authUsers'
import { closeServerSession, fetchCookieSession, setApiIdentity } from '../lib/api'

interface AuthState {
  session: AuthSession | null
  /** True while a server-side cookie identity check is still in flight —
      "no session" is not yet an answer the interface may react to, so boots
      hold a splash instead of flickering the login page. */
  booting: boolean
  /** The password parameter stays in the contract (and its field in the form)
      so the SSO swap later touches no page code; the backend ignores it in
      this stub phase. */
  signIn: (email: string, password: string) => Promise<AuthResult>
  /** Awaits the server cookie drop so the SSO adoption effect cannot re-adopt
      the very session being signed out of. */
  signOut: () => Promise<void>
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
  // A locally remembered session is the answer at import time; only when it
  // is absent does the server-side cookie check become the pending question.
  const [booting, setBooting] = useState(() => loadSession() === null)

  // One effect owns the API identity for every phase of the session:
  // freshly signed-in, and signed-out (null clears it). The restored-on-
  // reload phase is covered by the identity set at module import.
  useEffect(() => {
    setApiIdentity(session?.email ?? null)
  }, [session])

  // SSO adoption: nothing remembered locally does not mean nobody is signed
  // in — the server-side cookie from the Entra hand-off survives reloads.
  // One one-shot check when the UI has no session; adoption must not resurrect
  // a session the user just signed out of, so the backend cookie is the only
  // thing that can restore one.
  useEffect(() => {
    if (session !== null) return
    let active = true
    void fetchCookieSession()
      .then((result) => {
        if (!active) return
        // The answer is in either way: the interface may react to
        // "signed out" from here on.
        setBooting(false)
        if (!result.ok) return
        const adopted: AuthSession = {
          email: result.session.email,
          name: result.session.name,
          role: result.session.role,
        }
        saveSession(adopted)
        setSession(adopted)
      })
      .catch(() => {
        // The seam surfaces failures as results, but a future fetch change
        // must never wedge the boot splash: no answer reads as signed out.
        if (active) setBooting(false)
      })
    return () => {
      active = false
    }
  }, [session])

  const value = useMemo<AuthState>(
    () => ({
      session,
      booting,
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
      signOut: async () => {
        await closeServerSession()
        clearSession()
        setSession(null)
      },
    }),
    [session, booting],
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
