import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { ReviewStatusPage } from '../../src/pages/ReviewStatusPage'

const ADMIN_STORAGE_KEY = 'performance-review.admin.v1'

function page(): React.ReactElement {
  return (
    <AdminStoreProvider>
      <ReviewStatusPage />
    </AdminStoreProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

function dataRows(): HTMLElement[] {
  const table = screen.getByRole('table')
  const body = within(table).getAllByRole('rowgroup')[1]
  return within(body ?? table).queryAllByRole('row')
}

describe('ReviewStatusPage', () => {
  it('shows every employee with their form status and a completion meter per status', () => {
    render(page())

    expect(screen.getByRole('heading', { name: 'Review form status' })).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Review completion split by status' }),
    ).toBeInTheDocument()
    const titles = [...document.querySelectorAll('.pie-block__chart title')].map((t) => t.textContent)
    expect(titles).toHaveLength(4)
    expect(titles.every((title) => title?.includes(' of 6 ('))).toBe(true)
    const tiles = [...document.querySelectorAll('.tile')].map((tile) => tile.textContent)
    expect(tiles).toHaveLength(4)
    for (const label of ['Total employees', 'Completed', 'In progress', 'Not started']) {
      expect(tiles.some((text) => text?.includes(label))).toBe(true)
    }
    for (const status of ['Not started', 'In progress', 'Submitted', 'Signed off']) {
      expect(dataRows().some((row) => within(row).queryByText(status))).toBe(true)
    }
    expect(screen.getByText('Employees · 6 of 6')).toBeInTheDocument()
  })

  it('filters the roster to pending reviews when Pending is selected', async () => {
    const user = userEvent.setup()
    render(page())

    await user.click(screen.getByRole('button', { name: 'Pending' }))

    expect(screen.getByText('Employees · 4 of 6')).toBeInTheDocument()
    const statuses = dataRows().map((row) => row.textContent)
    expect(statuses.some((text) => text?.includes('Not started'))).toBe(true)
    expect(statuses.some((text) => text?.includes('In progress'))).toBe(true)
    expect(statuses.some((text) => text?.includes('Submitted'))).toBe(false)
    expect(statuses.some((text) => text?.includes('Signed off'))).toBe(false)
  })

  it('filters the roster to completed reviews when Completed is selected', async () => {
    const user = userEvent.setup()
    render(page())

    await user.click(screen.getByRole('button', { name: 'Completed' }))

    expect(screen.getByText('Employees · 2 of 6')).toBeInTheDocument()
    const statuses = dataRows().map((row) => row.textContent)
    expect(statuses.some((text) => text?.includes('Submitted'))).toBe(true)
    expect(statuses.some((text) => text?.includes('Signed off'))).toBe(true)
    expect(statuses.some((text) => text?.includes('Not started'))).toBe(false)
    expect(statuses.some((text) => text?.includes('In progress'))).toBe(false)
  })

  it('shows the empty-roster next move when no employees are loaded', () => {
    window.localStorage.setItem(
      ADMIN_STORAGE_KEY,
      JSON.stringify({ employees: [], cycleSettings: null }),
    )
    render(page())

    expect(
      screen.getByText('No employees loaded. Upload a roster CSV on the Employee data upload page.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Employees · 0 of 0')).toBeInTheDocument()
  })
})
