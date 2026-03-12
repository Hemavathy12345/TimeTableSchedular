import { useState, useEffect } from 'react';
import api from '../utils/api';
import Modal from '../components/Modal';
import { useToast, ToastContainer } from '../components/Toast';

export default function Classes() {
    const [classes, setClasses] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', year: 1, section: 'A', departmentId: '', defaultRoomId: '' });
    const { toasts, addToast, removeToast } = useToast();

    useEffect(() => { load(); }, []);

    const load = async () => {
        const [c, d, r] = await Promise.all([api.get('/classes'), api.get('/departments'), api.get('/rooms')]);
        setClasses(c.data); setDepartments(d.data); setRooms(r.data);
    };

    const deptName = (id) => departments.find(d => d.id === id)?.name || '-';
    const roomName = (id) => rooms.find(r => r.id === id)?.name || '-';
    const openAdd = () => { 
        setEditing(null); 
        setForm({ 
            name: '', year: 1, section: 'A', 
            departmentId: departments[0]?.id || '',
            defaultRoomId: '' 
        }); 
        setShowModal(true); 
    };
    const openEdit = (c) => { 
        setEditing(c); 
        setForm({ 
            name: c.name, year: c.year, section: c.section, 
            departmentId: c.departmentId,
            defaultRoomId: c.defaultRoomId || '' 
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

    return (
        <div className="fade-in">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <div className="table-header">
                <div>
                    <h1 className="page-title">🎓 Classes & Sections</h1>
                    <p className="page-subtitle">Manage class sections by year and department</p>
                </div>
                <button className="btn btn-primary" onClick={openAdd}>+ Add Class</button>
            </div>
            <div className="data-table-wrapper">
                <table className="data-table">
                    <thead><tr><th>Name</th><th>Year</th><th>Section</th><th>Department</th><th>Default Room</th><th>Actions</th></tr></thead>
                    <tbody>
                        {classes.map(c => (
                            <tr key={c.id}>
                                <td style={{ fontWeight: 600 }}>{c.name}</td>
                                <td>Year {c.year}</td>
                                <td><span className="badge badge-success">{c.section}</span></td>
                                <td>{deptName(c.departmentId)}</td>
                                <td><span className="badge badge-classroom">{roomName(c.defaultRoomId)}</span></td>
                                <td>
                                    <div className="table-actions">
                                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>✏️</button>
                                        <button className="btn btn-danger btn-sm" onClick={() => remove(c.id)}>🗑</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {classes.length === 0 && <tr><td colSpan={6} className="empty-state">No classes found</td></tr>}
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
                    <select className="form-select" value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })}>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
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
            </Modal>
        </div>
    );
}
