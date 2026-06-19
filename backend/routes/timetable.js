import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
    Timetable,
    Class,
    Subject,
    Faculty,
    Room,
    TimeSlotConfig,
    FacultySubjectMapping,
    Coe,
    TimetableReservation,
    Department
} from '../models/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import {
    generateTimetable,
    validateSwap,
    validateMove,
    buildAllocationSummary,
    findValidSubjectsForSlot
} from '../engine/scheduler.js';
import { logAction } from '../utils/audit.js';

const router = Router();

// Helper: Filter/Mask Timetable entries to hide other department data from department users
async function filterTimetableForUser(tt, user) {
    if (!tt) return null;
    const ttObj = tt.toObject ? tt.toObject() : JSON.parse(JSON.stringify(tt));

    if (user.role === 'admin') {
        ttObj.entries = ttObj.entries.map(e => ({ ...e, editable: true }));
        return ttObj;
    }

    // Only show full details for the user's OWN department classes.
    // Entries from other departments are always masked — even if the timetable is published.
    // (Faculty/room IDs are kept visible so cross-dept availability can be checked.)
    const allowedClasses = await Class.find({ departmentId: user.departmentId }).lean();
    const allowedClassIds = allowedClasses.map(c => c.id);

    const filteredEntries = ttObj.entries.map(e => {
        if (allowedClassIds.includes(e.classId)) {
            return { ...e, editable: true };
        } else {
            // Mask subject/class details but keep room & faculty IDs visible
            return {
                day: e.day,
                slotIndex: e.slotIndex,
                duration: e.duration || 1,
                isLab: e.isLab || false,
                isFixed: e.isFixed || false,
                isExtra: e.isExtra || false,
                isActivity: e.isActivity || false,
                isCOE: e.isCOE || false,
                coeLabel: e.coeLabel ? 'COE Activity' : null,
                roomId: e.roomId,
                facultyId: e.facultyId,
                labFaculty2Id: e.labFaculty2Id,
                labFaculty3Id: e.labFaculty3Id,
                classId: 'masked',
                subjectId: 'masked',
                subjectName: 'Occupied',
                subjectCode: 'OCCUPIED',
                className: 'Other Dept',
                classYear: null,
                schedulingNote: 'Reserved by another department',
                editable: false
            };
        }
    });

    const filteredConflicts = ttObj.conflicts ? ttObj.conflicts.filter(c => allowedClassIds.includes(c.classId)) : [];

    return {
        ...ttObj,
        entries: filteredEntries,
        conflicts: filteredConflicts
    };
}

// GET /api/timetable/mappings/all
router.get('/mappings/all', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const filter = {};
        if (req.user.role === 'department_user') {
            const classes = await Class.find({ departmentId: req.user.departmentId }).lean();
            const classIds = classes.map(c => c.id);
            filter.classId = { $in: classIds };
        }

        const mappings = await FacultySubjectMapping.find(filter).lean();
        const faculty = await Faculty.find().lean();
        const subjects = await Subject.find().lean();
        const classes = await Class.find().lean();

        const enriched = mappings.map(m => ({
            ...m,
            facultyName: faculty.find(f => f.id === m.facultyId)?.name || '',
            subjectName: subjects.find(s => s.id === m.subjectId)?.name || '',
            className: classes.find(c => c.id === m.classId)?.name || '',
            labFaculty2Name: m.labFaculty2Id ? faculty.find(f => f.id === m.labFaculty2Id)?.name || '' : '',
            labFaculty3Name: m.labFaculty3Id ? faculty.find(f => f.id === m.labFaculty3Id)?.name || '' : ''
        }));
        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/timetable/mappings
router.post('/mappings', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { facultyId, subjectId, classId, labFaculty2Id, labFaculty3Id, assignedLabId } = req.body;
        if (!facultyId || !subjectId || !classId) {
            return res.status(400).json({ error: 'facultyId, subjectId, and classId required' });
        }

        if (req.user.role === 'department_user') {
            const cls = await Class.findOne({ id: classId }).lean();
            if (!cls || cls.departmentId !== req.user.departmentId) {
                return res.status(403).json({ error: 'Access denied. Class belongs to another department.' });
            }
        }

        const mapping = await FacultySubjectMapping.create({
            id: `fsm-${uuidv4().slice(0, 8)}`,
            facultyId, subjectId, classId,
            labFaculty2Id: labFaculty2Id || null,
            labFaculty3Id: labFaculty3Id || null,
            assignedLabId: assignedLabId || null
        });
        res.status(201).json(mapping.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/timetable/mappings/class/:classId
router.put('/mappings/class/:classId', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const classId = req.params.classId;
        const { mappings } = req.body;

        if (!Array.isArray(mappings)) {
            return res.status(400).json({ error: 'Mappings array required' });
        }

        // Verify class exists and matches department scope
        const cls = await Class.findOne({ id: classId });
        if (!cls) return res.status(404).json({ error: 'Class not found' });

        if (req.user.role === 'department_user' && cls.departmentId !== req.user.departmentId) {
            return res.status(403).json({ error: 'Access denied. Class belongs to another department.' });
        }

        // Delete existing and bulk insert new
        await FacultySubjectMapping.deleteMany({ classId });
        const validMappings = mappings.filter(m => m.subjectId && m.facultyId);
        const newMappings = validMappings.map(m => ({
            id: `fsm-${uuidv4().slice(0, 8)}`,
            classId: classId,
            subjectId: m.subjectId,
            facultyId: m.facultyId,
            labFaculty2Id: m.labFaculty2Id || null,
            labFaculty3Id: m.labFaculty3Id || null,
            assignedLabId: m.assignedLabId || null
        }));

        if (newMappings.length > 0) {
            await FacultySubjectMapping.insertMany(newMappings);
        }

        res.json({ message: 'Mappings updated successfully', count: newMappings.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/timetable/mappings/:id
router.delete('/mappings/:id', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        if (req.user.role === 'department_user') {
            const m = await FacultySubjectMapping.findOne({ id: req.params.id }).lean();
            if (!m) return res.status(404).json({ error: 'Mapping not found' });
            const cls = await Class.findOne({ id: m.classId }).lean();
            if (!cls || cls.departmentId !== req.user.departmentId) {
                return res.status(403).json({ error: 'Access denied. Mapping belongs to another department.' });
            }
        }

        const result = await FacultySubjectMapping.deleteOne({ id: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Mapping not found' });
        res.json({ message: 'Mapping deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/timetable - list all timetables
router.get('/', authenticateToken, async (req, res) => {
    try {
        const query = {};
        if (req.user.role === 'department_user') {
            query.$or = [
                { departmentId: req.user.departmentId },
                { departmentId: { $ne: req.user.departmentId }, isPublished: true }
            ];
        }
        const timetables = await Timetable.find(query).lean();
        const formatted = [];

        // Pre-load departments for name lookup
        const allDepartments = await Department.find().lean();

        let deptClassIds = null;
        if (req.user.role === 'department_user') {
            const classes = await Class.find({ departmentId: req.user.departmentId }).lean();
            deptClassIds = classes.map(c => c.id);
        }

        for (const t of timetables) {
            let entries = t.entries || [];
            let conflicts = t.conflicts || [];
            if (deptClassIds) {
                entries = entries.filter(e => deptClassIds.includes(e.classId));
                conflicts = conflicts.filter(c => deptClassIds.includes(c.classId));
            }

            // Filter out stale conflicts (where the subject was actually placed)
            const placedSet = new Set(entries.map(e => `${e.classId}:${e.subjectId}`));
            const realConflicts = conflicts.filter(c => {
                if (c.type === 'coe') return true; // always show COE conflicts
                if (!c.classId || !c.subjectId) return true; // keep if no ID to check
                return !placedSet.has(`${c.classId}:${c.subjectId}`);
            });

            // Resolve department name
            const dept = t.departmentId ? allDepartments.find(d => d.id === t.departmentId) : null;

            formatted.push({
                id: t.id,
                name: t.name,
                description: t.description,
                generatedAt: t.generatedAt,
                entryCount: entries.length,
                conflictCount: realConflicts.length,
                isPublished: t.isPublished || false,
                isLocked: t.isLocked || false,
                departmentId: t.departmentId || null,
                departmentName: dept ? dept.name : null,
                departmentCode: dept ? dept.code : null
            });
        }
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/timetable/:id/allocation-summary
router.get('/:id/allocation-summary', authenticateToken, async (req, res) => {
    try {
        const tt = await Timetable.findOne({ id: req.params.id }).lean();
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        if (req.user.role === 'department_user') {
            if (tt.departmentId !== req.user.departmentId && !tt.isPublished) {
                return res.status(403).json({ error: 'Access denied. This timetable is not published.' });
            }
        }

        const [subjects, mappings, classes] = await Promise.all([
            Subject.find().lean(),
            FacultySubjectMapping.find().lean(),
            Class.find().lean()
        ]);

        let entries = tt.entries;
        let filteredClasses = classes;
        if (req.user.role === 'department_user') {
            const deptClassIds = classes.filter(c => c.departmentId === req.user.departmentId).map(c => c.id);
            entries = entries.filter(e => deptClassIds.includes(e.classId));
            filteredClasses = classes.filter(c => c.departmentId === req.user.departmentId);
        }

        const summary = buildAllocationSummary(entries, subjects, mappings, filteredClasses);

        const totalAllocated = summary.reduce((sum, r) => sum + r.allocatedPeriods, 0);
        const fixedPeriods = summary.filter(r => r.courseCode === '-').reduce((sum, r) => sum + r.allocatedPeriods, 0);
        const subjectPeriods = totalAllocated - fixedPeriods;

        res.json({
            timetableName: tt.name,
            summary,
            totals: {
                totalAllocated,
                fixedPeriods,
                subjectPeriods,
                maxPerWeek: 42,
                remaining: 42 - totalAllocated
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/timetable/:id/faculty-overview
router.get('/:id/faculty-overview', authenticateToken, async (req, res) => {
    try {
        const tt = await Timetable.findOne({ id: req.params.id }).lean();
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        if (req.user.role === 'department_user') {
            if (tt.departmentId !== req.user.departmentId && !tt.isPublished) {
                return res.status(403).json({ error: 'Access denied. This timetable is not published.' });
            }
        }

        const [subjects, faculty, classes, rooms, configs, departments] = await Promise.all([
            Subject.find().lean(),
            Faculty.find().lean(),
            Class.find().lean(),
            Room.find().lean(),
            TimeSlotConfig.find().lean(),
            Department.find().lean()
        ]);

        const masterConfig = configs[0] || null;

        // ----- Aggregate entries across ALL published timetables -----
        // ECE department users need to see CSE faculty's committed slots so they
        // can detect conflicts when scheduling shared faculty.
        const allPublishedTTs = await Timetable.find({ isPublished: true }).lean();

        const entryMap = new Map();

        // Current timetable entries first (they are the editing context)
        tt.entries.forEach((e, idx) => {
            const key = `${e.day}-${e.slotIndex}-${e.classId}-${e.facultyId}`;
            entryMap.set(key, { ...e, _origIdx: idx, _fromCurrentTT: true });
        });

        // Merge entries from other published timetables
        for (const ptt of allPublishedTTs) {
            if (ptt.id === tt.id) continue;
            ptt.entries.forEach(e => {
                const key = `${e.day}-${e.slotIndex}-${e.classId}-${e.facultyId}`;
                if (!entryMap.has(key)) {
                    entryMap.set(key, { ...e, _origIdx: -1, _fromCurrentTT: false });
                }
            });
        }

        const allEntries = Array.from(entryMap.values());

        const enriched = allEntries.map((e, idx) => {
            const cls = classes.find(c => c.id === e.classId);
            const isMyDept = req.user.role !== 'department_user' || cls?.departmentId === req.user.departmentId;
            const classDept = departments.find(d => d.id === cls?.departmentId);

            // Fall back to configs[0] when no year-specific config exists
            const config = configs.find(c => Number(c.year) === Number(cls?.year)) || configs[0] || null;
            const startSlot = config?.slots[e.slotIndex];
            const endSlot = config?.slots[e.slotIndex + (e.duration || 1) - 1];

            return {
                ...e,
                originalIndex: e._origIdx,
                editable: isMyDept && e._fromCurrentTT,
                fromCurrentTT: e._fromCurrentTT,
                subjectName: isMyDept ? (subjects.find(s => s.id === e.subjectId)?.name || '') : 'Occupied',
                subjectCode: isMyDept ? (subjects.find(s => s.id === e.subjectId)?.code || '') : 'OCCUPIED',
                className: cls?.name || 'Unknown Class',
                classYear: cls?.year || '',
                classDeptName: classDept?.name || '',
                classDeptCode: classDept?.code || '',
                roomName: isMyDept ? (rooms.find(r => r.id === e.roomId)?.name || '') : '',
                facultyName: faculty.find(f => f.id === e.facultyId)?.name || '',
                labFaculty2Name: e.labFaculty2Id ? faculty.find(f => f.id === e.labFaculty2Id)?.name || '' : '',
                labFaculty3Name: e.labFaculty3Id ? faculty.find(f => f.id === e.labFaculty3Id)?.name || '' : '',
                startTime: startSlot?.start || '',
                endTime: endSlot?.end || ''
            };
        });

        // Group by faculty — show ALL faculty including those from other depts
        // (dept user can see cross-dept faculty to avoid scheduling conflicts)
        const facultyMap = {};
        const addToFaculty = (facId, entry) => {
            if (!facId) return;
            const fac = faculty.find(f => f.id === facId);
            if (!facultyMap[facId]) {
                const facDept = departments.find(d => d.id === fac?.departmentId);
                facultyMap[facId] = {
                    facultyId: facId,
                    facultyName: fac?.name || facId,
                    facultyDeptName: facDept?.name || '',
                    facultyDeptCode: facDept?.code || '',
                    entries: []
                };
            }
            facultyMap[facId].entries.push(entry);
        };
        enriched.forEach(e => {
            const uniqueFacs = [...new Set([e.facultyId, e.labFaculty2Id, e.labFaculty3Id].filter(Boolean))];
            uniqueFacs.forEach(facId => {
                addToFaculty(facId, e);
            });
        });

        const checkOverlap = (s1, e1, s2, e2) => (s1 < e2 && e1 > s2);
        
        const markConflict = (e1, e2, reason) => {
            e1.isConflict = true;
            e1.conflictReason = reason;
            if (!e1.conflictsWith) e1.conflictsWith = [];
            e1.conflictsWith.push({ subjectName: e2.subjectName, facultyName: e2.facultyName, reason });

            e2.isConflict = true;
            e2.conflictReason = reason;
            if (!e2.conflictsWith) e2.conflictsWith = [];
            e2.conflictsWith.push({ subjectName: e1.subjectName, facultyName: e1.facultyName, reason });
        };

        const timeRegistry = { faculty: {}, room: {} };
        const addToRegistry = (reg, day, id, s, e, entry) => {
            if (!id || !s || !e) return;
            const startM = timeStrMins(s);
            const endM = timeStrMins(e);
            
            if (!reg[day]) reg[day] = {};
            if (!reg[day][id]) reg[day][id] = [];
            
            reg[day][id].forEach(existing => {
                if (checkOverlap(startM, endM, existing.s, existing.e)) {
                    markConflict(entry, existing.entry, 'Time overlap detected (Different year slot configurations)');
                }
            });
            
            reg[day][id].push({ s: startM, e: endM, entry });
        };

        const timeStrMins = (str) => {
            if (!str) return 0;
            const [h, m] = str.split(':').map(Number);
            return h * 60 + m;
        };

        enriched.forEach(e => {
            addToRegistry(timeRegistry.faculty, e.day, e.facultyId, e.startTime, e.endTime, e);
            if (e.labFaculty2Id) {
                addToRegistry(timeRegistry.faculty, e.day, e.labFaculty2Id, e.startTime, e.endTime, e);
            }
            if (e.roomId) {
                addToRegistry(timeRegistry.room, e.day, e.roomId, e.startTime, e.endTime, e);
            }
        });

        const facultySchedules = Object.values(facultyMap).map(fs => {
            const overlaps = [];
            const seenKeys = new Set();
            fs.entries.forEach(e => {
                if (e.isConflict) {
                    const key = `${e.day}-${e.slotIndex}`;
                    if (!seenKeys.has(key)) {
                        seenKeys.add(key);
                        overlaps.push({ day: e.day, slotIndex: e.slotIndex, reason: e.conflictReason });
                    }
                }
            });
            return { ...fs, overlaps };
        });
        facultySchedules.sort((a, b) => a.facultyName.localeCompare(b.facultyName));

        res.json({ timetableName: tt.name, timeSlotConfig: masterConfig, timeSlotConfigs: configs, facultySchedules });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// GET /api/timetable/:id
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const tt = await Timetable.findOne({ id: req.params.id }).lean();
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        if (req.user.role === 'department_user') {
            if (tt.departmentId !== req.user.departmentId && !tt.isPublished) {
                return res.status(403).json({ error: 'Access denied. This timetable is not published.' });
            }
        }

        const filtered = await filterTimetableForUser(tt, req.user);
        res.json(filtered);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/timetable/generate
router.post('/generate', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { name, description, selectedClassIds, selectedMappingIds } = req.body;
        if (!name) return res.status(400).json({ error: 'Timetable name is required' });

        const allClasses = await Class.find().lean();
        const allMappings = await FacultySubjectMapping.find().lean();
        const subjects = await Subject.find().lean();
        const faculty = await Faculty.find().lean();
        const rooms = await Room.find().lean();
        const timeSlotConfigs = await TimeSlotConfig.find().lean();
        const coeEntries = await Coe.find().lean();

        let classes = allClasses;
        let mappings = allMappings;
        let existingReservations = [];
        let otherDeptEntries = [];

        // Load ALL published timetables (not just one) so every department's
        // existing constraints are respected when generating a new timetable.
        const allPublishedTTs = await Timetable.find({ isPublished: true }).lean();

        // === DEPARTMENT USER: Incremental/Continuation Mode ===
        // Only dept users are restricted by other departments' reservations.
        // Admin always generates a completely FRESH timetable — no reservation pre-fills.
        if (req.user.role === 'department_user') {
            // Force scoped class selection to this department only
            const deptClasses = allClasses.filter(c => c.departmentId === req.user.departmentId);
            const deptClassIds = deptClasses.map(c => c.id);

            if (selectedClassIds && selectedClassIds.length > 0) {
                classes = deptClasses.filter(c => selectedClassIds.includes(c.id));
            } else {
                classes = deptClasses;
            }

            const activeClassIds = classes.map(c => c.id);
            mappings = allMappings.filter(m => activeClassIds.includes(m.classId));

            // Collect other-dept entries from ALL published timetables with deduplication.
            // Using a Map keyed by day+slotIndex+classId ensures each slot appears once
            // even if the same entry appears in multiple published timetable documents
            // (e.g., ECE's published timetable may already include CSE's baseline entries).
            if (allPublishedTTs.length > 0) {
                const otherDeptEntryMap = new Map();
                for (const ptt of allPublishedTTs) {
                    for (const e of ptt.entries) {
                        if (!deptClassIds.includes(e.classId)) {
                            const key = `${e.day}-${e.slotIndex}-${e.classId}`;
                            if (!otherDeptEntryMap.has(key)) {
                                otherDeptEntryMap.set(key, e);
                            }
                        }
                    }
                }
                otherDeptEntries = Array.from(otherDeptEntryMap.values());

                // Build existingReservations from deduplicated other-dept entries.
                // These have complete duration, labFaculty2/3, roomId data — much more
                // accurate than the TimetableReservation table.
                existingReservations = otherDeptEntries.map(e => {
                    const cls = allClasses.find(c => c.id === e.classId);
                    return {
                        day:           e.day,
                        slotIndex:     e.slotIndex,
                        duration:      e.duration || 1,
                        facultyId:     e.facultyId    || null,
                        labFaculty2Id: e.labFaculty2Id || null,
                        labFaculty3Id: e.labFaculty3Id || null,
                        roomId:        e.roomId       || null,
                        subjectId:     e.subjectId    || null,
                        year:          cls ? cls.year  : null
                    };
                });
            }
        } else {
            // === ADMIN: Full fresh generation — no reservation constraints ===
            if (selectedClassIds && selectedClassIds.length > 0) {
                classes = allClasses.filter(c => selectedClassIds.includes(c.id));
                mappings = allMappings.filter(m => selectedClassIds.includes(m.classId));
            } else {
                if (selectedMappingIds && selectedMappingIds.length > 0) {
                    mappings = allMappings.filter(m => selectedMappingIds.includes(m.id));
                }
                // else: use all classes and all mappings (full institution generation)
            }
            // existingReservations stays [] — admin always generates fresh
            // otherDeptEntries stays [] — admin output is not merged with old data
        }

        const data = {
            classes,
            subjects,
            faculty,
            rooms,
            timeSlotConfigs,
            defaultClasses: [],
            facultySubjectMapping: mappings,
            coeEntries,
            existingReservations
        };

        const result = generateTimetable(data);

        // Merge baseline entries from other departments/unselected classes
        const finalEntries = [...otherDeptEntries, ...result.entries];

        const timetable = await Timetable.create({
            id: `tt-${uuidv4().slice(0, 8)}`,
            name,
            description: description || '',
            generatedAt: new Date().toISOString(),
            isPublished: false,
            isLocked: false,
            departmentId: req.user.role === 'department_user' ? req.user.departmentId : null,
            entries: finalEntries,
            conflicts: result.conflicts
        });

        const logMsg = req.user.role === 'department_user' 
            ? `Generated timetable: ${name} (Incremental for department)`
            : `Generated timetable: ${name}`;
        await logAction(req.user, logMsg, { timetableId: timetable.id });

        res.status(201).json(timetable.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/timetable/:id/auto-generate
router.put('/:id/auto-generate', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { id } = req.params;
        const tt = await Timetable.findOne({ id });
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        if (req.user.role === 'department_user') {
            if (tt.isLocked) {
                return res.status(403).json({ error: 'Timetable is locked.' });
            }
        }

        const allClasses = await Class.find().lean();
        const allMappings = await FacultySubjectMapping.find().lean();
        const subjects = await Subject.find().lean();
        const faculty = await Faculty.find().lean();
        const rooms = await Room.find().lean();
        const timeSlotConfigs = await TimeSlotConfig.find().lean();
        const coeEntries = await Coe.find().lean();

        const { selectedClassIds } = req.body;

        // Scope generation to user's department (or all classes if admin)
        let targetDeptId = req.user.role === 'department_user' ? req.user.departmentId : null;
        let classes = allClasses;
        let mappings = allMappings;

        if (targetDeptId) {
            const deptClasses = allClasses.filter(c => c.departmentId === targetDeptId);
            if (selectedClassIds && selectedClassIds.length > 0) {
                classes = deptClasses.filter(c => selectedClassIds.includes(c.id));
            } else {
                classes = deptClasses;
            }
            const classIds = classes.map(c => c.id);
            mappings = allMappings.filter(m => classIds.includes(m.classId));
        } else if (selectedClassIds && selectedClassIds.length > 0) {
            classes = allClasses.filter(c => selectedClassIds.includes(c.id));
            const classIds = classes.map(c => c.id);
            mappings = allMappings.filter(m => classIds.includes(m.classId));
        }

        const targetClassIds = classes.map(c => c.id);

        // Keep all entries that DO NOT belong to the target classes (other departments' reservations)
        const otherDeptEntries = tt.entries.filter(e => !targetClassIds.includes(e.classId));

        // Load other published timetables to include their cross-department reservations too
        const allPublishedTTs = await Timetable.find({ isPublished: true }).lean();
        const reservationMap = new Map();

        // 1. Add other dept entries from current timetable
        otherDeptEntries.forEach(e => {
            const key = `${e.day}-${e.slotIndex}-${e.classId}`;
            reservationMap.set(key, e);
        });

        // 2. Add non-target entries from other published timetables
        for (const ptt of allPublishedTTs) {
            if (ptt.id === tt.id) continue;
            for (const e of ptt.entries) {
                if (!targetClassIds.includes(e.classId)) {
                    const key = `${e.day}-${e.slotIndex}-${e.classId}`;
                    if (!reservationMap.has(key)) {
                        reservationMap.set(key, e);
                    }
                }
            }
        }

        const existingReservations = Array.from(reservationMap.values()).map(e => {
            const cls = allClasses.find(c => c.id === e.classId);
            return {
                day: e.day,
                slotIndex: e.slotIndex,
                duration: e.duration || 1,
                facultyId: e.facultyId || null,
                labFaculty2Id: e.labFaculty2Id || null,
                labFaculty3Id: e.labFaculty3Id || null,
                roomId: e.roomId || null,
                subjectId: e.subjectId || null,
                year: cls ? cls.year : null
            };
        });

        const data = {
            classes,
            subjects,
            faculty,
            rooms,
            timeSlotConfigs,
            defaultClasses: [],
            facultySubjectMapping: mappings,
            coeEntries,
            existingReservations
        };

        const result = generateTimetable(data);

        // Combine other department entries (original unmodified) with newly generated department entries
        const finalEntries = [...otherDeptEntries, ...result.entries];

        tt.entries = finalEntries;
        // Keep other dept conflicts + add new ones
        const otherDeptConflicts = (tt.conflicts || []).filter(c => c.classId && !targetClassIds.includes(c.classId));
        tt.conflicts = [...otherDeptConflicts, ...result.conflicts];

        await tt.save();
        await logAction(req.user, `Automatically generated department slots in timetable: ${tt.name}`, { timetableId: tt.id });

        res.json({ message: 'Timetable slots generated successfully', timetable: tt });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/timetable/:id/swap
router.put('/:id/swap', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { entryIndex1, entryIndex2 } = req.body;
        if (entryIndex1 === undefined || entryIndex2 === undefined) {
            return res.status(400).json({ error: 'entryIndex1 and entryIndex2 required' });
        }

        const tt = await Timetable.findOne({ id: req.params.id });
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        if (req.user.role === 'department_user') {
            if (tt.isLocked) {
                return res.status(403).json({ error: 'Timetable is locked.' });
            }
        }

        const [subjects, classes, configs, rooms, facultySubjectMapping] = await Promise.all([
            Subject.find().lean(),
            Class.find().lean(),
            TimeSlotConfig.find().lean(),
            Room.find().lean(),
            FacultySubjectMapping.find().lean()
        ]);

        const validation = validateSwap(tt.entries.toObject(), entryIndex1, entryIndex2, {
            subjects, classes, configs, rooms, facultySubjectMapping
        });

        if (!validation.valid) {
            return res.status(400).json({ error: validation.reason, violations: validation.violations });
        }

        const e1 = tt.entries[entryIndex1];
        const e2 = tt.entries[entryIndex2];
        const d1 = e1.duration || 1;
        const classId1 = e1.classId;
        const classId2 = e2.classId;

        if (req.user.role === 'department_user') {
            const cls1 = classes.find(c => c.id === classId1);
            if (!cls1 || cls1.departmentId !== req.user.departmentId) {
                return res.status(403).json({ error: 'Access denied. You can only modify entries belonging to classes in your own department.' });
            }
            const cls2 = classes.find(c => c.id === classId2);
            if (!cls2 || cls2.departmentId !== req.user.departmentId) {
                return res.status(403).json({ error: 'Access denied. You can only modify entries belonging to classes in your own department.' });
            }
        }

        const e1Day = e1.day;
        const e1Slot = e1.slotIndex;
        const e2Day = e2.day;
        const e2Slot = e2.slotIndex;

        const indicesInWin1 = [];
        tt.entries.forEach((e, idx) => {
            if (e.classId === classId1 && e.day === e1Day &&
                e.slotIndex < e1Slot + d1 && e.slotIndex + (e.duration || 1) > e1Slot) {
                indicesInWin1.push(idx);
            }
        });

        const indicesInWin2 = [];
        tt.entries.forEach((e, idx) => {
            if (e.classId === classId2 && e.day === e2Day &&
                e.slotIndex < e2Slot + d1 && e.slotIndex + (e.duration || 1) > e2Slot) {
                indicesInWin2.push(idx);
            }
        });
        
        const finalUpdates = [];
        indicesInWin1.forEach(idx => {
            const e = tt.entries[idx];
            finalUpdates.push({ idx, day: e2Day, slot: e.slotIndex - e1Slot + e2Slot });
        });
        indicesInWin2.forEach(idx => {
            const e = tt.entries[idx];
            finalUpdates.push({ idx, day: e1Day, slot: e.slotIndex - e2Slot + e1Slot });
        });

        finalUpdates.forEach(u => {
            tt.entries[u.idx].day = u.day;
            tt.entries[u.idx].slotIndex = u.slot;
        });

        await tt.save();
        await logAction(req.user, `Swapped slots in timetable: ${tt.name}`, { timetableId: tt.id, entry1: e1, entry2: e2 });

        res.json({ message: 'Slots swapped successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/timetable/:id/move-slot
router.put('/:id/move-slot', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { entryIndex, targetDay, targetSlotIndex } = req.body;
        if (entryIndex === undefined || !targetDay || targetSlotIndex === undefined) {
            return res.status(400).json({ error: 'entryIndex, targetDay, and targetSlotIndex are required' });
        }

        const tt = await Timetable.findOne({ id: req.params.id });
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        if (req.user.role === 'department_user') {
            if (tt.isLocked) {
                return res.status(403).json({ error: 'Timetable is locked.' });
            }
        }

        const entry = tt.entries[entryIndex];
        if (!entry) return res.status(400).json({ error: 'Invalid entry index' });

        const [subjects, classes, configs, rooms, facultySubjectMapping] = await Promise.all([
            Subject.find().lean(),
            Class.find().lean(),
            TimeSlotConfig.find().lean(),
            Room.find().lean(),
            FacultySubjectMapping.find().lean()
        ]);

        if (req.user.role === 'department_user') {
            const cls = classes.find(c => c.id === entry.classId);
            if (!cls || cls.departmentId !== req.user.departmentId) {
                return res.status(403).json({ error: 'Access denied. You can only move entries belonging to classes in your own department.' });
            }
        }

        const validation = validateMove(tt.entries.toObject(), entryIndex, targetDay, targetSlotIndex, {
            subjects, classes, configs, rooms, facultySubjectMapping
        });

        if (!validation.valid) {
            return res.status(400).json({ error: validation.reason, violations: validation.violations });
        }

        // Apply move: find all entries of same class at the source day/slot index (multi-period window)
        const sourceDay = entry.day;
        const sourceSlot = entry.slotIndex;
        const duration = entry.duration || 1;

        const indicesToMove = [];
        tt.entries.forEach((e, idx) => {
            if (e.classId === entry.classId && e.day === sourceDay &&
                e.slotIndex < sourceSlot + duration && e.slotIndex + (e.duration || 1) > sourceSlot) {
                indicesToMove.push(idx);
            }
        });

        indicesToMove.forEach(idx => {
            tt.entries[idx].day = targetDay;
            tt.entries[idx].slotIndex = tt.entries[idx].slotIndex - sourceSlot + targetSlotIndex;
        });

        await tt.save();
        await logAction(req.user, `Moved slot in timetable: ${tt.name}`, { timetableId: tt.id, entry, targetDay, targetSlotIndex });

        res.json({ message: 'Slot moved successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/timetable/:id/class-view/:classId
router.get('/:id/class-view/:classId', authenticateToken, async (req, res) => {
    try {
        const tt = await Timetable.findOne({ id: req.params.id }).lean();
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        if (req.user.role === 'department_user') {
            if (tt.departmentId !== req.user.departmentId && !tt.isPublished) {
                return res.status(403).json({ error: 'Access denied. This timetable is not published.' });
            }
        }

        const cls = await Class.findOne({ id: req.params.classId }).lean();
        if (!cls) return res.status(404).json({ error: 'Class not found' });

        const isMyDept = req.user.role !== 'department_user' || cls.departmentId === req.user.departmentId;

        const classEntries = tt.entries.filter(e => e.classId === req.params.classId);
        let config = await TimeSlotConfig.findOne({ year: cls?.year }).lean();
        if (!config) config = await TimeSlotConfig.findOne().lean();

        const subjects = await Subject.find().lean();
        const faculty = await Faculty.find().lean();
        const rooms = await Room.find().lean();

        const enriched = classEntries.map(e => ({
            ...e,
            editable: isMyDept,
            subjectName: isMyDept ? (subjects.find(s => s.id === e.subjectId)?.name || '') : 'Occupied',
            subjectCode: isMyDept ? (subjects.find(s => s.id === e.subjectId)?.code || '') : 'OCCUPIED',
            facultyName: isMyDept ? (faculty.find(f => f.id === e.facultyId)?.name || '') : '',
            labFaculty2Name: isMyDept && e.labFaculty2Id ? faculty.find(f => f.id === e.labFaculty2Id)?.name || '' : '',
            labFaculty3Name: isMyDept && e.labFaculty3Id ? faculty.find(f => f.id === e.labFaculty3Id)?.name || '' : '',
            roomName: isMyDept ? (rooms.find(r => r.id === e.roomId)?.name || '') : ''
        }));

        res.json({
            className: cls.name,
            classYear: cls.year,
            classSection: cls.section,
            timeSlotConfig: config,
            entries: enriched
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/timetable/:id/resolve/:entryIndex — Automatic conflict resolver
router.put('/:id/resolve/:entryIndex', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const tt = await Timetable.findOne({ id: req.params.id });
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        if (req.user.role === 'department_user' && tt.isLocked) {
            return res.status(403).json({ error: 'Timetable is locked by Administrator.' });
        }

        const idx = parseInt(req.params.entryIndex);
        if (isNaN(idx) || idx < 0 || idx >= tt.entries.length) {
            return res.status(400).json({ error: 'Invalid entry index' });
        }

        const target = tt.entries[idx];
        const duration = target.duration || 1;

        const classes = await Class.find().lean();
        const cls = classes.find(c => c.id === target.classId);
        if (!cls) return res.status(404).json({ error: 'Class not found' });

        if (req.user.role === 'department_user') {
            if (cls.departmentId !== req.user.departmentId) {
                return res.status(403).json({ error: 'Access denied. You can only resolve conflicts for classes in your own department.' });
            }
        }

        let config = await TimeSlotConfig.findOne({ year: cls?.year || '1' }).lean();
        if (!config) config = await TimeSlotConfig.findOne().lean();
        if (!config) return res.status(400).json({ error: 'No time slot config for this class year' });

        const days = config.days;
        const totalSlots = config.slots.length;
        let found = false;
        let bestDay = null;
        let bestSlot = null;

        for (const day of days) {
            for (let s = 0; s <= totalSlots - duration; s++) {
                let isBreak = false;
                for (let d = 0; d < duration; d++) {
                    const slotType = config.slots[s + d]?.type;
                    if (slotType === 'break' || slotType === 'lunch') {
                        isBreak = true;
                        break;
                    }
                }
                if (isBreak) continue;

                const collisions = tt.entries.filter((e, i) => {
                    if (i === idx) return false;
                    const eDur = e.duration || 1;
                    const overlapDay = (e.day === day);
                    const overlapTime = (s < e.slotIndex + eDur && s + duration > e.slotIndex);
                    return overlapDay && overlapTime;
                });

                if (collisions.length === 0) {
                    bestDay = day;
                    bestSlot = s;
                    found = true;
                    break;
                }
            }
            if (found) break;
        }

        if (found) {
            target.day = bestDay;
            target.slotIndex = bestSlot;
            target.isExtra = true;
            target.schedulingNote = `Auto-resolved collision; moved to ${bestDay} slot ${bestSlot + 1}`;
            await tt.save();

            await logAction(req.user, `Auto-resolved conflict in timetable: ${tt.name}`, { timetableId: tt.id, classId: target.classId, newSlot: `${bestDay}-${bestSlot}` });

            res.json({ message: `Successfully rescheduled to ${bestDay} slot ${bestSlot + 1}`, entry: target });
        } else {
            res.status(400).json({ error: 'No conflict-free slots found for this class year' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/timetable/:id/faculty-view/:facultyId
router.get('/:id/faculty-view/:facultyId', authenticateToken, async (req, res) => {
    try {
        const tt = await Timetable.findOne({ id: req.params.id }).lean();
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        if (req.user.role === 'department_user') {
            if (tt.departmentId !== req.user.departmentId && !tt.isPublished) {
                return res.status(403).json({ error: 'Access denied. This timetable is not published.' });
            }
        }

        const fac = await Faculty.findOne({ id: req.params.facultyId }).lean();

        const subjects  = await Subject.find().lean();
        const classes   = await Class.find().lean();
        const rooms     = await Room.find().lean();
        const faculty   = await Faculty.find().lean();
        const allConfigs = await TimeSlotConfig.find().lean();
        const departments = await Department.find().lean();

        // ----- Aggregate entries across ALL published timetables -----
        // This ensures that if a CSE faculty member is already scheduled in the
        // CSE published timetable, ECE will see those slots as occupied.
        const allPublishedTTs = await Timetable.find({ isPublished: true }).lean();

        // Deduplicate using a Map (day-slotIndex-classId key) so the same entry
        // isn't counted twice if it appears in multiple published documents.
        const entryMap = new Map();

        // Always include current timetable entries first (they are the "authoritative" source)
        for (const e of tt.entries) {
            if (e.facultyId === req.params.facultyId || e.labFaculty2Id === req.params.facultyId || e.labFaculty3Id === req.params.facultyId) {
                const key = `${e.day}-${e.slotIndex}-${e.classId}`;
                entryMap.set(key, { ...e, _fromCurrentTT: true });
            }
        }

        // Then add entries from other published timetables (don't overwrite current)
        for (const ptt of allPublishedTTs) {
            if (ptt.id === tt.id) continue; // already processed
            for (const e of ptt.entries) {
                if (e.facultyId === req.params.facultyId || e.labFaculty2Id === req.params.facultyId || e.labFaculty3Id === req.params.facultyId) {
                    const key = `${e.day}-${e.slotIndex}-${e.classId}`;
                    if (!entryMap.has(key)) {
                        entryMap.set(key, { ...e, _fromCurrentTT: false });
                    }
                }
            }
        }

        const allFacultyEntries = Array.from(entryMap.values());

        const tsMins = (str) => {
            if (!str) return 0;
            const [h, m] = str.split(':').map(Number);
            return h * 60 + m;
        };

        // Enrich each entry
        const enriched = allFacultyEntries.map(e => {
            const cls       = classes.find(c => c.id === e.classId);
            const isMyDept  = req.user.role !== 'department_user' || cls?.departmentId === req.user.departmentId;
            const config    = allConfigs.find(c => Number(c.year) === Number(cls?.year)) || allConfigs[0] || null;
            const startSlot = config?.slots[e.slotIndex];
            const endSlot   = config?.slots[e.slotIndex + (e.duration || 1) - 1];

            // Find the department of the class for the label
            const classDept = departments.find(d => d.id === cls?.departmentId);

            return {
                ...e,
                editable:        isMyDept && e._fromCurrentTT,
                fromCurrentTT:   e._fromCurrentTT || false,
                subjectName:     isMyDept ? (subjects.find(s => s.id === e.subjectId)?.name || '') : 'Occupied',
                subjectCode:     isMyDept ? (subjects.find(s => s.id === e.subjectId)?.code || '') : 'OCCUPIED',
                className:       cls?.name || 'Unknown Class',
                classYear:       cls?.year || '',
                classDeptName:   classDept?.name || '',
                classDeptCode:   classDept?.code || '',
                roomName:        isMyDept ? (rooms.find(r => r.id === e.roomId)?.name || '') : '',
                facultyName:     faculty.find(f => f.id === e.facultyId)?.name || '',
                labFaculty2Name: e.labFaculty2Id ? faculty.find(f => f.id === e.labFaculty2Id)?.name || '' : '',
                labFaculty3Name: e.labFaculty3Id ? faculty.find(f => f.id === e.labFaculty3Id)?.name || '' : '',
                startTime:       startSlot?.start || '',
                endTime:         endSlot?.end || ''
            };
        });

        // Detect time-overlap conflicts within this faculty's merged schedule
        const dayGroups = {};
        enriched.forEach(e => {
            if (!dayGroups[e.day]) dayGroups[e.day] = [];
            dayGroups[e.day].push(e);
        });
        Object.values(dayGroups).forEach(dayEntries => {
            dayEntries.forEach((e, i) => {
                const s1 = tsMins(e.startTime);
                const e1 = tsMins(e.endTime);
                if (!s1 || !e1) return;
                dayEntries.forEach((ee, j) => {
                    if (j === i) return;
                    const s2 = tsMins(ee.startTime);
                    const e2 = tsMins(ee.endTime);
                    if (s1 < e2 && e1 > s2) {
                        e.isConflict = true;
                        e.conflictReason = `Double-booked: also teaching ${ee.subjectName || 'another class'} (${ee.className}) at this time`;
                    }
                });
            });
        });

        const years = [...new Set(allFacultyEntries.map(e => {
            const cls = classes.find(c => c.id === e.classId);
            return cls?.year;
        }).filter(Boolean))];
        const configs = allConfigs.filter(c => years.map(Number).includes(Number(c.year)));

        res.json({
            facultyName:      fac?.name || '',
            facultyDeptName:  departments.find(d => d.id === fac?.departmentId)?.name || '',
            facultyDeptCode:  departments.find(d => d.id === fac?.departmentId)?.code || '',
            timeSlotConfigs:  configs.length > 0 ? configs : allConfigs,
            entries:          enriched
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// GET /api/timetable/:id/room-view/:roomId
router.get('/:id/room-view/:roomId', authenticateToken, async (req, res) => {
    try {
        const tt = await Timetable.findOne({ id: req.params.id }).lean();
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        if (req.user.role === 'department_user') {
            if (tt.departmentId !== req.user.departmentId && !tt.isPublished) {
                return res.status(403).json({ error: 'Access denied. This timetable is not published.' });
            }
        }

        const room = await Room.findOne({ id: req.params.roomId }).lean();
        if (!room) return res.status(404).json({ error: 'Room not found' });

        const [subjects, faculty, classes, configs, rooms, departments] = await Promise.all([
            Subject.find().lean(),
            Faculty.find().lean(),
            Class.find().lean(),
            TimeSlotConfig.find().lean(),
            Room.find().lean(),
            Department.find().lean()
        ]);

        // ----- Aggregate lab entries across ALL published timetables -----
        // A room (lab) booked by CSE must appear as "Occupied" when ECE views it.
        const allPublishedTTs = await Timetable.find({ isPublished: true }).lean();

        const entryMap = new Map();

        const isLabEntry = (e) => {
            if (e.roomId !== req.params.roomId) return false;
            if (e.isLab) return true;
            const subject = subjects.find(s => s.id === e.subjectId);
            return subject?.type === 'lab';
        };

        // Current timetable entries first (authoritative)
        for (const e of tt.entries) {
            if (isLabEntry(e)) {
                const key = `${e.day}-${e.slotIndex}-${e.classId}`;
                entryMap.set(key, { ...e, _fromCurrentTT: true });
            }
        }

        // Merge from other published timetables
        for (const ptt of allPublishedTTs) {
            if (ptt.id === tt.id) continue;
            for (const e of ptt.entries) {
                if (isLabEntry(e)) {
                    const key = `${e.day}-${e.slotIndex}-${e.classId}`;
                    if (!entryMap.has(key)) {
                        entryMap.set(key, { ...e, _fromCurrentTT: false });
                    }
                }
            }
        }

        const allRoomEntries = Array.from(entryMap.values());

        const enriched = allRoomEntries.map(e => {
            const cls      = classes.find(c => c.id === e.classId);
            const isMyDept = req.user.role !== 'department_user' || cls?.departmentId === req.user.departmentId;
            const classDept = departments.find(d => d.id === cls?.departmentId);

            // Fall back to configs[0] when no year-specific config exists
            const config    = configs.find(c => Number(c.year) === Number(cls?.year)) || configs[0] || null;
            const startSlot = config?.slots[e.slotIndex];
            const endSlot   = config?.slots[e.slotIndex + (e.duration || 1) - 1];
            const roomObj   = rooms.find(r => r.id === e.roomId);
            return {
                ...e,
                editable:        isMyDept && e._fromCurrentTT,
                fromCurrentTT:   e._fromCurrentTT || false,
                subjectName:     isMyDept ? (subjects.find(s => s.id === e.subjectId)?.name || '') : 'Occupied',
                subjectCode:     isMyDept ? (subjects.find(s => s.id === e.subjectId)?.code || '') : 'OCCUPIED',
                className:       cls?.name || 'Unknown Class',
                classYear:       cls?.year || '',
                classDeptName:   classDept?.name || '',
                classDeptCode:   classDept?.code || '',
                facultyName:     isMyDept ? (faculty.find(f => f.id === e.facultyId)?.name || '') : '',
                roomName:        roomObj?.name || '',
                labFaculty2Name: isMyDept && e.labFaculty2Id ? faculty.find(f => f.id === e.labFaculty2Id)?.name || '' : '',
                labFaculty3Name: isMyDept && e.labFaculty3Id ? faculty.find(f => f.id === e.labFaculty3Id)?.name || '' : '',
                startTime:       startSlot?.start || '',
                endTime:         endSlot?.end || ''
            };
        });

        const years = [...new Set(allRoomEntries.map(e => {
            const cls = classes.find(c => c.id === e.classId);
            return cls?.year;
        }).filter(Boolean))];
        const roomConfigs = configs.filter(c => years.includes(c.year));

        res.json({
            roomName:        room.name,
            roomType:        room.type,
            roomCapacity:    room.capacity || '',
            timeSlotConfig:  roomConfigs[0] || configs[0] || null,
            timeSlotConfigs: roomConfigs.length > 0 ? roomConfigs : (configs[0] ? [configs[0]] : []),
            entries:         enriched
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/timetable/:id/valid-subjects/:classId/:day/:slotIndex
router.get('/:id/valid-subjects/:classId/:day/:slotIndex', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { id, classId, day, slotIndex } = req.params;
        const tt = await Timetable.findOne({ id }).lean();
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        if (req.user.role === 'department_user') {
            if (tt.departmentId !== req.user.departmentId && !tt.isPublished) {
                return res.status(403).json({ error: 'Access denied. This timetable is not published.' });
            }
        }

        const [subjects, faculty, rooms, mappings, classes, configs] = await Promise.all([
            Subject.find().lean(),
            Faculty.find().lean(),
            Room.find().lean(),
            FacultySubjectMapping.find().lean(),
            Class.find().lean(),
            TimeSlotConfig.find().lean()
        ]);

        const idx = parseInt(slotIndex);
        const options = findValidSubjectsForSlot(tt.entries, classId, day, idx, {
            subjects, faculty, rooms, mappings, classes, configs
        });

        res.json(options);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/timetable/:id/replace-slot
router.put('/:id/replace-slot', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { id } = req.params;
        const { day, slotIndex, classId, subjectId, facultyId, labFaculty2Id, roomId, isExtra } = req.body;

        if (!classId || !day || slotIndex === undefined || !subjectId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const tt = await Timetable.findOne({ id });
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        if (req.user.role === 'department_user') {
            if (tt.isLocked) {
                return res.status(403).json({ error: 'Timetable is locked.' });
            }
            const cls = await Class.findOne({ id: classId }).lean();
            if (!cls || cls.departmentId !== req.user.departmentId) {
                return res.status(403).json({ error: 'Access denied. You can only modify entries belonging to classes in your own department.' });
            }
        }

        const [subjects, faculty, rooms, mappings, classes, configs] = await Promise.all([
            Subject.find().lean(),
            Faculty.find().lean(),
            Room.find().lean(),
            FacultySubjectMapping.find().lean(),
            Class.find().lean(),
            TimeSlotConfig.find().lean()
        ]);

        const validOptions = findValidSubjectsForSlot(tt.entries.toObject(), classId, day, slotIndex, {
            subjects, faculty, rooms, mappings, classes, configs
        });

        const isValid = validOptions.some(opt => 
            opt.subjectId === subjectId &&
            opt.facultyId === facultyId &&
            (opt.labFaculty2Id || null) === (labFaculty2Id || null) &&
            opt.roomId === roomId
        );

        if (!isValid) {
            return res.status(400).json({ error: 'This subject placement is invalid or violates scheduling constraints (e.g. room or faculty clash).' });
        }

        const subject = subjects.find(s => s.id === subjectId);
        const duration = subject?.duration || 1;

        const newEntry = {
            classId,
            subjectId,
            facultyId,
            labFaculty2Id: labFaculty2Id || null,
            roomId: roomId || null,
            day,
            slotIndex,
            duration,
            isLab: subject?.type === 'lab',
            subjectType: subject?.type || null,
            isFixed: false,
            isExtra: isExtra !== undefined ? isExtra : true,
            isActivity: subject?.type === 'activity',
            schedulingNote: `Manually replaced: ${subject?.name}`
        };

        // Remove any existing entries of this class that overlap with the new entry's duration
        tt.entries = tt.entries.filter(e => {
            if (e.classId !== classId) return true;
            if (e.day !== day) return true;
            return !(e.slotIndex < slotIndex + duration && e.slotIndex + (e.duration || 1) > slotIndex);
        });

        tt.entries.push(newEntry);

        await tt.save();
        await logAction(req.user, `Replaced slot in timetable: ${tt.name}`, { timetableId: tt.id, day, slotIndex, classId, subjectId });

        res.json({ message: 'Slot replaced successfully', entry: newEntry });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/timetable/:id
router.delete('/:id', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const tt = await Timetable.findOne({ id: req.params.id });
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        if (req.user.role === 'department_user') {
            if (tt.departmentId !== req.user.departmentId) {
                return res.status(403).json({ error: 'Access denied. Cannot delete other department timetables.' });
            }
            if (tt.isLocked) {
                return res.status(403).json({ error: 'Timetable is locked.' });
            }
        }

        await Timetable.deleteOne({ id: req.params.id });
        await logAction(req.user, `Deleted timetable: ${tt.name}`, { timetableId: req.params.id });

        res.json({ message: 'Timetable deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/timetable/bulk-delete
router.post('/bulk-delete', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });

        if (req.user.role === 'department_user') {
            const timetables = await Timetable.find({ id: { $in: ids } }).lean();
            const unauthorized = timetables.some(t => t.departmentId !== req.user.departmentId || t.isLocked);
            if (unauthorized) {
                return res.status(403).json({ error: 'Access denied. Some timetables belong to other departments or are locked.' });
            }
        }

        const result = await Timetable.deleteMany({ id: { $in: ids } });
        await logAction(req.user, `Bulk deleted ${result.deletedCount} timetables`, { ids });

        res.json({ message: `${result.deletedCount} timetables deleted` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/timetable/:id/publish — Publish a timetable and synchronize its reservations (Admin or Dept User)
router.put('/:id/publish', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { id } = req.params;
        const tt = await Timetable.findOne({ id });
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        if (req.user.role === 'department_user') {
            if (tt.departmentId !== req.user.departmentId && !tt.isPublished) {
                return res.status(403).json({ error: 'Access denied. You can only publish your own department\'s timetable.' });
            }
        }

        const targetDeptId = tt.departmentId;
        if (targetDeptId) {
            await Timetable.updateMany(
                { id: { $ne: id }, departmentId: targetDeptId },
                { $set: { isPublished: false } }
            );
        } else {
            await Timetable.updateMany(
                { id: { $ne: id } },
                { $set: { isPublished: false } }
            );
        }

        tt.isPublished = true;
        await tt.save();

        if (targetDeptId) {
            await TimetableReservation.deleteMany({ department: targetDeptId });
        } else {
            await TimetableReservation.deleteMany({});
        }

        const allClasses = await Class.find().lean();
        const reservations = [];

        for (const entry of tt.entries) {
            const cls = allClasses.find(c => c.id === entry.classId);
            const deptId = cls ? cls.departmentId : null;
            if (deptId && (entry.facultyId || entry.roomId)) {
                if (req.user.role === 'department_user' && deptId !== targetDeptId) {
                    continue;
                }
                reservations.push({
                    day: entry.day,
                    slot: entry.slotIndex,
                    faculty: entry.facultyId || null,
                    room: (!entry.isLab && entry.roomId) ? entry.roomId : null,
                    lab: (entry.isLab && entry.roomId) ? entry.roomId : null,
                    department: deptId,
                    classId: entry.classId,
                    year: cls ? cls.year : null
                });
            }
        }

        if (reservations.length > 0) {
            await TimetableReservation.insertMany(reservations);
        }

        await logAction(req.user, `Published timetable: ${tt.name}`, { timetableId: id });

        res.json({ message: 'Timetable published successfully and reservations synchronized.', timetable: tt });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/timetable/:id/lock — Lock/Unlock a timetable (Admin or Dept User)
router.put('/:id/lock', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { id } = req.params;
        const { isLocked } = req.body;
        const tt = await Timetable.findOne({ id });
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        if (req.user.role === 'department_user') {
            if (tt.departmentId !== req.user.departmentId) {
                return res.status(403).json({ error: 'Access denied. You can only lock/unlock your own department\'s timetable.' });
            }
        }

        tt.isLocked = isLocked !== undefined ? isLocked : !tt.isLocked;
        await tt.save();

        await logAction(req.user, tt.isLocked ? `Locked timetable: ${tt.name}` : `Unlocked timetable: ${tt.name}`, { timetableId: id });

        res.json({ message: `Timetable ${tt.isLocked ? 'locked' : 'unlocked'} successfully.`, timetable: tt });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
