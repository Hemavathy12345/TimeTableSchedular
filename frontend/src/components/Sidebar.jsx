import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Sidebar() {
    const [collapsed, setCollapsed] = useState(false);
    const { user, logout } = useAuth();
    const location = useLocation();

    const isAdmin = user?.role === 'admin';
    const isFaculty = user?.role === 'faculty';

    const navItems = [
        { path: '/dashboard', label: 'Dashboard', roles: ['admin', 'faculty', 'student'] },
        { type: 'section', label: 'Data Management', roles: ['admin'] },
        { path: '/departments', label: 'Departments', roles: ['admin'] },
        { path: '/faculty', label: 'Faculty', roles: ['admin'] },
        { path: '/rooms', label: 'Rooms & Labs', roles: ['admin'] },
        { path: '/subjects', label: 'Subjects', roles: ['admin'] },
        { path: '/classes', label: 'Classes', roles: ['admin'] },
        { path: '/timeslots', label: 'Time Slots', roles: ['admin'] },
        { type: 'section', label: 'Scheduling', roles: ['admin'] },
        { path: '/generate', label: 'Generate Timetable', roles: ['admin'] },
        { path: '/timetables', label: 'View Timetables', roles: ['admin', 'faculty', 'student'] },
    ];

    const filteredItems = navItems.filter(item => item.roles.includes(user?.role));

    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
            <div className="sidebar-header">
                {/* <div className="sidebar-logo">P</div> */}
                {!collapsed && (
                    <div>
                        <div className="sidebar-title">Planora</div>
                        <div className="sidebar-subtitle">Timetable System</div>
                    </div>
                )}
            </div>

            <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}>
                {collapsed ? '→' : '←'}
            </button>

            <nav className="sidebar-nav">
                {filteredItems.map((item, idx) => {
                    if (item.type === 'section') {
                        return !collapsed ? (
                            <div key={idx} className="sidebar-section">
                                <div className="sidebar-section-label">{item.label}</div>
                            </div>
                        ) : null;
                    }
                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
                        >
                            <span className="sidebar-icon">{item.icon}</span>
                            {!collapsed && <span className="sidebar-item-text">{item.label}</span>}
                        </NavLink>
                    );
                })}
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-user">
                    <div className="sidebar-avatar">
                        {user?.name?.charAt(0) || 'U'}
                    </div>
                    {!collapsed && (
                        <div className="sidebar-user-info">
                            <div className="sidebar-user-name">{user?.name}</div>
                            <div className="sidebar-user-role">{user?.role}</div>
                        </div>
                    )}
                </div>
                {!collapsed && (
                    <button className="sidebar-logout" onClick={logout}>
                        ↪ Sign Out
                    </button>
                )}
            </div>
        </aside>
    );
}
