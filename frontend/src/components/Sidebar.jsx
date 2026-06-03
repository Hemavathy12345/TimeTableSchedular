import { useState } from 'react';
import { NavLink } from 'react-router-dom';

export default function Sidebar() {
    const [collapsed, setCollapsed] = useState(false);


    const navItems = [
        { path: '/dashboard', label: 'Dashboard', roles: ['admin', 'faculty', 'student'] },
        { type: 'section', label: 'Data Management', roles: ['admin'] },
        { path: '/departments', label: 'Departments', roles: ['admin'] },
        { path: '/faculty', label: 'Faculty', roles: ['admin'] },
        { path: '/rooms', label: 'Rooms & Labs', roles: ['admin'] },
        { path: '/subjects', label: 'Subjects', roles: ['admin'] },
        { path: '/classes', label: 'Classes', roles: ['admin'] },
        { path: '/timeslots', label: 'Time Slots', roles: ['admin'] },
        { path: '/coe-schedule', label: 'COE Schedule', roles: ['admin'] },
        { type: 'section', label: 'Scheduling', roles: ['admin'] },
        { path: '/generate', label: 'Generate Timetable', roles: ['admin'] },
        { path: '/timetables', label: 'View Timetables', roles: ['admin', 'faculty', 'student'] },
    ];

    const filteredItems = navItems;

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
        </aside>
    );
}

