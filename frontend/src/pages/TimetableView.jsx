import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToast, ToastContainer } from '../components/Toast';
import { exportClassPDF, exportFacultyPDF, exportLabPDF } from '../utils/pdfExport';
import SearchableSelect from '../components/SearchableSelect';

export default function TimetableView() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { toasts, addToast, removeToast } = useToast();

    const [timetable, setTimetable] = useState(null);
    const [classes, setClasses] = useState([]);
    const [faculty, setFaculty] = useState([]);
    const [subjects, setSubjects] = useState([]); // Added
    const [rooms, setRooms] = useState([]);       // Added
    const [viewMode, setViewMode] = useState('class'); // 'class' | 'faculty' | 'lab' | 'summary' | 'mapping'
    const [selectedId, setSelectedId] = useState('');
    const [viewData, setViewData] = useState(null);
    const [allocationSummary, setAllocationSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);     // Added
    const [swapMode, setSwapMode] = useState(false);
    const [swapFirst, setSwapFirst] = useState(null);
    const [replacementSlot, setReplacementSlot] = useState(null);
    const [validSubjects, setValidSubjects] = useState([]);
    const [replacementLoading, setReplacementLoading] = useState(false);
    const [hoveredSlot, setHoveredSlot] = useState(null); // { day, slotIndex }
    const [isLocked, setIsLocked] = useState(false);
    const [isPublished, setIsPublished] = useState(false);
    const [publishLoading, setPublishLoading] = useState(false);
    const [lockLoading, setLockLoading] = useState(false);
    const [autoGenLoading, setAutoGenLoading] = useState(false);

    // Edit Schedule Workflow states
    const [departments, setDepartments] = useState([]);
    const [classMappings, setClassMappings] = useState({});
    const [activeClassId, setActiveClassId] = useState(null);
    const [savingMappings, setSavingMappings] = useState(false);
    const [selectedClasses, setSelectedClasses] = useState([]);
    const [wizardStep, setWizardStep] = useState(0); // 0: Data Mapping, 1: Faculty Mapping, 2: Generation
    const [filterDeptId, setFilterDeptId] = useState(''); // Admin class-view department filter

    useEffect(() => {
        setSelectedId(null);
        setViewData(null);
        loadBase();
    }, [id]);

    const loadBase = async () => {
        try {
            const ttRes = await api.get(`/timetable/${id}`);
            const tt = ttRes.data;
            const deptId = tt.departmentId;

            // When a dept_user views another department's published timetable,
            // load OWN department's classes/faculty for the dropdown (they can't
            // edit other dept data anyway). For all other cases use the timetable's deptId.
            const isViewingOtherDept = user?.role === 'department_user'
                && deptId
                && deptId !== user?.departmentId;

            let queryParam;
            if (user?.role === 'admin') {
                queryParam = 'all=true';
            } else if (isViewingOtherDept) {
                // Show own classes so user can check faculty/lab from their perspective
                queryParam = user.departmentId ? `departmentId=${user.departmentId}` : 'all=true';
            } else {
                queryParam = (deptId && deptId !== 'null' && deptId !== 'undefined')
                    ? `departmentId=${deptId}`
                    : 'all=true';
            }

            const [clsRes, facRes, subRes, roomRes, deptRes, mappingRes] = await Promise.all([
                api.get(`/classes?${queryParam}`),
                api.get('/faculty?all=true'),
                api.get(`/subjects?${queryParam}`),
                api.get('/rooms'),
                api.get('/departments'),
                api.get('/timetable/mappings/all')
            ]);
            setTimetable(tt);
            
            const loadedClasses = clsRes.data;
            const loadedSubjects = subRes.data;

            setClasses(loadedClasses);
            setFaculty(facRes.data);
            setSubjects(loadedSubjects);
            setRooms(roomRes.data);
            setDepartments(deptRes.data);
            setIsLocked(tt.isLocked || false);
            setIsPublished(tt.isPublished || false);

            if (user?.role === 'admin') {
                setFilterDeptId(deptId || '');
            }

            // Select all department classes by default in the Edit Schedule Workflow
            const defaultSelectedClasses = (user?.role === 'admin' && deptId)
                ? loadedClasses.filter(c => c.departmentId === deptId)
                : loadedClasses;
            setSelectedClasses(defaultSelectedClasses.map(c => c.id));
            if (defaultSelectedClasses.length > 0) {
                setActiveClassId(defaultSelectedClasses[0].id);
            }

            // Initialize mapping state from DB
            const initialMappings = {};
            mappingRes.data.forEach(mapping => {
                if (!initialMappings[mapping.classId]) initialMappings[mapping.classId] = {};
                initialMappings[mapping.classId][mapping.subjectId] = {
                    facultyId: mapping.facultyId,
                    labFaculty2Id: mapping.labFaculty2Id || '',
                    labFaculty3Id: mapping.labFaculty3Id || '',
                    assignedLabId: mapping.assignedLabId || ''
                };
            });

            // Apply Advisor Defaults if missing from DB
            loadedClasses.forEach(cls => {
                if (!initialMappings[cls.id]) initialMappings[cls.id] = {};

                const relevantSubjects = loadedSubjects.filter(sub =>
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

            // Auto-select first class of the timetable's department if nothing selected or if the previously selected class doesn't exist in the new dataset
            const deptClasses = (user?.role === 'admin' && deptId)
                ? loadedClasses.filter(c => c.departmentId === deptId)
                : loadedClasses;
            const fallbackClasses = deptClasses.length > 0 ? deptClasses : loadedClasses;

            if (fallbackClasses.length > 0) {
                if (!selectedId || !loadedClasses.some(c => c.id === selectedId)) {
                    setSelectedId(fallbackClasses[0].id);
                }
            }

            // Load allocation summary
            try {
                const sumRes = await api.get(`/timetable/${id}/allocation-summary`);
                setAllocationSummary(sumRes.data);
            } catch (e) { /* summary optional */ }

            setLoading(false);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load timetable base data');
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedId && id) {
            setViewData(null); // Clear previous to avoid stale display
            loadView();
        }
    }, [selectedId, viewMode, id]);

    const loadView = async () => {
        if (!selectedId) return;
        try {
            let endpoint;
            if (viewMode === 'class') endpoint = `/timetable/${id}/class-view/${selectedId}`;
            else if (viewMode === 'faculty') endpoint = `/timetable/${id}/faculty-view/${selectedId}`;
            else if (viewMode === 'lab') endpoint = `/timetable/${id}/room-view/${selectedId}`;
            else return; // summary has no per-entity view
            const res = await api.get(endpoint);
            setViewData(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const switchView = (mode) => {
        if (mode === viewMode) return;
        setViewMode(mode);
        setViewData(null); // Explicit clear
        const labRooms = rooms.filter(r => r.type === 'lab');
        if ((mode === 'class' || mode === 'summary') && classes.length > 0) {
            setSelectedId(classes[0].id);
        } else if (mode === 'faculty' && faculty.length > 0) {
            setSelectedId(faculty[0].id);
        } else if (mode === 'lab' && labRooms.length > 0) {
            setSelectedId(labRooms[0].id);
        } else if (mode === 'mapping') {
            setWizardStep(0);
            if (classes.length > 0 && (!activeClassId || !classes.some(c => c.id === activeClassId))) {
                setActiveClassId(classes[0].id);
            }
        }
        setSwapMode(false);
        setSwapFirst(null);
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
            
            // Re-sync classMappings for this class from DB response
            setClassMappings(prev => {
                const updated = { ...prev };
                const freshMap = {};
                m.data
                    .filter(mapping => mapping.classId === classId)
                    .forEach(mapping => {
                        freshMap[mapping.subjectId] = {
                            facultyId: mapping.facultyId,
                            labFaculty2Id: mapping.labFaculty2Id || '',
                            labFaculty3Id: mapping.labFaculty3Id || '',
                            assignedLabId: mapping.assignedLabId || '',
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

    const handleSlotClick = (entry, entryIndex) => {
        if (!user || (user.role !== 'admin' && user.role !== 'department_user')) return;
        if (isLocked && user.role !== 'admin') {
            addToast('Timetable is locked by Administrator', 'error');
            return;
        }

        if (swapMode) {
            if (entry.isFixed) { addToast('Cannot swap fixed slots', 'error'); return; }
            if (entryIndex === null || entry.isEmpty) { addToast('Cannot swap empty slots', 'error'); return; }
            
            if (swapFirst === null) {
                if (!entry.editable) {
                    addToast('Access denied. You can only move/swap slots belonging to classes in your own department.', 'error');
                    return;
                }
                setSwapFirst(entryIndex);
                addToast('Select second slot to swap with or click Move Here on an empty slot');
            } else {
                if (!entry.editable) {
                    addToast('Access denied. You can only swap with slots belonging to classes in your own department.', 'error');
                    return;
                }
                performSwap(swapFirst, entryIndex);
            }
        } else {
            // Only open replacement panel for extra (gap-fill) slots or empty slots
            if (entry.isExtra || entry.isEmpty) {
                // Check if user is authorized to edit this class/slot
                const canEdit = user?.role === 'admin' || (user?.role === 'department_user' && classes.find(c => c.id === entry.classId)?.departmentId === user?.departmentId);
                if (!canEdit) {
                    addToast('Access denied. You can only modify entries belonging to classes in your own department.', 'error');
                    return;
                }
                fetchValidSubjects(entry);
            }
        }
    };

    const fetchValidSubjects = async (entry) => {
        try {
            setReplacementLoading(true);
            setReplacementSlot(entry);
            const res = await api.get(`/timetable/${id}/valid-subjects/${entry.classId}/${entry.day}/${entry.slotIndex}`);
            setValidSubjects(res.data);
            setReplacementLoading(false);
        } catch (err) {
            addToast('Failed to fetch valid subjects', 'error');
            setReplacementLoading(false);
            setReplacementSlot(null);
        }
    };

    const performReplacement = async (option) => {
        try {
            const body = {
                day: replacementSlot.day,
                slotIndex: replacementSlot.slotIndex,
                classId: replacementSlot.classId,
                subjectId: option.subjectId,
                facultyId: option.facultyId,
                labFaculty2Id: option.labFaculty2Id,
                roomId: option.roomId,
                isExtra: true
            };
            await api.put(`/timetable/${id}/replace-slot`, body);
            addToast('Slot replaced successfully');
            setReplacementSlot(null);
            await loadBase();
            loadView();
        } catch (err) {
            addToast(err.response?.data?.error || 'Replacement failed', 'error');
        }
    };

    const performSwap = async (idx1, idx2) => {
        try {
            await api.put(`/timetable/${id}/swap`, { entryIndex1: idx1, entryIndex2: idx2 });
            addToast('Slots swapped successfully!');
            setSwapFirst(null);
            setSwapMode(false);
            await loadBase();
            loadView();
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Swap failed';
            const violations = err.response?.data?.violations;
            const detail = (violations && violations.length > 0) ? `: ${violations.slice(0, 2).join('; ')}${violations.length > 2 ? '...' : ''}` : '';
            addToast(errorMsg + detail, 'error');
            setSwapFirst(null);
        }
    };

    const handleEmptySlotClick = async (day, slotIndex) => {
        if (swapFirst === null) return;
        try {
            await api.put(`/timetable/${id}/move-slot`, {
                entryIndex: swapFirst,
                targetDay: day,
                targetSlotIndex: slotIndex
            });
            addToast('Slot moved successfully!');
            setSwapFirst(null);
            setSwapMode(false);
            await loadBase();
            loadView();
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Move failed';
            const violations = err.response?.data?.violations;
            const detail = (violations && violations.length > 0) ? `: ${violations.slice(0, 2).join('; ')}${violations.length > 2 ? '...' : ''}` : '';
            addToast(errorMsg + detail, 'error');
            setSwapFirst(null);
        }
    };


    const handleAutoGenerateWorkflow = async () => {
        if (selectedClasses.length === 0) {
            addToast("Please select at least one class for scheduling", "error");
            return;
        }

        const unmappedClasses = [];
        const REQUIRED_TYPES = ['theory', 'lab', 'project', 'elective', 'Non-Academic'];
        
        selectedClasses.forEach(cId => {
            const cls = classes.find(c => c.id === cId);
            if (!cls) return;
            const clsSubjects = subjects.filter(s =>
                Number(s.year) === Number(cls.year) &&
                (!s.departmentId || s.departmentId === cls.departmentId) &&
                REQUIRED_TYPES.includes(s.type)
            );
            const unmappedForClass = clsSubjects.filter(s => !classMappings[cls.id]?.[s.id]?.facultyId);
            if (unmappedForClass.length > 0) {
                unmappedClasses.push({ name: cls.name, count: unmappedForClass.length });
            }
        });

        if (unmappedClasses.length > 0) {
            const details = unmappedClasses.map(u => ` - ${u.name}: ${u.count} unmapped subject(s)`).join('\n');
            if (!confirm(`Warning: You have unmapped subjects in the following selected classes:\n${details}\n\nUnmapped subjects will NOT be scheduled. Are you sure you want to proceed with slot generation?`)) {
                setWizardStep(1); // Go back to Faculty Mapping
                return;
            }
        }

        setAutoGenLoading(true);
        try {
            await api.put(`/timetable/${id}/auto-generate`, {
                selectedClassIds: selectedClasses
            });
            addToast("Automatically generated slots successfully!");
            await loadBase();
            switchView('class');
        } catch (err) {
            addToast(err.response?.data?.error || "Automatic generation failed", "error");
        } finally {
            setAutoGenLoading(false);
        }
    };

    const handleExportPDF = () => {
        if (!viewData) return;
        if (viewMode === 'class') {
            exportClassPDF(viewData);
        } else if (viewMode === 'faculty') {
            exportFacultyPDF(viewData);
        } else if (viewMode === 'lab') {
            exportLabPDF(viewData);
        }
        addToast('PDF exported!');
    };

    if (loading) return <div className="loading-overlay"><div className="spinner"></div><div className="loading-text">Loading timetable...</div></div>;

    // Build the grid
    const renderGrid = () => {
        const entityLabel = viewMode === 'class' ? 'class' : viewMode === 'faculty' ? 'faculty member' : 'lab room';
        if (!viewData) return <div className="empty-state"><p>Select a {entityLabel} to view</p></div>;

        // Special handling for lab view empty sessions
        if (viewMode === 'lab' && (!viewData.entries || viewData.entries.length === 0)) {
            return (
                <div className="empty-state" style={{ background: 'rgba(16, 84, 165, 0.02)', border: '2px dashed rgba(16, 84, 165, 0.1)', borderRadius: 12 }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}></div>
                    <h3>No lab sessions scheduled</h3>
                    <p style={{ maxWidth: 350, margin: '8px auto', fontSize: 13, color: 'var(--text-secondary)' }}>
                        This lab room is currently free or only contains theory classes which are filtered out of this view.
                    </p>
                </div>
            );
        }

        const rawConfigs = (viewMode === 'faculty' || viewMode === 'lab')
            ? (viewData.timeSlotConfigs || (viewData.timeSlotConfig ? [viewData.timeSlotConfig] : []))
            : (viewData.timeSlotConfig ? [viewData.timeSlotConfig] : []);

        // Group configs by slot layout (days and slots) to merge years with identical schedules
        const groupedConfigs = [];
        rawConfigs.forEach(cfg => {
            const layoutKey = JSON.stringify({
                days: cfg.days,
                slots: cfg.slots.map(s => ({ start: s.start, end: s.end, type: s.type }))
            });
            const existing = groupedConfigs.find(g => g.layoutKey === layoutKey);
            if (existing) {
                if (!existing.years.includes(cfg.year)) existing.years.push(cfg.year);
            } else {
                groupedConfigs.push({
                    ...cfg,
                    years: [cfg.year],
                    layoutKey
                });
            }
        });

        if (groupedConfigs.length === 0) return <div className="empty-state"><p>No time slot configuration found</p></div>;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
                {groupedConfigs.map((config, configIdx) => {
                    const days = config.days;
                    const slots = config.slots;

                    // Filter entries for this specific config's year set
                    const filteredEntries = (viewMode === 'faculty' || viewMode === 'lab')
                        ? viewData.entries.filter(e => config.years.includes(Number(e.classYear)))
                        : viewData.entries;

                    if ((viewMode === 'faculty' || viewMode === 'lab') && filteredEntries.length === 0 && groupedConfigs.length > 1) return null;

                    // Build lookup: day -> slotIndex -> entry (Repeat entry for its entire duration)
                    const lookup = {};
                    filteredEntries.forEach((e) => {
                        const dur = e.duration || 1;
                        for (let d = 0; d < dur; d++) {
                            const key = `${e.day}-${e.slotIndex + d}`;
                            if (!lookup[key]) lookup[key] = [];
                            lookup[key].push({
                                ...e,
                                isContinuation: d > 0,
                                _idx: timetable.entries.findIndex(te =>
                                    te.classId === e.classId && te.subjectId === e.subjectId && te.day === e.day && te.slotIndex === e.slotIndex
                                )
                            });
                        }
                    });

                    return (
                        <div key={config.layoutKey || configIdx} className="card" style={{ padding: '24px', marginBottom: '32px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                            {(viewMode === 'faculty' || viewMode === 'lab' || groupedConfigs.length > 1) && (
                                <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 4, height: 24, background: 'var(--primary)', borderRadius: 2 }}></div>
                                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {config.years.length > 1 ? `Years ${config.years.sort((a, b) => a - b).join(', ')}` : `Year ${config.years[0]}`}
                                    </h3>
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-color)', padding: '2px 8px', borderRadius: 4 }}>
                                        {slots.filter(s => s.type === 'class').length} classes per day
                                    </span>
                                </div>
                            )}
                            <div className="timetable-grid">
                                <table className="timetable-table">
                                    <thead>
                                        <tr>
                                            <th>Day</th>
                                            {slots.map((slot, sIdx) => (
                                                <th key={sIdx}>
                                                    <div>
                                                        {slot.type === 'break' ? 'Break' : slot.type === 'lunch' ? 'Lunch' : slot.type === 'activity' ? 'Activity' : `Hour ${slots.slice(0, sIdx + 1).filter(s => s.type === 'class').length}`}
                                                    </div>
                                                    <span className="slot-time">{slot.start} - {slot.end}</span>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {days.map((day, dayIdx) => (
                                            <tr key={day}>
                                                <td>
                                                    <div className="timetable-day-label">
                                                        {day.toUpperCase().substring(0, 3)}
                                                    </div>
                                                </td>
                                                {slots.map((slot, slotIdx) => {
                                                    const key = `${day}-${slotIdx}`;
                                                    const cellEntries = lookup[key] || [];

                                                    if (slot.type === 'break') {
                                                        return <td key={slotIdx}><div className="timetable-slot break-slot">Break</div></td>;
                                                    }
                                                    if (slot.type === 'lunch') {
                                                        return <td key={slotIdx}><div className="timetable-slot lunch-slot">Lunch</div></td>;
                                                    }

                                                    if (cellEntries.length === 0) {
                                                         if (slot.type === 'activity') {
                                                             return <td key={slotIdx}><div className="timetable-slot activity-slot">Activity Hour</div></td>;
                                                         }
                                                         
                                                         const canEdit = (user?.role === 'admin' || (user?.role === 'department_user' && classes.find(c => c.id === selectedId)?.departmentId === user?.departmentId)) && !isLocked;

                                                         if (swapMode && swapFirst !== null && canEdit && viewMode === 'class') {
                                                             return (
                                                                 <td key={slotIdx}>
                                                                     <div 
                                                                         className="timetable-slot empty-target-slot"
                                                                         style={{
                                                                             cursor: 'pointer',
                                                                             border: '2px dashed var(--primary-color)',
                                                                             background: 'rgba(26, 115, 232, 0.05)',
                                                                             minHeight: '40px',
                                                                             display: 'flex',
                                                                             alignItems: 'center',
                                                                             justifyContent: 'center',
                                                                             fontSize: '11px',
                                                                             color: '#1a73e8',
                                                                             fontWeight: 600
                                                                         }}
                                                                         onClick={() => handleEmptySlotClick(day, slotIdx)}
                                                                     >
                                                                         Move Here
                                                                     </div>
                                                                 </td>
                                                             );
                                                         }
                                                         
                                                         if (canEdit && viewMode === 'class') {
                                                             return (
                                                                 <td key={slotIdx} onClick={() => handleSlotClick({ isEmpty: true, classId: selectedId, day, slotIndex: slotIdx }, null)} style={{ cursor: 'pointer' }}>
                                                                     <div className="timetable-slot empty-slot" style={{ minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: '12px', fontWeight: 600, border: '1px dashed #e2e8f0', borderRadius: 8, transition: 'all 0.2s' }}
                                                                          onMouseEnter={e => { e.currentTarget.style.color = '#1a73e8'; e.currentTarget.style.borderColor = '#1a73e8'; e.currentTarget.style.background = 'rgba(26, 115, 232, 0.02)'; }}
                                                                          onMouseLeave={e => { e.currentTarget.style.color = '#cbd5e1'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'transparent'; }}>
                                                                         + Add
                                                                     </div>
                                                                 </td>
                                                             );
                                                         }
                                                         
                                                         return <td key={slotIdx}></td>;
                                                     }

                                                    return (
                                                        <td key={slotIdx}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                                                                {cellEntries.map((entry, eIdx) => {
                                                                    if (entry.isCOE) {
                                                                        const tooltip = [
                                                                            `COE Block (Hard Constraint): ${entry.coeLabel}`,
                                                                            entry.facultyName ? `Co-Faculty: ${entry.facultyName}` : '',
                                                                            entry.schedulingNote ? `Note: ${entry.schedulingNote}` : ''
                                                                        ].filter(Boolean).join('\n');
                                                                        return (
                                                                            <div key={eIdx} className="timetable-slot" style={{
                                                                                background: 'var(--primary-50)',
                                                                                border: '1.5px solid var(--primary-200)',
                                                                                cursor: 'default',
                                                                                position: 'relative'
                                                                            }}
                                                                                title={tooltip}>
                                                                                <div className="slot-subject" style={{ color: 'var(--primary-color)', fontWeight: 700, fontSize: 11 }}>
                                                                                    {entry.coeLabel || 'COE'}
                                                                                </div>
                                                                                {entry.facultyName && (
                                                                                    <div className="slot-faculty" style={{ color: 'var(--text-secondary)', fontSize: 9, opacity: 0.9 }}>
                                                                                        {entry.facultyName}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    }

                                                                    if (entry.isActivity) {
                                                                        return (
                                                                            <div key={eIdx} className="timetable-slot" style={{ background: 'var(--bg-color)', border: '1.5px solid var(--border-color)', cursor: 'default' }}
                                                                                title={`Fixed Activity: ${entry.activityLabel}`}>
                                                                                <div className="slot-subject" style={{ color: 'var(--text-primary)' }}>{entry.activityLabel}</div>
                                                                            </div>
                                                                        );
                                                                    }

                                                                    const isConf = !!entry.isConflict;
                                                                    const typeClass = entry.isLab ? 'lab' : (entry.subjectType === 'project' ? 'project' : 'theory');
                                                                    const isCrossDept = entry.fromCurrentTT === false;
                                                                    
                                                                    // Highlight if it's the first selected slot
                                                                    let isActive = swapMode && (swapFirst === entry._idx);
                                                                    
                                                                    // OR highlight if it's in the potential target window based on hover
                                                                    if (swapMode && swapFirst !== null && hoveredSlot && hoveredSlot.day === day) {
                                                                        const firstEntry = timetable.entries[swapFirst];
                                                                        const d1 = firstEntry.duration || 1;
                                                                        if (slotIdx >= hoveredSlot.slotIndex && slotIdx < hoveredSlot.slotIndex + d1) {
                                                                            isActive = true;
                                                                        }
                                                                    }

                                                                    // Cross-dept entries: styled distinctly, non-interactive
                                                                    if (isCrossDept) {
                                                                        return (
                                                                            <div
                                                                                key={eIdx}
                                                                                className={`timetable-slot ${typeClass}`}
                                                                                style={{
                                                                                    background: entry.isLab
                                                                                        ? 'var(--gold-l)'
                                                                                        : 'var(--primary-50)',
                                                                                    border: `1.5px solid ${entry.isLab ? 'var(--gold)' : 'var(--primary-200)'}`,
                                                                                    cursor: 'not-allowed',
                                                                                    opacity: 0.85,
                                                                                    position: 'relative'
                                                                                }}
                                                                                title={[
                                                                                    `Reserved by ${entry.classDeptCode || entry.classDeptName || 'another department'}`,
                                                                                    entry.subjectName !== 'Occupied' ? `${entry.subjectName} (${entry.subjectCode})` : 'Details hidden',
                                                                                    `Class: ${entry.className}${entry.classYear ? ` – Year ${entry.classYear}` : ''}`,
                                                                                    entry.facultyName ? `Faculty: ${entry.facultyName}` : ''
                                                                                ].filter(Boolean).join('\n')}
                                                                            >
                                                                                {/* Dept badge */}
                                                                                <div style={{
                                                                                    position: 'absolute', top: 3, right: 4,
                                                                                    background: entry.isLab ? 'var(--gold)' : 'var(--primary)',
                                                                                    color: entry.isLab ? 'var(--navy)' : '#fff',
                                                                                    fontSize: 8, fontWeight: 800,
                                                                                    padding: '1px 5px', borderRadius: 99,
                                                                                    letterSpacing: '0.5px'
                                                                                }}>
                                                                                    {entry.classDeptCode || 'OTHER'}
                                                                                </div>
                                                                                <div className="slot-subject" style={{ color: entry.isLab ? 'var(--navy)' : 'var(--primary)', paddingRight: 28 }}>
                                                                                    {entry.subjectCode || entry.subjectName}
                                                                                </div>
                                                                                <div className="slot-faculty" style={{ color: 'var(--text-secondary)' }}>
                                                                                    {entry.className}
                                                                                    {entry.facultyName ? ` · ${entry.facultyName}` : ''}
                                                                                </div>
                                                                                <div style={{ fontSize: 8, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>
                                                                                    {entry.classDeptName || 'Other Dept'} — read-only
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    }

                                                                    return (
                                                                        <div
                                                                            key={eIdx}
                                                                            className={`timetable-slot ${typeClass} ${isActive ? 'swap-highlight' : ''}`}
                                                                            style={{
                                                                                cursor: (swapMode && !entry.isContinuation) ? 'pointer' : 'default',
                                                                                border: isConf ? '2px solid var(--danger)' : (isActive ? '2px dashed var(--gold)' : undefined),
                                                                                background: isConf ? '#fff0f0' : (isActive ? 'var(--gold-l)' : undefined),
                                                                                opacity: entry.isContinuation ? 0.9 : 1
                                                                            }}
                                                                            onMouseEnter={() => {
                                                                                if (swapMode && swapFirst !== null) setHoveredSlot({ day, slotIndex: slotIdx });
                                                                            }}
                                                                            onMouseLeave={() => {
                                                                                if (swapMode) setHoveredSlot(null);
                                                                            }}
                                                                            onClick={() => {
                                                                                if (!entry.isContinuation) handleSlotClick(entry, entry._idx);
                                                                            }}
                                                                            title={[
                                                                                isConf ? 'OVERLAP DETECTED' : '',
                                                                                `${entry.subjectName} (${entry.subjectCode})`,
                                                                                `Faculty: ${entry.facultyName}${entry.labFaculty2Name ? ' + ' + entry.labFaculty2Name : ''}${entry.labFaculty3Name ? ' + ' + entry.labFaculty3Name : ''}`,
                                                                                `Room: ${entry.roomName}`,
                                                                                entry.isExtra ? 'Extra session (gap-fill)' : '',
                                                                                entry.schedulingNote ? `Note: ${entry.schedulingNote}` : ''
                                                                            ].filter(Boolean).join('\n')}
                                                                        >
                                                                            {isConf && (
                                                                                <div style={{ position: 'absolute', top: 4, right: 6, color: 'var(--danger)', fontSize: 8, fontWeight: 900 }}>
                                                                                    CONFLICT
                                                                                </div>
                                                                            )}
                                                                            <div className="slot-subject">
                                                                                {entry.subjectCode || entry.subjectName}
                                                                                {entry.isExtra && <span style={{ fontSize: 9, marginLeft: 3, color: 'var(--gold)', fontWeight: 700 }}>+</span>}
                                                                            </div>
                                                                            <div className="slot-faculty">
                                                                                {viewMode === 'lab'
                                                                                    ? `${entry.className} · ${entry.facultyName}`
                                                                                    : viewMode === 'class'
                                                                                         ? entry.facultyName
                                                                                         : entry.className
                                                                                }
                                                                                {entry.labFaculty2Name && ` + ${entry.labFaculty2Name}`}
                                                                                {entry.labFaculty3Name && ` + ${entry.labFaculty3Name}`}
                                                                            </div>
                                                                            {viewMode !== 'lab' && <div className="slot-room">{entry.roomName}</div>}
                                                                        </div>
                                                                    );

                                                                })}
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };


    return (
        <div className="fade-in">
            <ToastContainer toasts={toasts} removeToast={removeToast} />

            <div className="table-header">
                <div>
                    <h1 className="page-title">
                        {timetable?.name}
                        {isLocked && <span style={{ marginLeft: 10, fontSize: 13, background: 'var(--gold-l)', color: 'var(--navy)', border: '1px solid var(--gold)', padding: '2px 10px', borderRadius: 999, fontWeight: 700, verticalAlign: 'middle' }}>Locked</span>}
                        {isPublished && <span style={{ marginLeft: 6, fontSize: 13, background: 'var(--primary-50)', color: 'var(--primary-600)', border: '1px solid var(--primary-200)', padding: '2px 10px', borderRadius: 999, fontWeight: 700, verticalAlign: 'middle' }}>Published</span>}
                    </h1>
                    <p className="page-subtitle">{timetable?.description || 'Generated timetable view'}</p>
                </div>
                <div className="btn-group">
            {/* Swap/Move Mode button — for admin and department users */}
                    {(user?.role === 'admin' || user?.role === 'department_user') && !isLocked && (
                        <button
                            className={`btn ${swapMode ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => { setSwapMode(!swapMode); setSwapFirst(null); }}
                            title={swapMode ? 'Cancel swap mode' : 'Enter swap mode to swap or move slots'}
                        >
                            {swapMode ? 'Cancel Swap / Move' : 'Swap / Move Slots'}
                        </button>
                    )}
                    {user?.role === 'admin' && (
                        <button
                            className="btn btn-secondary"
                            disabled={lockLoading}
                            onClick={async () => {
                                setLockLoading(true);
                                try {
                                    await api.put(`/timetable/${id}/lock`, { isLocked: !isLocked });
                                    setIsLocked(!isLocked);
                                    addToast(isLocked ? 'Timetable unlocked' : 'Timetable locked');
                                } catch (e) {
                                    addToast(e.response?.data?.error || 'Lock failed', 'error');
                                } finally { setLockLoading(false); }
                            }}
                            title={isLocked ? 'Unlock timetable' : 'Lock timetable'}
                        >
                            {lockLoading ? '...' : isLocked ? 'Unlock' : 'Lock'}
                        </button>
                    )}
                    {/* Publish button — visible to admin AND dept users managing their own timetable OR when editing a published timetable */}
                    {(user?.role === 'admin' || (user?.role === 'department_user' && (timetable?.departmentId === user?.departmentId || isPublished))) && (
                        <button
                            className={`btn ${isPublished ? 'btn-secondary' : 'btn-primary'}`}
                            disabled={publishLoading}
                            onClick={async () => {
                                if (!confirm(isPublished ? 'This timetable is already published. Re-publish to sync reservations?' : 'Publish this timetable? This will sync cross-department reservations.')) return;
                                setPublishLoading(true);
                                try {
                                    await api.put(`/timetable/${id}/publish`);
                                    setIsPublished(true);
                                    addToast('Timetable published and reservations synchronized!');
                                } catch (e) {
                                    addToast(e.response?.data?.error || 'Publish failed', 'error');
                                } finally { setPublishLoading(false); }
                             }}
                             title="Publish timetable and sync reservations"
                        >
                            {publishLoading ? '...' : isPublished ? 'Re-Publish' : 'Publish'}
                        </button>
                    )}
                    <button
                        className="btn btn-secondary"
                        onClick={() => navigate(`/timetable/${id}/faculty-overview`)}
                        title="View all faculty schedules and detect overlaps"
                    >
                        Faculty Overview
                    </button>
                    <button className="btn btn-primary" onClick={handleExportPDF}>Export PDF</button>
                </div>
            </div>


            {/* Cross-department info banner — shown when a dept user views another dept's published timetable */}
            {user?.role === 'department_user' && timetable?.departmentId && timetable.departmentId !== user?.departmentId && (
                <div style={{
                    marginBottom: 16,
                    padding: '12px 16px',
                    background: 'var(--primary-50)',
                    border: '1px solid var(--primary-200)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                }}>
                    <div>
                        <strong style={{ color: 'var(--primary-color)' }}>Cross-Department Joint Editing</strong>
                        <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>
                            This timetable was published by another department. You can <strong>edit and schedule</strong> your own department's classes in remaining free slots, and check shared resources in the <strong>Faculty</strong> and <strong>Lab</strong> views. Other departments' slots remain locked as reservations.
                        </span>
                    </div>
                </div>
            )}

            {/* ── Conflicts Panel ── */}
            {timetable?.conflicts && timetable.conflicts.length > 0 && (() => {
                // Build a Set of "classId:subjectId" pairs that are actually placed in entries.
                // Conflicts for subjects that were successfully placed via swap-repair or
                // constraint-relaxation are STALE and should not be shown.
                const placedSet = new Set(
                    (timetable.entries || []).map(e => `${e.classId}:${e.subjectId}`)
                );

                // Only keep conflicts where the subject is genuinely missing from entries
                const realConflicts = timetable.conflicts.filter(c => {
                    if (c.type === 'coe') return true; // always show COE conflicts
                    if (!c.classId || !c.subjectId) return true; // keep if no ID to check
                    return !placedSet.has(`${c.classId}:${c.subjectId}`);
                });

                if (realConflicts.length === 0) return null;

                const grouped = {};
                realConflicts.forEach(c => {
                    const key = c.className || c.classId || 'General';
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(c);
                });
                return (
                    <div style={{
                        marginBottom: 20,
                        border: '1px solid #fca5a5',
                        borderRadius: 'var(--radius-md)',
                        overflow: 'hidden',
                        background: '#fff8f8'
                    }}>
                        {/* Panel header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 16px',
                            background: '#ffebeb',
                            borderBottom: '1px solid #fca5a5'
                        }}>
                            <strong style={{ color: '#b91c1c', fontSize: 14 }}>
                                {realConflicts.length} Scheduling Issue{realConflicts.length !== 1 ? 's' : ''} Detected
                            </strong>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4 }}>
                                — subjects that could not be placed due to hard constraints
                            </span>
                            <button
                                style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                                onClick={() => navigate(`/timetable/${id}/faculty-overview`)}
                            >
                                Open Gantt Chart for Faculty Overlaps
                            </button>
                        </div>
                        {/* Conflict rows */}
                        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                            {Object.entries(grouped).map(([className, items]) => (
                                <div key={className} style={{ padding: '10px 16px', borderBottom: '1px solid #ffebeb' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                                        {className}
                                    </div>
                                    {items.map((c, i) => (
                                        <div key={i} style={{
                                            display: 'flex', alignItems: 'flex-start', gap: 8,
                                            padding: '5px 0',
                                            fontSize: 12, color: 'var(--text-secondary)'
                                        }}>
                                            <span style={{
                                                background: c.type === 'coe' ? 'var(--primary-50)' : '#ffebeb',
                                                color: c.type === 'coe' ? 'var(--primary)' : '#b91c1c',
                                                borderRadius: 4, padding: '1px 7px',
                                                fontWeight: 700, fontSize: 11, flexShrink: 0
                                            }}>
                                                {c.type === 'coe' ? 'COE' : c.subjectName || 'Subject'}
                                            </span>
                                            <span style={{ color: 'var(--text-muted)' }}>{c.reason}</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}


            {/* View toggle */}

            <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="view-toggle">
                    <button className={`view-toggle-btn ${viewMode === 'class' ? 'active' : ''}`} onClick={() => switchView('class')}>
                        Class View
                    </button>
                    <button className={`view-toggle-btn ${viewMode === 'faculty' ? 'active' : ''}`} onClick={() => switchView('faculty')}>
                        Faculty View
                    </button>
                    <button className={`view-toggle-btn ${viewMode === 'lab' ? 'active' : ''}`} onClick={() => switchView('lab')}>
                        Lab View
                    </button>
                    <button className={`view-toggle-btn ${viewMode === 'summary' ? 'active' : ''}`} onClick={() => switchView('summary')}
                        style={{ borderLeft: '2px solid var(--border-color)' }}>
                        Allocation Summary
                    </button>
                    {(user?.role === 'admin' || user?.role === 'department_user') && (
                        <button className={`view-toggle-btn ${viewMode === 'mapping' ? 'active' : ''}`} onClick={() => switchView('mapping')}
                            style={{ borderLeft: '2px solid var(--border-color)' }}>
                            Edit Schedule Workflow
                        </button>
                    )}
                </div>

                {(viewMode === 'class' || viewMode === 'summary' || viewMode === 'faculty' || viewMode === 'lab') && (() => {
                    let opts = [];
                    let ph = "";
                    if (viewMode === 'class' || viewMode === 'summary') {
                        let filteredClasses = classes;
                        // For admin: filter by selected department
                        if (user?.role === 'admin' && filterDeptId) {
                            filteredClasses = classes.filter(c => c.departmentId === filterDeptId);
                        } else if (viewMode === 'summary' && user?.role === 'department_user' && user?.departmentId) {
                            filteredClasses = classes.filter(c => c.departmentId === user.departmentId);
                        }
                        opts = filteredClasses.map(c => ({ id: c.id, name: c.name }));
                        ph = "Search class...";
                    } else if (viewMode === 'faculty') {
                        opts = faculty.map(f => ({
                            id: f.id,
                            name: f.departmentCode ? `${f.name} (${f.departmentCode})` : f.name
                        }));
                        ph = "Search faculty...";
                    } else if (viewMode === 'lab') {
                        opts = rooms.filter(r => r.type === 'lab').map(r => ({
                            id: r.id,
                            name: `${r.name} (Cap: ${r.capacity || '—'})`
                        }));
                        ph = "Search lab...";
                    }

                    return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {/* Department filter — admin only, class/summary views */}
                            {user?.role === 'admin' && (viewMode === 'class' || viewMode === 'summary') && departments.length > 0 && (
                                <select
                                    value={filterDeptId}
                                    onChange={e => {
                                        setFilterDeptId(e.target.value);
                                        setSelectedId(''); // reset class selection on dept change
                                    }}
                                    className="form-select"
                                    style={{ fontSize: 13, padding: '6px 10px', height: 38, borderRadius: 8, border: '1.5px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', minWidth: 140, maxWidth: 180 }}
                                >
                                    <option value="">All Departments</option>
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.code || d.name}</option>
                                    ))}
                                </select>
                            )}
                            <SearchableSelect
                                options={opts}
                                value={selectedId}
                                onChange={e => setSelectedId(e.target.value)}
                                placeholder={ph}
                                style={{ width: 280 }}
                            />
                        </div>
                    );
                })()}
                {viewMode === 'lab' && viewData && (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ background: 'var(--primary-50)', color: 'var(--primary-color)', border: '1px solid var(--primary-200)', padding: '2px 10px', borderRadius: 999, fontWeight: 600 }}>
                            Lab View
                        </span>
                        {viewData.roomCapacity ? `Capacity: ${viewData.roomCapacity}` : ''}
                    </span>
                )}
            </div>

            {swapMode && (
                <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text-primary)' }}>
                    <strong>Swap Mode:</strong> {swapFirst !== null ? 'Now click the second slot to swap with.' : 'Click on the first slot you want to swap.'}
                </div>
            )}

            {viewMode === 'summary' ? (
                <div>
                    {allocationSummary ? (
                        <>
                            {/* Filter summary for selected class */}
                            {(() => {
                                const classSummary = allocationSummary.summary?.filter(s => s.classId === selectedId) || [];
                                const classTotals = {
                                    allocated: classSummary.reduce((sum, r) => sum + r.allocatedPeriods, 0),
                                    required: classSummary.reduce((sum, r) => sum + r.requiredPeriods, 0),
                                    remaining: classSummary.reduce((sum, r) => sum + r.remainingPeriods, 0)
                                };

                                return (
                                    <>
                                        {/* Class Totals bar */}
                                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                                            {[
                                                { label: 'Allocated Periods', value: classTotals.allocated, color: '#6366f1' },
                                                { label: 'Required Periods', value: classTotals.required, color: '#0ea5e9' },
                                                { label: 'Remaining to Allocate', value: classTotals.remaining, color: classTotals.remaining > 0 ? '#ef4444' : '#22c55e' },
                                                { label: 'Completion', value: classTotals.required > 0 ? `${Math.round((classTotals.allocated / classTotals.required) * 100)}%` : '0%', color: '#f59e0b' },
                                            ].map(stat => (
                                                <div key={stat.label} style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '16px 22px', minWidth: 140, boxShadow: 'var(--shadow-sm)' }}>
                                                    <div style={{ fontSize: 24, fontWeight: 700, color: stat.color }}>{stat.value ?? '—'}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.label}</div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="data-table-wrapper">
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
                                                        <th>Subject</th>
                                                        <th>Code</th>
                                                        <th>Status</th>
                                                        <th style={{ textAlign: 'center' }}>Required</th>
                                                        <th style={{ textAlign: 'center' }}>Allocated</th>
                                                        <th style={{ textAlign: 'center' }}>Remaining</th>
                                                        <th>Notes</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {classSummary.map((row, i) => (
                                                        <tr key={i} style={{ opacity: row.allocatedPeriods === 0 ? 0.7 : 1 }}>
                                                            <td>
                                                                <div style={{ fontWeight: 600 }}>{row.courseTitle}</div>
                                                            </td>
                                                            <td><code style={{ fontSize: 12 }}>{row.courseCode}</code></td>
                                                            <td>
                                                                {row.isFullyAllocated ? (
                                                                    <span style={{ color: '#059669', fontSize: 12, fontWeight: 600 }}>Fully Allocated</span>
                                                                ) : row.allocatedPeriods > 0 ? (
                                                                    <span style={{ color: '#d97706', fontSize: 12, fontWeight: 600 }}>Partially Allocated</span>
                                                                ) : (
                                                                    <span style={{ color: '#dc2626', fontSize: 12, fontWeight: 600 }}>Not Allocated</span>
                                                                )}
                                                            </td>
                                                            <td style={{ textAlign: 'center', fontWeight: 600 }}>{row.requiredPeriods}</td>
                                                            <td style={{ textAlign: 'center' }}>
                                                                <span style={{
                                                                    background: row.isFullyAllocated ? '#ecfdf5' : (row.allocatedPeriods > 0 ? '#fffbeb' : '#fef2f2'),
                                                                    color: row.isFullyAllocated ? '#065f46' : (row.allocatedPeriods > 0 ? '#92400e' : '#991b1b'),
                                                                    padding: '2px 10px', borderRadius: 12, fontWeight: 700, fontSize: 13
                                                                }}>
                                                                    {row.allocatedPeriods}
                                                                </span>
                                                            </td>
                                                            <td style={{ textAlign: 'center', color: row.remainingPeriods > 0 ? '#ef4444' : 'inherit', fontWeight: row.remainingPeriods > 0 ? 700 : 400 }}>
                                                                {row.remainingPeriods}
                                                            </td>
                                                            <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 250 }}>{row.schedulingNote}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                );
                            })()}
                        </>
                    ) : (
                        <div className="empty-state"><p>No allocation summary available. Generate a timetable first.</p></div>
                    )}
                </div>
            ) : viewMode === 'mapping' ? (
                <div className="card fade-in" style={{ padding: 24, minHeight: 480 }}>
                    {/* Step Indicators */}
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28, gap: 12, flexWrap: 'wrap' }}>
                        {[
                            { step: 0, num: '1', label: 'Data Mapping', desc: 'Select Classes' },
                            { step: 1, num: '2', label: 'Faculty Mapping', desc: 'Allocate Faculty' },
                            { step: 2, num: '3', label: 'Timetable Generation', desc: 'Auto-Generate Slots' }
                        ].map((s, idx) => {
                            const isCurrent = wizardStep === s.step;
                            const isCompleted = wizardStep > s.step;
                            return (
                                <div key={idx} style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    background: isCurrent ? 'var(--gold-l)' : (isCompleted ? 'var(--primary-50)' : 'var(--surface)'),
                                    border: isCurrent ? '1.5px solid var(--gold)' : (isCompleted ? '1.5px solid var(--primary-200)' : '1.5px solid var(--border-color)'),
                                    borderRadius: 12, 
                                    padding: '12px 18px', 
                                    minWidth: 180,
                                    opacity: isCurrent ? 1 : 0.85,
                                    transition: 'all 0.2s',
                                    boxShadow: isCurrent ? 'var(--shadow-sm)' : 'none'
                                }}>
                                    <div style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: '50%',
                                        background: isCompleted ? 'var(--primary-color)' : (isCurrent ? 'var(--gold)' : 'var(--text-muted)'),
                                        color: isCurrent && !isCompleted ? 'var(--navy)' : '#fff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 700,
                                        marginRight: 12,
                                        fontSize: 13
                                    }}>
                                        {isCompleted ? '✓' : s.num}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: isCurrent ? 'var(--navy)' : 'var(--text-secondary)' }}>{s.label}</div>
                                        <div style={{ fontSize: 10, color: isCurrent ? 'var(--primary-color)' : 'var(--text-muted)', marginTop: 2 }}>{s.desc}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Step Content */}
                    {wizardStep === 0 && (
                        <div>
                            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#1e293b' }}>Data Mapping: Select Classes</h2>
                            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Choose which department classes you want to map faculty and generate slots for.</p>
                            
                            <div style={{ marginBottom: 16 }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedClasses(classes.map(c => c.id))}>Select All</button>
                                <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => setSelectedClasses([])}>Deselect All</button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 28 }}>
                                {classes.map(cls => {
                                    const isChecked = selectedClasses.includes(cls.id);
                                    return (
                                        <label key={cls.id} style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: 12,
                                            padding: '16px 20px',
                                            background: isChecked ? 'rgba(59, 130, 246, 0.03)' : '#fff',
                                            border: isChecked ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                                            borderRadius: 12,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            boxShadow: isChecked ? '0 1px 3px rgba(59, 130, 246, 0.1)' : 'none'
                                        }}>
                                            <input 
                                                type="checkbox" 
                                                checked={isChecked} 
                                                onChange={() => {
                                                    setSelectedClasses(prev => prev.includes(cls.id) ? prev.filter(x => x !== cls.id) : [...prev, cls.id]);
                                                }} 
                                                style={{ marginTop: 3 }}
                                            />
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: 14, color: isChecked ? '#1e3a8a' : '#334155' }}>{cls.name}</div>
                                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                                    Year {cls.year} • Section {cls.section}
                                                </div>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="btn btn-primary" disabled={selectedClasses.length === 0} onClick={() => {
                                    if (selectedClasses.length > 0 && (!activeClassId || !selectedClasses.includes(activeClassId))) {
                                        setActiveClassId(selectedClasses[0]);
                                    }
                                    setWizardStep(1);
                                }}>
                                    Next: Faculty Mapping →
                                </button>
                            </div>
                        </div>
                    )}

                    {wizardStep === 1 && (
                        <div>
                            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#1e293b' }}>Faculty Mapping: Allocate Faculty</h2>
                            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Select a class on the left to map its faculty. Ensure all required subjects are mapped.</p>

                            <div style={{ display: 'flex', gap: 20, marginTop: 16 }}>
                                {/* Left Sidebar: Selected Classes */}
                                <div style={{ width: '30%', minWidth: 220, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                                    <div style={{ padding: '12px 14px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: 13 }}>
                                        Selected Classes ({selectedClasses.length})
                                    </div>
                                    <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                                        {selectedClasses.length === 0 ? (
                                            <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No classes selected</div>
                                        ) : (
                                            selectedClasses.map(cId => {
                                                const cls = classes.find(c => c.id === cId);
                                                if (!cls) return null;
                                                const isActive = activeClassId === cId;

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
                                                            padding: '16px 20px', cursor: 'pointer', borderBottom: '1px solid #e2e8f0',
                                                            background: isActive ? '#eff6ff' : 'transparent',
                                                            borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent'
                                                        }}>
                                                        <div style={{ fontWeight: 700, fontSize: 13, color: isActive ? '#2563eb' : 'inherit' }}>{cls.name}</div>
                                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{mappedCount} / {clsSubjects.length} mapped</div>
                                                        {isComplete ? <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 700, marginTop: 4 }}>Complete</div> : null}
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
                                            <div className="card" style={{ padding: '20px', minHeight: 400, overflow: 'visible', background: '#fff', border: '1px solid #e2e8f0' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
                                                    <div>
                                                        <h3 style={{ fontSize: 16, margin: 0, color: '#2563eb' }}>{ac.name}</h3>
                                                        <div style={{ fontSize: 12, color: '#64748b' }}>Year {ac.year} • Section {ac.section}</div>
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
                                                                <div key={sub.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', background: '#fff', padding: '18px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'relative', overflow: 'visible' }}>
                                                                    {/* Subject Info */}
                                                                    <div style={{ flex: '0 0 100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                                        <div>
                                                                            <span className={`badge ${sub.type === 'lab' ? 'badge-lab' : sub.type === 'theory' ? 'badge-theory' : sub.type === 'project' ? 'badge-project' : 'badge-elective'}`} style={{ marginRight: 6, fontSize: 9 }}>{sub.type}</span>
                                                                            <span style={{ fontWeight: 600, fontSize: 13 }}>{sub.name}</span>
                                                                            <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', marginLeft: 8 }}>{sub.code}</span>
                                                                        </div>
                                                                        {sub.type === 'lab' && (
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Assigned Lab:</span>
                                                                                <select
                                                                                    className="form-select"
                                                                                    style={{ fontSize: 10, padding: '2px 8px', height: 26, border: '1px solid #cbd5e1', borderRadius: 4 }}
                                                                                    value={mappingData.assignedLabId || ''}
                                                                                    onChange={e => handleLabChange(activeClassId, sub.id, e.target.value)}
                                                                                >
                                                                                    <option value="">Select Lab...</option>
                                                                                    {rooms.filter(r => r.type === 'lab').map(r => (
                                                                                        <option key={r.id} value={r.id}>{r.name}</option>
                                                                                    ))}
                                                                                </select>
                                                                                <span style={{ fontSize: 9, color: '#7c3aed', fontStyle: 'italic' }}>this section only</span>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Dept Filter */}
                                                                    <div style={{ flex: '0 0 140px' }}>
                                                                        <div style={{ fontSize: 9, color: '#64748b', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Dept Filter</div>
                                                                        <select className="form-select" style={{ fontSize: 11, height: 36, background: '#fff', border: '1px solid #d1d5db' }}
                                                                            value={rowDeptId}
                                                                            onChange={e => handleMappingChange(activeClassId, sub.id, 'tempDeptId', e.target.value)}>
                                                                            <option value="">All Depts</option>
                                                                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                                        </select>
                                                                    </div>

                                                                    {/* Primary Faculty */}
                                                                    <div style={{ flex: '1 1 160px' }}>
                                                                        <div style={{ fontSize: 9, color: '#64748b', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Primary Faculty *</div>
                                                                        <SearchableSelect
                                                                            options={faculty
                                                                                .filter(f => !rowDeptId || f.departmentId === rowDeptId)
                                                                                .map(f => ({
                                                                                    id: f.id,
                                                                                    name: f.name,
                                                                                    subtitle: departments.find(d => d.id === f.departmentId)?.name || ''
                                                                                }))}
                                                                            value={mappingData.facultyId}
                                                                            onChange={e => handleMappingChange(activeClassId, sub.id, 'facultyId', e.target.value)}
                                                                            placeholder="Select Faculty"
                                                                        />
                                                                    </div>

                                                                    {/* Co-Faculty selectors - only for lab subjects */}
                                                                    {isLab && (
                                                                        <>
                                                                            <div style={{ flex: '1 1 160px' }}>
                                                                                <div style={{ fontSize: 9, color: '#2563eb', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Co-Faculty 1 (optional)</div>
                                                                                <SearchableSelect
                                                                                    options={faculty.map(f => ({
                                                                                        id: f.id,
                                                                                        name: f.name,
                                                                                        subtitle: departments.find(d => d.id === f.departmentId)?.name || ''
                                                                                    }))}
                                                                                    value={mappingData.labFaculty2Id || ''}
                                                                                    onChange={e => handleMappingChange(activeClassId, sub.id, 'labFaculty2Id', e.target.value)}
                                                                                    placeholder="Co-Faculty 1"
                                                                                />
                                                                            </div>
                                                                            <div style={{ flex: '1 1 160px' }}>
                                                                                <div style={{ fontSize: 9, color: '#2563eb', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Co-Faculty 2 (optional)</div>
                                                                                <SearchableSelect
                                                                                    options={faculty.map(f => ({
                                                                                        id: f.id,
                                                                                        name: f.name,
                                                                                        subtitle: departments.find(d => d.id === f.departmentId)?.name || ''
                                                                                    }))}
                                                                                    value={mappingData.labFaculty3Id || ''}
                                                                                    onChange={e => handleMappingChange(activeClassId, sub.id, 'labFaculty3Id', e.target.value)}
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
                                        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, color: '#64748b', background: '#fff' }}>
                                            Select a class from the left sidebar to assign faculty.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
                                <button className="btn btn-secondary" onClick={() => setWizardStep(0)}>
                                    ← Back: Select Classes
                                </button>
                                <button className="btn btn-primary" onClick={() => setWizardStep(2)}>
                                    Next: Timetable Generation →
                                </button>
                            </div>
                        </div>
                    )}

                    {wizardStep === 2 && (
                        <div>
                            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#1e293b' }}>Timetable Generation: Auto-Generate</h2>
                            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Review your selected classes and mapping progress, and generate your schedule.</p>

                            <div className="card" style={{ padding: 20, marginBottom: 28, background: '#fff', border: '1px solid #e2e8f0' }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: '#1e293b' }}>Summary of Selected Classes</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {selectedClasses.map(cId => {
                                        const cls = classes.find(c => c.id === cId);
                                        if (!cls) return null;

                                        const REQUIRED_TYPES = ['theory', 'lab', 'project', 'elective', 'Non-Academic'];
                                        const clsSubjects = subjects.filter(s =>
                                            Number(s.year) === Number(cls.year) &&
                                            (!s.departmentId || s.departmentId === cls.departmentId) &&
                                            REQUIRED_TYPES.includes(s.type)
                                        );
                                        const mappedCount = clsSubjects.filter(s => classMappings[cId]?.[s.id]?.facultyId).length;
                                        const isComplete = clsSubjects.length > 0 && mappedCount === clsSubjects.length;

                                        return (
                                            <div key={cId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                                <div>
                                                    <span style={{ fontWeight: 600, fontSize: 14, color: '#334155' }}>{cls.name}</span>
                                                    <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>({mappedCount} of {clsSubjects.length} subjects mapped)</span>
                                                </div>
                                                <span style={{
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    padding: '2px 8px',
                                                    borderRadius: 12,
                                                    background: isComplete ? '#dcfce7' : '#fee2e2',
                                                    color: isComplete ? '#15803d' : '#b91c1c'
                                                }}>
                                                    {isComplete ? 'Ready to Generate' : 'Incomplete'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <button className="btn btn-secondary" onClick={() => setWizardStep(1)}>
                                    ← Back: Faculty Mapping
                                </button>
                                <button className="btn btn-primary" onClick={handleAutoGenerateWorkflow} disabled={autoGenLoading}
                                    style={{
                                        background: 'linear-gradient(135deg, #10b981, #059669)',
                                        border: 'none',
                                        color: '#fff',
                                        fontWeight: 600
                                    }}
                                >
                                    {autoGenLoading ? 'Generating Slots...' : 'Generate Schedule'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <>{renderGrid()}</>
            )}


            {/* Ultra-Simple Replacement Modal */}
            {replacementSlot && (
                <div className="modal-overlay" onClick={() => setReplacementSlot(null)}>
                    <div className="modal" 
                        style={{ maxWidth: 400, padding: 0, borderRadius: 12, overflow: 'hidden', background: '#fff' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {replacementLoading ? (
                            <div style={{ textAlign: 'center', padding: 30 }}>
                                <div className="spinner" style={{ margin: '0 auto 10px', width: 20, height: 20 }}></div>
                                <p style={{ fontSize: 12, color: '#333' }}>Finding options...</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 12, fontWeight: 700, color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>SELECT REPLACEMENT</span>
                                    <span style={{ fontWeight: 400, color: '#64748b' }}>{replacementSlot.day} · Slot {replacementSlot.slotIndex + 1}</span>
                                </div>
                                
                                <div style={{ maxHeight: '50vh', overflowY: 'auto', background: '#fff' }}>
                                    {validSubjects.length === 0 ? (
                                        <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                                            No available options
                                        </div>
                                    ) : (
                                        validSubjects.map((opt, i) => (
                                            <button 
                                                key={i} 
                                                style={{ 
                                                    width: '100%',
                                                    padding: '14px 16px',
                                                    background: '#fff',
                                                    border: 'none',
                                                    borderBottom: '1px solid #f1f5f9',
                                                    textAlign: 'left',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: 2,
                                                    transition: 'background 0.15s'
                                                }}
                                                onClick={() => performReplacement(opt)}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{opt.subjectName}</span>
                                                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{opt.subjectCode}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569' }}>
                                                    <span>{opt.facultyName}</span>
                                                    <span style={{ fontWeight: 700, color: '#1a73e8' }}>{opt.roomName}</span>
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                                <button 
                                    style={{ padding: '12px', border: 'none', background: '#fcfcfc', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontWeight: 600, borderTop: '1px solid #f1f5f9' }}
                                    onClick={() => setReplacementSlot(null)}
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
