import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Departments from './pages/Departments';
import Faculty from './pages/Faculty';
import Rooms from './pages/Rooms';
import Subjects from './pages/Subjects';
import Classes from './pages/Classes';
import TimeSlots from './pages/TimeSlots';
import GenerateWizard from './pages/GenerateWizard';
import TimetableList from './pages/TimetableList';
import TimetableView from './pages/TimetableView';
import FacultyOverview from './pages/FacultyOverview';
import CoeSchedule from './pages/CoeSchedule';
import Users from './pages/Users';
import AuditLogs from './pages/AuditLogs';

function ProtectedRoute({ children, roles }) {
    const { user, loading } = useAuth();
    if (loading) {
        return (
            <div className="loading-overlay">
                <div className="spinner"></div>
                <div className="loading-text">Authenticating...</div>
            </div>
        );
    }
    if (!user) return <Navigate to="/login" replace />;
    if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
    return children;
}

function AppLayout({ children }) {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                {children}
            </main>
        </div>
    );
}

function AppRoutes() {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="loading-overlay">
                <div className="spinner"></div>
                <div className="loading-text">Loading...</div>
            </div>
        );
    }

    if (!user) {
        return (
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        );
    }

    return (
        <AppLayout>
            <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/departments" element={
                    <ProtectedRoute roles={['admin', 'department_user']}>
                        <Departments />
                    </ProtectedRoute>
                } />
                <Route path="/faculty" element={<Faculty />} />
                <Route path="/rooms" element={
                    <ProtectedRoute roles={['admin', 'department_user']}>
                        <Rooms />
                    </ProtectedRoute>
                } />
                <Route path="/subjects" element={<Subjects />} />
                <Route path="/classes" element={
                    <ProtectedRoute roles={['admin', 'department_user']}>
                        <Classes />
                    </ProtectedRoute>
                } />
                <Route path="/timeslots" element={
                    <ProtectedRoute roles={['admin', 'department_user']}>
                        <TimeSlots />
                    </ProtectedRoute>
                } />
                <Route path="/generate" element={<GenerateWizard />} />
                <Route path="/timetables" element={<TimetableList />} />
                <Route path="/timetable/:id" element={<TimetableView />} />
                <Route path="/timetable/:id/faculty-overview" element={<FacultyOverview />} />
                <Route path="/coe-schedule" element={
                    <ProtectedRoute roles={['admin', 'department_user']}>
                        <CoeSchedule />
                    </ProtectedRoute>
                } />
                <Route path="/users" element={
                    <ProtectedRoute roles={['admin']}>
                        <Users />
                    </ProtectedRoute>
                } />
                <Route path="/audit-logs" element={
                    <ProtectedRoute roles={['admin']}>
                        <AuditLogs />
                    </ProtectedRoute>
                } />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </AppLayout>
    );
}

export default function App() {
    return (
        <Router>
            <AuthProvider>
                <AppRoutes />
            </AuthProvider>
        </Router>
    );
}
