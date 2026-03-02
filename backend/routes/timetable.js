import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
    Timetable,
    Class,
    Subject,
    Faculty,
    Room,
    TimeSlotConfig,
    FacultySubjectMapping
} from '../models/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { generateTimetable, validateSwap } from '../engine/scheduler.js';

const router = Router();

// GET /api/timetable - list all timetables
router.get('/', authenticateToken, async (req, res) => {
    try {
        const timetables = await Timetable.find({}, {
            id: 1,
            name: 1,
            description: 1,
            generatedAt: 1,
            entries: 1,
            conflicts: 1
        }).lean();

        const formatted = timetables.map(t => ({
            id: t.id,
            name: t.name,
            description: t.description,
            generatedAt: t.generatedAt,
            entryCount: t.entries.length,
            conflictCount: t.conflicts ? t.conflicts.length : 0
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/timetable/:id
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const tt = await Timetable.findOne({ id: req.params.id }).lean();
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });
        res.json(tt);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/timetable/generate
router.post('/generate', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, description, selectedClassIds, selectedMappingIds } = req.body;
        if (!name) return res.status(400).json({ error: 'Timetable name is required' });

        // Load all data from MongoDB
        const allClasses = await Class.find().lean();
        const allMappings = await FacultySubjectMapping.find().lean();
        const subjects = await Subject.find().lean();
        const faculty = await Faculty.find().lean();
        const rooms = await Room.find().lean();
        const timeSlotConfigs = await TimeSlotConfig.find().lean();

        // Use selected classes or all classes
        const classes = selectedClassIds && selectedClassIds.length > 0
            ? allClasses.filter(c => selectedClassIds.includes(c.id))
            : allClasses;

        // Use selected mappings or all mappings
        const mappings = selectedMappingIds && selectedMappingIds.length > 0
            ? allMappings.filter(m => selectedMappingIds.includes(m.id))
            : allMappings;

        const data = {
            classes,
            subjects,
            faculty,
            rooms,
            timeSlotConfigs,
            defaultClasses: [], // Not yet implemented in models/seed
            facultySubjectMapping: mappings
        };

        const result = generateTimetable(data);

        const timetable = await Timetable.create({
            id: `tt-${uuidv4().slice(0, 8)}`,
            name,
            description: description || '',
            generatedAt: new Date().toISOString(),
            entries: result.entries,
            conflicts: result.conflicts
        });

        res.status(201).json(timetable.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/timetable/:id/swap
router.put('/:id/swap', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { entryIndex1, entryIndex2 } = req.body;
        if (entryIndex1 === undefined || entryIndex2 === undefined) {
            return res.status(400).json({ error: 'entryIndex1 and entryIndex2 required' });
        }

        const tt = await Timetable.findOne({ id: req.params.id });
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        const subjects = await Subject.find().lean();

        // Validate the swap
        const validation = validateSwap(tt.entries, entryIndex1, entryIndex2, {
            subjects
        });

        if (!validation.valid) {
            return res.status(400).json({ error: validation.reason, violations: validation.violations });
        }

        // Perform the swap
        const e1 = tt.entries[entryIndex1];
        const e2 = tt.entries[entryIndex2];

        const tempDay = e1.day;
        const tempSlot = e1.slotIndex;
        const tempRoom = e1.roomId;

        // Mongoose requires setting indices this way or using .set()
        tt.entries[entryIndex1].day = e2.day;
        tt.entries[entryIndex1].slotIndex = e2.slotIndex;
        tt.entries[entryIndex1].roomId = e2.roomId;

        tt.entries[entryIndex2].day = tempDay;
        tt.entries[entryIndex2].slotIndex = tempSlot;
        tt.entries[entryIndex2].roomId = tempRoom;

        await tt.save();

        res.json({ message: 'Swap successful', timetable: tt.toObject() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/timetable/:id/class-view/:classId
router.get('/:id/class-view/:classId', authenticateToken, async (req, res) => {
    try {
        const tt = await Timetable.findOne({ id: req.params.id }).lean();
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        const classEntries = tt.entries.filter(e => e.classId === req.params.classId);
        const cls = await Class.findOne({ id: req.params.classId }).lean();
        const config = await TimeSlotConfig.findOne({ year: cls?.year }).lean();

        const subjects = await Subject.find().lean();
        const faculty = await Faculty.find().lean();
        const rooms = await Room.find().lean();

        // Enrich entries with names
        const enriched = classEntries.map(e => ({
            ...e,
            subjectName: subjects.find(s => s.id === e.subjectId)?.name || '',
            subjectCode: subjects.find(s => s.id === e.subjectId)?.code || '',
            facultyName: faculty.find(f => f.id === e.facultyId)?.name || '',
            labFaculty2Name: e.labFaculty2Id ? faculty.find(f => f.id === e.labFaculty2Id)?.name || '' : '',
            roomName: rooms.find(r => r.id === e.roomId)?.name || ''
        }));

        res.json({
            className: cls?.name || '',
            classYear: cls?.year || '',
            timeSlotConfig: config,
            entries: enriched
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/timetable/:id/faculty-view/:facultyId
router.get('/:id/faculty-view/:facultyId', authenticateToken, async (req, res) => {
    try {
        const tt = await Timetable.findOne({ id: req.params.id }).lean();
        if (!tt) return res.status(404).json({ error: 'Timetable not found' });

        const facultyEntries = tt.entries.filter(
            e => e.facultyId === req.params.facultyId || e.labFaculty2Id === req.params.facultyId
        );
        const fac = await Faculty.findOne({ id: req.params.facultyId }).lean();

        const subjects = await Subject.find().lean();
        const classes = await Class.find().lean();
        const rooms = await Room.find().lean();
        const faculty = await Faculty.find().lean();

        const enriched = facultyEntries.map(e => {
            const cls = classes.find(c => c.id === e.classId);
            return {
                ...e,
                subjectName: subjects.find(s => s.id === e.subjectId)?.name || '',
                subjectCode: subjects.find(s => s.id === e.subjectId)?.code || '',
                className: cls?.name || '',
                classYear: cls?.year || '',
                roomName: rooms.find(r => r.id === e.roomId)?.name || '',
                facultyName: faculty.find(f => f.id === e.facultyId)?.name || '',
                labFaculty2Name: e.labFaculty2Id ? faculty.find(f => f.id === e.labFaculty2Id)?.name || '' : ''
            };
        });

        // Determine which time slot configs are relevant
        const years = [...new Set(facultyEntries.map(e => {
            const cls = classes.find(c => c.id === e.classId);
            return cls?.year;
        }).filter(Boolean))];
        const configs = await TimeSlotConfig.find({ year: { $in: years } }).lean();

        res.json({
            facultyName: fac?.name || '',
            timeSlotConfigs: configs,
            entries: enriched
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/timetable/:id
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await Timetable.deleteOne({ id: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Timetable not found' });
        res.json({ message: 'Timetable deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/timetable/mappings/all
router.get('/mappings/all', authenticateToken, async (req, res) => {
    try {
        const mappings = await FacultySubjectMapping.find().lean();
        const faculty = await Faculty.find().lean();
        const subjects = await Subject.find().lean();
        const classes = await Class.find().lean();

        const enriched = mappings.map(m => ({
            ...m,
            facultyName: faculty.find(f => f.id === m.facultyId)?.name || '',
            subjectName: subjects.find(s => s.id === m.subjectId)?.name || '',
            className: classes.find(c => c.id === m.classId)?.name || '',
            labFaculty2Name: m.labFaculty2Id ? faculty.find(f => f.id === m.labFaculty2Id)?.name || '' : ''
        }));
        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/timetable/mappings
router.post('/mappings', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { facultyId, subjectId, classId, labFaculty2Id } = req.body;
        if (!facultyId || !subjectId || !classId) {
            return res.status(400).json({ error: 'facultyId, subjectId, and classId required' });
        }

        const mapping = await FacultySubjectMapping.create({
            id: `fsm-${uuidv4().slice(0, 8)}`,
            facultyId, subjectId, classId,
            labFaculty2Id: labFaculty2Id || null
        });
        res.status(201).json(mapping.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/timetable/mappings/:id
router.delete('/mappings/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await FacultySubjectMapping.deleteOne({ id: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Mapping not found' });
        res.json({ message: 'Mapping deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
