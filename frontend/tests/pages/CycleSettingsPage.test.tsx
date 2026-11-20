import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { CycleSettingsPage } from '../../src/pages/CycleSettingsPage'

const STORAGE_KEY = 'performance-review.admin.v1'

function page(): React.ReactElement {
  return (
    <AdminStoreProvider>
      <CycleSettingsPage />
    </AdminStoreProvider>
  )
}

function setDate(index: number, value: string): void {
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="date"]')
  const input = inputs[index]
  if (!input) throw new Error(`date input ${index} not found`)
  fireEvent.change(input, { target: { value } })
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('CycleSettingsPage', () => {
  it('blocks save while the HR release date is missing', () => {
    render(page())
    setDate(0, '2027-01-15')
    setDate(1, '2027-01-20')
    setDate(2, '2027-02-10')

    expect(screen.getByText('Choose the HR approval and release date.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save cycle settings' })).toBeDisabled()
  })

  it('shows the date-range error when the HR release date precedes the manager review end', () => {
    render(page())
    setDate(0, '2027-01-15')
    setDate(1, '2027-01-20')
    setDate(2, '2027-02-10')
    setDate(3, '2027-02-05')

    expect(
      screen.getByText('HR approval and release date must come on or after the manager review end date.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save cycle settings' })).toBeDisabled()
  })

  it('saves valid settings incl. the HR release date, shows the toast, and persists', async () => {
    render(page())
    setDate(0, '2027-01-15')
    setDate(1, '2027-01-20')
    setDate(2, '2027-02-10')
    setDate(3, '2027-02-20')

    const save = screen.getByRole('button', { name: 'Save cycle settings' })
    expect(save).toBeEnabled()
    await userEvent.click(save)

    expect(await screen.findByRole('status')).toHaveTextContent('HR release by 2027-02-20')
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}').cycleSettings).toEqual({
      submissionDeadline: '2027-01-15',
      managerReviewStart: '2027-01-20',
      managerReviewEnd: '2027-02-10',
      hrApprovalReleaseBy: '2027-02-20',
    })
  })

  it('renders saved cycle settings, incl. the HR release date, back into the form', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        employees: [],
        cycleSettings: {
          submissionDeadline: '2027-01-15',
          managerReviewStart: '2027-01-20',
          managerReviewEnd: '2027-02-10',
          hrApprovalReleaseBy: '2027-02-20',
        },
      }),
    )
    render(page())
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="date"]')
    expect(inputs[3]?.value).toBe('2027-02-20')
  })
})
