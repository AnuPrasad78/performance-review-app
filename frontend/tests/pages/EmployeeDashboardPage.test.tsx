import { render, screen } from '@testing-library/react'
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
  it('shows the review progress meter with employee details below it', async () => {
    render(renderDashboardWithRoutes())

    expect(await screen.findByText('0/7')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'SECTIONS COMPLETED' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Asha Nair')).toBeInTheDocument()
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

    const dueDate = await screen.findByText('01-Feb-2027')
    expect(dueDate).toBeInTheDocument()
    expect(dueDate.className).toContain('page-head__due')
  })
})
