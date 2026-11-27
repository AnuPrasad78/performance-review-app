import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Employee } from '../lib/types'

interface SessionProfileState {
  profile: Employee | null
  setProfile: (profile: Employee | null) => void
}

/** The layout's brand bar renders above the routed pages while the roster
    row a page loads lives below them — this bridge lets the page that owns
    the API record publish it upward, so the session chip shows the real
    person (every employee, not only the ones in the session-profile mock). */
const SessionProfileContext = createContext<SessionProfileState>({
  profile: null,
  setProfile: () => {},
})

export function SessionProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Employee | null>(null)
  return (
    <SessionProfileContext.Provider value={{ profile, setProfile }}>
      {children}
    </SessionProfileContext.Provider>
  )
}

export function useSessionProfile(): SessionProfileState {
  return useContext(SessionProfileContext)
}
