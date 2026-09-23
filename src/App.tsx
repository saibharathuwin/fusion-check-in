import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/useAuth'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { LoginPage } from './pages/Login/LoginPage'
import { StaffLoginPage } from './pages/Scanner/StaffLoginPage'
import { KioskLoginPage } from './pages/Scanner/KioskLoginPage'
import { ScannerPage } from './pages/Scanner/ScannerPage'
import { DashboardLayout } from './components/DashboardLayout/DashboardLayout'
import { Dashboard } from './pages/Dashboard/Dashboard'
import { Events } from './pages/Events/Events'
import { EventsLandingPage } from './pages/Events/EventsLandingPage'
import { AddEventForm } from './pages/Events/AddEventForm'
import { EditEventPage } from './pages/Events/EditEventPage'
import { EventDetailLayout } from './pages/EventDetail/EventDetailLayout'
import { EventOverview } from './pages/EventDetail/EventOverview'
import { EventAnalysisPage } from './pages/EventDetail/EventAnalysisPage'
import { EventAttendeesPage } from './pages/EventDetail/EventAttendeesPage'
import { EventMissingStudentsPage } from './pages/EventDetail/EventMissingStudentsPage'
import { ActiveEventsPage } from './pages/Dashboard/ActiveEventsPage'
import { UpcomingEventsPage } from './pages/Dashboard/UpcomingEventsPage'
import { AddStudentPage } from './pages/AddStudent/AddStudentPage'
import { StudentsLandingPage } from './pages/Students/StudentsLandingPage'
import { ImportStudentsPage } from './pages/Students/ImportStudentsPage'
import { StudentDirectoryPage } from './pages/StudentDirectory/StudentDirectoryPage'
import { StudentAnalyticsPage } from './pages/Students/StudentAnalyticsPage'
import { PassToolsPage } from './pages/PassTools/PassToolsPage'
import { ComingSoon } from './pages/ComingSoon/ComingSoon'

function AppRoutes() {
  const { staffUser } = useAuth()
  const firstName = staffUser?.fullName.split(' ')[0] ?? ''

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/scanner/login" element={<StaffLoginPage />} />
      <Route path="/kiosk" element={<KioskLoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/scanner" element={<ScannerPage />} />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
        <Route path="/students/new" element={<AddStudentPage />} />
        <Route path="/students/directory" element={<StudentDirectoryPage />} />
        <Route path="/students/import" element={<ImportStudentsPage />} />
        <Route path="/students/passes" element={<PassToolsPage />} />
        <Route path="/students/analytics" element={<StudentAnalyticsPage />} />
        {/* Standalone, no sidebar — same pattern as the /students/* pages above. EventDetailLayout
            just fetches the event by :id and hands it down via outlet context, so it works the
            same whether or not a DashboardLayout sits above it. */}
        <Route path="/events/:id/analysis" element={<EventDetailLayout />}>
          <Route index element={<EventAnalysisPage />} />
          <Route path="attendees" element={<EventAttendeesPage />} />
          <Route path="missing" element={<EventMissingStudentsPage />} />
        </Route>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Dashboard firstName={firstName} />} />
          <Route path="/events" element={<EventsLandingPage />} />
          <Route path="/events/all" element={<Events />} />
          <Route path="/events/new" element={<AddEventForm />} />
          <Route path="/events/active" element={<ActiveEventsPage />} />
          <Route path="/events/upcoming" element={<UpcomingEventsPage />} />
          <Route path="/events/:id/edit" element={<EditEventPage />} />
          <Route path="/events/:id" element={<EventDetailLayout />}>
            <Route index element={<EventOverview />} />
          </Route>
          <Route path="/students" element={<StudentsLandingPage />} />
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
