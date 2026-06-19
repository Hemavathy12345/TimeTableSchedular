import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Subject, Department } from '../models/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/subjects
router.get('/', authenticateToken, async (req, res) => {
    try {
        const filter = {};
        if (req.query.departmentId && req.query.departmentId !== 'null' && req.query.departmentId !== 'undefined') {
            filter.departmentId = req.query.departmentId;
        } else if (req.user.role === 'department_user' && req.user.departmentId && req.query.all !== 'true') {
            filter.departmentId = req.user.departmentId;
        }

        if (req.query.year) filter.year = parseInt(req.query.year);
        if (req.query.type) filter.type = req.query.type;

        const subjects = await Subject.find(filter).lean();
        res.json(subjects);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/subjects/:id
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const sub = await Subject.findOne({ id: req.params.id }).lean();
        if (!sub) return res.status(404).json({ error: 'Subject not found' });
        res.json(sub);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper: derive totalHours and duration from type
const deriveSubjectDefaults = (type, totalHours, duration) => {
    const hours = parseInt(totalHours) || 15;
    let defaultDuration = (type === 'lab' || type === 'project') ? 2 : 1;
    if (type === 'Non-Academic' && Math.ceil(hours / 15) === 2) {
        defaultDuration = 2;
    }
    const dur = parseInt(duration) || defaultDuration;
    return { totalHours: hours, duration: dur };
};

// POST /api/subjects
router.post('/', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { name, code, type, totalHours, year, departmentId, duration, assignedLabId } = req.body;
        if (!name || !code || !type) return res.status(400).json({ error: 'Name, code, and type required' });

        let targetDeptId = departmentId || null;
        if (req.user.role === 'department_user') {
            if (departmentId && departmentId !== req.user.departmentId) {
                return res.status(403).json({ error: 'Access denied. Cannot create subject for another department.' });
            }
            targetDeptId = req.user.departmentId;
        }

        const derived = deriveSubjectDefaults(type, totalHours, duration);
        const sub = await Subject.create({
            id: `sub-${uuidv4().slice(0, 8)}`,
            name, code, type,
            totalHours: derived.totalHours,
            year: year || 1,
            departmentId: targetDeptId,
            duration: derived.duration,
            assignedLabId: assignedLabId || null
        });
        res.status(201).json(sub.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/subjects/:id
router.put('/:id', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const query = { id: req.params.id };
        if (req.user.role === 'department_user') {
            // Cannot update global subjects or subjects of other departments
            const checkSub = await Subject.findOne({ id: req.params.id }).lean();
            if (!checkSub) return res.status(404).json({ error: 'Subject not found' });
            if (checkSub.departmentId !== req.user.departmentId) {
                return res.status(403).json({ error: 'Access denied. You cannot modify this subject.' });
            }
            query.departmentId = req.user.departmentId;

            if (req.body.departmentId && req.body.departmentId !== req.user.departmentId) {
                return res.status(400).json({ error: 'Cannot change subject department to another department.' });
            }
        }

        const { type, totalHours, duration } = req.body;
        let updateBody = { ...req.body };
        if (type && totalHours !== undefined) {
            const derived = deriveSubjectDefaults(type, totalHours, duration);
            updateBody.totalHours = derived.totalHours;
            updateBody.duration = derived.duration;
        }

        const sub = await Subject.findOneAndUpdate(
            query,
            { $set: updateBody },
            { new: true, lean: true }
        );
        if (!sub) return res.status(404).json({ error: 'Subject not found or access denied' });
        res.json(sub);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/subjects/:id
router.delete('/:id', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const query = { id: req.params.id };
        if (req.user.role === 'department_user') {
            query.departmentId = req.user.departmentId;
        }

        const result = await Subject.deleteOne(query);
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Subject not found or access denied' });
        res.json({ message: 'Subject deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper: parse year
const parseYear = (val) => {
    if (!val) return 1;
    const s = String(val).trim().toUpperCase();
    const romanMap = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6 };
    if (romanMap[s] !== undefined) return romanMap[s];
    const n = parseInt(s);
    return isNaN(n) ? 1 : n;
};

// POST /api/subjects/import-excel
router.post('/import-excel', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { data } = req.body;
        if (!Array.isArray(data) || data.length === 0) {
            return res.status(400).json({ error: 'Invalid data format. Expected array of subject records.' });
        }

        const allDepts = await Department.find({}).lean();
        const deptByCode = {};
        const deptByName = {};
        allDepts.forEach(d => {
            if (d.code) deptByCode[d.code.trim().toLowerCase()] = d.id;
            if (d.name) {
                const nameLow = d.name.trim().toLowerCase();
                deptByName[nameLow] = d.id;
                if (nameLow.includes('&')) deptByName[nameLow.replace('&', 'and')] = d.id;
                if (nameLow.includes('and')) deptByName[nameLow.replace('and', '&')] = d.id;
            }
        });

        const results = { success: 0, failed: 0, errors: [] };

        for (let i = 0; i < data.length; i++) {
            const record = data[i];

            const name = String(record.name || record['Course Name'] || record['Course Title'] || '').trim();
            const code = String(record.code || record['Course Code'] || '').trim();
            const typeRaw = String(record.type || record.Type || record['Type (Theory/Lab)'] || record['Type (Theory/Lab/Project/Elective)'] || '').trim().toLowerCase();
            const totalHoursRaw = parseInt(record.totalHours || record.TotalHours || record['Total Hours'] || record.weeklyFrequency || record.WeeklyFrequency);
            const durationRaw = record.duration || record.Duration;
            const yearRaw = record.year || record.Year;
            const deptRaw = String(record.department || record.Department || record.departmentId || record.DepartmentId || '').trim();

            if (!name || !code || !typeRaw) {
                results.failed++;
                results.errors.push(`Row ${i + 1}: Missing name, code, or type`);
                continue;
            }

            let typeVal = 'theory';
            if (typeRaw.includes('lab')) {
                typeVal = 'lab';
            } else if (typeRaw.includes('project')) {
                typeVal = 'project';
            } else if (typeRaw.includes('elective')) {
                typeVal = 'elective';
            } else if (typeRaw.includes('non-academic') || typeRaw.includes('non academic')) {
                typeVal = 'Non-Academic';
            } else if (typeRaw.includes('theory')) {
                typeVal = 'theory';
            } else {
                typeVal = 'theory';
            }

            let deptId = null;
            if (req.user.role === 'department_user') {
                deptId = req.user.departmentId;
            } else if (deptRaw) {
                deptId = deptByCode[deptRaw.toLowerCase()]
                    || deptByName[deptRaw.toLowerCase()]
                    || null;

                if (!deptId && deptRaw.startsWith('dept-')) {
                    deptId = deptRaw;
                }

                if (!deptId) {
                    results.errors.push(`Row ${i + 1}: Warning — Department "${deptRaw}" not found in system, imported without department.`);
                }
            }

            try {
                const derived = deriveSubjectDefaults(typeVal, totalHoursRaw, durationRaw);
                await Subject.create({
                    id: `sub-${uuidv4().slice(0, 8)}`,
                    name: name,
                    code: code,
                    type: typeVal,
                    totalHours: derived.totalHours,
                    year: parseYear(yearRaw),
                    departmentId: deptId,
                    duration: derived.duration
                });
                results.success++;
            } catch (rowErr) {
                results.failed++;
                results.errors.push(`Row ${i + 1}: ${rowErr.message}`);
            }
        }

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/subjects/bulk-delete
router.post('/bulk-delete', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });

        const query = { id: { $in: ids } };
        if (req.user.role === 'department_user') {
            query.departmentId = req.user.departmentId;
        }

        const result = await Subject.deleteMany(query);
        res.json({ message: `${result.deletedCount} subjects deleted` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
