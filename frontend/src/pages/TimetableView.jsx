import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToast, ToastContainer } from '../components/Toast';
import { exportClassPDF, exportFacultyPDF, exportLabPDF } from '../utils/pdfExport';
import SearchableSelect from '../components/SearchableSelect';

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
    const [replacementSlot, setReplacementSlot] = useState(null);
    const [validSubjects, setValidSubjects] = useState([]);
    const [replacementLoading, setReplacementLoading] = useState(false);
    const [hoveredSlot, setHoveredSlot] = useState(null); // { day, slotIndex }

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
        if (user?.role !== 'admin') return;

        if (swapMode) {
            if (entry.isFixed) { addToast('Cannot swap fixed slots', 'error'); return; }
            if (swapFirst === null) {
                setSwapFirst(entryIndex);
                addToast('Select second slot to swap with');
            } else {
                performSwap(swapFirst, entryIndex);
            }
        } else {
            // Replacement Mode (Only for extra sessions as requested)
            if (entry.isExtra) {
                fetchValidSubjects(entry);
            }
        }
    };

    const fetchValidSubjects = async (entry) => {
        try {
            setReplacementLoading(true);
            setReplacementSlot(entry);
            const res = await api.get(`/timetable/${id}/valid-subjects/${entry.classId}/${entry.day}/${entry.slotIndex}`);
            setValidSubjects(res.data);
            setReplacementLoading(false);
        } catch (err) {
            addToast('Failed to fetch valid subjects', 'error');
            setReplacementLoading(false);
            setReplacementSlot(null);
        }
    };

    const performReplacement = async (option) => {
        try {
            const body = {
                day: replacementSlot.day,
                slotIndex: replacementSlot.slotIndex,
                classId: replacementSlot.classId,
                subjectId: option.subjectId,
                facultyId: option.facultyId,
                labFaculty2Id: option.labFaculty2Id,
                roomId: option.roomId,
                isExtra: true
            };
            await api.put(`/timetable/${id}/replace-slot`, body);
            addToast('Slot replaced successfully');
            setReplacementSlot(null);
            await loadBase();
            loadView();
        } catch (err) {
            addToast(err.response?.data?.error || 'Replacement failed', 'error');
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
            const errorMsg = err.response?.data?.error || 'Swap failed';
            const violations = err.response?.data?.violations;
            const detail = (violations && violations.length > 0) ? `: ${violations.slice(0, 2).join('; ')}${violations.length > 2 ? '...' : ''}` : '';
            addToast(errorMsg + detail, 'error');
            setSwapFirst(null);
        }
    };

    const handleExportPDF = () => {
        if (!viewData) return;
        if (viewMode === 'class') {
            exportClassPDF(viewData);
        } else if (viewMode === 'faculty') {
            exportFacultyPDF(viewData);
        } else if (viewMode === 'lab') {
            exportLabPDF(viewData);
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
                    <div style={{ fontSize: 32, marginBottom: 12 }}></div>
                    <h3>No lab sessions scheduled</h3>
                    <p style={{ maxWidth: 350, margin: '8px auto', fontSize: 13, color: 'var(--text-secondary)' }}>
                        This lab room is currently free or only contains theory classes which are filtered out of this view.
                    </p>
                </div>
            );
        }

        const rawConfigs = (viewMode === 'faculty' || viewMode === 'lab')
            ? (viewData.timeSlotConfigs || (viewData.timeSlotConfig ? [viewData.timeSlotConfig] : []))
            : (viewData.timeSlotConfig ? [viewData.timeSlotConfig] : []);

        // Group configs by slot layout (days and slots) to merge years with identical schedules
        const groupedConfigs = [];
        rawConfigs.forEach(cfg => {
            const layoutKey = JSON.stringify({
                days: cfg.days,
                slots: cfg.slots.map(s => ({ start: s.start, end: s.end, type: s.type }))
            });
            const existing = groupedConfigs.find(g => g.layoutKey === layoutKey);
            if (existing) {
                if (!existing.years.includes(cfg.year)) existing.years.push(cfg.year);
            } else {
                groupedConfigs.push({
                    ...cfg,
                    years: [cfg.year],
                    layoutKey
                });
            }
        });

        if (groupedConfigs.length === 0) return <div className="empty-state"><p>No time slot configuration found</p></div>;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
                {groupedConfigs.map((config, configIdx) => {
                    const days = config.days;
                    const slots = config.slots;

                    // Filter entries for this specific config's year set
                    const filteredEntries = (viewMode === 'faculty' || viewMode === 'lab')
                        ? viewData.entries.filter(e => config.years.includes(Number(e.classYear)))
                        : viewData.entries;

                    if ((viewMode === 'faculty' || viewMode === 'lab') && filteredEntries.length === 0 && groupedConfigs.length > 1) return null;

                    // Build lookup: day -> slotIndex -> entry (Repeat entry for its entire duration)
                    const lookup = {};
                    filteredEntries.forEach((e) => {
                        const dur = e.duration || 1;
                        for (let d = 0; d < dur; d++) {
                            const key = `${e.day}-${e.slotIndex + d}`;
                            if (!lookup[key]) lookup[key] = [];
                            lookup[key].push({
                                ...e,
                                isContinuation: d > 0,
                                _idx: timetable.entries.findIndex(te =>
                                    te.classId === e.classId && te.subjectId === e.subjectId && te.day === e.day && te.slotIndex === e.slotIndex
                                )
                            });
                        }
                    });

                    return (
                        <div key={config.layoutKey || configIdx} className="card" style={{ padding: '24px', marginBottom: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                            {(viewMode === 'faculty' || viewMode === 'lab' || groupedConfigs.length > 1) && (
                                <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 4, height: 24, background: '#1a73e8', borderRadius: 2 }}></div>
                                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#333' }}>
                                        {config.years.length > 1 ? `Years ${config.years.sort((a, b) => a - b).join(', ')}` : `Year ${config.years[0]}`}
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
                                            <th>Day</th>
                                            {slots.map((slot, sIdx) => (
                                                <th key={sIdx}>
                                                    <div>
                                                        {slot.type === 'break' ? 'Break' : slot.type === 'lunch' ? 'Lunch' : slot.type === 'activity' ? 'Activity' : `Hour ${slots.slice(0, sIdx + 1).filter(s => s.type === 'class').length}`}
                                                    </div>
                                                    <span className="slot-time">{slot.start} - {slot.end}</span>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {days.map((day, dayIdx) => (
                                            <tr key={day}>
                                                <td>
                                                    <div className="timetable-day-label">
                                                        {day.toUpperCase().substring(0, 3)}
                                                    </div>
                                                </td>
                                                {slots.map((slot, slotIdx) => {
                                                    const key = `${day}-${slotIdx}`;
                                                    const cellEntries = lookup[key] || [];

                                                    if (slot.type === 'break') {
                                                        return <td key={slotIdx}><div className="timetable-slot break-slot">Break</div></td>;
                                                    }
                                                    if (slot.type === 'lunch') {
                                                        return <td key={slotIdx}><div className="timetable-slot lunch-slot">Lunch</div></td>;
                                                    }

                                                    if (cellEntries.length === 0) {
                                                        if (slot.type === 'activity') {
                                                            return <td key={slotIdx}><div className="timetable-slot activity-slot">Activity Hour</div></td>;
                                                        }
                                                        return <td key={slotIdx}></td>;
                                                    }

                                                    return (
                                                        <td key={slotIdx}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                                                                {cellEntries.map((entry, eIdx) => {
                                                                    if (entry.isCOE) {
                                                                        const tooltip = [
                                                                            `COE Block (Hard Constraint): ${entry.coeLabel}`,
                                                                            entry.facultyName ? `Co-Faculty: ${entry.facultyName}` : '',
                                                                            entry.schedulingNote ? `Note: ${entry.schedulingNote}` : ''
                                                                        ].filter(Boolean).join('\n');
                                                                        return (
                                                                            <div key={eIdx} className="timetable-slot" style={{
                                                                                background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)',
                                                                                border: '2px solid #a78bfa',
                                                                                cursor: 'default',
                                                                                position: 'relative'
                                                                            }}
                                                                                title={tooltip}>
                                                                                <div className="slot-subject" style={{ color: '#5b21b6', fontWeight: 700, fontSize: 11 }}>
                                                                                    {entry.coeLabel || 'COE'}
                                                                                </div>
                                                                                {entry.facultyName && (
                                                                                    <div className="slot-faculty" style={{ color: '#6d28d9', fontSize: 9, opacity: 0.9 }}>
                                                                                        👤 {entry.facultyName}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    }

                                                                    if (entry.isActivity) {
                                                                        return (
                                                                            <div key={eIdx} className="timetable-slot" style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #86efac', cursor: 'default' }}
                                                                                title={`Fixed Activity: ${entry.activityLabel}`}>
                                                                                <div className="slot-subject" style={{ color: '#15803d' }}>📌 {entry.activityLabel}</div>
                                                                            </div>
                                                                        );
                                                                    }

                                                                    const isConf = !!entry.isConflict;
                                                                    const typeClass = entry.isLab ? 'lab' : (entry.subjectType === 'project' ? 'project' : 'theory');
                                                                    
                                                                    // Highlight if it's the first selected slot
                                                                    let isActive = swapMode && (swapFirst === entry._idx);
                                                                    
                                                                    // OR highlight if it's in the potential target window based on hover
                                                                    if (swapMode && swapFirst !== null && hoveredSlot && hoveredSlot.day === day) {
                                                                        const firstEntry = timetable.entries[swapFirst];
                                                                        const d1 = firstEntry.duration || 1;
                                                                        if (slotIdx >= hoveredSlot.slotIndex && slotIdx < hoveredSlot.slotIndex + d1) {
                                                                            isActive = true;
                                                                        }
                                                                    }

                                                                    return (
                                                                        <div
                                                                            key={eIdx}
                                                                            className={`timetable-slot ${typeClass} ${isActive ? 'swap-highlight' : ''}`}
                                                                            style={{
                                                                                cursor: (swapMode && !entry.isContinuation) ? 'pointer' : 'default',
                                                                                border: isConf ? '2px solid #ef4444' : (isActive ? '2px dashed var(--primary-color)' : undefined),
                                                                                background: isConf ? '#fee2e2' : (isActive ? 'rgba(26, 115, 232, 0.1)' : undefined),
                                                                                opacity: entry.isContinuation ? 0.9 : 1
                                                                            }}
                                                                            onMouseEnter={() => {
                                                                                if (swapMode && swapFirst !== null) setHoveredSlot({ day, slotIndex: slotIdx });
                                                                            }}
                                                                            onMouseLeave={() => {
                                                                                if (swapMode) setHoveredSlot(null);
                                                                            }}
                                                                            onClick={() => {
                                                                                if (!entry.isContinuation) handleSlotClick(entry, entry._idx);
                                                                            }}
                                                                            title={[
                                                                                isConf ? '⚠ OVERLAP DETECTED' : '',
                                                                                `${entry.subjectName} (${entry.subjectCode})`,
                                                                                `Faculty: ${entry.facultyName}${entry.labFaculty2Name ? ' + ' + entry.labFaculty2Name : ''}${entry.labFaculty3Name ? ' + ' + entry.labFaculty3Name : ''}`,
                                                                                `Room: ${entry.roomName}`,
                                                                                entry.isExtra ? 'Extra session (gap-fill)' : '',
                                                                                entry.schedulingNote ? `Note: ${entry.schedulingNote}` : ''
                                                                            ].filter(Boolean).join('\n')}
                                                                        >
                                                                            {isConf && (
                                                                                <div style={{ position: 'absolute', top: 4, right: 6, color: '#ef4444', fontSize: 8, fontWeight: 900 }}>
                                                                                    ⚠ CONFLICT
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
                                                                                {entry.labFaculty3Name && ` + ${entry.labFaculty3Name}`}
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
                                        ))}
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
                            className={`btn ${swapMode ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => {
                                setSwapMode(!swapMode);
                                setSwapFirst(null);
                            }}
                            title={swapMode ? "Cancel swap mode" : "Enter swap mode to move slots"}
                        >
                            {swapMode ? 'Cancel Swap' : 'Swap Slots'}
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

                {(viewMode === 'class' || viewMode === 'summary' || viewMode === 'faculty' || viewMode === 'lab') && (() => {
                    let opts = [];
                    let ph = "";
                    if (viewMode === 'class' || viewMode === 'summary') {
                        opts = classes.map(c => ({ id: c.id, name: c.name }));
                        ph = "Search class...";
                    } else if (viewMode === 'faculty') {
                        opts = faculty.map(f => ({ id: f.id, name: f.name }));
                        ph = "Search faculty...";
                    } else if (viewMode === 'lab') {
                        opts = rooms.filter(r => r.type === 'lab').map(r => ({
                            id: r.id,
                            name: `${r.name} (Cap: ${r.capacity || '—'})`
                        }));
                        ph = "Search lab...";
                    }

                    return (
                        <SearchableSelect
                            options={opts}
                            value={selectedId}
                            onChange={e => setSelectedId(e.target.value)}
                            placeholder={ph}
                            style={{ width: 280 }}
                        />
                    );
                })()}
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
                                                                        <span style={{ fontSize: 16 }}></span> Fully Allocated
                                                                    </span>
                                                                ) : row.allocatedPeriods > 0 ? (
                                                                    <span style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                                                                        <span style={{ fontSize: 16 }}></span> Partially Allocated
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                                                                        <span style={{ fontSize: 16 }}></span> Not Allocated
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


            {/* Ultra-Simple Replacement Modal */}
            {replacementSlot && (
                <div className="modal-overlay" onClick={() => setReplacementSlot(null)}>
                    <div className="modal" 
                        style={{ maxWidth: 400, padding: 0, borderRadius: 12, overflow: 'hidden', background: '#fff' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {replacementLoading ? (
                            <div style={{ textAlign: 'center', padding: 30 }}>
                                <div className="spinner" style={{ margin: '0 auto 10px', width: 20, height: 20 }}></div>
                                <p style={{ fontSize: 12, color: '#333' }}>Finding options...</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 12, fontWeight: 700, color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>SELECT REPLACEMENT</span>
                                    <span style={{ fontWeight: 400, color: '#64748b' }}>{replacementSlot.day} · Slot {replacementSlot.slotIndex + 1}</span>
                                </div>
                                
                                <div style={{ maxHeight: '50vh', overflowY: 'auto', background: '#fff' }}>
                                    {validSubjects.length === 0 ? (
                                        <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                                            No available options
                                        </div>
                                    ) : (
                                        validSubjects.map((opt, i) => (
                                            <button 
                                                key={i} 
                                                style={{ 
                                                    width: '100%',
                                                    padding: '14px 16px',
                                                    background: '#fff',
                                                    border: 'none',
                                                    borderBottom: '1px solid #f1f5f9',
                                                    textAlign: 'left',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: 2,
                                                    transition: 'background 0.15s'
                                                }}
                                                onClick={() => performReplacement(opt)}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{opt.subjectName}</span>
                                                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{opt.subjectCode}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569' }}>
                                                    <span>{opt.facultyName}</span>
                                                    <span style={{ fontWeight: 700, color: '#1a73e8' }}>{opt.roomName}</span>
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                                <button 
                                    style={{ padding: '12px', border: 'none', background: '#fcfcfc', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontWeight: 600, borderTop: '1px solid #f1f5f9' }}
                                    onClick={() => setReplacementSlot(null)}
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
