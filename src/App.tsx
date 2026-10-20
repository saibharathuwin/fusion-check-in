import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/useAuth'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { LoginPage } from './pages/Login/LoginPage'
import { ResetPasswordPage } from './pages/Login/ResetPasswordPage'
import { StaffLoginPage } from './pages/Scanner/StaffLoginPage'
import { KioskLoginPage } from './pages/Scanner/KioskLoginPage'
import { ScannerPage } from './pages/Scanner/ScannerPage'
import { DashboardLayout } from './components/DashboardLayout/DashboardLayout'
import { Dashboard } from './pages/Dashboard/Dashboard'
import { Events } from './pages/Events/Events'
import { AddEventForm } from './pages/Events/AddEventForm'
import { EditEventPage } from './pages/Events/EditEventPage'
import { EventDetailLayout } from './pages/EventDetail/EventDetailLayout'
import { EventOverview } from './pages/EventDetail/EventOverview'
import { EventAnalysisPage } from './pages/EventDetail/EventAnalysisPage'
import { EventInviteesPage } from './pages/EventDetail/EventInviteesPage'
import { EventDroppedPage } from './pages/EventDetail/EventDroppedPage'
import { EventAttendeesPage } from './pages/EventDetail/EventAttendeesPage'
import { EventMissingStudentsPage } from './pages/EventDetail/EventMissingStudentsPage'
import { EventJoinedLaterPage } from './pages/EventDetail/EventJoinedLaterPage'
import { ActiveEventsPage } from './pages/Dashboard/ActiveEventsPage'
import { UpcomingEventsPage } from './pages/Dashboard/UpcomingEventsPage'
import { AddStudentPage } from './pages/AddStudent/AddStudentPage'
import { ImportStudentsPage } from './pages/Students/ImportStudentsPage'
import { StudentDirectoryPage } from './pages/StudentDirectory/StudentDirectoryPage'
import { StudentAnalyticsPage } from './pages/Students/StudentAnalyticsPage'
import { PassToolsPage } from './pages/PassTools/PassToolsPage'
import { SettingsPage } from './pages/Settings/SettingsPage'
import { ComingSoon } from './pages/ComingSoon/ComingSoon'

function AppRoutes() {
  const { staffUser } = useAuth()
  const firstName = staffUser?.fullName.split(' ')[0] ?? ''
  // Pass Tools keeps which student is selected as its own local state, not in the URL — so
  // clicking "Pass tools" in the nav while already on that page is otherwise a no-op navigation
  // that does nothing but close the menu, leaving staff stuck on whatever student they had open.
  // Keying it to location.key forces a fresh mount on every nav click, even to the same path,
  // resetting it back to the browse view like every other "go to this page" link does.
  const location = useLocation()

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/scanner/login" element={<StaffLoginPage />} />
      <Route path="/kiosk" element={<KioskLoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/scanner" element={<ScannerPage />} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
        {/* Standalone and deliberately outside DashboardLayout — opened in its own browser tab
            from the profile dropdown, it gets its own dedicated header instead of the main app
            nav (SettingsPage renders that header itself, same pattern as the pages below). */}
        <Route path="/settings" element={<SettingsPage />} />
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Dashboard firstName={firstName} />} />
          <Route path="/events" element={<Navigate to="/events/all" replace />} />
          <Route path="/events/all" element={<Events />} />
          <Route path="/events/new" element={<AddEventForm />} />
          <Route path="/events/active" element={<ActiveEventsPage />} />
          <Route path="/events/upcoming" element={<UpcomingEventsPage />} />
          <Route path="/events/:id/edit" element={<EditEventPage />} />
          <Route path="/events/:id" element={<EventDetailLayout />}>
            <Route index element={<EventOverview />} />
          </Route>
          <Route path="/events/:id/invitees" element={<EventDetailLayout />}>
            <Route index element={<EventInviteesPage />} />
          </Route>
          {/* EventDetailLayout just fetches the event by :id and hands it down via outlet
              context, so it works the same whether or not a DashboardLayout sits above it. */}
          <Route path="/events/:id/analysis" element={<EventDetailLayout />}>
            <Route index element={<EventAnalysisPage />} />
            <Route path="attendees" element={<EventAttendeesPage />} />
            <Route path="missing" element={<EventMissingStudentsPage />} />
            <Route path="dropped" element={<EventDroppedPage />} />
            <Route path="joined-later" element={<EventJoinedLaterPage />} />
          </Route>
          <Route path="/students" element={<Navigate to="/students/directory" replace />} />
          <Route path="/students/new" element={<AddStudentPage />} />
          <Route path="/students/directory" element={<StudentDirectoryPage />} />
          <Route path="/students/import" element={<ImportStudentsPage />} />
          <Route path="/students/passes" element={<PassToolsPage key={location.key} />} />
          <Route path="/students/analytics" element={<StudentAnalyticsPage />} />
          <Route path="*" element={<ComingSoon />} />
        </Route>
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

export default App
