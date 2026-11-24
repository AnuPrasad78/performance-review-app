import { render, screen } from '@testing-library/react'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { AuthProvider } from '../../src/state/AuthContext'
import { UsersPage } from '../../src/pages/UsersPage'

const STORAGE_KEY = 'performance-review.admin.v1'

beforeEach(() => {
  window.localStorage.clear()
})

describe('UsersPage', () => {
  it('renders the seeded roster with its count', async () => {
    render(
      <AdminStoreProvider>
          <AuthProvider>
        <UsersPage />
      </AuthProvider>
        </AdminStoreProvider>,
    )
    expect(await screen.findByText('Roster · 6 employees')).toBeInTheDocument()
    expect(screen.getByText('asha.nair@emids.com')).toBeInTheDocument()
  })

  it('shows the next-move empty state when the stored roster is blank', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ employees: [], cycleSettings: null }))
    render(
      <AdminStoreProvider>
          <AuthProvider>
        <UsersPage />
      </AuthProvider>
        </AdminStoreProvider>,
    )
    expect(screen.getByText('No employees loaded. Upload a roster CSV to get started.')).toBeInTheDocument()
  })
})
