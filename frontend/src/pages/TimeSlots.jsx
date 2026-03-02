import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/Toast';

export default function TimeSlots() {
    const [configs, setConfigs] = useState([]);
    const [selectedYear, setSelectedYear] = useState(1);
    const [editingConfig, setEditingConfig] = useState(null);
    const { toasts, addToast, removeToast } = useToast();

    useEffect(() => { load(); }, []);

    const load = async () => {
        const res = await api.get('/timeslots');
        setConfigs(res.data);
    };

    useEffect(() => {
        const config = configs.find(c => c.year === selectedYear);
        if (config) {
            setEditingConfig(JSON.parse(JSON.stringify(config)));
        } else {
            setEditingConfig({
                year: selectedYear,
                days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                slots: [
                    { start: '09:00', end: '09:50', type: 'class' },
                    { start: '09:50', end: '10:40', type: 'class' },
                    { start: '10:40', end: '10:55', type: 'break' },
                    { start: '10:55', end: '11:45', type: 'class' },
                ]
            });
        }
    }, [selectedYear, configs]);

    const addSlot = () => {
        if (!editingConfig) return;
        const slots = [...editingConfig.slots];
        const last = slots[slots.length - 1];
        slots.push({ start: last?.end || '09:00', end: '09:50', type: 'class' });
        setEditingConfig({ ...editingConfig, slots });
    };

    const removeSlot = (idx) => {
        const slots = editingConfig.slots.filter((_, i) => i !== idx);
        setEditingConfig({ ...editingConfig, slots });
    };

    const updateSlot = (idx, field, value) => {
        const slots = [...editingConfig.slots];
        slots[idx] = { ...slots[idx], [field]: value };
        setEditingConfig({ ...editingConfig, slots });
    };

    const save = async () => {
        try {
            if (editingConfig.id) {
                await api.put(`/timeslots/${editingConfig.id}`, editingConfig);
            } else {
                await api.post('/timeslots', editingConfig);
            }
            addToast(`Year ${selectedYear} time slots saved`);
            load();
        } catch (err) { addToast(err.response?.data?.error || 'Error saving', 'error'); }
    };

    const getSlotColor = (type) => {
        switch (type) {
            case 'break': return 'var(--warning)';
            case 'lunch': return 'var(--success)';
            default: return 'var(--primary-400)';
        }
    };

    return (
        <div className="fade-in">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <div className="table-header">
                <div>
                    <h1 className="page-title">⏰ Time Slot Configuration</h1>
                    <p className="page-subtitle">Configure staggered timings for each year level</p>
                </div>
                <button className="btn btn-primary" onClick={save}>💾 Save Configuration</button>
            </div>

            <div className="view-toggle" style={{ marginBottom: 24, width: 'fit-content' }}>
                {[1, 2, 3, 4].map(y => (
                    <button
                        key={y}
                        className={`view-toggle-btn ${selectedYear === y ? 'active' : ''}`}
                        onClick={() => setSelectedYear(y)}
                    >
                        Year {y}
                    </button>
                ))}
            </div>

            {editingConfig && (
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Year {selectedYear} Schedule</h2>
                        <button className="btn btn-secondary btn-sm" onClick={addSlot}>+ Add Slot</button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {editingConfig.slots.map((slot, idx) => (
                            <div key={idx} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '10px 16px',
                                background: 'var(--glass-bg)',
                                border: `1px solid var(--glass-border)`,
                                borderLeft: `4px solid ${getSlotColor(slot.type)}`,
                                borderRadius: 'var(--radius-md)',
                            }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', width: 30 }}>#{idx + 1}</span>
                                <input
                                    type="time"
                                    className="form-input"
                                    style={{ width: 120 }}
                                    value={slot.start}
                                    onChange={e => updateSlot(idx, 'start', e.target.value)}
                                />
                                <span style={{ color: 'var(--text-muted)' }}>to</span>
                                <input
                                    type="time"
                                    className="form-input"
                                    style={{ width: 120 }}
                                    value={slot.end}
                                    onChange={e => updateSlot(idx, 'end', e.target.value)}
                                />
                                <select
                                    className="form-select"
                                    style={{ width: 120 }}
                                    value={slot.type}
                                    onChange={e => updateSlot(idx, 'type', e.target.value)}
                                >
                                    <option value="class">📖 Class</option>
                                    <option value="break">☕ Break</option>
                                    <option value="lunch">🍽️ Lunch</option>
                                </select>
                                <button className="btn btn-danger btn-sm btn-icon" onClick={() => removeSlot(idx)}>×</button>
                            </div>
                        ))}
                    </div>

                    {editingConfig.slots.length === 0 && (
                        <div className="empty-state">
                            <p>No slots configured. Click "Add Slot" to start.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
