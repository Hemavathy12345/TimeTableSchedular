import { useState, useEffect } from 'react';
import api from '../utils/api';
import Modal from '../components/Modal';
import { useToast, ToastContainer } from '../components/Toast';
import { useAuth } from '../context/AuthContext';

export default function Departments() {
    const [departments, setDepartments] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', code: '' });
    const { toasts, addToast, removeToast } = useToast();
    const [selectedIds, setSelectedIds] = useState([]);
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';

    useEffect(() => { load(); }, []);

    const load = async () => {
        const res = await api.get('/departments');
        setDepartments(res.data);
        setSelectedIds([]);
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

    const handleBulkDelete = async () => {
        if (!confirm(`Delete ${selectedIds.length} departments?`)) return;
        try {
            await api.post('/departments/bulk-delete', { ids: selectedIds });
            addToast(`${selectedIds.length} departments deleted`);
            load();
        } catch (err) {
            addToast(err.response?.data?.error || 'Error during bulk delete', 'error');
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === departments.length) setSelectedIds([]);
        else setSelectedIds(departments.map(d => d.id));
    };

    return (
        <div className="fade-in">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <div className="table-header">
                <div>
                    <h1 className="page-title">Departments</h1>
                    <p className="page-subtitle">Manage academic departments</p>
                </div>
                <div className="btn-group">
                    {isAdmin && selectedIds.length > 0 && (
                        <button className="btn btn-danger" onClick={handleBulkDelete}>Delete Selected ({selectedIds.length})</button>
                    )}
                    {isAdmin && <button className="btn btn-primary" onClick={openAdd}>+ Add Department</button>}
                </div>
            </div>

            <div className="data-table-wrapper">
                <table className="data-table">
                    <thead>
                        <tr>
                            {isAdmin && <th style={{ width: 40 }}>
                                <input type="checkbox" checked={departments.length > 0 && selectedIds.length === departments.length} onChange={toggleSelectAll} />
                            </th>}
                            <th>Name</th>
                            <th>Code</th>
                            {isAdmin && <th>Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {departments.map(d => (
                            <tr key={d.id} className={selectedIds.includes(d.id) ? 'row-selected' : ''}>
                                {isAdmin && <td>
                                    <input type="checkbox" checked={selectedIds.includes(d.id)} onChange={() => toggleSelect(d.id)} />
                                </td>}
                                <td style={{ fontWeight: 600 }}>{d.name}</td>
                                <td><span className="badge badge-theory">{d.code}</span></td>
                                {isAdmin && <td>
                                    <div className="table-actions">
                                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(d)}>Edit</button>
                                        <button className="btn btn-danger btn-sm" onClick={() => remove(d.id)}>Delete</button>
                                    </div>
                                </td>}
                            </tr>
                        ))}
                        {departments.length === 0 && (
                            <tr><td colSpan={isAdmin ? 4 : 2} className="empty-state">No departments yet</td></tr>
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
