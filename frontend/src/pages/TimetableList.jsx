import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function TimetableList() {
    const [timetables, setTimetables] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => { load(); }, []);

    const load = async () => {
        try {
            const res = await api.get('/timetable');
            setTimetables(res.data);
        } catch (e) {
            console.error('Failed to load timetables', e);
        } finally {
            setLoading(false);
        }
    };

    const remove = async (id) => {
        if (!confirm('Delete this timetable?')) return;
        try {
            await api.delete(`/timetable/${id}`);
            load();
        } catch (e) {
            alert(e.response?.data?.error || 'Delete failed');
        }
    };

    const toggleLock = async (id, currentLocked) => {
        try {
            await api.put(`/timetable/${id}/lock`, { isLocked: !currentLocked });
            load();
        } catch (e) {
            alert(e.response?.data?.error || 'Lock action failed');
        }
    };

    const publishTimetable = async (id, currentPublished) => {
        if (!confirm(currentPublished
            ? 'Re-publish and sync reservations?'
            : 'Publish this timetable? This will synchronize constraints for other departments.')) return;
        try {
            await api.put(`/timetable/${id}/publish`);
            load();
        } catch (e) {
            alert(e.response?.data?.error || 'Publish action failed');
        }
    };

    if (loading) return <div className="loading-overlay"><div className="spinner"></div><div className="loading-text">Loading timetables...</div></div>;

    // Split into own-dept timetables vs other-dept published timetables
    const isOtherDept = tt => user?.role === 'department_user'
        && tt.departmentId
        && tt.departmentId !== user?.departmentId
        && tt.isPublished;

    const ownTimetables = timetables.filter(tt => !isOtherDept(tt));
    const crossDeptTimetables = timetables.filter(tt => isOtherDept(tt));

    const renderCard = (tt) => {
        const canManage = user?.role === 'admin'
            || (user?.role === 'department_user' && tt.departmentId === user?.departmentId);
        const otherDept = isOtherDept(tt);

        return (
            <div
                key={tt.id}
                className="card"
                style={{
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderLeft: otherDept ? '3.5px solid var(--primary-200)' : (tt.isPublished ? '3.5px solid var(--primary)' : '3.5px solid var(--border)'),
                    transition: 'box-shadow 0.2s, border-color 0.2s'
                }}
                onClick={() => navigate(`/timetable/${tt.id}`)}
            >
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                            {tt.name}
                        </h3>
                        {tt.isLocked && (
                            <span style={{ fontSize: 11, background: 'var(--gold-l)', color: 'var(--navy)', border: '1px solid var(--gold)', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                                Locked
                            </span>
                        )}
                        {tt.isPublished && (
                            <span style={{ fontSize: 11, background: 'var(--primary-50)', color: 'var(--primary-600)', border: '1px solid var(--primary-200)', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                                Published
                            </span>
                        )}
                        {/* Department badge */}
                        {tt.departmentName && (
                            <span style={{
                                fontSize: 11,
                                background: otherDept ? 'var(--primary-50)' : 'var(--gold-l)',
                                color: otherDept ? 'var(--primary-color)' : 'var(--navy)',
                                border: otherDept ? '1px solid var(--primary-200)' : '1px solid var(--gold)',
                                padding: '2px 9px',
                                borderRadius: 12,
                                fontWeight: 700,
                                letterSpacing: '0.3px'
                            }}>
                                {tt.departmentCode || tt.departmentName}
                            </span>
                        )}
                        {!tt.departmentName && user?.role === 'admin' && (
                            <span style={{ fontSize: 11, background: 'var(--bg-color)', color: 'var(--text-secondary)', border: '1px solid var(--border)', padding: '2px 9px', borderRadius: 12, fontWeight: 600 }}>
                                Institution-wide
                            </span>
                        )}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        {otherDept
                            ? `Published by ${tt.departmentName} — you can edit/modify your department's slots in this timetable`
                            : (tt.description || 'No description')}
                    </p>
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                        <span className="badge badge-theory">{tt.entryCount} entries</span>
                        {tt.conflictCount > 0 && (
                            <span
                                className="badge badge-danger"
                                title={`${tt.conflictCount} subject(s) could not be scheduled due to hard constraints.`}
                            >
                                {tt.conflictCount} unscheduled
                            </span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Generated: {new Date(tt.generatedAt).toLocaleDateString()} {new Date(tt.generatedAt).toLocaleTimeString()}
                        </span>
                    </div>
                </div>
                <div className="btn-group" onClick={e => e.stopPropagation()} style={{ flexShrink: 0, marginLeft: 16 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => navigate(`/timetable/${tt.id}`)}>
                        View & Edit →
                    </button>
                    {canManage && (
                        <>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => toggleLock(tt.id, tt.isLocked)}
                                title={tt.isLocked ? 'Unlock timetable' : 'Lock timetable'}
                            >
                                {tt.isLocked ? 'Unlock' : 'Lock'}
                            </button>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => publishTimetable(tt.id, tt.isPublished)}
                                title="Publish timetable"
                            >
                                {tt.isPublished ? 'Re-Publish' : 'Publish'}
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => remove(tt.id)}>Delete</button>
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="fade-in">
            <div className="table-header">
                <div>
                    <h1 className="page-title">Generated Timetables</h1>
                    <p className="page-subtitle">View and manage generated timetables</p>
                </div>
                <a href="/generate" className="btn btn-primary">Generate New</a>
            </div>

            {/* Own department timetables */}
            {ownTimetables.length === 0 && crossDeptTimetables.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon"></div>
                    <h3>No timetables yet</h3>
                    <p>Use the Generation Wizard to create your first timetable.</p>
                </div>
            ) : (
                <>
                    {ownTimetables.length > 0 && (
                        <div style={{ marginBottom: 32 }}>
                            {user?.role === 'department_user' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                    <div style={{ width: 3, height: 18, background: 'var(--primary)', borderRadius: 2 }} />
                                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        My Department Timetables
                                    </span>
                                </div>
                            )}
                            <div style={{ display: 'grid', gap: 16 }}>
                                {ownTimetables.map(tt => renderCard(tt))}
                            </div>
                        </div>
                    )}

                    {/* Cross-department published timetables */}
                    {crossDeptTimetables.length > 0 && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                <div style={{ width: 3, height: 18, background: 'var(--primary-color)', borderRadius: 2 }} />
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Published by Other Departments
                                </span>
                                <span style={{ fontSize: 11, background: 'var(--primary-50)', color: 'var(--primary-600)', border: '1px solid var(--primary-200)', padding: '2px 9px', borderRadius: 12, fontWeight: 600 }}>
                                    Joint Editing • Edit own classes, respect other dept's slots
                                </span>
                            </div>
                            <div style={{
                                padding: '14px 16px',
                                background: 'var(--primary-50)',
                                border: '1px solid var(--primary-200)',
                                borderRadius: 10,
                                marginBottom: 14,
                                fontSize: 13,
                                color: 'var(--text-secondary)'
                            }}>
                                Note: These timetables are published by other departments. You can view their <strong>faculty</strong> and <strong>lab</strong> schedules to understand availability, and <strong>edit/modify</strong> slots for your own department's classes.
                                {ownTimetables.filter(t => t.isPublished).length === 0 && (
                                    <span style={{ marginLeft: 6, color: 'var(--primary-600)', fontWeight: 600 }}>
                                        — Generate & Publish your own timetable to appear in other departments' lists.
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'grid', gap: 16 }}>
                                {crossDeptTimetables.map(tt => renderCard(tt))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
