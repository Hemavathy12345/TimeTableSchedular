import { useState, useEffect } from 'react';
import api from '../utils/api';
import Modal from '../components/Modal';
import { useToast, ToastContainer } from '../components/Toast';
import { useAuth } from '../context/AuthContext';

export default function Classes() {
    const [classes, setClasses] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [faculty, setFaculty] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', year: 1, section: 'A', departmentId: '', defaultRoomId: '', advisorId: '', tutor1Id: '', tutor2Id: '' });
    const { toasts, addToast, removeToast } = useToast();
    const [selectedIds, setSelectedIds] = useState([]);
    const [filters, setFilters] = useState({ dept: '', year: '' });
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const myDeptId = user?.departmentId;

    useEffect(() => { load(); }, []);

    const load = async () => {
        const [c, d, r, f] = await Promise.all([api.get('/classes'), api.get('/departments'), api.get('/rooms'), api.get('/faculty')]);
        setClasses(c.data); setDepartments(d.data); setRooms(r.data); setFaculty(f.data);
        setSelectedIds([]);

        // Default to CSE department if found in the list for admin, otherwise myDeptId
        if (isAdmin) {
            const cseDept = d.data.find(dept => (dept.code || '').toUpperCase() === 'CSE' || (dept.name || '').toLowerCase().includes('computer science'));
            if (cseDept) {
                setFilters(prev => ({ ...prev, dept: cseDept.id }));
            }
        } else if (myDeptId) {
            setFilters(prev => ({ ...prev, dept: myDeptId }));
        }
    };

    const deptName = (id) => departments.find(d => d.id === id)?.name || '-';
    const roomName = (id) => rooms.find(r => r.id === id)?.name || '-';
    const advisorName = (id) => faculty.find(f => f.id === id)?.name || '-';
    const openAdd = () => {
        setEditing(null);
        setForm({
            name: '', year: 1, section: 'A',
            departmentId: isAdmin ? (departments[0]?.id || '') : myDeptId,
            defaultRoomId: '',
            advisorId: '',
            tutor1Id: '',
            tutor2Id: ''
        });
        setShowModal(true);
    };
    const openEdit = (c) => {
        setEditing(c);
        setForm({
            name: c.name, year: c.year, section: c.section,
            departmentId: c.departmentId,
            defaultRoomId: c.defaultRoomId || '',
            advisorId: c.advisorId || '',
            tutor1Id: c.tutor1Id || '',
            tutor2Id: c.tutor2Id || ''
        });
        setShowModal(true);
    };

    const save = async () => {
        try {
            if (editing) { await api.put(`/classes/${editing.id}`, form); addToast('Class updated'); }
            else { await api.post('/classes', form); addToast('Class added'); }
            setShowModal(false); load();
        } catch (err) { addToast(err.response?.data?.error || 'Error', 'error'); }
    };

    const remove = async (id) => {
        if (!confirm('Delete this class?')) return;
        await api.delete(`/classes/${id}`); addToast('Class deleted'); load();
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Delete ${selectedIds.length} classes?`)) return;
        try {
            await api.post('/classes/bulk-delete', { ids: selectedIds });
            addToast(`${selectedIds.length} classes deleted`);
            load();
        } catch (err) {
            addToast(err.response?.data?.error || 'Error during bulk delete', 'error');
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const filteredClasses = classes.filter(c => {
        if (filters.dept && c.departmentId !== filters.dept) return false;
        if (filters.year && c.year.toString() !== filters.year) return false;
        return true;
    });

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredClasses.length) setSelectedIds([]);
        else setSelectedIds(filteredClasses.map(c => c.id));
    };

    return (
        <div className="fade-in">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <div className="table-header">
                <div>
                    <h1 className="page-title"> Classes & Sections</h1>
                    <p className="page-subtitle">Manage class sections by year and department</p>
                </div>
                <div className="btn-group">
                    {isAdmin && (
                        <select className="form-select" style={{ width: 180 }} value={filters.dept} onChange={e => setFilters({ ...filters, dept: e.target.value })}>
                            <option value="">All Departments</option>
                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    )}
                    <select className="form-select" style={{ width: 120 }} value={filters.year} onChange={e => setFilters({ ...filters, year: e.target.value })}>
                        <option value="">All Years</option>
                        {[1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)}
                    </select>
                    {(isAdmin || myDeptId) && selectedIds.length > 0 && (
                        <button className="btn btn-danger" onClick={handleBulkDelete}>Delete Selected ({selectedIds.length})</button>
                    )}
                    {(isAdmin || myDeptId) && <button className="btn btn-primary" onClick={openAdd}>+ Add Class</button>}
                </div>
            </div>
            <div className="data-table-wrapper">
                <table className="data-table">
                    <thead>
                        <tr>
                            {(isAdmin || myDeptId) && <th style={{ width: 40 }}>
                                <input type="checkbox" checked={filteredClasses.length > 0 && selectedIds.length === filteredClasses.length} onChange={toggleSelectAll} />
                            </th>}
                            <th>Name</th><th>Year</th><th>Section</th><th>Department</th><th>Default Room</th><th>Class Advisor</th><th>Tutor 1</th><th>Tutor 2</th>{(isAdmin || myDeptId) && <th>Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredClasses.map(c => {
                            const canWrite = isAdmin || c.departmentId === myDeptId;
                            return (
                            <tr key={c.id} className={selectedIds.includes(c.id) ? 'row-selected' : ''}>
                                {(isAdmin || myDeptId) && <td>
                                    {canWrite && <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggleSelect(c.id)} />}
                                </td>}
                                <td style={{ fontWeight: 600 }}>{c.name}</td>
                                <td>Year {c.year}</td>
                                <td><span className="badge badge-success">{c.section}</span></td>
                                <td>{deptName(c.departmentId)}</td>
                                <td><span className="badge badge-classroom">{roomName(c.defaultRoomId)}</span></td>
                                <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{advisorName(c.advisorId)}</td>
                                <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{advisorName(c.tutor1Id)}</td>
                                <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{advisorName(c.tutor2Id)}</td>
                                {(isAdmin || myDeptId) && <td>
                                    {canWrite && <div className="table-actions">
                                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>Edit</button>
                                        <button className="btn btn-danger btn-sm" onClick={() => remove(c.id)}>Delete</button>
                                    </div>}
                                </td>}
                            </tr>
                        )})}
                        {filteredClasses.length === 0 && <tr><td colSpan={(isAdmin || myDeptId) ? 10 : 8} className="empty-state">No classes found</td></tr>}
                    </tbody>
                </table>
            </div>
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Class' : 'Add Class'}
                footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
                <div className="form-group">
                    <label className="form-label">Class Name</label>
                    <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. CSE 2nd Year A" />
                </div>
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Year</label>
                        <select className="form-select" value={form.year} onChange={e => setForm({ ...form, year: parseInt(e.target.value) })}>
                            {[1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Section</label>
                        <input className="form-input" value={form.section} onChange={e => setForm({ ...form, section: e.target.value })} placeholder="e.g. A" />
                    </div>
                </div>
                <div className="form-group">
                    <label className="form-label">Department</label>
                    <select className="form-select" value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })} disabled={!isAdmin}>
                        {(isAdmin ? departments : departments.filter(d => d.id === myDeptId)).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Default Classroom</label>
                    <select className="form-select" value={form.defaultRoomId} onChange={e => setForm({ ...form, defaultRoomId: e.target.value })}>
                        <option value="">None</option>
                        {rooms.filter(r => r.type === 'classroom').map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Class Advisor</label>
                    <select className="form-select" value={form.advisorId} onChange={e => setForm({ ...form, advisorId: e.target.value })}>
                        <option value="">None</option>
                        {faculty.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                    </select>
                </div>
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Tutor 1 (Optional)</label>
                        <select className="form-select" value={form.tutor1Id} onChange={e => setForm({ ...form, tutor1Id: e.target.value })}>
                            <option value="">None</option>
                            {faculty.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Tutor 2 (Optional)</label>
                        <select className="form-select" value={form.tutor2Id} onChange={e => setForm({ ...form, tutor2Id: e.target.value })}>
                            <option value="">None</option>
                            {faculty.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
