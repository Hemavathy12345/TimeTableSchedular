import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import api from '../utils/api';
import Modal from '../components/Modal';
import { useToast, ToastContainer } from '../components/Toast';

export default function Subjects() {
    const [subjects, setSubjects] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', code: '', type: 'theory', weeklyFrequency: 3, year: 1, departmentId: '', duration: 1 });
    const [filters, setFilters] = useState({ dept: '', year: '', type: '' });
    const [importData, setImportData] = useState([]);
    const [importErrors, setImportErrors] = useState([]);
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef(null);
    const { toasts, addToast, removeToast } = useToast();

    useEffect(() => { load(); }, []);

    const load = async () => {
        const [s, d] = await Promise.all([api.get('/subjects'), api.get('/departments')]);
        setSubjects(s.data); setDepartments(d.data);
    };

    const deptName = (id) => departments.find(d => d.id === id)?.name || '-';
    const openAdd = () => { setEditing(null); setForm({ name: '', code: '', type: 'theory', weeklyFrequency: 3, year: 1, departmentId: departments[0]?.id || '', duration: 1 }); setShowModal(true); };
    const openEdit = (s) => { setEditing(s); setForm({ name: s.name, code: s.code, type: s.type, weeklyFrequency: s.weeklyFrequency, year: s.year, departmentId: s.departmentId, duration: s.duration }); setShowModal(true); };

    const save = async () => {
        try {
            const data = { ...form, duration: form.type === 'lab' ? 2 : 1 };
            if (editing) { await api.put(`/subjects/${editing.id}`, data); addToast('Subject updated'); }
            else { await api.post('/subjects', data); addToast('Subject added'); }
            setShowModal(false); load();
        } catch (err) { addToast(err.response?.data?.error || 'Error', 'error'); }
    };

    const remove = async (id) => {
        if (!confirm('Delete this subject?')) return;
        await api.delete(`/subjects/${id}`); addToast('Subject deleted'); load();
    };

    // ── Excel Import ──────────────────────────────────────────────────────────
    const downloadTemplate = () => {
        const ws = XLSX.utils.aoa_to_sheet([
            ['name', 'code', 'type', 'duration', 'year', 'department'],
            ['Programming for Problem Solving', 'U23CS101', 'Theory', 4, 1, 'Computer Science & Engineering'],
            ['Programming for Problem Solving Lab', 'U23CS101L', 'Lab', 2, 1, 'Computer Science & Engineering'],
            ['Engineering Mathematics I', 'U23MA101', 'Theory', 4, 1, 'Computer Science & Engineering'],
            ['Data Structures', 'U23CS201', 'Theory', 3, 2, 'Computer Science & Engineering'],
            ['Data Structures Lab', 'U23CS201L', 'Lab', 2, 2, 'Computer Science & Engineering'],
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Subjects');
        XLSX.writeFile(wb, 'subjects_template.xlsx');
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const wb = XLSX.read(evt.target.result, { type: 'binary' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                setImportData(rows);
                setImportErrors([]);
            } catch {
                addToast('Failed to read Excel file', 'error');
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleImport = async () => {
        if (importData.length === 0) { addToast('No data to import', 'error'); return; }
        setImporting(true);
        try {
            const res = await api.post('/subjects/import-excel', { data: importData });
            const { success, failed, errors } = res.data;
            setImportErrors(errors || []);
            if (success > 0) {
                addToast(`✅ Imported ${success} subject${success > 1 ? 's' : ''}${failed > 0 ? `, ${failed} failed` : ''}`, failed > 0 ? 'warning' : 'success');
                load();
            }
            if (failed > 0 && success === 0) addToast(`All ${failed} rows failed`, 'error');
            if (failed === 0) { setShowImportModal(false); setImportData([]); }
        } catch (err) {
            addToast(err.response?.data?.error || 'Import failed', 'error');
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const openImport = () => { setImportData([]); setImportErrors([]); setShowImportModal(true); };
    // ─────────────────────────────────────────────────────────────────────────

    let filtered = subjects;
    if (filters.dept) filtered = filtered.filter(s => s.departmentId === filters.dept);
    if (filters.year) filtered = filtered.filter(s => s.year === parseInt(filters.year));
    if (filters.type) filtered = filtered.filter(s => s.type === filters.type);

    return (
        <div className="fade-in">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <div className="table-header">
                <div>
                    <h1 className="page-title">📚 Subjects</h1>
                    <p className="page-subtitle">Manage subjects with weekly frequency and type settings</p>
                </div>
                <div className="btn-group">
                    <select className="form-select" style={{ width: 180 }} value={filters.dept} onChange={e => setFilters({ ...filters, dept: e.target.value })}>
                        <option value="">All Departments</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <select className="form-select" style={{ width: 100 }} value={filters.year} onChange={e => setFilters({ ...filters, year: e.target.value })}>
                        <option value="">All Years</option>
                        {[1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)}
                    </select>
                    <select className="form-select" style={{ width: 110 }} value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}>
                        <option value="">All Types</option>
                        <option value="theory">Theory</option>
                        <option value="lab">Lab</option>
                    </select>
                    <button className="btn btn-secondary" onClick={openImport}>📥 Import Excel</button>
                    <button className="btn btn-primary" onClick={openAdd}>+ Add Subject</button>
                </div>
            </div>

            <div className="data-table-wrapper">
                <table className="data-table">
                    <thead><tr><th>Name</th><th>Code</th><th>Type</th><th>Weekly Freq.</th><th>Year</th><th>Department</th><th>Actions</th></tr></thead>
                    <tbody>
                        {filtered.map(s => (
                            <tr key={s.id}>
                                <td style={{ fontWeight: 600 }}>{s.name}</td>
                                <td>{s.code}</td>
                                <td><span className={`badge ${s.type === 'lab' ? 'badge-lab' : 'badge-theory'}`}>{s.type}</span></td>
                                <td>{s.weeklyFrequency}x / week</td>
                                <td>Year {s.year}</td>
                                <td>{deptName(s.departmentId)}</td>
                                <td>
                                    <div className="table-actions">
                                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>✏️</button>
                                        <button className="btn btn-danger btn-sm" onClick={() => remove(s.id)}>🗑</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && <tr><td colSpan={7} className="empty-state">No subjects found</td></tr>}
                    </tbody>
                </table>
            </div>

            {/* Add / Edit Modal */}
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Subject' : 'Add Subject'}
                footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Subject Name</label>
                        <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Data Structures" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Code</label>
                        <input className="form-input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. CS201" />
                    </div>
                </div>
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Type</label>
                        <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                            <option value="theory">Theory</option>
                            <option value="lab">Lab</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Weekly Frequency</label>
                        <input className="form-input" type="number" min="1" max="7" value={form.weeklyFrequency} onChange={e => setForm({ ...form, weeklyFrequency: parseInt(e.target.value) })} />
                    </div>
                </div>
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Year</label>
                        <select className="form-select" value={form.year} onChange={e => setForm({ ...form, year: parseInt(e.target.value) })}>
                            {[1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Department</label>
                        <select className="form-select" value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })}>
                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                </div>
            </Modal>

            {/* Import Excel Modal */}
            <Modal isOpen={showImportModal} onClose={() => setShowImportModal(false)} title="📥 Import Subjects from Excel"
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={downloadTemplate}>⬇ Download Template</button>
                        <button className="btn btn-secondary" onClick={() => setShowImportModal(false)}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleImport} disabled={importing || importData.length === 0}>
                            {importing ? 'Importing...' : `Import ${importData.length > 0 ? `(${importData.length} rows)` : ''}`}
                        </button>
                    </>
                }>
                <div className="form-group">
                    <label className="form-label">Select Excel File (.xlsx / .xls)</label>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="form-input" onChange={handleFileChange} />
                </div>

                {/* Required columns info */}
                <div style={{ background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 8, padding: '12px 16px', marginBottom: 12, fontSize: 13 }}>
                    <strong>Supported columns:</strong><br />
                    • <code>Course Name</code> / <code>name</code><br />
                    • <code>Course Code</code> / <code>code</code><br />
                    • <code>Type (Theory/Lab)</code> / <code>type</code><br />
                    • <code>Weekly Frequency</code> / <code>weeklyFrequency</code><br />
                    • <code>Year</code> (I / II / III / IV or 1–4)<br />
                    • <code>Department</code> / <code>departmentId</code> (Name or Code)
                </div>

                {/* Preview table */}
                {importData.length > 0 && (
                    <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 8 }}>
                        <table className="data-table" style={{ fontSize: 12 }}>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Name</th>
                                    <th>Code</th>
                                    <th>Type</th>
                                    <th>Duration</th>
                                    <th>Year</th>
                                    <th>Department</th>
                                </tr>
                            </thead>
                            <tbody>
                                {importData.slice(0, 10).map((row, i) => (
                                    <tr key={i}>
                                        <td>{i + 1}</td>
                                        <td>{row.name}</td>
                                        <td>{row.code}</td>
                                        <td>{row.type}</td>
                                        <td>{row.duration}</td>
                                        <td>{row.year}</td>
                                        <td>{row.department}</td>
                                    </tr>
                                ))}
                                {importData.length > 10 && (
                                    <tr><td colSpan={7} style={{ textAlign: 'center', color: '#888' }}>...and {importData.length - 10} more rows</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Errors */}
                {importErrors.length > 0 && (
                    <div style={{ marginTop: 12, background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: '10px 14px', maxHeight: 120, overflowY: 'auto' }}>
                        <strong style={{ color: '#c53030', fontSize: 13 }}>⚠ Errors ({importErrors.length})</strong>
                        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: '#742a2a' }}>
                            {importErrors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                    </div>
                )}
            </Modal>
        </div>
    );
}
