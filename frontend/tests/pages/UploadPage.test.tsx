import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { AuthProvider } from '../../src/state/AuthContext'
import { UploadPage } from '../../src/pages/UploadPage'

const ROSTER_CSV = `first_name,last_name,email,role,department,manager
Asha,Nair,asha.nair@emids.com,Engineer,Quality,Ravi Menon
Priya,Raj,priya.raj@emids.com,Engineer,Delivery,Anika Rao
`

const BROKEN_HEADER_CSV = `name,email
Priya,Raj,priya.raj@emids.com
`

const STORAGE_KEY = 'performance-review.admin.v1'

function page(): React.ReactElement {
  return (
    <AdminStoreProvider>
          <AuthProvider>
      <UploadPage />
    </AuthProvider>
        </AdminStoreProvider>
  )
}

async function uploadCsv(content: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('file input not found')
  const file = new File([content], 'roster.csv', { type: 'text/csv' })
  const user = userEvent.setup()
  await user.upload(input, file)
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('UploadPage', () => {
  it('shows the roster readout before and after a successful import', async () => {
    render(page())
    expect(screen.getByText('ROSTER NOW · 6 EMPLOYEES')).toBeInTheDocument()
    await uploadCsv(ROSTER_CSV)

    expect(await screen.findByRole('status', {}, { timeout: 3000 })).toHaveTextContent(
      '1 employee loaded — 1 duplicate email skipped.',
    )
    expect(screen.getByText('ROSTER NOW · 7 EMPLOYEES')).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}').employees).toHaveLength(7)
  })

  it('rejects a CSV with the wrong header and leaves the roster readout unchanged', async () => {
    render(page())
    await uploadCsv(BROKEN_HEADER_CSV)

    expect(await screen.findByRole('status', {}, { timeout: 3000 })).toHaveTextContent(
      'The header row must list: first_name, last_name, email, role, department, manager.',
    )
    expect(screen.getByText('ROSTER NOW · 6 EMPLOYEES')).toBeInTheDocument()
  })

  it('keeps the button disabled with the in-flight label while the import runs', async () => {
    render(page())
    const button = screen.getByRole('button', { name: 'Choose CSV file' })
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('file input not found')
    const file = new File([ROSTER_CSV], 'roster.csv', { type: 'text/csv' })
    await userEvent.upload(input, file)

    expect(await screen.findByRole('button', { name: 'Loading roster' })).toBeDisabled()
    expect(button.textContent).toContain('Loading roster')
  })
})
