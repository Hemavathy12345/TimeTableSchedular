import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import sriEshwarLogo from '../assets/sri_eshwar_logo.png';

// Simple inline SVG icons — clean, no emoji
const Icon = ({ d, size = 16, stroke = false }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={stroke ? 'none' : 'currentColor'}
        stroke={stroke ? 'currentColor' : 'none'} strokeWidth={stroke ? 1.8 : 0}
        strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d={d} />
    </svg>
);

const NAV_ITEMS = [
    {
        path: '/dashboard', label: 'Dashboard', roles: ['admin', 'department_user'],
        iconD: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
        stroke: true
    },
    { type: 'section', label: 'Data Management', roles: ['admin', 'department_user'] },
    {
        path: '/departments', label: 'Departments', roles: ['admin', 'department_user'],
        iconD: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
        stroke: true
    },
    {
        path: '/faculty', label: 'Faculty', roles: ['admin', 'department_user'],
        iconD: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
        stroke: true
    },
    {
        path: '/rooms', label: 'Rooms & Labs', roles: ['admin', 'department_user'],
        iconD: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z',
        stroke: true
    },
    {
        path: '/subjects', label: 'Subjects', roles: ['admin', 'department_user'],
        iconD: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
        stroke: true
    },
    {
        path: '/classes', label: 'Classes', roles: ['admin', 'department_user'],
        iconD: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z',
        stroke: true
    },
    {
        path: '/timeslots', label: 'Time Slots', roles: ['admin', 'department_user'],
        iconD: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
        stroke: true
    },
    {
        path: '/coe-schedule', label: 'COE Schedule', roles: ['admin', 'department_user'],
        iconD: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
        stroke: true
    },
    { type: 'section', label: 'Scheduling', roles: ['admin', 'department_user'] },
    {
        path: '/generate', label: 'Generate Timetable', roles: ['admin', 'department_user'],
        iconD: 'M13 10V3L4 14h7v7l9-11h-7z',
        stroke: true
    },
    {
        path: '/timetables', label: 'View Timetables', roles: ['admin', 'department_user'],
        iconD: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
        stroke: true
    },
    { type: 'section', label: 'Administration', roles: ['admin'] },
    {
        path: '/users', label: 'User Accounts', roles: ['admin'],
        iconD: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
        stroke: true
    },
    {
        path: '/audit-logs', label: 'Audit Logs', roles: ['admin'],
        iconD: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
        stroke: true
    },
];

export default function Sidebar() {
    const [collapsed, setCollapsed] = useState(false);
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [deptName, setDeptName] = useState('');

    useEffect(() => {
        if (user?.departmentId) {
            api.get('/departments').then(res => {
                const dept = res.data.find(d => d.id === user.departmentId);
                if (dept) setDeptName(dept.name);
            }).catch(() => {});
        }
    }, [user?.departmentId]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const visibleItems = NAV_ITEMS.filter(item => {
        if (!item.roles) return true;
        if (!user) return false;
        return item.roles.includes(user.role);
    });

    const initials = user?.name
        ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
        : '?';

    const roleLabel = user?.role === 'admin' ? 'Administrator' : 'Dept. User';

    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
            {/* Header */}
            <div className="sidebar-header">
                <img src={sriEshwarLogo} alt="SE Logo" className="sidebar-logo" />
                {!collapsed && (
                    <div>
                        <div className="sidebar-title">Sri Eshwar</div>
                        <div className="sidebar-subtitle">Timetable System</div>
                    </div>
                )}
            </div>

            {/* Collapse toggle */}
            <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
                {collapsed ? '›' : '‹'}
            </button>

            {/* User info */}
            {!collapsed && user && (
                <div style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(0,0,0,0.15)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{
                            width: 30, height: 30, borderRadius: '50%',
                            background: 'rgba(255,198,0,0.18)',
                            border: '1.5px solid #ffc600',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#ffc600', fontWeight: 800, fontSize: 12, flexShrink: 0
                        }}>
                            {initials}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {user.name}
                            </div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>
                                {roleLabel}{deptName ? ` — ${deptName}` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Navigation */}
            <nav className="sidebar-nav">
                {visibleItems.map((item, idx) => {
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
                            title={collapsed ? item.label : ''}
                        >
                            <span className="sidebar-icon">
                                <Icon d={item.iconD} size={15} stroke={item.stroke} />
                            </span>
                            {!collapsed && (
                                <span className="sidebar-item-text">{item.label}</span>
                            )}
                        </NavLink>
                    );
                })}
            </nav>

            {/* Logout */}
            <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 'auto' }}>
                <button
                    onClick={handleLogout}
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: collapsed ? '8px 0' : '8px 12px',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        background: 'none',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 5,
                        cursor: 'pointer',
                        color: 'rgba(255,255,255,0.5)',
                        fontSize: 12,
                        fontWeight: 600,
                        transition: 'background 0.15s, color 0.15s',
                        fontFamily: 'inherit'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#fc8181'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
                    title="Logout"
                >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    {!collapsed && <span>Sign Out</span>}
                </button>
            </div>
        </aside>
    );
}
