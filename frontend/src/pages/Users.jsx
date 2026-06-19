import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/Toast';
import Modal from '../components/Modal';

export default function Users() {
    const [users, setUsers] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const { toasts, addToast, removeToast } = useToast();

    const emptyForm = { name: '', username: '', email: '', password: '', role: 'department_user', departmentId: '' };
    const [form, setForm] = useState(emptyForm);

    useEffect(() => { loadAll(); }, []);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [u, d] = await Promise.all([api.get('/users'), api.get('/departments')]);
            setUsers(u.data);
            setDepartments(d.data);
        } catch (err) {
            console.error('Failed to load users or departments:', err);
            const msg = err.response?.data?.error || err.message || 'Unknown error';
            addToast(`Failed to load data: ${msg}`, 'error');
        }
        setLoading(false);
    };

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setShowModal(true);
    };

    const openEdit = (u) => {
        setEditing(u);
        setForm({ name: u.name, username: u.username, email: u.email, password: '', role: u.role, departmentId: u.departmentId || '' });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name || !form.username || !form.email || (!editing && !form.password)) {
            addToast('Please fill all required fields', 'error'); return;
        }
        if (form.role === 'department_user' && !form.departmentId) {
            addToast('Department is required for department users', 'error'); return;
        }
        try {
            const payload = { ...form };
            if (!payload.password) delete payload.password;
            if (payload.role === 'admin') delete payload.departmentId;

            if (editing) {
                await api.put(`/users/${editing.id}`, payload);
                addToast('User updated successfully');
            } else {
                await api.post('/users', payload);
                addToast('User created successfully');
            }
            setShowModal(false);
            loadAll();
        } catch (err) {
            addToast(err.response?.data?.error || 'Operation failed', 'error');
        }
    };

    const handleDelete = async (id, name) => {
        if (!confirm(`Delete user "${name}"?`)) return;
        try {
            await api.delete(`/users/${id}`);
            addToast('User deleted');
            loadAll();
        } catch (err) {
            addToast(err.response?.data?.error || 'Delete failed', 'error');
        }
    };

    const getDeptName = (deptId) => departments.find(d => d.id === deptId)?.name || deptId || '—';
    const roleBadge = (role) => {
        if (role === 'admin') return <span className="badge" style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>Admin</span>;
        if (role === 'department_user') return <span className="badge" style={{ background: '#ede9fe', color: '#5b21b6', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>Dept User</span>;
        return <span className="badge">{role}</span>;
    };

    if (loading) return <div className="loading-overlay"><div className="spinner"></div><div className="loading-text">Loading users...</div></div>;

    return (
        <div className="fade-in">
            <ToastContainer toasts={toasts} removeToast={removeToast} />

            <div className="table-header">
                <div>
                    <h1 className="page-title">User Accounts</h1>
                    <p className="page-subtitle">Manage administrator and department user accounts</p>
                </div>
                <button className="btn btn-primary" onClick={openCreate}>+ New User</button>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="data-table-wrapper">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Username</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Department</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.length === 0 ? (
                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: '#888' }}>No users found</td></tr>
                            ) : users.map(u => (
                                <tr key={u.id}>
                                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                                    <td><code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{u.username}</code></td>
                                    <td style={{ color: '#64748b', fontSize: 13 }}>{u.email}</td>
                                    <td>{roleBadge(u.role)}</td>
                                    <td style={{ fontSize: 13 }}>{getDeptName(u.departmentId)}</td>
                                    <td>
                                        <div className="btn-group">
                                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>Edit</button>
                                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u.id, u.name)}>Delete</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && (
                <Modal onClose={() => setShowModal(false)}>
                    <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>
                        {editing ? 'Edit User Account' : 'Create New User Account'}
                    </h2>

                    <div className="form-group">
                        <label className="form-label">Full Name *</label>
                        <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dr. Smith" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Username *</label>
                        <input className="form-input" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="e.g. cse_admin" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Email *</label>
                        <input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="e.g. user@institution.edu" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">{editing ? 'New Password (leave blank to keep current)' : 'Password *'}</label>
                        <input className="form-input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Role *</label>
                        <select className="form-select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value, departmentId: '' })}>
                            <option value="admin">Administrator</option>
                            <option value="department_user">Department User</option>
                        </select>
                    </div>
                    {form.role === 'department_user' && (
                        <div className="form-group">
                            <label className="form-label">Department *</label>
                            <select className="form-select" value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })}>
                                <option value="">— Select Department —</option>
                                {departments.map(d => (
                                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="btn-group" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
                        <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Save Changes' : 'Create User'}</button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
