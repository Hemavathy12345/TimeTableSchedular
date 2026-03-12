import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';

// Helper to convert "HH:MM" to minutes
const timeToMins = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
};

// Helper to format minutes back to "HH:MM"
const minsToTime = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export default function FacultyOverview() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');

    useEffect(() => {
        loadOverview();
    }, [id]);

    const loadOverview = async () => {
        try {
            const res = await api.get(`/timetable/${id}/faculty-overview`);
            setData(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load faculty overview');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
        <div className="loading-overlay">
            <div className="spinner"></div>
            <div className="loading-text">Loading Faculty Gantt Chart...</div>
        </div>
    );

    if (error) return (
        <div className="fade-in">
            <div style={{ color: 'var(--danger)', padding: 24 }}>⚠ {error}</div>
        </div>
    );

    const { timetableName, timeSlotConfig, facultySchedules } = data;

    // Filter by search
    const filtered = facultySchedules.filter(fs =>
        fs.facultyName.toLowerCase().includes(search.toLowerCase())
    );

    const totalOverlaps = facultySchedules.reduce((sum, fs) => sum + fs.overlaps.length, 0);
    const facultiesWithOverlaps = facultySchedules.filter(fs => fs.overlaps.length > 0);

    // Build overlap key set for quick lookup
    const buildOverlapKeys = (fs) => {
        const keys = new Set();
        fs.overlaps.forEach(o => keys.add(`${o.day}-${o.slotIndex}`));
        return keys;
    };

    // Prepare timeline dimensions
    const days = timeSlotConfig?.days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const allSlots = timeSlotConfig?.slots || [];
    
    // Find absolute bounds for the x-axis
    let minMins = 8 * 60; // default 08:00
    let maxMins = 17 * 60; // default 17:00

    if (allSlots.length > 0) {
        minMins = Math.min(...allSlots.map(s => timeToMins(s.start)));
        maxMins = Math.max(...allSlots.map(s => timeToMins(s.end)));
    }
    
    // Add small padding to left/right for aesthetics (30 mins)
    minMins -= 30;
    maxMins += 30;
    const totalDuration = maxMins - minMins;

    const getLeftPercent = (timeStr) => ((timeToMins(timeStr) - minMins) / totalDuration) * 100;

    // Determine the class slots to map entry.slotIndex back to exact slot times
    const classSlots = allSlots.filter(s => s.type === 'class');

    return (
        <div className="fade-in" style={{ minHeight: '100vh' }}>
            {/* Header */}
            <div className="table-header" style={{ marginBottom: 20 }}>
                <div>
                    <h1 className="page-title">👥 Faculty Overview</h1>
                    <p className="page-subtitle">
                        {timetableName} — Gantt Chart Timeline
                    </p>
                </div>
                <div className="btn-group">
                    <button className="btn btn-secondary" onClick={() => navigate(`/timetable/${id}`)}>
                        ← Back to Timetable
                    </button>
                </div>
            </div>

            {/* Summary Strip */}
            <div style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 20
            }}>
                <div style={summaryCard('#10b981', '#d1fae5')}>
                    <div style={{ fontSize: 26, fontWeight: 700 }}>{facultySchedules.length}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>Total Faculty</div>
                </div>
                <div style={summaryCard(totalOverlaps > 0 ? '#ef4444' : '#10b981', totalOverlaps > 0 ? '#fee2e2' : '#d1fae5')}>
                    <div style={{ fontSize: 26, fontWeight: 700 }}>{totalOverlaps}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>Total Overlaps</div>
                </div>
                {facultiesWithOverlaps.length > 0 && facultiesWithOverlaps.map(fs => (
                    <div key={fs.facultyId} style={summaryCard('#ef4444', '#fee2e2')}>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{fs.overlaps.length}</div>
                        <div style={{ fontSize: 11, opacity: 0.85, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            ⚠ {fs.facultyName}
                        </div>
                    </div>
                ))}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, background: 'rgba(139,92,246,0.8)', border: '1px solid rgba(139,92,246,1)' }}></div>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Theory session</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, background: 'rgba(6,182,212,0.8)', border: '1px solid rgba(6,182,212,1)' }}></div>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Lab session</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, background: 'rgba(239,68,68,0.9)', border: '2px solid #b91c1c' }}></div>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Conflict / Double-booked</span>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <input
                        className="form-input"
                        placeholder="Search faculty..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ width: 220 }}
                    />
                </div>
            </div>

            {/* Per-Faculty Gantt Cards */}
            {filtered.length === 0 && (
                <div className="empty-state"><p>No faculty match your search.</p></div>
            )}

            {filtered.map(fs => {
                const overlapKeys = buildOverlapKeys(fs);
                
                return (
                    <div key={fs.facultyId} style={{
                        marginBottom: 32,
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden',
                        border: fs.overlaps.length > 0
                            ? '1.5px solid rgba(239,68,68,0.5)'
                            : '1px solid var(--border)',
                        background: 'var(--surface)',
                        boxShadow: fs.overlaps.length > 0
                            ? '0 0 0 3px rgba(239,68,68,0.08)'
                            : 'var(--shadow-sm)'
                    }}>
                        {/* Faculty card header */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '12px 16px',
                            background: 'var(--surface-hover)',
                            borderBottom: '1px solid var(--border)'
                        }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: 'var(--gradient-primary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 700, fontSize: 16, color: '#fff', flexShrink: 0
                            }}>
                                {fs.facultyName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 15 }}>{fs.facultyName}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                    {fs.entries.length} session{fs.entries.length !== 1 ? 's' : ''} scheduled
                                    {fs.overlaps.length > 0 && (
                                        <span style={{
                                            marginLeft: 8, color: '#ef4444', fontWeight: 600,
                                            background: 'rgba(239,68,68,0.1)', padding: '1px 8px', borderRadius: 999
                                        }}>
                                            ⚠ {fs.overlaps.length} conflict{fs.overlaps.length !== 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Gantt Chart Area */}
                        <div style={{ 
                            padding: '24px 16px 16px 16px',
                            minHeight: 200,
                            overflowX: 'auto',
                            background: 'var(--bg-color)' 
                        }}>
                            {/* X-Axis Timeline (Ruler at top) — offset by 80px for day label */}
                            <div style={{ display: 'flex', marginBottom: 16 }}>
                                {/* Spacer for day label column */}
                                <div style={{ width: 80, flexShrink: 0 }} />
                                {/* Ruler */}
                                <div style={{ flexGrow: 1, position: 'relative', height: 24, borderBottom: '1px solid var(--border)' }}>
                                    {Array.from({ length: Math.ceil(totalDuration / 60) + 1 }).map((_, i) => {
                                        const m = minMins + (i * 60);
                                        if (m > maxMins) return null;
                                        const pct = ((m - minMins) / totalDuration) * 100;
                                        return (
                                            <div key={i} style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: -10, borderLeft: '1px solid var(--border)', zIndex: 0 }}>
                                                <div style={{ position: 'absolute', left: -16, top: -20, fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, width: 32, textAlign: 'center' }}>
                                                    {minsToTime(m)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Day Rows (stripes rendered inside each row track for correct alignment) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {days.map(day => {
                                    const dayEntries = fs.entries.filter(e => e.day === day);

                                    return (
                                        <div key={day} style={{ display: 'flex', height: 48, alignItems: 'center' }}>
                                            {/* Y-Axis Label */}
                                            <div style={{ width: 80, flexShrink: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right', paddingRight: 16 }}>
                                                {day.substring(0, 3).toUpperCase()}
                                            </div>

                                            {/* Row Track */}
                                            <div style={{ flexGrow: 1, position: 'relative', height: '100%', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', overflow: 'hidden' }}>

                                                {/* Break/Lunch stripes inside each row track — perfectly aligned with sessions */}
                                                {allSlots.filter(s => s.type !== 'class').map((slot, idx) => {
                                                    const left = getLeftPercent(slot.start);
                                                    const width = getLeftPercent(slot.end) - left;
                                                    return (
                                                        <div key={`break-${idx}`} style={{
                                                            position: 'absolute',
                                                            left: `${left}%`,
                                                            width: `${width}%`,
                                                            top: 0,
                                                            bottom: 0,
                                                            background: slot.type === 'lunch' ? 'rgba(16,185,129,0.07)' : 'rgba(245,158,11,0.07)',
                                                            borderLeft: slot.type === 'lunch' ? '1px dashed rgba(16,185,129,0.35)' : '1px dashed rgba(245,158,11,0.35)',
                                                            borderRight: slot.type === 'lunch' ? '1px dashed rgba(16,185,129,0.35)' : '1px dashed rgba(245,158,11,0.35)',
                                                            zIndex: 0,
                                                            pointerEvents: 'none',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}>
                                                            <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 9, color: 'var(--text-muted)', opacity: 0.5, letterSpacing: 2 }}>
                                                                {slot.type.toUpperCase()}
                                                            </span>
                                                        </div>
                                                    );
                                                })}

                                                {/* Session blocks */}
                                                {dayEntries.map((e, idx) => {
                                                    const slotDef = classSlots[e.slotIndex];
                                                    if (!slotDef) return null;

                                                    const isOverlap = overlapKeys.has(`${e.day}-${e.slotIndex}`);
                                                    const left = getLeftPercent(slotDef.start);
                                                    const width = getLeftPercent(slotDef.end) - left;

                                                    const sharingEntries = dayEntries.filter(ee => ee.slotIndex === e.slotIndex);
                                                    const sharingIndex = sharingEntries.findIndex(ee => ee.subjectId === e.subjectId && ee.classId === e.classId);
                                                    const topOffset = isOverlap ? sharingIndex * 6 : 0;
                                                    const zIndex = isOverlap ? 10 + sharingIndex : 5;

                                                    return (
                                                        <div key={idx} style={{
                                                            position: 'absolute',
                                                            left: `${left}%`,
                                                            width: `${width}%`,
                                                            top: 4 + topOffset,
                                                            height: 36,
                                                            borderRadius: 4,
                                                            background: isOverlap
                                                                ? 'rgba(239,68,68,0.95)'
                                                                : e.isLab
                                                                    ? 'rgba(6,182,212,0.9)'
                                                                    : 'rgba(139,92,246,0.9)',
                                                            border: isOverlap ? '2px solid #7f1d1d' : '1px solid rgba(255,255,255,0.2)',
                                                            color: '#fff',
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            justifyContent: 'center',
                                                            padding: '0 6px',
                                                            overflow: 'hidden',
                                                            zIndex: zIndex,
                                                            transition: 'transform 0.2s',
                                                            cursor: 'pointer'
                                                        }}
                                                        title={`${e.subjectName} (${e.subjectCode})\nClass: ${e.className}\nRoom: ${e.roomName}\nTime: ${slotDef.start}-${slotDef.end}`}
                                                        onMouseEnter={ev => ev.currentTarget.style.transform = 'translateY(-2px)'}
                                                        onMouseLeave={ev => ev.currentTarget.style.transform = 'translateY(0)'}
                                                        >
                                                            <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                                {isOverlap && '⚠ '}{e.subjectCode}
                                                            </div>
                                                            <div style={{ fontSize: 9, opacity: 0.9, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                                {e.className} • {e.roomName}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// Style helpers
function summaryCard(color, bg) {
    return {
        background: `linear-gradient(135deg, ${bg}, ${bg}aa)`,
        border: `1px solid ${color}44`,
        borderRadius: 'var(--radius-md)',
        padding: '10px 18px',
        color: color,
        minWidth: 80,
        textAlign: 'center',
        flexShrink: 0
    };
}
