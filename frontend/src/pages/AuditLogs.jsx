import { useState, useEffect } from 'react';
import api from '../utils/api';

export default function AuditLogs() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState('');

    useEffect(() => { loadLogs(); }, []);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const res = await api.get('/audit-logs');
            setLogs(res.data);
        } catch (err) {
            console.error('Failed to load audit logs', err);
        }
        setLoading(false);
    };

    const filtered = logs.filter(l => {
        const matchesSearch = !filter || l.action?.toLowerCase().includes(filter.toLowerCase()) || l.username?.toLowerCase().includes(filter.toLowerCase());
        const matchesRole = !roleFilter || l.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    const roleBadge = (role) => {
        if (role === 'admin') return (
            <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>Admin</span>
        );
        if (role === 'department_user') return (
            <span style={{ background: '#ede9fe', color: '#5b21b6', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>Dept User</span>
        );
        return <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>{role}</span>;
    };

    if (loading) return <div className="loading-overlay"><div className="spinner"></div><div className="loading-text">Loading audit logs...</div></div>;

    return (
        <div className="fade-in">
            <div className="table-header">
                <div>
                    <h1 className="page-title">Audit Logs</h1>
                    <p className="page-subtitle">Complete history of institutional timetable changes and user actions</p>
                </div>
                <button className="btn btn-secondary" onClick={loadLogs}>↻ Refresh</button>
            </div>

            <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <input
                    className="form-input"
                    style={{ width: 260 }}
                    placeholder="Search by action or username..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                />
                <select className="form-select" style={{ width: 160 }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                    <option value="">All Roles</option>
                    <option value="admin">Admin</option>
                    <option value="department_user">Department User</option>
                </select>
                <div style={{ marginLeft: 'auto', fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center' }}>
                    {filtered.length} records
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon" style={{ opacity: 0.35 }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                        </svg>
                    </div>
                    <h3>No audit logs found</h3>
                    <p>Logs will appear here once users take actions.</p>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="data-table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>User</th>
                                    <th>Role</th>
                                    <th>Action</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((log, idx) => (
                                    <tr key={log.id || idx}>
                                        <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                                            {new Date(log.timestamp || log.createdAt).toLocaleString('en-IN', {
                                                day: '2-digit', month: 'short', year: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                            })}
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600, fontSize: 13 }}>{log.username}</div>
                                            {log.departmentId && <div style={{ fontSize: 11, color: '#94a3b8' }}>Dept: {log.departmentId}</div>}
                                        </td>
                                        <td>{roleBadge(log.role)}</td>
                                        <td style={{ fontSize: 13, maxWidth: 280 }}>{log.action}</td>
                                        <td style={{ fontSize: 12, color: '#64748b', maxWidth: 200 }}>
                                            {log.details && Object.keys(log.details).length > 0 ? (
                                                <code style={{ background: '#f8fafc', padding: '2px 4px', borderRadius: 4, fontSize: 11, wordBreak: 'break-all' }}>
                                                    {JSON.stringify(log.details).slice(0, 80)}{JSON.stringify(log.details).length > 80 ? '...' : ''}
                                                </code>
                                            ) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
