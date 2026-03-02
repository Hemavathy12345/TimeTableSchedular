import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import Modal from '../components/Modal';
import { useToast, ToastContainer } from '../components/Toast';
import * as XLSX from 'xlsx';

export default function Faculty() {
    const [faculty, setFaculty] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', departmentId: '', designation: '' });
    const [filter, setFilter] = useState('');
    const { toasts, addToast, removeToast } = useToast();

    useEffect(() => { load(); }, []);

    const load = async () => {
        const [f, d] = await Promise.all([api.get('/faculty'), api.get('/departments')]);
        setFaculty(f.data);
        setDepartments(d.data);
    };

    const deptName = (id) => departments.find(d => d.id === id)?.name || '-';
    const openAdd = () => { setEditing(null); setForm({ name: '', departmentId: departments[0]?.id || '', designation: '' }); setShowModal(true); };
    const openEdit = (f) => { setEditing(f); setForm({ name: f.name, departmentId: f.departmentId, designation: f.designation || '' }); setShowModal(true); };

    const fileInputRef = useRef(null);

    const handleExcelImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        console.log('📁 File selected:', file.name, 'Type:', file.type, 'Size:', file.size);

        // Check file type
        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv'
        ];

        if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
            addToast('⚠️ Please select a valid Excel file (.xlsx, .xls, or .csv)', 'error');
            e.target.value = '';
            return;
        }

        addToast('📊 Processing file...', 'info');

        try {
            const reader = new FileReader();
            reader.onerror = (error) => {
                console.error('❌ FileReader error:', error);
                addToast('Error reading file', 'error');
            };

            reader.onload = async (event) => {
                try {
                    console.log('📖 File read successfully, parsing...');
                    const workbook = XLSX.read(event.target.result, { type: 'binary' });

                    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
                        throw new Error('Excel file has no sheets');
                    }

                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet);

                    console.log('📊 Excel rows parsed:', rows);
                    console.log('📋 Available departments:', departments);
                    console.log('👀 First 3 rows from Excel:');
                    console.table(rows.slice(0, 3));

                    if (rows.length === 0) {
                        addToast('⚠️ Excel file is empty', 'error');
                        return;
                    }

                    // Map Excel columns to our data structure
                    const data = rows.map((row, index) => {
                        const name = row.Name || row.name || row.Professor || row.professor || '';
                        const deptInput = row.DepartmentID || row.departmentId || row.Department || row.department || row.DepartmentCode || row.departmentCode || '';
                        const designation = row.Designation || row.designation || '';

                        // Try to find department by ID, code, or name
                        let departmentId = '';
                        if (deptInput) {
                            const dept = departments.find(d =>
                                d.id === deptInput ||
                                d.code.toLowerCase() === deptInput.toLowerCase() ||
                                d.name.toLowerCase() === deptInput.toLowerCase()
                            );
                            if (dept) {
                                departmentId = dept.id;
                            } else {
                                console.warn(`Row ${index + 2}: Could not find department for "${deptInput}"`);
                            }
                        }

                        return { name, departmentId, designation };
                    });

                    console.log('📤 Sending data to backend:', data);
                    console.log('👀 First 3 mapped records:');
                    console.table(data.slice(0, 3));

                    const result = await api.post('/faculty/import-excel', { data });
                    addToast(`✅ Import complete: ${result.data.success} successful, ${result.data.failed} failed`);
                    if (result.data.errors.length > 0) {
                        console.error('❌ Import errors:', result.data.errors);
                        addToast(`⚠️ ${result.data.errors.length} errors occurred. Check console (F12).`, 'error');
                    }
                    load();
                } catch (err) {
                    console.error('❌ Import error:', err);
                    const errorMsg = err.response?.data?.error || err.message || 'Error importing Excel file';
                    addToast(`❌ ${errorMsg}`, 'error');
                }
            };
            reader.readAsBinaryString(file);
        } catch (err) {
            console.error('❌ File read error:', err);
            addToast(`❌ Error reading file: ${err.message}`, 'error');
        }
        e.target.value = ''; // Reset file input
    };

    const save = async () => {
        try {
            if (editing) { await api.put(`/faculty/${editing.id}`, form); addToast('Faculty updated'); }
            else { await api.post('/faculty', form); addToast('Faculty added'); }
            setShowModal(false); load();
        } catch (err) { addToast(err.response?.data?.error || 'Error', 'error'); }
    };

    const remove = async (id) => {
        if (!confirm('Delete this faculty member?')) return;
        await api.delete(`/faculty/${id}`);
        addToast('Faculty deleted'); load();
    };

    const filtered = faculty.filter(f =>
        f.name.toLowerCase().includes(filter.toLowerCase()) ||
        (f.designation || '').toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div className="fade-in">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <div className="table-header">
                <div>
                    <h1 className="page-title">👨‍🏫 Faculty</h1>
                    <p className="page-subtitle">Manage faculty members across departments</p>
                </div>
                <div className="btn-group">
                    <input className="filter-input" placeholder="🔍 Search faculty..." value={filter} onChange={e => setFilter(e.target.value)} />
                    <input type="file" ref={fileInputRef} onChange={handleExcelImport} accept=".xlsx,.xls" style={{ display: 'none' }} />
                    <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>📊 Import Excel</button>
                    <button className="btn btn-primary" onClick={openAdd}>+ Add Faculty</button>
                </div>
            </div>
            <div className="data-table-wrapper">
                <table className="data-table">
                    <thead><tr><th>Name</th><th>Department</th><th>Designation</th><th>Actions</th></tr></thead>
                    <tbody>
                        {filtered.map(f => (
                            <tr key={f.id}>
                                <td style={{ fontWeight: 600 }}>{f.name}</td>
                                <td><span className="badge badge-classroom">{deptName(f.departmentId)}</span></td>
                                <td style={{ color: 'var(--text-secondary)' }}>{f.designation || '-'}</td>
                                <td>
                                    <div className="table-actions">
                                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(f)}>✏️</button>
                                        <button className="btn btn-danger btn-sm" onClick={() => remove(f.id)}>🗑</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && <tr><td colSpan={4} className="empty-state">No faculty found</td></tr>}
                    </tbody>
                </table>
            </div>
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Faculty' : 'Add Faculty'}
                footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
                <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dr. Sharma" />
                </div>
                <div className="form-group">
                    <label className="form-label">Department</label>
                    <select className="form-select" value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })}>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Designation</label>
                    <input className="form-input" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Professor, Assistant Professor, etc." />
                </div>
            </Modal>
        </div>
    );
}
