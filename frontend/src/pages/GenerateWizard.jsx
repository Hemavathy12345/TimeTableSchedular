import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/Toast';

const STEPS = [
    { label: 'Basic Info', icon: '📝' },
    { label: 'Schedule Config', icon: '⏰' },
    { label: 'Data Mapping', icon: '🔗' },
    { label: 'Faculty Mapping', icon: '👨‍🏫' },
    { label: 'Review & Generate', icon: '⚡' },
];

export default function GenerateWizard() {
    const navigate = useNavigate();
    const { toasts, addToast, removeToast } = useToast();
    const [step, setStep] = useState(0);
    const [generating, setGenerating] = useState(false);

    // Data
    const [departments, setDepartments] = useState([]);
    const [faculty, setFaculty] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [classes, setClasses] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [timeSlotConfigs, setTimeSlotConfigs] = useState([]);
    const [mappings, setMappings] = useState([]);

    // Wizard state
    const [ttName, setTtName] = useState('');
    const [ttDesc, setTtDesc] = useState('');
    const [selectedClasses, setSelectedClasses] = useState([]);
    const [selectedMappings, setSelectedMappings] = useState([]);

    // New mapping form
    const [newMapping, setNewMapping] = useState({ facultyId: '', subjectId: '', classId: '', labFaculty2Id: '' });

    useEffect(() => { loadAll(); }, []);

    const loadAll = async () => {
        const [d, f, s, c, r, ts, m] = await Promise.all([
            api.get('/departments'), api.get('/faculty'), api.get('/subjects'),
            api.get('/classes'), api.get('/rooms'), api.get('/timeslots'),
            api.get('/timetable/mappings/all')
        ]);
        setDepartments(d.data); setFaculty(f.data); setSubjects(s.data);
        setClasses(c.data); setRooms(r.data); setTimeSlotConfigs(ts.data);
        setMappings(m.data);
        setSelectedClasses(c.data.map(cl => cl.id));
        setSelectedMappings(m.data.map(mp => mp.id));
    };

    const toggleClass = (id) => {
        setSelectedClasses(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const toggleMapping = (id) => {
        setSelectedMappings(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const addMapping = async () => {
        if (!newMapping.facultyId || !newMapping.subjectId || !newMapping.classId) {
            addToast('Please select faculty, subject, and class', 'error');
            return;
        }
        try {
            await api.post('/timetable/mappings', newMapping);
            addToast('Mapping added');
            setNewMapping({ facultyId: '', subjectId: '', classId: '', labFaculty2Id: '' });
            loadAll();
        } catch (err) { addToast(err.response?.data?.error || 'Error', 'error'); }
    };

    const deleteMapping = async (id) => {
        await api.delete(`/timetable/mappings/${id}`);
        addToast('Mapping removed');
        loadAll();
    };

    const generate = async () => {
        if (!ttName) { addToast('Please enter a timetable name', 'error'); return; }
        setGenerating(true);
        try {
            const res = await api.post('/timetable/generate', {
                name: ttName,
                description: ttDesc,
                selectedClassIds: selectedClasses,
                selectedMappingIds: selectedMappings
            });
            addToast('Timetable generated successfully!');
            setTimeout(() => navigate(`/timetable/${res.data.id}`), 1000);
        } catch (err) {
            addToast(err.response?.data?.error || 'Generation failed', 'error');
        }
        setGenerating(false);
    };

    const getName = (list, id) => list.find(x => x.id === id)?.name || id;

    const renderStep = () => {
        switch (step) {
            case 0: // Basic Info
                return (
                    <div>
                        <h2 className="wizard-card-title">📝 Basic Information</h2>
                        <p className="wizard-card-description">Enter a name and description for this timetable generation.</p>
                        <div className="form-group">
                            <label className="form-label">Timetable Name *</label>
                            <input className="form-input" value={ttName} onChange={e => setTtName(e.target.value)}
                                placeholder="e.g. Semester 2 - 2024 Timetable" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea className="form-textarea" value={ttDesc} onChange={e => setTtDesc(e.target.value)}
                                placeholder="Optional description..." />
                        </div>
                    </div>
                );

            case 1: // Schedule Config
                return (
                    <div>
                        <h2 className="wizard-card-title">⏰ Schedule Configuration</h2>
                        <p className="wizard-card-description">Review the staggered time slot configurations for each year.</p>
                        {timeSlotConfigs.sort((a, b) => a.year - b.year).map(config => (
                            <div key={config.id} className="card" style={{ marginBottom: 16, padding: 16 }}>
                                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Year {config.year}</h3>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {config.slots.map((slot, idx) => (
                                        <span key={idx} className={`badge ${slot.type === 'class' ? 'badge-theory' : slot.type === 'break' ? 'badge-warning' : 'badge-success'}`}>
                                            {slot.start}-{slot.end} ({slot.type})
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {timeSlotConfigs.length === 0 && <div className="empty-state"><p>No time slot configs found. Please configure them first.</p></div>}
                    </div>
                );

            case 2: // Data Mapping - Select Classes
                return (
                    <div>
                        <h2 className="wizard-card-title">🔗 Select Classes</h2>
                        <p className="wizard-card-description">Choose which classes to include in this timetable generation.</p>
                        <div style={{ marginBottom: 12 }}>
                            <button className="btn btn-sm btn-secondary" onClick={() => setSelectedClasses(classes.map(c => c.id))}>Select All</button>
                            <button className="btn btn-sm btn-secondary" style={{ marginLeft: 8 }} onClick={() => setSelectedClasses([])}>Deselect All</button>
                        </div>
                        <div className="checkbox-list">
                            {classes.map(cls => (
                                <label key={cls.id} className="checkbox-item">
                                    <input type="checkbox" checked={selectedClasses.includes(cls.id)} onChange={() => toggleClass(cls.id)} />
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 13 }}>{cls.name}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Year {cls.year} • Section {cls.section} • {getName(departments, cls.departmentId)}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                );

            case 3: // Faculty-Subject Mapping
                return (
                    <div>
                        <h2 className="wizard-card-title">👨‍🏫 Faculty-Subject Mapping</h2>
                        <p className="wizard-card-description">Review and manage which faculty teaches which subject for each class. Select which mappings to include.</p>

                        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Add New Mapping</h3>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Faculty</label>
                                    <select className="form-select" value={newMapping.facultyId} onChange={e => setNewMapping({ ...newMapping, facultyId: e.target.value })}>
                                        <option value="">Select Faculty</option>
                                        {faculty.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Subject</label>
                                    <select className="form-select" value={newMapping.subjectId} onChange={e => setNewMapping({ ...newMapping, subjectId: e.target.value })}>
                                        <option value="">Select Subject</option>
                                        {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Class</label>
                                    <select className="form-select" value={newMapping.classId} onChange={e => setNewMapping({ ...newMapping, classId: e.target.value })}>
                                        <option value="">Select Class</option>
                                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Lab Co-Faculty (Optional)</label>
                                    <select className="form-select" value={newMapping.labFaculty2Id} onChange={e => setNewMapping({ ...newMapping, labFaculty2Id: e.target.value })}>
                                        <option value="">None</option>
                                        {faculty.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <button className="btn btn-primary btn-sm" onClick={addMapping}>+ Add Mapping</button>
                        </div>

                        <div className="checkbox-list">
                            {mappings.map(m => (
                                <label key={m.id} className="checkbox-item" style={{ justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <input type="checkbox" checked={selectedMappings.includes(m.id)} onChange={() => toggleMapping(m.id)} />
                                        <div>
                                            <div style={{ fontSize: 13 }}>
                                                <strong>{m.facultyName}</strong>
                                                <span className="mapping-arrow"> → </span>
                                                <span style={{ color: 'var(--primary-400)' }}>{m.subjectName}</span>
                                                <span className="mapping-arrow"> → </span>
                                                <span>{m.className}</span>
                                            </div>
                                            {m.labFaculty2Name && (
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lab Co-Faculty: {m.labFaculty2Name}</div>
                                            )}
                                        </div>
                                    </div>
                                    <button className="btn btn-danger btn-sm btn-icon" onClick={(e) => { e.preventDefault(); deleteMapping(m.id); }}>🗑</button>
                                </label>
                            ))}
                        </div>
                    </div>
                );

            case 4: // Review & Generate
                return (
                    <div>
                        <h2 className="wizard-card-title">⚡ Review & Generate</h2>
                        <p className="wizard-card-description">Review your configuration and generate the timetable.</p>

                        <div style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
                            <div className="card" style={{ padding: 16 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Timetable Name</div>
                                <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{ttName || '(Not set)'}</div>
                            </div>
                            <div className="stat-grid">
                                <div className="stat-card">
                                    <div className="stat-value">{selectedClasses.length}</div>
                                    <div className="stat-label">Classes Selected</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-value">{selectedMappings.length}</div>
                                    <div className="stat-label">Mappings Active</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-value">{timeSlotConfigs.length}</div>
                                    <div className="stat-label">Year Configs</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-value">{rooms.length}</div>
                                    <div className="stat-label">Rooms Available</div>
                                </div>
                            </div>
                        </div>

                        <button
                            className="btn btn-primary btn-lg"
                            style={{ width: '100%', justifyContent: 'center', fontSize: 16 }}
                            onClick={generate}
                            disabled={generating || !ttName}
                        >
                            {generating ? (
                                <><span className="spinner" style={{ width: 20, height: 20, margin: 0, borderWidth: 2 }}></span> Generating...</>
                            ) : (
                                '⚡ Generate Timetable'
                            )}
                        </button>
                    </div>
                );

            default: return null;
        }
    };

    return (
        <div className="fade-in">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <div className="page-header">
                <h1 className="page-title">⚡ Generation Wizard</h1>
                <p className="page-subtitle">Step-by-step timetable generation</p>
            </div>

            <div className="wizard-container">
                <div className="wizard-stepper">
                    {STEPS.map((s, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center' }}>
                            <div className={`wizard-step ${idx === step ? 'active' : ''} ${idx < step ? 'completed' : ''}`}
                                onClick={() => setStep(idx)} style={{ cursor: 'pointer' }}>
                                <div className="wizard-step-number">{idx < step ? '✓' : idx + 1}</div>
                                <span className="wizard-step-label">{s.label}</span>
                            </div>
                            {idx < STEPS.length - 1 && <div className={`wizard-connector ${idx < step ? 'completed' : ''}`} />}
                        </div>
                    ))}
                </div>

                <div className="wizard-card">
                    {renderStep()}

                    <div className="wizard-footer">
                        <button className="btn btn-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>
                            ← Previous
                        </button>
                        {step < STEPS.length - 1 && (
                            <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
                                Next →
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
