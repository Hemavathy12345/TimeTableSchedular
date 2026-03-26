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
        if ((mode === 'class' || mode === 'summary') && classes.length > 0) {
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

        const configs = viewMode === 'faculty' 
            ? (viewData.timeSlotConfigs || []) 
            : [viewData.timeSlotConfig].filter(Boolean);

        if (configs.length === 0) return <div className="empty-state"><p>No time slot configuration found</p></div>;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
                {configs.map((config, configIdx) => {
                    const days = config.days;
                    const slots = config.slots;
                    
                    // Filter entries for this specific config's year
                    const filteredEntries = viewMode === 'faculty' 
                        ? viewData.entries.filter(e => Number(e.classYear) === Number(config.year))
                        : viewData.entries;

                    if (viewMode === 'faculty' && filteredEntries.length === 0 && configs.length > 1) return null;

                    // Build lookup: day -> slotIndex -> entry
                    const lookup = {};
                    filteredEntries.forEach((e) => {
                        const key = `${e.day}-${e.slotIndex}`;
                        if (!lookup[key]) lookup[key] = [];
                        lookup[key].push({
                            ...e, _idx: timetable.entries.findIndex(te =>
                                te.classId === e.classId && te.subjectId === e.subjectId && te.day === e.day && te.slotIndex === e.slotIndex
                            )
                        });
                    });

                    return (
                        <div key={config.id || configIdx} className="card" style={{ padding: '24px', marginBottom: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                            {configs.length > 1 && (
                                <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 4, height: 24, background: '#1a73e8', borderRadius: 2 }}></div>
                                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#333' }}>
                                        Schedule for Year {config.year} Configuration
                                    </h3>
                                    <span style={{ fontSize: 12, color: '#666', background: '#f0f0f0', padding: '2px 8px', borderRadius: 4 }}>
                                        {slots.filter(s => s.type === 'class').length} classes per day
                                    </span>
                                </div>
                            )}
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

                                                        return (
                                                            <td key={day}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    {cellEntries.map((entry, eIdx) => {
                                                                        if (entry.isActivity) {
                                                                            return (
                                                                                <div key={eIdx} className="timetable-slot" style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #86efac', cursor: 'default' }}
                                                                                    title={`Fixed Activity: ${entry.activityLabel}`}>
                                                                                    <div className="slot-subject" style={{ fontSize: 11, color: '#15803d' }}>📌 {entry.activityLabel}</div>
                                                                                </div>
                                                                            );
                                                                        }
                                                                        
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
                        </div>
                    );
                })}
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

                {(viewMode === 'class' || viewMode === 'summary' || viewMode === 'faculty' || viewMode === 'lab') && (
                    <select className="form-select" style={{ width: 250 }} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                        {(viewMode === 'class' || viewMode === 'summary')
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
                            {/* Filter summary for selected class */}
                            {(() => {
                                const classSummary = allocationSummary.summary?.filter(s => s.classId === selectedId) || [];
                                const classTotals = {
                                    allocated: classSummary.reduce((sum, r) => sum + r.allocatedPeriods, 0),
                                    required: classSummary.reduce((sum, r) => sum + r.requiredPeriods, 0),
                                    remaining: classSummary.reduce((sum, r) => sum + r.remainingPeriods, 0)
                                };

                                return (
                                    <>
                                        {/* Class Totals bar */}
                                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                                            {[
                                                { label: 'Allocated Periods', value: classTotals.allocated, color: '#6366f1' },
                                                { label: 'Required Periods', value: classTotals.required, color: '#0ea5e9' },
                                                { label: 'Remaining to Allocate', value: classTotals.remaining, color: classTotals.remaining > 0 ? '#ef4444' : '#22c55e' },
                                                { label: 'Completion', value: classTotals.required > 0 ? `${Math.round((classTotals.allocated / classTotals.required) * 100)}%` : '0%', color: '#f59e0b' },
                                            ].map(stat => (
                                                <div key={stat.label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '16px 22px', minWidth: 140, boxShadow: 'var(--shadow-sm)' }}>
                                                    <div style={{ fontSize: 24, fontWeight: 700, color: stat.color }}>{stat.value ?? '—'}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="data-table-wrapper">
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
                                                        <th>Subject</th>
                                                        <th>Code</th>
                                                        <th>Status</th>
                                                        <th style={{ textAlign: 'center' }}>Required</th>
                                                        <th style={{ textAlign: 'center' }}>Allocated</th>
                                                        <th style={{ textAlign: 'center' }}>Remaining</th>
                                                        <th>Notes</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {classSummary.map((row, i) => (
                                                        <tr key={i} style={{ opacity: row.allocatedPeriods === 0 ? 0.7 : 1 }}>
                                                            <td>
                                                                <div style={{ fontWeight: 600 }}>{row.courseTitle}</div>
                                                            </td>
                                                            <td><code style={{ fontSize: 12 }}>{row.courseCode}</code></td>
                                                            <td>
                                                                {row.isFullyAllocated ? (
                                                                    <span style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                                                                        <span style={{ fontSize: 16 }}>✓</span> Fully Allocated
                                                                    </span>
                                                                ) : row.allocatedPeriods > 0 ? (
                                                                    <span style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                                                                        <span style={{ fontSize: 16 }}>⚠</span> Partially Allocated
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                                                                        <span style={{ fontSize: 16 }}>✕</span> Not Allocated
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td style={{ textAlign: 'center', fontWeight: 600 }}>{row.requiredPeriods}</td>
                                                            <td style={{ textAlign: 'center' }}>
                                                                <span style={{ 
                                                                    background: row.isFullyAllocated ? '#ecfdf5' : (row.allocatedPeriods > 0 ? '#fffbeb' : '#fef2f2'), 
                                                                    color: row.isFullyAllocated ? '#065f46' : (row.allocatedPeriods > 0 ? '#92400e' : '#991b1b'), 
                                                                    padding: '2px 10px', borderRadius: 12, fontWeight: 700, fontSize: 13 
                                                                }}>
                                                                    {row.allocatedPeriods}
                                                                </span>
                                                            </td>
                                                            <td style={{ textAlign: 'center', color: row.remainingPeriods > 0 ? '#ef4444' : 'inherit', fontWeight: row.remainingPeriods > 0 ? 700 : 400 }}>
                                                                {row.remainingPeriods}
                                                            </td>
                                                            <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 250 }}>{row.schedulingNote}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                );
                            })()}
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
