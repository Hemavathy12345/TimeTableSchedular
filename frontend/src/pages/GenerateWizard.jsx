import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useToast, ToastContainer } from '../components/Toast';
import { useAuth } from '../context/AuthContext';

const STEPS = [
    { label: 'Basic Info' },
    { label: 'Schedule Config' },
    { label: 'Data Mapping' },
    { label: 'Faculty Mapping' },
    { label: 'Review & Generate' },
];

function SearchableSelect({ options, value, onChange, placeholder, disabled }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const triggerRef = { current: null };

    // Handle click outside to close
    useEffect(() => {
        if (!isOpen) return;
        const close = (e) => {
            if (triggerRef.current && !triggerRef.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [isOpen]);

    const filtered = options.filter(o => {
        const q = search.toLowerCase();
        return o.name.toLowerCase().includes(q) || (o.subtitle && o.subtitle.toLowerCase().includes(q));
    });
    const selected = options.find(o => o.id === value);

    const handleToggle = (e) => {
        if (disabled) return;
        setIsOpen(prev => !prev);
    };

    const handleSelect = (id) => {
        onChange(id);
        setIsOpen(false);
        setSearch('');
    };

    return (
        <div style={{ position: 'relative', width: '100%' }} ref={el => triggerRef.current = el}>
            <div className={`searchable-select-display ${disabled ? 'disabled' : ''}`}
                style={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer', width: '100%', minHeight: 36, alignItems: 'center' }}
                onClick={handleToggle}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.2, overflow: 'hidden' }}>
                    {selected ? (
                        <>
                            <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</span>
                            {selected.subtitle && (
                                <span style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 400 }}>{selected.subtitle}</span>
                            )}
                        </>
                    ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{placeholder}</span>
                    )}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    width: '100%',
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 4,
                    boxShadow: 'var(--shadow-sm)',
                    zIndex: 99999,
                    maxHeight: 300,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    marginTop: 4
                }}>
                    <div className="searchable-select-search">
                        <input autoFocus placeholder="Search name or dept..." value={search} onChange={e => setSearch(e.target.value)} onClick={e => e.stopPropagation()} />
                    </div>
                    <div className="searchable-select-options">
                        <div className={`searchable-select-option ${!value ? 'selected' : ''}`} onClick={() => handleSelect('')}>
                            {placeholder}
                        </div>
                        {filtered.map(o => (
                            <div key={o.id}
                                className={`searchable-select-option ${o.id === value ? 'selected' : ''}`}
                                onClick={() => handleSelect(o.id)}
                                style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.2 }}>
                                <span style={{ fontWeight: 500, fontSize: 12 }}>{o.name}</span>
                                {o.subtitle && (
                                    <span style={{
                                        fontSize: 10,
                                        color: o.id === value ? 'rgba(255,255,255,0.8)' : 'var(--primary)',
                                        fontWeight: 400
                                    }}>{o.subtitle}</span>
                                )}
                            </div>
                        ))}
                        {filtered.length === 0 && <div className="searchable-select-option-empty">No results found</div>}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function GenerateWizard() {
    const navigate = useNavigate();
    const { toasts, addToast, removeToast } = useToast();
    const { user } = useAuth();
    const isDeptUser = user?.role === 'department_user';
    const myDeptId = user?.departmentId || '';
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
    const [classMappings, setClassMappings] = useState({}); // { classId: { subjectId: { facultyId, labFaculty2Id, labFaculty3Id } } }
    const [savingMappings, setSavingMappings] = useState(false);
    const [filterDeptId, setFilterDeptId] = useState('');

    useEffect(() => { loadAll(); }, []);

    const loadAll = async () => {
        const [d, f, s, c, r, ts, m] = await Promise.all([
            api.get('/departments'),
            api.get('/faculty?all=true'),
            api.get('/subjects?all=true'),
            api.get('/classes'),
            api.get('/rooms'),
            api.get('/timeslots'),
            api.get('/timetable/mappings/all')
        ]);
        setDepartments(d.data);
        setRooms(r.data);
        setTimeSlotConfigs(ts.data);

        // Load all faculty and subjects to support cross-department mapping (e.g. assigning CSE faculty to ECE classes)
        const allFaculty   = f.data;
        const allSubjects  = s.data;
        const allClasses   = c.data; // already scoped by backend for dept_user

        setFaculty(allFaculty);
        setSubjects(allSubjects);
        setClasses(allClasses);

        // Initialize mapping state from DB
        const initialMappings = {};
        m.data.forEach(mapping => {
            if (!initialMappings[mapping.classId]) initialMappings[mapping.classId] = {};
            initialMappings[mapping.classId][mapping.subjectId] = {
                facultyId: mapping.facultyId,
                labFaculty2Id: mapping.labFaculty2Id || '',
                labFaculty3Id: mapping.labFaculty3Id || '',
                assignedLabId: mapping.assignedLabId || ''
            };
        });

        // Apply Advisor Defaults if missing from DB
        allClasses.forEach(cls => {
            if (!initialMappings[cls.id]) initialMappings[cls.id] = {};

            const relevantSubjects = allSubjects.filter(sub =>
                Number(sub.year) === Number(cls.year) &&
                (!sub.departmentId || sub.departmentId === cls.departmentId)
            );

            relevantSubjects.forEach(sub => {
                const subName = sub.name.toLowerCase();
                if (cls.advisorId && (subName === 'library' || subName === 'tutor ward meeting')) {
                    if (!initialMappings[cls.id][sub.id]?.facultyId) {
                        initialMappings[cls.id][sub.id] = {
                            facultyId: cls.advisorId,
                            labFaculty2Id: '',
                            labFaculty3Id: '',
                            assignedLabId: ''
                        };
                    }
                }
            });
        });

        setClassMappings(initialMappings);
        setMappings(m.data);

        setSelectedClasses(allClasses.map(cl => cl.id));
        if (allClasses.length > 0) setActiveClassId(allClasses[0].id);
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
            const currentSubMap = currentClassMap[subjectId] || { facultyId: '', labFaculty2Id: '', labFaculty3Id: '' };
            return {
                ...prev,
                [classId]: {
                    ...currentClassMap,
                    [subjectId]: { ...currentSubMap, [field]: value }
                }
            };
        });
    };

    const handleLabChange = (classId, subjectId, labId) => {
        // Update per-section lab assignment in local state only; saved with class mappings
        setClassMappings(prev => {
            const currentClassMap = prev[classId] || {};
            const currentSubMap = currentClassMap[subjectId] || { facultyId: '', labFaculty2Id: '', labFaculty3Id: '', assignedLabId: '' };
            return {
                ...prev,
                [classId]: {
                    ...currentClassMap,
                    [subjectId]: { ...currentSubMap, assignedLabId: labId || '' }
                }
            };
        });
    };

    const saveClassMappings = async (classId) => {
        setSavingMappings(true);
        try {
            const mappingsObj = classMappings[classId] || {};
            // Convert to array, strip UI-only fields (tempDeptId), filter incomplete
            const payload = Object.entries(mappingsObj)
                .map(([subjectId, fields]) => ({
                    subjectId,
                    facultyId: fields.facultyId || null,
                    labFaculty2Id: fields.labFaculty2Id || null,
                    labFaculty3Id: fields.labFaculty3Id || null,
                    assignedLabId: fields.assignedLabId || null
                }))
                .filter(m => m.facultyId);

            await api.put(`/timetable/mappings/class/${classId}`, { mappings: payload });
            addToast('Class mappings saved successfully', 'success');

            // Reload all mappings and rebuild classMappings state from DB
            const m = await api.get('/timetable/mappings/all');
            setMappings(m.data);

            // Re-sync classMappings for this class from DB response
            setClassMappings(prev => {
                const updated = { ...prev };
                // Clear existing for this class (keep tempDeptId filters)
                const freshMap = {};
                m.data
                    .filter(mapping => mapping.classId === classId)
                    .forEach(mapping => {
                        freshMap[mapping.subjectId] = {
                            facultyId: mapping.facultyId,
                            labFaculty2Id: mapping.labFaculty2Id || '',
                            labFaculty3Id: mapping.labFaculty3Id || '',
                            assignedLabId: mapping.assignedLabId || '',
                            // preserve existing tempDeptId from current state
                            tempDeptId: prev[classId]?.[mapping.subjectId]?.tempDeptId
                        };
                    });
                updated[classId] = { ...prev[classId], ...freshMap };
                return updated;
            });
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

                                            // Check mapping completion — include all subject types that need faculty assignment
                                            const REQUIRED_TYPES = ['theory', 'lab', 'project', 'elective', 'Non-Academic'];
                                            const clsSubjects = subjects.filter(s =>
                                                Number(s.year) === Number(cls.year) &&
                                                (!s.departmentId || s.departmentId === cls.departmentId) &&
                                                REQUIRED_TYPES.includes(s.type)
                                            );
                                            const mappedCount = clsSubjects.filter(s => classMappings[cId]?.[s.id]?.facultyId).length;
                                            const isComplete = clsSubjects.length > 0 && mappedCount === clsSubjects.length;

                                            return (
                                                <div key={cId} onClick={() => setActiveClassId(cId)}
                                                    style={{
                                                        padding: '16px 20px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)',
                                                        background: isActive ? 'var(--primary-50)' : 'transparent',
                                                        borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent'
                                                    }}>
                                                    <div style={{ fontWeight: 700, fontSize: 13, color: isActive ? 'var(--primary-700)' : 'inherit' }}>{cls.name}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{mappedCount} / {clsSubjects.length} mapped</div>
                                                    {isComplete ? <div style={{ fontSize: 10, color: '#2e7d32', fontWeight: 700, marginTop: 4 }}> Complete</div> : null}
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
                                    const relevantSubjects = subjects.filter(s => Number(s.year) === Number(ac.year) && (!s.departmentId || s.departmentId === ac.departmentId));

                                    return (
                                        <div className="card" style={{ padding: '20px', minHeight: 400, overflow: 'visible' }}>
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
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 24, overflow: 'visible' }}>
                                                    {relevantSubjects.map(sub => {
                                                        const mappingData = classMappings[activeClassId]?.[sub.id] || { facultyId: '', labFaculty2Id: '', labFaculty3Id: '' };
                                                        const isLab = sub.type === 'lab';
                                                        // Fallback flow: 1. Manual selection 2. Department of assigned faculty 3. Subject department 4. All
                                                        let rowDeptId = mappingData.tempDeptId;
                                                        if (rowDeptId === undefined) {
                                                            if (mappingData.facultyId) {
                                                                const assignedFac = faculty.find(f => f.id === mappingData.facultyId);
                                                                rowDeptId = assignedFac ? assignedFac.departmentId : (sub.departmentId ?? '');
                                                            } else {
                                                                rowDeptId = sub.departmentId ?? '';
                                                            }
                                                        }
                                                        return (
                                                            <div key={sub.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', background: 'var(--card-bg)', padding: '18px 20px', borderRadius: 12, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', position: 'relative', overflow: 'visible' }}>
                                                                {/* Subject Info */}
                                                                <div style={{ flex: '0 0 100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                                    <div>
                                                                        <span className={`badge ${sub.type === 'lab' ? 'badge-lab' : sub.type === 'theory' ? 'badge-theory' : sub.type === 'project' ? 'badge-project' : 'badge-elective'}`} style={{ marginRight: 6, fontSize: 9 }}>{sub.type}</span>
                                                                        <span style={{ fontWeight: 600, fontSize: 13 }}>{sub.name}</span>
                                                                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginLeft: 8 }}>{sub.code}</span>
                                                                    </div>
                                                                    {/* Lab assignment for lab subjects */}
                                                                    {sub.type === 'lab' && (
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Assigned Lab:</span>
                                                                            <select
                                                                                className="form-select"
                                                                                style={{ fontSize: 10, padding: '2px 8px', height: 26, border: '1px solid var(--border-color)', borderRadius: 4 }}
                                                                                value={mappingData.assignedLabId || ''}
                                                                                onChange={e => handleLabChange(activeClassId, sub.id, e.target.value)}
                                                                            >
                                                                                <option value="">Select Lab...</option>
                                                                                {rooms.filter(r => r.type === 'lab').map(r => (
                                                                                    <option key={r.id} value={r.id}>{r.name}</option>
                                                                                ))}
                                                                            </select>
                                                                            <span style={{ fontSize: 9, color: 'var(--primary)', fontStyle: 'italic' }}>this section only</span>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Dept Filter */}
                                                                <div style={{ flex: '0 0 140px' }}>
                                                                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Dept Filter</div>
                                                                    <select className="form-select" style={{ fontSize: 11, height: 36, background: 'var(--card-bg)', border: '1px solid var(--border-color)' }}
                                                                        value={rowDeptId}
                                                                        onChange={e => handleMappingChange(activeClassId, sub.id, 'tempDeptId', e.target.value)}>
                                                                        <option value="">All Depts</option>
                                                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                                    </select>
                                                                </div>

                                                                {/* Primary Faculty */}
                                                                <div style={{ flex: '1 1 160px' }}>
                                                                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Primary Faculty *</div>
                                                                    <SearchableSelect
                                                                        options={faculty
                                                                            .filter(f => !rowDeptId || f.departmentId === rowDeptId)
                                                                            .map(f => ({
                                                                                ...f,
                                                                                subtitle: departments.find(d => d.id === f.departmentId)?.name || ''
                                                                            }))}
                                                                        value={mappingData.facultyId}
                                                                        onChange={val => handleMappingChange(activeClassId, sub.id, 'facultyId', val)}
                                                                        placeholder="Select Faculty"
                                                                    />
                                                                </div>
{/* Co-Faculty selectors - only for lab subjects */}
{isLab && (
    <>
        <div style={{ flex: '1 1 160px' }}>
            <div style={{ fontSize: 9, color: 'var(--primary-600)', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Co-Faculty 1 (optional)</div>
            <SearchableSelect
                options={faculty.map(f => ({
                    id: f.id,
                    name: f.name,
                    subtitle: departments.find(d => d.id === f.departmentId)?.name || ''
                }))}
                value={mappingData.labFaculty2Id || ''}
                onChange={val => handleMappingChange(activeClassId, sub.id, 'labFaculty2Id', val)}
                placeholder="Co-Faculty 1"
            />
        </div>
        <div style={{ flex: '1 1 160px' }}>
            <div style={{ fontSize: 9, color: 'var(--primary-600)', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Co-Faculty 2 (optional)</div>
            <SearchableSelect
                options={faculty.map(f => ({
                    id: f.id,
                    name: f.name,
                    subtitle: departments.find(d => d.id === f.departmentId)?.name || ''
                }))}
                value={mappingData.labFaculty3Id || ''}
                onChange={val => handleMappingChange(activeClassId, sub.id, 'labFaculty3Id', val)}
                placeholder="Co-Faculty 2"
            />
        </div>
    </>
)}
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
                                <div className="wizard-step-number">{idx + 1}</div>
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
