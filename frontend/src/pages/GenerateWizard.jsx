import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/Toast';

const STEPS = [
    { label: 'Basic Info' },
    { label: 'Schedule Config'},
    { label: 'Data Mapping'},
    { label: 'Faculty Mapping' },
    { label: 'Review & Generate' },
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
    
    // Faculty Mapping state
    const [activeClassId, setActiveClassId] = useState(null);
    const [classMappings, setClassMappings] = useState({}); // { classId: { subjectId: { facultyId, labFaculty2Id } } }
    const [savingMappings, setSavingMappings] = useState(false);

    useEffect(() => { loadAll(); }, []);

    const loadAll = async () => {
        const [d, f, s, c, r, ts, m] = await Promise.all([
            api.get('/departments'), api.get('/faculty'), api.get('/subjects'),
            api.get('/classes'), api.get('/rooms'), api.get('/timeslots'),
            api.get('/timetable/mappings/all')
        ]);
        setDepartments(d.data); setFaculty(f.data); setSubjects(s.data);
        setClasses(c.data); setRooms(r.data); setTimeSlotConfigs(ts.data);
        
        // Initialize mapping state from DB
        const initialMappings = {};
        m.data.forEach(mapping => {
            if (!initialMappings[mapping.classId]) initialMappings[mapping.classId] = {};
            initialMappings[mapping.classId][mapping.subjectId] = {
                facultyId: mapping.facultyId,
                labFaculty2Id: mapping.labFaculty2Id || ''
            };
        });
        setClassMappings(initialMappings);
        setMappings(m.data);
        
        setSelectedClasses(c.data.map(cl => cl.id));
        if (c.data.length > 0) setActiveClassId(c.data[0].id);
    };

    const toggleClass = (id) => {
        setSelectedClasses(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
        // Also update activeClassId if it's the first one being toggled
        if (!selectedClasses.includes(id) && !activeClassId) {
            setActiveClassId(id);
        }
    };

    const handleMappingChange = (classId, subjectId, field, value) => {
        setClassMappings(prev => {
            const currentClassMap = prev[classId] || {};
            const currentSubMap = currentClassMap[subjectId] || { facultyId: '', labFaculty2Id: '' };
            return {
                ...prev,
                [classId]: {
                    ...currentClassMap,
                    [subjectId]: { ...currentSubMap, [field]: value }
                }
            };
        });
    };

    const saveClassMappings = async (classId) => {
        setSavingMappings(true);
        try {
            const mappingsObj = classMappings[classId] || {};
            // Convert to array and filter out incomplete
            const payload = Object.entries(mappingsObj)
                .map(([subjectId, fields]) => ({
                    subjectId,
                    facultyId: fields.facultyId,
                    labFaculty2Id: fields.labFaculty2Id || null
                }))
                .filter(m => m.facultyId);

            await api.put(`/timetable/mappings/class/${classId}`, { mappings: payload });
            addToast('Class mappings saved successfully', 'success');
            
            // Reload all mappings occasionally to keep sync
            const m = await api.get('/timetable/mappings/all');
            setMappings(m.data);
        } catch (err) {
            addToast(err.response?.data?.error || 'Failed to save mappings', 'error');
        } finally {
            setSavingMappings(false);
        }
    };

    const generate = async () => {
        if (!ttName) { addToast('Please enter a timetable name', 'error'); return; }
        setGenerating(true);
        try {
            const res = await api.post('/timetable/generate', {
                name: ttName,
                description: ttDesc,
                selectedClassIds: selectedClasses
                // The backend generator now reads from the bulk-saved mappings directly
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
                        <h2 className="wizard-card-title">Basic Information</h2>
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
                        <h2 className="wizard-card-title">Schedule Configuration</h2>
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
                        <h2 className="wizard-card-title">Select Classes</h2>
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
                        <h2 className="wizard-card-title">Faculty-Subject Mapping</h2>
                        <p className="wizard-card-description">Select a class on the left to map its faculty. Ensure all subjects are covered.</p>

                        <div style={{ display: 'flex', gap: 20, marginTop: 16 }}>
                            {/* Left Sidebar: Selected Classes */}
                            <div style={{ width: '30%', minWidth: 220, background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden' }}>
                                <div style={{ padding: '12px 14px', background: '#f8fafc', borderBottom: '1px solid var(--border-color)', fontWeight: 600, fontSize: 13 }}>
                                    Target Classes ({selectedClasses.length})
                                </div>
                                <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                                    {selectedClasses.length === 0 ? (
                                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No classes selected</div>
                                    ) : (
                                        selectedClasses.map(cId => {
                                            const cls = classes.find(c => c.id === cId);
                                            if (!cls) return null;
                                            const isActive = activeClassId === cId;
                                            
                                            // Check mapping completion
                                            const clsSubjects = subjects.filter(s => s.year === cls.year && (!s.departmentId || s.departmentId === cls.departmentId));
                                            const mappedCount = clsSubjects.filter(s => classMappings[cId]?.[s.id]?.facultyId).length;
                                            const isComplete = clsSubjects.length > 0 && mappedCount === clsSubjects.length;

                                            return (
                                                <div key={cId} onClick={() => setActiveClassId(cId)}
                                                    style={{ 
                                                        padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', 
                                                        background: isActive ? '#eff6ff' : 'transparent',
                                                        borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent'
                                                    }}>
                                                    <div style={{ fontWeight: 600, fontSize: 13, color: isActive ? 'var(--primary-600)' : 'inherit' }}>{cls.name}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{mappedCount} / {clsSubjects.length} subjects mapped</div>
                                                    {isComplete ? <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>✅ Complete</span> : null}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Right Content: Subject Assignment Form for Active Class */}
                            <div style={{ flex: 1 }}>
                                {activeClassId ? (() => {
                                    const ac = classes.find(c => c.id === activeClassId);
                                    if (!ac) return null;
                                    const relevantSubjects = subjects.filter(s => s.year === ac.year && (!s.departmentId || s.departmentId === ac.departmentId));

                                    return (
                                        <div className="card" style={{ padding: '20px', minHeight: 400 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border-color)' }}>
                                                <div>
                                                    <h3 style={{ fontSize: 16, margin: 0, color: 'var(--primary-600)' }}>{ac.name}</h3>
                                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Year {ac.year} • Section {ac.section}</div>
                                                </div>
                                                <button className="btn btn-primary" onClick={() => saveClassMappings(activeClassId)} disabled={savingMappings}>
                                                    {savingMappings ? 'Saving...' : 'Save Class Mappings'}
                                                </button>
                                            </div>

                                            {relevantSubjects.length === 0 ? (
                                                <div className="empty-state">No subjects found for Year {ac.year}. Add subjects first.</div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                                    {relevantSubjects.map(sub => {
                                                        const mappingData = classMappings[activeClassId]?.[sub.id] || { facultyId: '', labFaculty2Id: '' };
                                                        return (
                                                            <div key={sub.id} style={{ display: 'flex', gap: 16, alignItems: 'center', background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                                                <div style={{ flex: '1 1 30%' }}>
                                                                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                                                                        <span className={`badge ${sub.type === 'lab' ? 'badge-lab' : sub.type === 'theory' ? 'badge-theory' : sub.type === 'project' ? 'badge-project' : 'badge-elective'}`} style={{ marginRight: 6 }}>{sub.type}</span>
                                                                        {sub.name}
                                                                    </div>
                                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{sub.code} ({sub.credits} cr)</div>
                                                                </div>
                                                                
                                                                <div style={{ flex: '1 1 35%' }}>
                                                                    <select className="form-select" style={{ fontSize: 12 }} 
                                                                        value={mappingData.facultyId} 
                                                                        onChange={e => handleMappingChange(activeClassId, sub.id, 'facultyId', e.target.value)}>
                                                                        <option value="">Select Primary Faculty</option>
                                                                        {faculty.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                                                    </select>
                                                                </div>

                                                                <div style={{ flex: '1 1 35%' }}>
                                                                    <select className="form-select" style={{ fontSize: 12 }} 
                                                                        value={mappingData.labFaculty2Id} 
                                                                        onChange={e => handleMappingChange(activeClassId, sub.id, 'labFaculty2Id', e.target.value)}
                                                                        disabled={sub.type !== 'lab' && sub.type !== 'project'}>
                                                                        <option value="">{sub.type === 'lab' || sub.type === 'project' ? 'Log Co-Faculty (Optional)' : 'N/A'}</option>
                                                                        {(sub.type === 'lab' || sub.type === 'project') && faculty.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                                                    </select>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })() : (
                                    <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, color: 'var(--text-muted)' }}>
                                        Select a class from the left sidebar to assign faculty.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );                   
            case 4: // Review & Generate
                return (
                    <div>
                        <h2 className="wizard-card-title">Review & Generate</h2>
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
                                    <div className="stat-value">{mappings.length}</div>
                                    <div className="stat-label">Total Mappings Defaulted</div>
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
                                'Generate Timetable'
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
                <h1 className="page-title">Generation Wizard</h1>
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
