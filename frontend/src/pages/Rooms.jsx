import { useState, useEffect } from 'react';
import api from '../utils/api';
import Modal from '../components/Modal';
import { useToast, ToastContainer } from '../components/Toast';
import { useAuth } from '../context/AuthContext';

export default function Rooms() {
    const [rooms, setRooms] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', type: 'classroom', capacity: 60, departmentId: '' });
    const [typeFilter, setTypeFilter] = useState('');
    const { toasts, addToast, removeToast } = useToast();
    const [selectedIds, setSelectedIds] = useState([]);
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const canEdit = user?.role === 'admin' || user?.role === 'department_user';

    useEffect(() => { load(); }, []);

    const load = async () => {
        const [r, d] = await Promise.all([api.get('/rooms'), api.get('/departments')]);
        setRooms(r.data); setDepartments(d.data);
        setSelectedIds([]);
    };

    const deptName = (id) => departments.find(d => d.id === id)?.name || '-';
    const openAdd = () => { setEditing(null); setForm({ name: '', type: 'classroom', capacity: 60, departmentId: departments[0]?.id || '' }); setShowModal(true); };
    const openEdit = (r) => { setEditing(r); setForm({ name: r.name, type: r.type, capacity: r.capacity, departmentId: r.departmentId }); setShowModal(true); };

    const save = async () => {
        try {
            if (editing) { await api.put(`/rooms/${editing.id}`, form); addToast('Room updated'); }
            else { await api.post('/rooms', form); addToast('Room added'); }
            setShowModal(false); load();
        } catch (err) { addToast(err.response?.data?.error || 'Error', 'error'); }
    };

    const remove = async (id) => {
        if (!confirm('Delete this room?')) return;
        await api.delete(`/rooms/${id}`); addToast('Room deleted'); load();
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Delete ${selectedIds.length} rooms?`)) return;
        try {
            await api.post('/rooms/bulk-delete', { ids: selectedIds });
            addToast(`${selectedIds.length} rooms deleted`);
            load();
        } catch (err) {
            addToast(err.response?.data?.error || 'Error during bulk delete', 'error');
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = (filteredItems) => {
        if (selectedIds.length === filteredItems.length) setSelectedIds([]);
        else setSelectedIds(filteredItems.map(r => r.id));
    };

    const filtered = typeFilter ? rooms.filter(r => r.type === typeFilter) : rooms;

    return (
        <div className="fade-in">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <div className="table-header">
                <div>
                    <h1 className="page-title">Rooms & Labs</h1>
                    <p className="page-subtitle">Manage classrooms and laboratory spaces</p>
                </div>
                <div className="btn-group">
                    {canEdit && selectedIds.length > 0 && (
                        <button className="btn btn-danger" onClick={handleBulkDelete}>Delete Selected ({selectedIds.length})</button>
                    )}
                    <select className="form-select" style={{ width: 140 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                        <option value="">All Types</option>
                        <option value="classroom">Classrooms</option>
                        <option value="lab">Labs</option>
                    </select>
                    {canEdit && <button className="btn btn-primary" onClick={openAdd}>+ Add Room</button>}
                </div>
            </div>
            <div className="data-table-wrapper">
                <table className="data-table">
                    <thead>
                        <tr>
                            {canEdit && <th style={{ width: 40 }}>
                                <input type="checkbox" checked={filtered.length > 0 && selectedIds.length === filtered.length} onChange={() => toggleSelectAll(filtered)} />
                            </th>}
                            <th>Name</th><th>Type</th><th>Capacity</th><th>Department</th>{canEdit && <th>Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(r => (
                            <tr key={r.id} className={selectedIds.includes(r.id) ? 'row-selected' : ''}>
                                {canEdit && <td>
                                    <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleSelect(r.id)} />
                                </td>}
                                <td style={{ fontWeight: 600 }}>{r.name}</td>
                                <td><span className={`badge ${r.type === 'lab' ? 'badge-lab' : 'badge-classroom'}`}>{r.type}</span></td>
                                <td>{r.capacity}</td>
                                <td>{deptName(r.departmentId)}</td>
                                {canEdit && <td>
                                    <div className="table-actions">
                                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
                                        <button className="btn btn-danger btn-sm" onClick={() => remove(r.id)}>Delete</button>
                                    </div>
                                </td>}
                            </tr>
                        ))}
                        {filtered.length === 0 && <tr><td colSpan={canEdit ? 6 : 4} className="empty-state">No rooms found</td></tr>}
                    </tbody>
                </table>
            </div>
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Room' : 'Add Room'}
                footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Room Name</label>
                        <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Room 101" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Type</label>
                        <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                            <option value="classroom">Classroom</option>
                            <option value="lab">Lab</option>
                        </select>
                    </div>
                </div>
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Capacity</label>
                        <input className="form-input" type="number" value={form.capacity} onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) })} />
                    </div>
                    {isAdmin && (
                        <div className="form-group">
                            <label className="form-label">Department</label>
                            <select className="form-select" value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })}>
                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
}
