import { useState, useEffect } from 'react';
import api from '../utils/api';
import Modal from '../components/Modal';
import { useToast, ToastContainer } from '../components/Toast';
import { useAuth } from '../context/AuthContext';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const YEARS = [1, 2, 3, 4];

// COE color theme — soft indigo/violet
const COE = {
    bg:         'var(--primary-50)',
    bgLight:    'var(--primary-50)',
    border:     'var(--primary-200)',
    borderDark: 'var(--primary)',
    text:       'var(--primary-color)',
    textLight:  'var(--navy)',
};

export default function CoeSchedule() {
    const [coeEntries, setCoeEntries] = useState([]);
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const canEdit = user?.role === 'admin' || user?.role === 'department_user';
    const [configs, setConfigs]       = useState([]);
    const [faculties, setFaculties]   = useState([]);
    const [sections, setSections]     = useState([]);
    const [showModal, setShowModal]   = useState(false);
    const [editing, setEditing]       = useState(null);
    const [departments, setDepartments] = useState([]);
    const [filterYear, setFilterYear] = useState('');
    const { toasts, addToast, removeToast } = useToast();

    const defaultForm = { year: 1, label: 'COE', day: 'Monday', startSlotIndex: 0, endSlotIndex: 0, coFacultyId: '', sections: ['All'], departments: ['All'] };
    const [form, setForm] = useState(defaultForm);

    useEffect(() => { load(); }, []);

    const load = async () => {
        const [coe, cfg, fac, cls, dept] = await Promise.all([
            api.get('/coe'),
            api.get('/timeslots'),
            api.get('/faculty?all=true'),
            api.get('/classes?all=true'),
            api.get('/departments')
        ]);
        setCoeEntries(coe.data);
        setConfigs(cfg.data);
        setFaculties(fac.data);
        const uniqueSects = [...new Set(cls.data.map(c => c.section).filter(Boolean))].sort();
        setSections(uniqueSects);
        setDepartments(dept.data);
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
            sections:       entry.sections && entry.sections.length > 0 ? entry.sections : [entry.section || 'All'],
            departments:    entry.departments && entry.departments.length > 0 ? entry.departments : ['All']
        });
        setShowModal(true);
    };

    const save = async () => {
        if (!form.day) { addToast('Day is required', 'error'); return; }
        if (Number(form.startSlotIndex) > Number(form.endSlotIndex)) {
            addToast('Start slot must be before or equal to end slot', 'error'); return;
        }
        if (!form.sections || form.sections.length === 0) {
            addToast('At least one section must be selected', 'error'); return;
        }
        if (!form.departments || form.departments.length === 0) {
            addToast('At least one department must be selected', 'error'); return;
        }
        try {
            const payload = {
                year:           Number(form.year),
                label:          form.label || 'COE',
                day:            form.day,
                startSlotIndex: Number(form.startSlotIndex),
                endSlotIndex:   Number(form.endSlotIndex),
                coFacultyId:    form.coFacultyId || null,
                sections:       form.sections,
                departments:    form.departments
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
                    {canEdit && <button className="btn btn-primary" onClick={openAdd}>+ Add COE Block</button>}
                </div>
            </div>


            {/* Table */}
            <div className="data-table-wrapper">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Year</th>
                            <th>Department</th>
                            <th>Section</th>
                            <th>Label</th>
                            <th>Day</th>
                            <th>Start Slot</th>
                            <th>End Slot</th>
                            <th>Co-Faculty</th>
                            <th>Duration</th>
                            {canEdit && <th>Actions</th>}
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
                                    {(() => {
                                        const entryDepts = entry.departments && entry.departments.length > 0 ? entry.departments : ['All'];
                                        const isAll = entryDepts.includes('All');
                                        if (isAll) {
                                            return <span className="badge badge-success">All</span>;
                                        }
                                        const deptCodes = entryDepts.map(dId => {
                                            const d = departments.find(dept => dept.id === dId);
                                            return d ? (d.code || d.name) : dId;
                                        });
                                        return (
                                            <span style={{
                                                background: 'var(--primary-50)',
                                                color: 'var(--primary-color)',
                                                border: '1px solid var(--primary-200)',
                                                borderRadius: 6,
                                                padding: '3px 10px',
                                                fontSize: 12,
                                                fontWeight: 700
                                            }}>
                                                {deptCodes.join(', ')}
                                            </span>
                                        );
                                    })()}
                                </td>
                                <td>
                                    {(() => {
                                        const entrySections = entry.sections && entry.sections.length > 0 ? entry.sections : [entry.section || 'All'];
                                        const isAll = entrySections.includes('All');
                                        return (
                                            <span style={{
                                                background: !isAll ? 'var(--gold-l)' : 'var(--bg-color)',
                                                color: !isAll ? 'var(--navy)' : 'var(--text-secondary)',
                                                border: !isAll ? '1px solid var(--gold)' : '1px solid var(--border-color)',
                                                borderRadius: 6,
                                                padding: '3px 10px',
                                                fontSize: 12,
                                                fontWeight: 700
                                            }}>
                                                {entrySections.join(', ')}
                                            </span>
                                        );
                                    })()}
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
                                        background: 'var(--primary-50)',
                                        color: 'var(--primary-color)',
                                        border: '1px solid var(--primary-200)'
                                    }}>
                                        {durationLabel(entry)}
                                    </span>
                                </td>
                                {canEdit && (
                                    <td>
                                        <div className="table-actions">
                                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(entry)}>Edit</button>
                                            <button className="btn btn-danger btn-sm" onClick={() => remove(entry.id)}>Delete</button>
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={canEdit ? 10 : 9} className="empty-state">
                                    {filterYear
                                        ? `No COE blocks defined for Year ${filterYear}.`
                                        : isAdmin 
                                            ? 'No COE blocks defined yet. Click "+ Add COE Block" to create one.'
                                            : 'No COE blocks defined yet.'}
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
                                                    {(() => {
                                                        const entrySections = e.sections && e.sections.length > 0 ? e.sections : [e.section || 'All'];
                                                        const isAllSec = entrySections.includes('All');
                                                        const entryDepts = e.departments && e.departments.length > 0 ? e.departments : ['All'];
                                                        const isAllDept = entryDepts.includes('All');
                                                        const deptCodes = isAllDept ? 'All Depts' : entryDepts.map(dId => {
                                                            const d = departments.find(dept => dept.id === dId);
                                                            return d ? (d.code || d.name) : dId;
                                                        }).join(', ');
                                                        return (
                                                            <>
                                                                {e.label} ({deptCodes} • {!isAllSec ? `Sec ${entrySections.join(', ')}` : 'All Secs'})
                                                            </>
                                                        );
                                                    })()}
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

                {/* Department selection */}
                <div className="form-group">
                    <label className="form-label">Departments <span style={{ color: 'var(--error)' }}>*</span></label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        <label className="checkbox-item" style={{ flex: '1 1 120px', minWidth: 120, margin: 0 }}>
                            <input
                                type="checkbox"
                                checked={form.departments ? form.departments.includes('All') : true}
                                onChange={e => {
                                    if (e.target.checked) {
                                        setForm({ ...form, departments: ['All'] });
                                    } else {
                                        setForm({ ...form, departments: [] });
                                    }
                                }}
                            />
                            <strong>All Departments</strong>
                        </label>
                        {departments.map(d => (
                            <label key={d.id} className="checkbox-item" style={{ flex: '1 1 120px', minWidth: 120, margin: 0 }}>
                                <input
                                    type="checkbox"
                                    checked={form.departments ? form.departments.includes(d.id) : false}
                                    onChange={e => {
                                        let newDepts = form.departments ? [...form.departments] : [];
                                        if (e.target.checked) {
                                            newDepts = newDepts.filter(x => x !== 'All');
                                            newDepts.push(d.id);
                                        } else {
                                            newDepts = newDepts.filter(x => x !== d.id);
                                        }
                                        if (newDepts.length === 0) {
                                            newDepts = ['All'];
                                        }
                                        setForm({ ...form, departments: newDepts });
                                    }}
                                />
                                <span>{d.code || d.name}</span>
                            </label>
                        ))}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                        Choose whether this block applies to all departments or specific departments
                    </span>
                </div>

                {/* Section selection */}
                <div className="form-group">
                    <label className="form-label">Section <span style={{ color: 'var(--error)' }}>*</span></label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        <label className="checkbox-item" style={{ flex: '1 1 120px', minWidth: 120, margin: 0 }}>
                            <input
                                type="checkbox"
                                checked={form.sections ? form.sections.includes('All') : true}
                                onChange={e => {
                                    if (e.target.checked) {
                                        setForm({ ...form, sections: ['All'] });
                                    } else {
                                        setForm({ ...form, sections: [] });
                                    }
                                }}
                            />
                            <strong>All Sections</strong>
                        </label>
                        {sections.map(s => (
                            <label key={s} className="checkbox-item" style={{ flex: '1 1 120px', minWidth: 120, margin: 0 }}>
                                <input
                                    type="checkbox"
                                    checked={form.sections ? form.sections.includes(s) : false}
                                    onChange={e => {
                                        let newSects = form.sections ? [...form.sections] : [];
                                        if (e.target.checked) {
                                            newSects = newSects.filter(x => x !== 'All');
                                            newSects.push(s);
                                        } else {
                                            newSects = newSects.filter(x => x !== s);
                                        }
                                        if (newSects.length === 0) {
                                            newSects = ['All'];
                                        }
                                        setForm({ ...form, sections: newSects });
                                    }}
                                />
                                <span>Section {s}</span>
                            </label>
                        ))}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                        Choose whether this block applies to all sections or specific class sections of this year
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
                    Year {form.year} {form.departments && !form.departments.includes('All') ? `(${form.departments.map(dId => departments.find(d => d.id === dId)?.code || dId).join(', ')})` : '(All Depts)'} {form.sections && !form.sections.includes('All') ? `(Sec ${form.sections.join(', ')})` : '(All Sections)'} · {form.day} · Slots {Number(form.startSlotIndex) + 1}–{Number(form.endSlotIndex) + 1}&nbsp;
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
