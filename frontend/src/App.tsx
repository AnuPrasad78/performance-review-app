import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppShell, type NavSection } from './components/organisms/AppShell'
import { AdminStoreProvider } from './state/AdminContext'
import { UsersPage } from './pages/UsersPage'
import { UploadPage } from './pages/UploadPage'
import { CycleSettingsPage } from './pages/CycleSettingsPage'

const NAV_SECTIONS: readonly NavSection[] = [
  { to: '/upload', label: 'CSV upload', icon: 'upload' },
  { to: '/users', label: 'Users', icon: 'users' },
  { to: '/cycle-settings', label: 'Cycle settings', icon: 'calendar' },
]

function AdminLayout() {
  return (
    <AppShell headerTitle="Admin console" navSections={NAV_SECTIONS}>
      <Outlet />
    </AppShell>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/users" replace />} />
      <Route element={<AdminLayout />}>
        <Route path="/users" element={<UsersPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/cycle-settings" element={<CycleSettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/users" replace />} />
    </Routes>
  )
}

export function App() {
  return (
    <AdminStoreProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AdminStoreProvider>
  )
}
