import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { AuthProvider } from '../../src/state/AuthContext'
import { AppRoutes } from '../../src/App'

beforeEach(() => {
  window.localStorage.clear()
})

function renderApp(): React.ReactElement {
  return (
    <AdminStoreProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </AdminStoreProvider>
  )
}

describe('LoginPage', () => {
  it('renders the sign-in form with single sign-on unavailable', () => {
    render(renderApp())
    expect(screen.getByRole('heading', { name: 'Sign in', level: 1 })).toBeInTheDocument()
    const sso = screen.getByRole('button', { name: 'Sign in with Microsoft' })
    expect(sso).toBeDisabled()
    expect(screen.getByText('SSO unavailable in this release')).toBeInTheDocument()
  })

  it('rejects a roster email with the wrong password', async () => {
    render(renderApp())
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'asha_menon@emids.com')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect password')
    expect(screen.getByRole('heading', { name: 'Sign in', level: 1 })).toBeInTheDocument()
  })

  it('reports inactive accounts instead of signing them in', async () => {
    render(renderApp())
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'gaurav_bhatt@emids.com')
    await user.type(screen.getByLabelText('Password'), 'Portal@2026')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This account is inactive')
  })

  it('signs the admin in to the admin console', async () => {
    render(renderApp())
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'admin@emids.com')
    await user.type(screen.getByLabelText('Password'), 'Portal@2026')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Employees', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument()
  })

  it('signs a roster employee in to the employee dashboard', async () => {
    render(renderApp())
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'bilal_khan@emids.com')
    await user.type(screen.getByLabelText('Password'), 'Portal@2026')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Annual Performance Review 2026', level: 1 })).toBeInTheDocument()
  })
})
