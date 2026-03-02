import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToast, ToastContainer } from '../components/Toast';
import { exportClassPDF, exportFacultyPDF } from '../utils/pdfExport';

export default function TimetableView() {
    const { id } = useParams();
    const { user } = useAuth();
    const { toasts, addToast, removeToast } = useToast();

    const [timetable, setTimetable] = useState(null);
    const [classes, setClasses] = useState([]);
    const [faculty, setFaculty] = useState([]);
    const [viewMode, setViewMode] = useState('class'); // 'class' | 'faculty'
    const [selectedId, setSelectedId] = useState('');
    const [viewData, setViewData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [swapMode, setSwapMode] = useState(false);
    const [swapFirst, setSwapFirst] = useState(null);

    useEffect(() => { loadBase(); }, [id]);

    const loadBase = async () => {
        const [tt, cls, fac] = await Promise.all([
            api.get(`/timetable/${id}`),
            api.get('/classes'),
            api.get('/faculty')
        ]);
        setTimetable(tt.data);
        setClasses(cls.data);
        setFaculty(fac.data);
        setLoading(false);

        // Auto-select first class
        if (cls.data.length > 0) {
            setSelectedId(cls.data[0].id);
        }
    };

    useEffect(() => {
        if (selectedId && id) loadView();
    }, [selectedId, viewMode, id]);

    const loadView = async () => {
        try {
            const endpoint = viewMode === 'class'
                ? `/timetable/${id}/class-view/${selectedId}`
                : `/timetable/${id}/faculty-view/${selectedId}`;
            const res = await api.get(endpoint);
            setViewData(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const switchView = (mode) => {
        setViewMode(mode);
        if (mode === 'class' && classes.length > 0) {
            setSelectedId(classes[0].id);
        } else if (mode === 'faculty' && faculty.length > 0) {
            setSelectedId(faculty[0].id);
        }
        setSwapMode(false);
        setSwapFirst(null);
    };

    const handleSlotClick = (entry, entryIndex) => {
        if (!swapMode || user?.role !== 'admin') return;
        if (entry.isFixed) { addToast('Cannot swap fixed slots', 'error'); return; }

        if (swapFirst === null) {
            setSwapFirst(entryIndex);
            addToast('Select second slot to swap with');
        } else {
            performSwap(swapFirst, entryIndex);
        }
    };

    const performSwap = async (idx1, idx2) => {
        try {
            await api.put(`/timetable/${id}/swap`, { entryIndex1: idx1, entryIndex2: idx2 });
            addToast('Slots swapped successfully!');
            setSwapFirst(null);
            setSwapMode(false);
            await loadBase();
            loadView();
        } catch (err) {
            addToast(err.response?.data?.error || 'Swap failed', 'error');
            setSwapFirst(null);
        }
    };

    const handleExportPDF = () => {
        if (!viewData) return;
        if (viewMode === 'class') {
            exportClassPDF(viewData);
        } else {
            exportFacultyPDF(viewData);
        }
        addToast('PDF exported!');
    };

    if (loading) return <div className="loading-overlay"><div className="spinner"></div><div className="loading-text">Loading timetable...</div></div>;

    // Build the grid
    const renderGrid = () => {
        if (!viewData) return <div className="empty-state"><p>Select a {viewMode === 'class' ? 'class' : 'faculty member'} to view</p></div>;

        const config = viewMode === 'class' ? viewData.timeSlotConfig : viewData.timeSlotConfigs?.[0];
        if (!config) return <div className="empty-state"><p>No time slot configuration found</p></div>;

        const days = config.days;
        const slots = config.slots;
        const entries = viewData.entries;

        // Build lookup: day -> slotIndex -> entry
        const lookup = {};
        entries.forEach((e, idx) => {
            const key = `${e.day}-${e.slotIndex}`;
            if (!lookup[key]) lookup[key] = [];
            lookup[key].push({
                ...e, _idx: timetable.entries.findIndex(te =>
                    te.classId === e.classId && te.subjectId === e.subjectId && te.day === e.day && te.slotIndex === e.slotIndex
                )
            });
        });

        return (
            <div className="timetable-grid">
                <table className="timetable-table">
                    <thead>
                        <tr>
                            <th style={{ width: 80 }}>Time</th>
                            {days.map(day => (
                                <th key={day} className="timetable-day-header">{day}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {slots.map((slot, slotIdx) => {
                            if (slot.type === 'break') {
                                return (
                                    <tr key={slotIdx}>
                                        <td><span className="slot-time">{slot.start}-{slot.end}</span></td>
                                        {days.map(day => (
                                            <td key={day}><div className="timetable-slot break-slot">☕ Break</div></td>
                                        ))}
                                    </tr>
                                );
                            }
                            if (slot.type === 'lunch') {
                                return (
                                    <tr key={slotIdx}>
                                        <td><span className="slot-time">{slot.start}-{slot.end}</span></td>
                                        {days.map(day => (
                                            <td key={day}><div className="timetable-slot lunch-slot">🍽️ Lunch</div></td>
                                        ))}
                                    </tr>
                                );
                            }

                            return (
                                <tr key={slotIdx}>
                                    <td><span className="slot-time">{slot.start}-{slot.end}</span></td>
                                    {days.map(day => {
                                        const key = `${day}-${slotIdx}`;
                                        const cellEntries = lookup[key] || [];

                                        // Check if this slot is part of a lab that started earlier
                                        const prevKey = `${day}-${slotIdx - 1}`;
                                        const prevEntries = lookup[prevKey] || [];
                                        const isLabContinuation = prevEntries.some(e => e.isLab);

                                        if (cellEntries.length === 0 && isLabContinuation) {
                                            return <td key={day} style={{ opacity: 0.5 }}><div className="timetable-slot lab" style={{ opacity: 0.6 }}><div className="slot-subject" style={{ fontSize: 10 }}>↕ Lab cont.</div></div></td>;
                                        }

                                        if (cellEntries.length === 0) {
                                            return <td key={day}></td>;
                                        }

                                        const entry = cellEntries[0];
                                        return (
                                            <td key={day}>
                                                <div
                                                    className={`timetable-slot ${entry.isLab ? 'lab' : 'theory'} ${swapMode && swapFirst === entry._idx ? 'swap-highlight' : ''}`}
                                                    onClick={() => handleSlotClick(entry, entry._idx)}
                                                    title={`${entry.subjectName} (${entry.subjectCode})\nFaculty: ${entry.facultyName}${entry.labFaculty2Name ? ' + ' + entry.labFaculty2Name : ''}\nRoom: ${entry.roomName}`}
                                                >
                                                    <div className="slot-subject">{entry.subjectCode || entry.subjectName}</div>
                                                    <div className="slot-faculty">
                                                        {viewMode === 'class' ? entry.facultyName : entry.className}
                                                        {entry.labFaculty2Name && ` + ${entry.labFaculty2Name}`}
                                                    </div>
                                                    <div className="slot-room">{entry.roomName}</div>
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="fade-in">
            <ToastContainer toasts={toasts} removeToast={removeToast} />

            <div className="table-header">
                <div>
                    <h1 className="page-title">📅 {timetable?.name}</h1>
                    <p className="page-subtitle">{timetable?.description || 'Generated timetable view'}</p>
                </div>
                <div className="btn-group">
                    {user?.role === 'admin' && (
                        <button
                            className={`btn ${swapMode ? 'btn-danger' : 'btn-secondary'}`}
                            onClick={() => { setSwapMode(!swapMode); setSwapFirst(null); }}
                        >
                            {swapMode ? '✕ Cancel Swap' : '🔄 Swap Slots'}
                        </button>
                    )}
                    <button className="btn btn-primary" onClick={handleExportPDF}>📄 Export PDF</button>
                </div>
            </div>

            {/* View toggle */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="view-toggle">
                    <button className={`view-toggle-btn ${viewMode === 'class' ? 'active' : ''}`} onClick={() => switchView('class')}>
                        🎓 Class View
                    </button>
                    <button className={`view-toggle-btn ${viewMode === 'faculty' ? 'active' : ''}`} onClick={() => switchView('faculty')}>
                        👨‍🏫 Faculty View
                    </button>
                </div>

                <select className="form-select" style={{ width: 250 }} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                    {viewMode === 'class'
                        ? classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                        : faculty.map(f => <option key={f.id} value={f.id}>{f.name}</option>)
                    }
                </select>
            </div>

            {swapMode && (
                <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
                    🔄 <strong>Swap Mode:</strong> {swapFirst !== null ? 'Now click the second slot to swap with.' : 'Click on the first slot you want to swap.'}
                </div>
            )}

            {renderGrid()}

            {/* Conflicts */}
            {timetable?.conflicts?.length > 0 && (
                <div style={{ marginTop: 24 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--danger)' }}>⚠ Unresolved Conflicts ({timetable.conflicts.length})</h3>
                    <div className="conflict-list">
                        {timetable.conflicts.map((c, idx) => (
                            <div key={idx} className="conflict-item">
                                ⚠ <strong>{c.className || c.classId}</strong> — {c.subjectName || c.subjectId}: {c.reason}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
