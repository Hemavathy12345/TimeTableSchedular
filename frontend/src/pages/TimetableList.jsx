import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

export default function TimetableList() {
    const [timetables, setTimetables] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => { load(); }, []);

    const load = async () => {
        const res = await api.get('/timetable');
        setTimetables(res.data);
        setLoading(false);
    };

    const remove = async (id) => {
        if (!confirm('Delete this timetable?')) return;
        await api.delete(`/timetable/${id}`);
        load();
    };

    if (loading) return <div className="loading-overlay"><div className="spinner"></div><div className="loading-text">Loading timetables...</div></div>;

    return (
        <div className="fade-in">
            <div className="table-header">
                <div>
                    <h1 className="page-title">📅 Generated Timetables</h1>
                    <p className="page-subtitle">View and manage generated timetables</p>
                </div>
                <a href="/generate" className="btn btn-primary">⚡ Generate New</a>
            </div>

            {timetables.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📅</div>
                    <h3>No timetables yet</h3>
                    <p>Use the Generation Wizard to create your first timetable.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: 16 }}>
                    {timetables.map(tt => (
                        <div key={tt.id} className="card" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onClick={() => navigate(`/timetable/${tt.id}`)}>
                            <div>
                                <h3 style={{ fontSize: 16, fontWeight: 600 }}>{tt.name}</h3>
                                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                                    {tt.description || 'No description'}
                                </p>
                                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                                    <span className="badge badge-theory">{tt.entryCount} entries</span>
                                    {tt.conflictCount > 0 && <span className="badge badge-danger">{tt.conflictCount} conflicts</span>}
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        Generated: {new Date(tt.generatedAt).toLocaleDateString()} {new Date(tt.generatedAt).toLocaleTimeString()}
                                    </span>
                                </div>
                            </div>
                            <div className="btn-group">
                                <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); navigate(`/timetable/${tt.id}`); }}>View →</button>
                                <button className="btn btn-danger btn-sm" onClick={e => { e.stopPropagation(); remove(tt.id); }}>🗑</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
