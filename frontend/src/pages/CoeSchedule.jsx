import { useState, useEffect } from 'react';
import api from '../utils/api';
import Modal from '../components/Modal';
import { useToast, ToastContainer } from '../components/Toast';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const YEARS = [1, 2, 3, 4];

// COE color theme — soft indigo/violet
const COE = {
    bg:         'linear-gradient(135deg, #f5f3ff, #ede9fe)',
    bgLight:    '#f5f3ff',
    border:     '#c4b5fd',
    borderDark: '#7c3aed',
    text:       '#5b21b6',
    textLight:  '#6d28d9',
};

export default function CoeSchedule() {
    const [coeEntries, setCoeEntries] = useState([]);
    const [configs, setConfigs]       = useState([]);
    const [faculties, setFaculties]   = useState([]);
    const [sections, setSections]     = useState([]);
    const [showModal, setShowModal]   = useState(false);
    const [editing, setEditing]       = useState(null);
    const [filterYear, setFilterYear] = useState('');
    const { toasts, addToast, removeToast } = useToast();

    const defaultForm = { year: 1, label: 'COE', day: 'Monday', startSlotIndex: 0, endSlotIndex: 0, coFacultyId: '', section: 'All' };
    const [form, setForm] = useState(defaultForm);

    useEffect(() => { load(); }, []);

    const load = async () => {
        const [coe, cfg, fac, cls] = await Promise.all([
            api.get('/coe'),
            api.get('/timeslots'),
            api.get('/faculty'),
            api.get('/classes')
        ]);
        setCoeEntries(coe.data);
        setConfigs(cfg.data);
        setFaculties(fac.data);
        const uniqueSects = [...new Set(cls.data.map(c => c.section).filter(Boolean))].sort();
        setSections(uniqueSects);
    };

    const getSlotsForYear = (year) => {
        const cfg = configs.find(c => Number(c.year) === Number(year));
        if (!cfg) return [];
        return Array.isArray(cfg.slots) ? cfg.slots : [];
    };

    const getSlotLabel = (year, idx) => {
        const slots = getSlotsForYear(year);
        const s = slots[idx];
        if (!s) return `Slot ${idx + 1}`;
        return `#${idx + 1} · ${s.start}–${s.end} (${s.type})`;
    };

    const openAdd = () => {
        setEditing(null);
        setForm({ ...defaultForm });
        setShowModal(true);
    };

    const openEdit = (entry) => {
        setEditing(entry);
        setForm({
            year:           entry.year,
            label:          entry.label || 'COE',
            day:            entry.day,
            startSlotIndex: entry.startSlotIndex,
            endSlotIndex:   entry.endSlotIndex,
            coFacultyId:    entry.coFacultyId || '',
            section:        entry.section || 'All'
        });
        setShowModal(true);
    };

    const save = async () => {
        if (!form.day) { addToast('Day is required', 'error'); return; }
        if (Number(form.startSlotIndex) > Number(form.endSlotIndex)) {
            addToast('Start slot must be before or equal to end slot', 'error'); return;
        }
        try {
            const payload = {
                year:           Number(form.year),
                label:          form.label || 'COE',
                day:            form.day,
                startSlotIndex: Number(form.startSlotIndex),
                endSlotIndex:   Number(form.endSlotIndex),
                coFacultyId:    form.coFacultyId || null,
                section:        form.section || 'All'
            };
            if (editing) {
                await api.put(`/coe/${editing.id}`, payload);
                addToast('COE entry updated', 'success');
            } else {
                await api.post('/coe', payload);
                addToast('COE entry created', 'success');
            }
            setShowModal(false);
            load();
        } catch (err) {
            addToast(err.response?.data?.error || 'Error saving COE entry', 'error');
        }
    };

    const remove = async (id) => {
        if (!confirm('Delete this COE entry? This affects future timetable generation for ALL classes of that year.')) return;
        try {
            await api.delete(`/coe/${id}`);
            addToast('COE entry deleted');
            load();
        } catch (err) {
            addToast(err.response?.data?.error || 'Error deleting', 'error');
        }
    };

    const durationLabel = (e) => {
        const n = e.endSlotIndex - e.startSlotIndex + 1;
        return `${n} slot${n !== 1 ? 's' : ''}`;
    };

    const allSlotIndices = getSlotsForYear(form.year).map((s, i) => ({ ...s, index: i }));

    const filtered = filterYear !== ''
        ? coeEntries.filter(e => Number(e.year) === Number(filterYear))
        : coeEntries;

    return (
        <div className="fade-in">
            <ToastContainer toasts={toasts} removeToast={removeToast} />

            {/* Page Header */}
            <div className="table-header">
                <div>
                    <h1 className="page-title">COE Schedule</h1>
                    <p className="page-subtitle">
                        Pre-define Centre of Excellence blocks per year — hard constraints reserved before any subject is scheduled
                    </p>
                </div>
                <div className="btn-group">
                    <select
                        className="form-select"
                        style={{ width: 160 }}
                        value={filterYear}
                        onChange={e => setFilterYear(e.target.value)}
                    >
                        <option value="">All Years</option>
                        {YEARS.map(y => <option key={y} value={y}>Year {y}</option>)}
                    </select>
                    <button className="btn btn-primary" onClick={openAdd}>+ Add COE Block</button>
                </div>
            </div>


            {/* Table */}
            <div className="data-table-wrapper">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Year</th>
                            <th>Section</th>
                            <th>Label</th>
                            <th>Day</th>
                            <th>Start Slot</th>
                            <th>End Slot</th>
                            <th>Co-Faculty</th>
                            <th>Duration</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(entry => (
                            <tr key={entry.id}>
                                <td>
                                    <span style={{
                                        background: 'var(--primary-50)',
                                        color: 'var(--primary-600)',
                                        border: '1px solid var(--primary-200)',
                                        borderRadius: 6,
                                        padding: '3px 10px',
                                        fontSize: 12,
                                        fontWeight: 700
                                    }}>
                                        Year {entry.year}
                                    </span>
                                </td>
                                <td>
                                    <span style={{
                                        background: entry.section && entry.section !== 'All' ? '#ecfdf5' : '#f3f4f6',
                                        color: entry.section && entry.section !== 'All' ? '#047857' : '#4b5563',
                                        border: entry.section && entry.section !== 'All' ? '1px solid #a7f3d0' : '1px solid #e5e7eb',
                                        borderRadius: 6,
                                        padding: '3px 10px',
                                        fontSize: 12,
                                        fontWeight: 700
                                    }}>
                                        {entry.section || 'All'}
                                    </span>
                                </td>
                                <td>
                                    <span style={{
                                        background: COE.bg,
                                        border: `1px solid ${COE.border}`,
                                        borderRadius: 6,
                                        padding: '3px 10px',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: COE.text
                                    }}>
                                         {entry.label || 'COE'}
                                    </span>
                                </td>
                                <td>{entry.day}</td>
                                <td style={{ fontFamily: 'monospace', fontSize: 13 }}>
                                    {getSlotLabel(entry.year, entry.startSlotIndex)}
                                </td>
                                <td style={{ fontFamily: 'monospace', fontSize: 13 }}>
                                    {getSlotLabel(entry.year, entry.endSlotIndex)}
                                </td>
                                <td>
                                    {faculties.find(f => f.id === entry.coFacultyId)?.name || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                </td>
                                <td>
                                    <span className="badge" style={{
                                        background: '#f0f9ff',
                                        color: '#0369a1',
                                        border: '1px solid #7dd3fc'
                                    }}>
                                        {durationLabel(entry)}
                                    </span>
                                </td>
                                <td>
                                    <div className="table-actions">
                                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(entry)}>Edit</button>
                                        <button className="btn btn-danger btn-sm" onClick={() => remove(entry.id)}>Delete</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={9} className="empty-state">
                                    {filterYear
                                        ? `No COE blocks defined for Year ${filterYear}.`
                                        : 'No COE blocks defined yet. Click "+ Add COE Block" to create one.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Summary Cards per Year */}
            {coeEntries.length > 0 && (
                <div style={{ marginTop: 32 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
                        COE Summary by Year
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                        {YEARS.filter(y => coeEntries.some(e => Number(e.year) === y)).map(y => {
                            const yearEntries = coeEntries.filter(e => Number(e.year) === y);
                            return (
                                <div key={y} className="card" style={{ padding: '16px 20px' }}>
                                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: 'var(--text-primary)' }}>
                                        Year {y}
                                        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                                            Applies to all Year {y} classes
                                        </span>
                                    </div>
                                    {yearEntries.map(e => (
                                        <div key={e.id} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '8px 12px',
                                            marginBottom: 6,
                                            background: COE.bg,
                                            border: `1px solid ${COE.border}`,
                                            borderLeft: `3px solid ${COE.borderDark}`,
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: 13
                                        }}>
                                            <span style={{ fontWeight: 700, color: COE.text }}></span>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, color: COE.text }}>
                                                    {e.label} {e.section && e.section !== 'All' ? `(Sec ${e.section})` : '(All Sections)'}
                                                </div>
                                                {e.coFacultyId && (
                                                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 2 }}>
                                                        Co-Faculty: {faculties.find(f => f.id === e.coFacultyId)?.name || e.coFacultyId}
                                                    </div>
                                                )}
                                                <div style={{ color: COE.textLight, fontSize: 12 }}>
                                                    {e.day} · Slots {e.startSlotIndex + 1}–{e.endSlotIndex + 1} · {durationLabel(e)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Add / Edit Modal */}
            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title={editing ? 'Edit COE Block' : 'Add COE Block'}
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                        <button className="btn btn-primary" onClick={save}>
                            {editing ? 'Update' : 'Create'}
                        </button>
                    </>
                }
            >
                {/* Year */}
                <div className="form-group">
                    <label className="form-label">Year <span style={{ color: 'var(--error)' }}>*</span></label>
                    <div style={{ display: 'flex', gap: 10 }}>
                        {YEARS.map(y => (
                            <button
                                key={y}
                                type="button"
                                onClick={() => setForm({ ...form, year: y, startSlotIndex: 0, endSlotIndex: 0 })}
                                style={{
                                    flex: 1,
                                    padding: '10px 0',
                                    borderRadius: 'var(--radius-md)',
                                    border: Number(form.year) === y ? `2px solid ${COE.borderDark}` : '1px solid var(--glass-border)',
                                    background: Number(form.year) === y ? COE.bgLight : 'var(--glass-bg)',
                                    color: Number(form.year) === y ? COE.text : 'var(--text-primary)',
                                    fontWeight: Number(form.year) === y ? 700 : 500,
                                    cursor: 'pointer',
                                    fontSize: 14
                                }}
                            >
                                Year {y}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Section selection */}
                <div className="form-group">
                    <label className="form-label">Section <span style={{ color: 'var(--error)' }}>*</span></label>
                    <select
                        className="form-select"
                        value={form.section}
                        onChange={e => setForm({ ...form, section: e.target.value })}
                    >
                        <option value="All">All Sections</option>
                        {sections.map(s => (
                            <option key={s} value={s}>Section {s}</option>
                        ))}
                    </select>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                        Choose whether this block applies to all sections or a specific class section of this year
                    </span>
                </div>

                {/* Label */}
                <div className="form-group">
                    <label className="form-label">COE Label</label>
                    <input
                        className="form-input"
                        value={form.label}
                        onChange={e => setForm({ ...form, label: e.target.value })}
                        placeholder="e.g. COE – AI Workshop"
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Descriptive name shown on the timetable grid
                    </span>
                </div>

                {/* Day */}
                <div className="form-group">
                    <label className="form-label">Day <span style={{ color: 'var(--error)' }}>*</span></label>
                    <select
                        className="form-select"
                        value={form.day}
                        onChange={e => setForm({ ...form, day: e.target.value })}
                    >
                        {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>

                {/* Co-Faculty (Optional) */}
                <div className="form-group">
                    <label className="form-label">Co-Faculty <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                    <select
                        className="form-select"
                        value={form.coFacultyId}
                        onChange={e => setForm({ ...form, coFacultyId: e.target.value })}
                    >
                        <option value="">— None —</option>
                        {faculties.map(f => (
                            <option key={f.id} value={f.id}>{f.name} ({f.id})</option>
                        ))}
                    </select>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        This faculty will be blocked from other subjects during this COE slot
                    </span>
                </div>

                {/* Slot range */}
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Start Slot <span style={{ color: 'var(--error)' }}>*</span></label>
                        <select
                            className="form-select"
                            value={form.startSlotIndex}
                            onChange={e => {
                                const v = Number(e.target.value);
                                setForm({ ...form, startSlotIndex: v, endSlotIndex: Math.max(v, Number(form.endSlotIndex)) });
                            }}
                        >
                            {allSlotIndices.length === 0
                                ? <option value={0}>No slots configured</option>
                                : allSlotIndices.map(s => (
                                    <option key={s.index} value={s.index}>
                                        #{s.index + 1} · {s.start}–{s.end} [{s.type}]
                                    </option>
                                ))
                            }
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">End Slot <span style={{ color: 'var(--error)' }}>*</span></label>
                        <select
                            className="form-select"
                            value={form.endSlotIndex}
                            onChange={e => setForm({ ...form, endSlotIndex: Number(e.target.value) })}
                        >
                            {allSlotIndices
                                .filter(s => s.index >= Number(form.startSlotIndex))
                                .map(s => (
                                    <option key={s.index} value={s.index}>
                                        #{s.index + 1} · {s.start}–{s.end} [{s.type}]
                                    </option>
                                ))
                            }
                        </select>
                    </div>
                </div>

                {/* Duration preview */}
                <div style={{
                    background: COE.bg,
                    border: `1px solid ${COE.border}`,
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 14px',
                    fontSize: 13,
                    color: COE.text,
                    marginTop: 4
                }}>
                    <strong> Block preview:</strong>&nbsp;
                    Year {form.year} · {form.day} · Slots {Number(form.startSlotIndex) + 1}–{Number(form.endSlotIndex) + 1}&nbsp;
                    ({Number(form.endSlotIndex) - Number(form.startSlotIndex) + 1} slot
                    {Number(form.endSlotIndex) - Number(form.startSlotIndex) + 1 !== 1 ? 's' : ''})
                    {(() => {
                        const s = allSlotIndices[form.startSlotIndex];
                        const e = allSlotIndices[form.endSlotIndex];
                        if (s && e) return <span> · {s.start} – {e.end}</span>;
                    })()}
                </div>
            </Modal>
        </div>
    );
}
