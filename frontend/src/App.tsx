import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell, type NavSection } from './components/organisms/AppShell'
import { AdminStoreProvider } from './state/AdminContext'
import { AuthProvider, useAuth } from './state/AuthContext'
import { LoginPage, ROLE_HOME } from './pages/LoginPage'
import { UsersPage } from './pages/UsersPage'
import { UploadPage } from './pages/UploadPage'
import { ReviewStatusPage } from './pages/ReviewStatusPage'
import { CycleSettingsPage } from './pages/CycleSettingsPage'
import { EmployeeDashboardPage } from './pages/EmployeeDashboardPage'
import type { AuthRole } from './lib/authUsers'

const ADMIN_NAV_SECTIONS: readonly NavSection[] = [
  { to: '/review-status', label: 'Review status', icon: 'chart' },
  { to: '/upload', label: 'Employee data upload', icon: 'upload' },
  { to: '/users', label: 'Users', icon: 'users' },
  { to: '/cycle-settings', label: 'Cycle settings', icon: 'calendar' },
]

function AdminLayout() {
  return (
    <AppShell headerTitle="Admin console" navSections={ADMIN_NAV_SECTIONS}>
      <Outlet />
    </AppShell>
  )
}

function EmployeeLayout() {
  return (
    <AppShell headerTitle="My review">
      <Outlet />
    </AppShell>
  )
}

/** Only sessions with the matching role get through; everyone else is routed
    back to sign-in, keeping the attempted route for the post-login return. */
function RequireRole({ role }: { role: AuthRole }) {
  const { session } = useAuth()
  const location = useLocation()
  if (session === null) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  if (session.role !== role) {
    return <Navigate to={ROLE_HOME[session.role]} replace />
  }
  return <Outlet />
}

function HomeRedirect() {
  const { session } = useAuth()
  return <Navigate to={session === null ? '/login' : ROLE_HOME[session.role]} replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireRole role="admin" />}>
        <Route element={<AdminLayout />}>
          <Route path="/users" element={<UsersPage />} />
          <Route path="/review-status" element={<ReviewStatusPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/cycle-settings" element={<CycleSettingsPage />} />
        </Route>
      </Route>
      <Route element={<RequireRole role="employee" />}>
        <Route element={<EmployeeLayout />}>
          <Route path="/dashboard" element={<EmployeeDashboardPage />} />
        </Route>
      </Route>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function App() {
  return (
    <AdminStoreProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </AdminStoreProvider>
  )
}
