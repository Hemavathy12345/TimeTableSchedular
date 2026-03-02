import { useState, useEffect } from 'react';
import api from '../utils/api';
import Modal from '../components/Modal';
import { useToast, ToastContainer } from '../components/Toast';

export default function Departments() {
    const [departments, setDepartments] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', code: '' });
    const { toasts, addToast, removeToast } = useToast();

    useEffect(() => { load(); }, []);

    const load = async () => {
        const res = await api.get('/departments');
        setDepartments(res.data);
    };

    const openAdd = () => { setEditing(null); setForm({ name: '', code: '' }); setShowModal(true); };
    const openEdit = (d) => { setEditing(d); setForm({ name: d.name, code: d.code }); setShowModal(true); };

    const save = async () => {
        try {
            if (editing) {
                await api.put(`/departments/${editing.id}`, form);
                addToast('Department updated');
            } else {
                await api.post('/departments', form);
                addToast('Department created');
            }
            setShowModal(false);
            load();
        } catch (err) {
            addToast(err.response?.data?.error || 'Error saving', 'error');
        }
    };

    const remove = async (id) => {
        if (!confirm('Delete this department?')) return;
        await api.delete(`/departments/${id}`);
        addToast('Department deleted');
        load();
    };

    return (
        <div className="fade-in">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <div className="table-header">
                <div>
                    <h1 className="page-title">🏛️ Departments</h1>
                    <p className="page-subtitle">Manage academic departments</p>
                </div>
                <button className="btn btn-primary" onClick={openAdd}>+ Add Department</button>
            </div>

            <div className="data-table-wrapper">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Code</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {departments.map(d => (
                            <tr key={d.id}>
                                <td style={{ fontWeight: 600 }}>{d.name}</td>
                                <td><span className="badge badge-theory">{d.code}</span></td>
                                <td>
                                    <div className="table-actions">
                                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(d)}>✏️ Edit</button>
                                        <button className="btn btn-danger btn-sm" onClick={() => remove(d.id)}>🗑 Delete</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {departments.length === 0 && (
                            <tr><td colSpan={3} className="empty-state">No departments yet</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Department' : 'Add Department'}
                footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
                <div className="form-group">
                    <label className="form-label">Department Name</label>
                    <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Computer Science" />
                </div>
                <div className="form-group">
                    <label className="form-label">Code</label>
                    <input className="form-input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. CSE" />
                </div>
            </Modal>
        </div>
    );
}
