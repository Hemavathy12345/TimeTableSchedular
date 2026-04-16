import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/Toast';

export default function TimeSlots() {
    const [selectedIds, setSelectedIds] = useState([]);

    useEffect(() => { load(); }, []);

    const load = async () => {
        const res = await api.get('/timeslots');
        setConfigs(res.data);
        setSelectedIds([]);
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Delete ${selectedIds.length} year configurations? This will remove all slot timings for these years.`)) return;
        try {
            await api.post('/timeslots/bulk-delete', { ids: selectedIds });
            addToast(`${selectedIds.length} configurations deleted`);
            load();
        } catch (err) {
            addToast(err.response?.data?.error || 'Error during bulk delete', 'error');
        }
    };

    const toggleSelect = (id) => {
        if (!id) return;
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    useEffect(() => {
        const config = configs.find(c => c.year === selectedYear);
        if (config) {
            const data = JSON.parse(JSON.stringify(config));
            if (!data.days.includes('Saturday')) data.days.push('Saturday');
            setEditingConfig(data);
        } else {
            setEditingConfig({
                year: selectedYear,
                days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
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
            const configToSave = { 
                ...editingConfig,
                days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
            };

            if (configToSave.days.length === 0) {
                addToast('Please select at least one day', 'error');
                return;
            }
            if (configToSave.id) {
                await api.put(`/timeslots/${configToSave.id}`, configToSave);
            } else {
                await api.post('/timeslots', configToSave);
            }
            addToast(`Year ${selectedYear} time slots saved`);
            load();
        } catch (err) { addToast(err.response?.data?.error || 'Error saving', 'error'); }
    };

    const getSlotColor = (type) => {
        switch (type) {
            case 'break': return 'var(--warning)';
            case 'lunch': return 'var(--success)';
            case 'activity': return '#a78bfa';
            default: return 'var(--primary-400)';
        }
    };

    return (
        <div className="fade-in">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <div className="table-header">
                <div>
                    <h1 className="page-title">Time Slot Configuration</h1>
                    <p className="page-subtitle">Configure staggered timings and working days for each year level</p>
                </div>
                <div className="btn-group">
                    {selectedIds.length > 0 && (
                        <button className="btn btn-danger" onClick={handleBulkDelete}>Delete Selected ({selectedIds.length})</button>
                    )}
                    <button className="btn btn-primary" onClick={save}>Save Configuration</button>
                </div>
            </div>

            <div className="view-toggle" style={{ marginBottom: 24, width: 'fit-content', display: 'flex', gap: 12, alignItems: 'center' }}>
                {[1, 2, 3, 4].map(y => {
                    const configId = configs.find(c => c.year === y)?.id;
                    return (
                        <div key={y} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <button
                                className={`view-toggle-btn ${selectedYear === y ? 'active' : ''}`}
                                onClick={() => setSelectedYear(y)}
                            >
                                Year {y}
                            </button>
                            {configId && (
                                <input 
                                    type="checkbox" 
                                    checked={selectedIds.includes(configId)} 
                                    onChange={() => toggleSelect(configId)} 
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {editingConfig && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>



                    <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 600 }}>Year {selectedYear} Periods</h2>
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
                                        <option value="class">Class</option>
                                        <option value="break">Break</option>
                                        <option value="lunch">Lunch</option>
                                        <option value="activity">Activity Hour</option>
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
                </div>
            )}
        </div>
    );
}
