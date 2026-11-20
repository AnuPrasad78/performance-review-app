import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AdminStoreProvider } from '../src/state/AdminContext'
import { AppRoutes } from '../src/App'

beforeEach(() => {
  window.localStorage.clear()
})

function renderApp(initial: string[] = ['/']): React.ReactElement {
  return (
    <AdminStoreProvider>
      <MemoryRouter initialEntries={initial}>
        <AppRoutes />
      </MemoryRouter>
    </AdminStoreProvider>
  )
}

describe('App — routed pages', () => {
  it('lands on the Users page', () => {
    render(renderApp())
    expect(screen.getByRole('heading', { name: 'Employees', level: 1 })).toBeInTheDocument()
  })

  it('navigates from Users to CSV upload and Cycle settings through the drawer', async () => {
    render(renderApp())
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const drawer = document.querySelector('.drawer')
    if (!(drawer instanceof HTMLElement)) throw new Error('drawer not found')
    expect(within(drawer).getAllByRole('link')).toHaveLength(3)

    await user.click(within(drawer).getByRole('link', { name: 'CSV upload' }))
    expect(screen.getByRole('heading', { name: 'CSV upload' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const drawerAgain = document.querySelector('.drawer')
    if (!(drawerAgain instanceof HTMLElement)) throw new Error('drawer not found')
    await user.click(within(drawerAgain).getByRole('link', { name: 'Cycle settings' }))
    expect(screen.getByRole('heading', { name: 'Review cycle settings', level: 1 })).toBeInTheDocument()
  })

  it('redirects unknown paths to Users', () => {
    render(renderApp(['/nope']))
    expect(screen.getByRole('heading', { name: 'Employees', level: 1 })).toBeInTheDocument()
  })

  it('keeps the store across routes — an import on Upload is visible on Users', async () => {
    const { container } = render(renderApp())
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const drawer = document.querySelector('.drawer')
    if (!(drawer instanceof HTMLElement)) throw new Error('drawer not found')
    await user.click(within(drawer).getByRole('link', { name: 'CSV upload' }))

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('file input not found')
    const csv = 'first_name,last_name,email,role,department,manager\nPriya,Raj,priya.raj@emids.com,Engineer,Delivery,Anika Rao\n'
    await user.upload(input, new File([csv], 'roster.csv', { type: 'text/csv' }))
    await screen.findByRole('status', {}, { timeout: 3000 })

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const drawerBack = document.querySelector('.drawer')
    if (!(drawerBack instanceof HTMLElement)) throw new Error('drawer not found')
    await user.click(within(drawerBack).getByRole('link', { name: 'Users' }))

    expect(await screen.findByText('Roster · 7 employees')).toBeInTheDocument()
    expect(screen.getByText('priya.raj@emids.com')).toBeInTheDocument()
  })
})
