import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AdminStoreProvider } from '../../src/state/AdminContext'
import { EmployeeDashboardPage } from '../../src/pages/EmployeeDashboardPage'
import { SelfEvaluationPage } from '../../src/pages/SelfEvaluationPage'

const STORAGE_KEY = 'performance-review.admin.v1'

beforeEach(() => {
  window.localStorage.clear()
})

function renderDashboardWithRoutes(): React.ReactElement {
  return (
    <AdminStoreProvider>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<EmployeeDashboardPage />} />
          <Route path="/self-evaluation" element={<SelfEvaluationPage />} />
        </Routes>
      </MemoryRouter>
    </AdminStoreProvider>
  )
}

describe('EmployeeDashboardPage', () => {
  it('reflects the store state in the stat strip and meter', async () => {
    render(renderDashboardWithRoutes())

    expect((await screen.findAllByText('Not started')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Not set').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Not signed').length).toBeGreaterThan(0)
  })

  it('the primary action navigates to the self-evaluation form', async () => {
    const user = userEvent.setup()
    render(renderDashboardWithRoutes())

    await user.click(await screen.findByRole('button', { name: 'Open self-evaluation' }))

    expect(screen.getByRole('heading', { name: 'Self-evaluation', level: 1 })).toBeInTheDocument()
  })

  it('uses the admin deadline when cycle settings are published', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      employees: [],
      cycleSettings: {
        submissionDeadline: '2027-02-01',
        managerReviewStart: '2027-02-02',
        managerReviewEnd: '2027-03-01',
        hrApprovalReleaseBy: '2027-03-15',
      },
    }))
    render(renderDashboardWithRoutes())

    expect(await screen.findByText(/Self-evaluation due 01-Feb-2027/)).toBeInTheDocument()
  })
})
