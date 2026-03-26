import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToast, ToastContainer } from '../components/Toast';
import { exportClassPDF, exportFacultyPDF } from '../utils/pdfExport';

export default function TimetableView() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { toasts, addToast, removeToast } = useToast();

    const [timetable, setTimetable] = useState(null);
    const [classes, setClasses] = useState([]);
    const [faculty, setFaculty] = useState([]);
    const [subjects, setSubjects] = useState([]); // Added
    const [rooms, setRooms] = useState([]);       // Added
    const [viewMode, setViewMode] = useState('class'); // 'class' | 'faculty' | 'lab' | 'summary'
    const [selectedId, setSelectedId] = useState('');
    const [viewData, setViewData] = useState(null);
    const [allocationSummary, setAllocationSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);     // Added
    const [swapMode, setSwapMode] = useState(false);
    const [swapFirst, setSwapFirst] = useState(null);

    useEffect(() => { loadBase(); }, [id]);

    const loadBase = async () => {
        try {
            const [ttRes, clsRes, facRes, subRes, roomRes] = await Promise.all([
                api.get(`/timetable/${id}`),
                api.get('/classes'),
                api.get('/faculty'),
                api.get('/subjects'),
                api.get('/rooms')
            ]);
            setTimetable(ttRes.data);
            setClasses(clsRes.data);
            setFaculty(facRes.data);
            setSubjects(subRes.data);
            setRooms(roomRes.data);

            // Auto-select first class if nothing selected
            if (clsRes.data.length > 0 && !selectedId) {
                setSelectedId(clsRes.data[0].id);
            }

            // Load allocation summary
            try {
                const sumRes = await api.get(`/timetable/${id}/allocation-summary`);
                setAllocationSummary(sumRes.data);
            } catch (e) { /* summary optional */ }

            setLoading(false);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load timetable base data');
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedId && id) {
            setViewData(null); // Clear previous to avoid stale display
            loadView();
        }
    }, [selectedId, viewMode, id]);

    const loadView = async () => {
        if (!selectedId) return;
        try {
            let endpoint;
            if (viewMode === 'class') endpoint = `/timetable/${id}/class-view/${selectedId}`;
            else if (viewMode === 'faculty') endpoint = `/timetable/${id}/faculty-view/${selectedId}`;
            else if (viewMode === 'lab') endpoint = `/timetable/${id}/room-view/${selectedId}`;
            else return; // summary has no per-entity view
            const res = await api.get(endpoint);
            setViewData(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const switchView = (mode) => {
        if (mode === viewMode) return;
        setViewMode(mode);
        setViewData(null); // Explicit clear
        const labRooms = rooms.filter(r => r.type === 'lab');
        if (mode === 'class' && classes.length > 0) {
            setSelectedId(classes[0].id);
        } else if (mode === 'faculty' && faculty.length > 0) {
            setSelectedId(faculty[0].id);
        } else if (mode === 'lab' && labRooms.length > 0) {
            setSelectedId(labRooms[0].id);
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
        const entityLabel = viewMode === 'class' ? 'class' : viewMode === 'faculty' ? 'faculty member' : 'lab room';
        if (!viewData) return <div className="empty-state"><p>Select a {entityLabel} to view</p></div>;

        // Special handling for lab view empty sessions
        if (viewMode === 'lab' && (!viewData.entries || viewData.entries.length === 0)) {
            return (
                <div className="empty-state" style={{ background: 'rgba(6,182,212,0.02)', border: '2px dashed rgba(6,182,212,0.1)', borderRadius: 12 }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🧪</div>
                    <h3>No lab sessions scheduled</h3>
                    <p style={{ maxWidth: 350, margin: '8px auto', fontSize: 13, color: 'var(--text-secondary)' }}>
                        This lab room is currently free or only contains theory classes which are filtered out of this view.
                    </p>
                </div>
            );
        }

        const config = (viewMode === 'class' || viewMode === 'lab') ? viewData.timeSlotConfig : viewData.timeSlotConfigs?.[0];
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
                                            <td key={day}><div className="timetable-slot break-slot">Break</div></td>
                                        ))}
                                    </tr>
                                );
                            }
                            if (slot.type === 'lunch') {
                                return (
                                    <tr key={slotIdx}>
                                        <td><span className="slot-time">{slot.start}-{slot.end}</span></td>
                                        {days.map(day => (
                                            <td key={day}><div className="timetable-slot lunch-slot">Lunch</div></td>
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

                                        // Check if any multi-slot subject (Lab, Project, etc.) started earlier and covers this slot
                                        let continuation = null;
                                        for (let offset = 1; offset <= slotIdx; offset++) {
                                            const earlierEntries = lookup[`${day}-${slotIdx - offset}`] || [];
                                            continuation = earlierEntries.find(e => e.duration > offset);
                                            if (continuation) break;
                                        }

                                        if (cellEntries.length === 0 && continuation) {
                                            const typeClass = continuation.isLab ? 'lab' : (continuation.subjectType === 'project' ? 'project' : 'theory');
                                            return (
                                                <td key={day} style={{ verticalAlign: 'top', paddingTop: 0 }}>
                                                    <div className={`timetable-slot ${typeClass}`} style={{ opacity: 0.7, borderTop: 'none', borderRadius: '0 0 4px 4px', minHeight: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <div className="slot-subject" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                                            ↕ {continuation.subjectCode || 'cont.'}
                                                        </div>
                                                    </div>
                                                </td>
                                            );
                                        }

                                        if (cellEntries.length === 0) {
                                            if (slot.type === 'activity') {
                                                return <td key={day}><div className="timetable-slot activity-slot">Activity Hour</div></td>;
                                            }
                                            return <td key={day}></td>;
                                        }

                                        const entry = cellEntries[0];
                                        // Activity slot styling
                                        if (entry.isActivity) {
                                            return (
                                                <td key={day}>
                                                    <div className="timetable-slot" style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #86efac', cursor: 'default' }}
                                                        title={`Fixed Activity: ${entry.activityLabel}`}>
                                                        <div className="slot-subject" style={{ fontSize: 11, color: '#15803d' }}>📌 {entry.activityLabel}</div>
                                                    </div>
                                                </td>
                                            );
                                        }
                                        return (
                                            <td key={day}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    {cellEntries.map((entry, eIdx) => {
                                                        const isConf = !!entry.isConflict;
                                                        const typeClass = entry.isLab ? 'lab' : (entry.subjectType === 'project' ? 'project' : 'theory');
                                                        const isActive = swapMode && (swapFirst === entry._idx);

                                                        return (
                                                            <div
                                                                key={eIdx}
                                                                className={`timetable-slot ${typeClass} ${isActive ? 'swap-highlight' : ''}`}
                                                                style={{
                                                                    cursor: swapMode ? 'pointer' : 'default',
                                                                    border: isConf ? '2px solid #ef4444' : (entry.isExtra ? '1px solid #f59e0b' : undefined),
                                                                    background: isConf ? '#fee2e2' : undefined,
                                                                    minHeight: cellEntries.length > 1 ? 40 : 64,
                                                                    padding: cellEntries.length > 1 ? '4px 8px' : '10px 12px',
                                                                    position: 'relative'
                                                                }}
                                                                onClick={() => handleSlotClick(entry, entry._idx)}
                                                                title={[
                                                                    isConf ? '⚠ OVERLAP DETECTED' : '',
                                                                    `${entry.subjectName} (${entry.subjectCode})`,
                                                                    `Faculty: ${entry.facultyName}${entry.labFaculty2Name ? ' + ' + entry.labFaculty2Name : ''}`,
                                                                    `Room: ${entry.roomName}`,
                                                                    entry.isExtra ? 'Extra session (gap-fill)' : '',
                                                                    entry.schedulingNote ? `Note: ${entry.schedulingNote}` : ''
                                                                ].filter(Boolean).join('\n')}
                                                            >
                                                                {isConf && (
                                                                    <div style={{ position: 'absolute', top: 2, right: 4, color: '#ef4444', fontSize: 9, fontWeight: 'bold' }}>
                                                                        ⚠ OVERLAP
                                                                    </div>
                                                                )}
                                                                <div className="slot-subject">
                                                                    {entry.subjectCode || entry.subjectName}
                                                                    {entry.isExtra && <span style={{ fontSize: 9, marginLeft: 3, color: '#f59e0b', fontWeight: 700 }}>+</span>}
                                                                </div>
                                                                <div className="slot-faculty">
                                                                    {viewMode === 'lab'
                                                                        ? `${entry.className} · ${entry.facultyName}`
                                                                        : viewMode === 'class'
                                                                            ? entry.facultyName
                                                                            : entry.className
                                                                    }
                                                                    {entry.labFaculty2Name && ` + ${entry.labFaculty2Name}`}
                                                                </div>
                                                                {viewMode !== 'lab' && <div className="slot-room">{entry.roomName}</div>}
                                                            </div>
                                                        );
                                                    })}
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
                    <h1 className="page-title">{timetable?.name}</h1>
                    <p className="page-subtitle">{timetable?.description || 'Generated timetable view'}</p>
                </div>
                <div className="btn-group">
                    {user?.role === 'admin' && (
                        <button
                            className={`btn ${swapMode ? 'btn-danger' : 'btn-secondary'}`}
                            onClick={() => { setSwapMode(!swapMode); setSwapFirst(null); }}
                        >
                            {swapMode ? '✕ Cancel Swap' : 'Swap Slots'}
                        </button>
                    )}
                    <button
                        className="btn btn-secondary"
                        onClick={() => navigate(`/timetable/${id}/faculty-overview`)}
                        title="View all faculty schedules and detect overlaps"
                    >
                        Faculty Overview
                    </button>
                    <button className="btn btn-primary" onClick={handleExportPDF}>Export PDF</button>
                </div>
            </div>

            {/* View toggle */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="view-toggle">
                    <button className={`view-toggle-btn ${viewMode === 'class' ? 'active' : ''}`} onClick={() => switchView('class')}>
                        Class View
                    </button>
                    <button className={`view-toggle-btn ${viewMode === 'faculty' ? 'active' : ''}`} onClick={() => switchView('faculty')}>
                        Faculty View
                    </button>
                    <button className={`view-toggle-btn ${viewMode === 'lab' ? 'active' : ''}`} onClick={() => switchView('lab')}>
                        Lab View
                    </button>
                    <button className={`view-toggle-btn ${viewMode === 'summary' ? 'active' : ''}`} onClick={() => switchView('summary')}
                        style={{ borderLeft: '2px solid var(--border-color)' }}>
                        Allocation Summary
                    </button>
                </div>

                {viewMode !== 'summary' && (
                    <select className="form-select" style={{ width: 250 }} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                        {viewMode === 'class'
                            ? classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                            : viewMode === 'faculty'
                                ? faculty.map(f => <option key={f.id} value={f.id}>{f.name}</option>)
                                : rooms.filter(r => r.type === 'lab').map(r => (
                                    <option key={r.id} value={r.id}>{r.name} (Cap: {r.capacity || '—'})</option>
                                ))
                        }
                    </select>
                )}
                {viewMode === 'lab' && viewData && (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ background: 'rgba(6,182,212,0.12)', color: 'rgba(6,182,212,1)', padding: '2px 10px', borderRadius: 999, fontWeight: 600 }}>
                            Lab View
                        </span>
                        {viewData.roomCapacity ? `Capacity: ${viewData.roomCapacity}` : ''}
                    </span>
                )}
            </div>

            {swapMode && (
                <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
                    <strong>Swap Mode:</strong> {swapFirst !== null ? 'Now click the second slot to swap with.' : 'Click on the first slot you want to swap.'}
                </div>
            )}

            {viewMode === 'summary' ? (
                <div>
                    {allocationSummary ? (
                        <>
                            {/* Totals bar */}
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                                {[
                                    { label: 'Total Allocated', value: allocationSummary.totals?.totalAllocated, color: '#6366f1' },
                                    { label: 'Subject Periods', value: allocationSummary.totals?.subjectPeriods, color: '#0ea5e9' },
                                    { label: 'Fixed Activities', value: allocationSummary.totals?.fixedPeriods, color: '#22c55e' },
                                    { label: 'Remaining / 42', value: allocationSummary.totals?.remaining, color: allocationSummary.totals?.remaining < 0 ? '#ef4444' : '#f59e0b' },
                                ].map(stat => (
                                    <div key={stat.label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '16px 22px', minWidth: 140, boxShadow: 'var(--shadow-sm)' }}>
                                        <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value ?? '—'}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{stat.label}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="data-table-wrapper">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Course Title</th>
                                            <th>Course Code</th>
                                            <th>Allocated Periods/Week</th>
                                            <th>Scheduling Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allocationSummary.summary?.map((row, i) => (
                                            <tr key={i}>
                                                <td style={{ fontWeight: 600 }}>{row.courseTitle}</td>
                                                <td><code style={{ fontSize: 12 }}>{row.courseCode}</code></td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '2px 10px', borderRadius: 12, fontWeight: 600, fontSize: 13 }}>{row.allocatedPeriods}</span>
                                                </td>
                                                <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 300 }}>{row.schedulingNote}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <div className="empty-state"><p>No allocation summary available. Generate a timetable first.</p></div>
                    )}
                </div>
            ) : (
                <>{renderGrid()}</>
            )}


        </div>
    );
}
