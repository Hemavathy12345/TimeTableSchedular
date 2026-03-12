import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
    const { user } = useAuth();
    const [stats, setStats] = useState({ departments: 0, faculty: 0, rooms: 0, subjects: 0, classes: 0, timetables: 0 });

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const [depts, fac, rooms, subs, cls, tt] = await Promise.all([
                api.get('/departments'),
                api.get('/faculty'),
                api.get('/rooms'),
                api.get('/subjects'),
                api.get('/classes'),
                api.get('/timetable'),
            ]);
            setStats({
                departments: depts.data.length,
                faculty: fac.data.length,
                rooms: rooms.data.length,
                subjects: subs.data.length,
                classes: cls.data.length,
                timetables: tt.data.length,
            });
        } catch (err) {
            console.error('Failed to load stats:', err);
        }
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1 className="page-title">Welcome back, {user?.name} </h1>
                <p className="page-subtitle">Here's an overview of your timetable system</p>
            </div>

            <div className="stat-grid">
                <div className="stat-card">
                    <div className="stat-value">{stats.departments}</div>
                    <div className="stat-label">Departments</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{stats.faculty}</div>
                    <div className="stat-label">Faculty Members</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{stats.rooms}</div>
                    <div className="stat-label">Rooms & Labs</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{stats.subjects}</div>
                    <div className="stat-label">Subjects</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{stats.classes}</div>
                    <div className="stat-label">Class Sections</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon"></div>
                    <div className="stat-value">{stats.timetables}</div>
                    <div className="stat-label">Generated Timetables</div>
                </div>
            </div>

            {user?.role === 'admin' && (
                <div className="card">
                    <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Quick Actions</h2>
                    <div className="btn-group" style={{ flexWrap: 'wrap' }}>
                        <a href="/generate" className="btn btn-primary">Generate New Timetable</a>
                        <a href="/departments" className="btn btn-secondary">Manage Departments</a>
                        <a href="/faculty" className="btn btn-secondary">Manage Faculty</a>
                        <a href="/timetables" className="btn btn-secondary">View Timetables</a>
                    </div>
                </div>
            )}
        </div>
    );
}
