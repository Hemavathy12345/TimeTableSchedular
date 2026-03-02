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

function ProtectedRoute({ children, roles }) {
    const { user, loading } = useAuth();
    if (loading) return <div className="loading-overlay"><div className="spinner"></div></div>;
    if (!user) return <Navigate to="/" />;
    if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" />;
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

    if (loading) return <div className="loading-overlay"><div className="spinner"></div><div className="loading-text">Loading...</div></div>;

    if (!user) return <Login />;

    return (
        <AppLayout>
            <Routes>
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/departments" element={<ProtectedRoute roles={['admin']}><Departments /></ProtectedRoute>} />
                <Route path="/faculty" element={<ProtectedRoute roles={['admin']}><Faculty /></ProtectedRoute>} />
                <Route path="/rooms" element={<ProtectedRoute roles={['admin']}><Rooms /></ProtectedRoute>} />
                <Route path="/subjects" element={<ProtectedRoute roles={['admin']}><Subjects /></ProtectedRoute>} />
                <Route path="/classes" element={<ProtectedRoute roles={['admin']}><Classes /></ProtectedRoute>} />
                <Route path="/timeslots" element={<ProtectedRoute roles={['admin']}><TimeSlots /></ProtectedRoute>} />
                <Route path="/generate" element={<ProtectedRoute roles={['admin']}><GenerateWizard /></ProtectedRoute>} />
                <Route path="/timetables" element={<ProtectedRoute><TimetableList /></ProtectedRoute>} />
                <Route path="/timetable/:id" element={<ProtectedRoute><TimetableView /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/dashboard" />} />
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
