import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
/* import Login from './pages/Login'; */
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
    return (
        <AppLayout>
            <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/departments" element={<Departments />} />
                <Route path="/faculty" element={<Faculty />} />
                <Route path="/rooms" element={<Rooms />} />
                <Route path="/subjects" element={<Subjects />} />
                <Route path="/classes" element={<Classes />} />
                <Route path="/timeslots" element={<TimeSlots />} />
                <Route path="/generate" element={<GenerateWizard />} />
                <Route path="/timetables" element={<TimetableList />} />
                <Route path="/timetable/:id" element={<TimetableView />} />
                <Route path="/timetable/:id/faculty-overview" element={<FacultyOverview />} />
                <Route path="/coe-schedule" element={<CoeSchedule />} />
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
