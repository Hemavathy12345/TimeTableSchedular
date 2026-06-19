import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';


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

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_LABEL_WIDTH = 68; // px, fixed for left column
const ROW_HEIGHT = 52;      // px per day row
const RULER_HEIGHT = 36;    // px for top ruler

export default function FacultyOverview() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [tooltip, setTooltip] = useState(null); // { text, x, y }

    useEffect(() => { loadOverview(); }, [id]);

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

    const handleResolve = async (entryIndex, subjectName) => {
        if (!window.confirm(`Attempt to automatically move "${subjectName}" to the first available free slot for this faculty, room, and class?`)) return;

        setLoading(true);
        try {
            await api.put(`/timetable/${id}/resolve/${entryIndex}`);
            await loadOverview();
            // Scroll to the updated timetable area or just show success
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to auto-resolve conflict.');
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
            <div style={{ color: 'var(--danger)', padding: 24 }}> {error}</div>
        </div>
    );

    const { timetableName, timeSlotConfigs, facultySchedules } = data;
    const allConfigs = timeSlotConfigs || [];

    // Filter by search
    const filtered = facultySchedules.filter(fs =>
        fs.facultyName.toLowerCase().includes(search.toLowerCase())
    );

    // Recount total overlaps as UNIQUE PAIRS (accurate for any number of overlapping sessions)
    let totalOverlaps = 0;
    facultySchedules.forEach(fs => {
        const dayRows = {};
        fs.entries.forEach(e => {
            if (!dayRows[e.day]) dayRows[e.day] = [];
            dayRows[e.day].push(e);
        });
        Object.values(dayRows).forEach(dayEntries => {
            dayEntries.forEach((e, i) => {
                const s1 = timeToMins(e.startTime);
                const e1 = timeToMins(e.endTime);
                if (!s1 || !e1) return;
                dayEntries.forEach((ee, j) => {
                    if (j <= i) return; // count each pair once
                    const s2 = timeToMins(ee.startTime);
                    const e2 = timeToMins(ee.endTime);
                    if (s1 < e2 && e1 > s2) totalOverlaps++;
                });
            });
        });
    });

    const facultiesWithConflicts = facultySchedules.filter(fs => {
        const dayRows = {};
        fs.entries.forEach(e => {
            if (!dayRows[e.day]) dayRows[e.day] = [];
            dayRows[e.day].push(e);
        });
        return Object.values(dayRows).some(dayEntries =>
            dayEntries.some((e, i) => {
                const s1 = timeToMins(e.startTime);
                const e1 = timeToMins(e.endTime);
                if (!s1 || !e1) return false;
                return dayEntries.some((ee, j) => j !== i &&
                    s1 < timeToMins(ee.endTime) && e1 > timeToMins(ee.startTime));
            })
        );
    });

    // Compute global time bounds (snapped to hours)
    let minMins = 24 * 60;
    let maxMins = 0;

    facultySchedules.forEach(fs => {
        fs.entries.forEach(e => {
            if (e.startTime) minMins = Math.min(minMins, timeToMins(e.startTime));
            if (e.endTime) maxMins = Math.max(maxMins, timeToMins(e.endTime));
        });
    });
    allConfigs.forEach(cfg => {
        cfg.slots.forEach(s => {
            if (s.start) minMins = Math.min(minMins, timeToMins(s.start));
            if (s.end) maxMins = Math.max(maxMins, timeToMins(s.end));
        });
    });

    if (minMins > maxMins) { minMins = 8 * 60; maxMins = 17 * 60; }
    minMins = Math.floor(minMins / 60) * 60;
    maxMins = Math.ceil(maxMins / 60) * 60;
    const totalDuration = maxMins - minMins;

    // Convert time → % position within the track
    const toPct = (timeStr) => ((timeToMins(timeStr) - minMins) / totalDuration) * 100;
    const widthPct = (start, end) => ((timeToMins(end) - timeToMins(start)) / totalDuration) * 100;

    // Ruler tick marks (every hour)
    const hourCount = Math.ceil(totalDuration / 60) + 1;
    const ticks = Array.from({ length: hourCount }, (_, i) => {
        const m = minMins + i * 60;
        return m <= maxMins ? m : null;
    }).filter(Boolean);

    return (
        <div className="fade-in" style={{ minHeight: '100vh', position: 'relative' }}>

            {/* Floating Tooltip */}
            {tooltip && (
                <div
                    style={{
                        position: 'fixed',
                        left: tooltip.x + 12,
                        top: tooltip.y - 8,
                        zIndex: 9999,
                        background: 'rgba(15,23,42,0.98)',
                        color: '#f1f5f9',
                        borderRadius: 10,
                        padding: '12px 16px',
                        fontSize: 12,
                        lineHeight: 1.7,
                        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        maxWidth: 240,
                        whiteSpace: 'pre-line',
                        pointerEvents: 'none'
                    }}
                >
                    {tooltip.text}
                </div>
            )}

            {/* Header */}
            <div className="table-header" style={{ marginBottom: 20 }}>
                <div>
                    <h1 className="page-title">Faculty Overview</h1>
                    <p className="page-subtitle">{timetableName} — Gantt Chart Timeline</p>
                </div>
                <div className="btn-group">
                    <button className="btn btn-secondary" onClick={() => navigate(`/timetable/${id}`)}>
                        ← Back to Timetable
                    </button>
                </div>
            </div>

            {/* Summary Strip */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <div style={summaryCard('var(--primary-color)', 'var(--primary-50)', 'var(--primary-200)')}>
                    <div style={{ fontSize: 26, fontWeight: 700 }}>{facultySchedules.length}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>Total Faculty</div>
                </div>
                <div style={summaryCard(totalOverlaps > 0 ? '#b91c1c' : 'var(--primary-color)', totalOverlaps > 0 ? '#fff0f0' : 'var(--primary-50)', totalOverlaps > 0 ? '#fca5a5' : 'var(--primary-200)')}>
                    <div style={{ fontSize: 26, fontWeight: 700 }}>{totalOverlaps}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>Scheduling Conflicts</div>
                </div>
                {facultiesWithConflicts.length > 0 && (
                    <div style={summaryCard('var(--navy)', 'var(--gold-l)', 'var(--gold)')}>
                        <div style={{ fontSize: 26, fontWeight: 700 }}>{facultiesWithConflicts.length}</div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>Faculty Affected</div>
                    </div>
                )}
            </div>

            {/* Legend + Search */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
                {[
                    { color: 'rgba(139,92,246,0.85)', label: 'Theory (current dept)' },
                    { color: 'rgba(6,182,212,0.85)', label: 'Lab (current dept)' },
                    { color: 'rgba(245,158,11,0.85)', label: 'Theory (other dept — read-only)' },
                    { color: 'rgba(251,191,36,0.85)', label: 'Lab (other dept — read-only)' },
                    { color: 'rgba(239,68,68,0.90)', label: 'Conflict / Double-booked' },
                ].map(({ color, label }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 16, height: 16, borderRadius: 3, background: color, border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
                    </div>
                ))}
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

            {/* No results */}
            {filtered.length === 0 && (
                <div className="empty-state"><p>No faculty match your search.</p></div>
            )}

            {/* Per-Faculty Gantt Cards */}
            {filtered.map(fs => (
                <FacultyGanttCard
                    key={fs.facultyId}
                    fs={fs}
                    ticks={ticks}
                    minMins={minMins}
                    totalDuration={totalDuration}
                    toPct={toPct}
                    widthPct={widthPct}
                    setTooltip={setTooltip}
                    onResolve={handleResolve}
                    ROW_HEIGHT={ROW_HEIGHT}
                    RULER_HEIGHT={RULER_HEIGHT}
                    DAY_LABEL_WIDTH={DAY_LABEL_WIDTH}
                    user={user}
                />
            ))}
        </div>
    );
}

/* ─────────────────────────────────────────────────────── */
/*  Single faculty Gantt card                              */
/* ─────────────────────────────────────────────────────── */
function FacultyGanttCard({
    fs, ticks, minMins, totalDuration, toPct, widthPct,
    setTooltip, onResolve,
    ROW_HEIGHT, RULER_HEIGHT, DAY_LABEL_WIDTH,
    user
}) {
    // Re-detect conflicts for this faculty card specifically
    const dayRows = {};
    fs.entries.forEach(e => {
        if (!dayRows[e.day]) dayRows[e.day] = [];
        dayRows[e.day].push(e);
    });

    // Recount conflicts for this faculty card as unique PAIRS
    let conflictsCount = 0;
    Object.values(dayRows).forEach(de => {
        de.forEach((e, i) => {
            const s1 = timeToMins(e.startTime);
            const e1 = timeToMins(e.endTime);
            if (!s1 || !e1) return;
            de.forEach((ee, j) => {
                if (j <= i) return;
                const s2 = timeToMins(ee.startTime);
                const e2 = timeToMins(ee.endTime);
                if (s1 < e2 && e1 > s2) conflictsCount++;
            });
        });
    });
    const finalCount = conflictsCount;
    const hasConflict = finalCount > 0;

    return (
        <div style={{
            marginBottom: 28,
            borderRadius: 'var(--radius-lg)',
            border: hasConflict ? '1.5px solid rgba(239,68,68,0.45)' : '1px solid var(--border)',
            background: 'var(--surface)',
            boxShadow: hasConflict ? '0 0 0 3px rgba(239,68,68,0.07)' : 'var(--shadow-sm)',
            overflow: 'hidden',
        }}>
            {/* Card Header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 20px',
                background: 'var(--surface-hover)',
                borderBottom: '1px solid var(--border)',
            }}>
                <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: 'var(--gradient-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 16, color: '#fff', flexShrink: 0,
                }}>
                    {fs.facultyName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{fs.facultyName}</span>
                        {fs.facultyDeptCode && (
                            <span style={{
                                fontSize: 10, fontWeight: 700,
                                background: 'var(--gradient-primary)',
                                color: '#fff', padding: '1px 7px', borderRadius: 99
                            }}>{fs.facultyDeptCode}</span>
                        )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {fs.entries.length} session{fs.entries.length !== 1 ? 's' : ''} scheduled
                        {hasConflict && (
                            <span style={{
                                marginLeft: 8, color: '#ef4444', fontWeight: 600,
                                background: 'rgba(239,68,68,0.1)', padding: '1px 8px', borderRadius: 999
                            }}>
                                {finalCount} conflict{finalCount !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ padding: '0 16px 16px 16px', overflowX: 'auto', background: 'var(--bg-color)' }}>
         
                <div style={{ minWidth: 640 }}>
                    <div style={{ display: 'flex', height: RULER_HEIGHT, marginBottom: 4 }}>
                    
                        <div style={{ width: DAY_LABEL_WIDTH, flexShrink: 0 }} />
                    
                        <div style={{ flex: 1, position: 'relative' }}>
                        
                            <div style={{
                                position: 'absolute',
                                left: 0, right: 0, bottom: 0,
                                height: 1,
                                background: 'var(--border)',
                            }} />
                            {ticks.map((m, i) => {
                                const pct = ((m - minMins) / totalDuration) * 100;
                                const isFirst = i === 0;
                                const isLast = i === ticks.length - 1;
                                return (
                                    <div key={m} style={{
                                        position: 'absolute',
                                        left: `${pct}%`,
                                        bottom: 0,
                                        // For last tick, shift label left so it doesn't clip
                                        transform: isLast ? 'translateX(-100%)' : isFirst ? 'none' : 'translateX(-50%)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: isFirst ? 'flex-start' : isLast ? 'flex-end' : 'center',
                                    }}>
                                        <span style={{
                                            fontSize: 10,
                                            fontWeight: 600,
                                            color: 'var(--text-muted)',
                                            lineHeight: 1,
                                            marginBottom: 3,
                                            userSelect: 'none',
                                        }}>
                                            {minsToTime(m)}
                                        </span>
                                        <div style={{ width: 1, height: 6, background: 'var(--border)' }} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Day Rows ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {DAYS.map((day, dayIdx) => {
                            const dayEntries = fs.entries.filter(e => e.day === day);

                            return (
                                <div key={day} style={{ display: 'flex', alignItems: 'center', height: ROW_HEIGHT }}>
                                    {/* Day label */}
                                    <div style={{
                                        width: DAY_LABEL_WIDTH, flexShrink: 0,
                                        fontSize: 11, fontWeight: 700,
                                        color: 'var(--text-secondary)',
                                        textAlign: 'right',
                                        paddingRight: 12,
                                        letterSpacing: '0.05em',
                                        userSelect: 'none',
                                    }}>
                                        {day.substring(0, 3).toUpperCase()}
                                    </div>

                                    {/* Track */}
                                    <div style={{
                                        flex: 1,
                                        position: 'relative',
                                        height: '100%',
                                        borderRadius: 6,
                                        background: dayIdx % 2 === 0 ? 'var(--surface)' : 'var(--surface-hover)',
                                        border: '1px solid var(--glass-border)',
                                        overflow: 'hidden',
                                    }}>
                                        {/* Vertical hour gridlines */}
                                        {ticks.map(m => {
                                            const pct = ((m - minMins) / totalDuration) * 100;
                                            return (
                                                <div key={m} style={{
                                                    position: 'absolute',
                                                    left: `${pct}%`,
                                                    top: 0, bottom: 0,
                                                    width: 1,
                                                    background: 'rgba(148,163,184,0.12)',
                                                    zIndex: 0,
                                                    pointerEvents: 'none',
                                                }} />
                                            );
                                        })}

                                        {/* Session blocks */}
                                        {dayEntries.map((e, idx) => {
                                            if (!e.startTime || !e.endTime) return null;

                                            const startM = timeToMins(e.startTime);
                                            const endM = timeToMins(e.endTime);

                                            // Detect conflict via time overlap in frontend for robustness
                                            const clashingSessions = dayEntries.filter(ee => {
                                                if (ee === e) return false;
                                                const s2 = timeToMins(ee.startTime);
                                                const e2 = timeToMins(ee.endTime);
                                                return (startM < e2 && endM > s2);
                                            });

                                            const isConflict = !!e.isConflict || clashingSessions.length > 0;
                                            const isCrossDept = e.fromCurrentTT === false;
                                            // canResolve: only allow resolving entries that belong to the current dept timetable
                                            const canResolve = isConflict && e.editable && !isCrossDept &&
                                                (user?.role === 'admin' || user?.role === 'department_user');

                                            const left = toPct(e.startTime);
                                            const width = widthPct(e.startTime, e.endTime);

                                            // Stack overlapping sessions 
                                            const allOverlappers = [...clashingSessions, e].sort((a, b) => {
                                                const tA = timeToMins(a.startTime);
                                                const tB = timeToMins(b.startTime);
                                                if (tA !== tB) return tA - tB;
                                                return (a.subjectId + a.classId).localeCompare(b.subjectId + b.classId);
                                            });
                                            const sibIdx = allOverlappers.indexOf(e);

                                            // Dynamic layout for clashing blocks
                                            const isStacked = allOverlappers.length > 1;
                                            const blockHeight = isStacked ? 22 : ROW_HEIGHT - 12;
                                            const stackOffset = sibIdx * 24;

                                            // Color: conflict (red) > cross-dept (gray) > lab (gold) > theory (blue)
                                            const bg = isConflict
                                                ? '#d32f2f'
                                                : isCrossDept
                                                    ? '#90a4ae'
                                                    : e.isLab
                                                        ? 'var(--gold)'
                                                        : 'var(--primary)';

                                            let tooltipText =
                                                `${isCrossDept ? '[' + (e.classDeptCode || 'OTHER DEPT') + '] ' : ''}${e.subjectName} (${e.subjectCode})\n` +
                                                `Class: ${e.className}${e.classYear ? ' — Year ' + e.classYear : ''}\n` +
                                                `Dept: ${e.classDeptName || '—'}\n` +
                                                `Room: ${e.roomName || '—'}\n` +
                                                `${e.startTime} – ${e.endTime}`;

                                            if (isCrossDept) {
                                                tooltipText += '\n\nRead-only (other department)';
                                            }

                                            if (isConflict) {
                                                tooltipText += '\n\nCONFLICT DETECTED';
                                                if (e.conflictsWith && e.conflictsWith.length > 0) {
                                                    e.conflictsWith.forEach(c => {
                                                        tooltipText += `\n- ${c.facultyName} (${c.subjectName}): ${c.reason}`;
                                                    });
                                                } else {
                                                    tooltipText += `\nOverlap with ${clashingSessions.length} other session(s)`;
                                                }
                                                if (canResolve) {
                                                    tooltipText += '\n\nClick to Auto-Resolve';
                                                }
                                            }

                                            return (
                                                <div
                                                    key={idx}
                                                    style={{
                                                        position: 'absolute',
                                                        left: `${left}%`,
                                                        width: `${width}%`,
                                                        top: 6 + stackOffset,
                                                        height: blockHeight,
                                                        borderRadius: isStacked ? 3 : 5,
                                                        background: bg,
                                                        border: isConflict
                                                            ? '2px solid #450a0a'
                                                            : '1px solid rgba(255,255,255,0.25)',
                                                        color: '#fff',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        justifyContent: 'center',
                                                        padding: '0 7px',
                                                        overflow: 'hidden',
                                                        zIndex: 5 + sibIdx,
                                                        cursor: canResolve ? 'pointer' : 'default',
                                                        boxSizing: 'border-box',
                                                        whiteSpace: 'nowrap'
                                                    }}
                                                    onMouseEnter={(ev) => {
                                                        const rect = ev.currentTarget.getBoundingClientRect();
                                                        setTooltip({
                                                            text: tooltipText,
                                                            x: rect.left,
                                                            y: rect.top
                                                        });
                                                    }}
                                                    onMouseLeave={(ev) => {
                                                        setTooltip(null);
                                                    }}
                                                    onClick={() => {
                                                        if (canResolve) {
                                                            onResolve(e.originalIndex, e.subjectCode);
                                                        }
                                                    }}
                                                >
                                                    <div style={{
                                                        fontSize: 11, fontWeight: 700,
                                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                        lineHeight: 1.2,
                                                        color: isCrossDept ? '#1c1917' : '#fff'
                                                    }}>
                                                        {isConflict && '[!] '}{isCrossDept && '(L) '}{e.subjectCode}
                                                    </div>
                                                    <div style={{
                                                        fontSize: 9, opacity: 0.88,
                                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                        lineHeight: 1.2, marginTop: 1,
                                                        color: isCrossDept ? '#292524' : undefined
                                                    }}>
                                                        {isCrossDept && (e.classDeptCode ? `[${e.classDeptCode}] ` : '')}{e.className} • {e.roomName || '—'}
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
        </div>
    );
}

// Style helpers
function summaryCard(textColor, bgColor, borderColor) {
    return {
        background: bgColor,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 'var(--radius-md)',
        padding: '10px 18px',
        color: textColor,
        minWidth: 100,
        textAlign: 'center',
        flexShrink: 0,
        boxShadow: 'var(--shadow-sm)'
    };
}
