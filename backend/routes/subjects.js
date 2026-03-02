import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Subject, Department } from '../models/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/subjects
router.get('/', authenticateToken, async (req, res) => {
    try {
        const filter = {};
        if (req.query.departmentId) filter.departmentId = req.query.departmentId;
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

// POST /api/subjects
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, code, type, weeklyFrequency, year, departmentId, duration } = req.body;
        if (!name || !code || !type) return res.status(400).json({ error: 'Name, code, and type required' });

        const sub = await Subject.create({
            id: `sub-${uuidv4().slice(0, 8)}`,
            name, code, type,
            weeklyFrequency: weeklyFrequency || 1,
            year: year || 1,
            departmentId: departmentId || null,
            duration: duration || (type === 'lab' ? 2 : 1)
        });
        res.status(201).json(sub.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/subjects/:id
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const sub = await Subject.findOneAndUpdate(
            { id: req.params.id },
            { $set: req.body },
            { new: true, lean: true }
        );
        if (!sub) return res.status(404).json({ error: 'Subject not found' });
        res.json(sub);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/subjects/:id
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await Subject.deleteOne({ id: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Subject not found' });
        res.json({ message: 'Subject deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper: parse year — handles integers and Roman numerals (I, II, III, IV)
const parseYear = (val) => {
    if (!val) return 1;
    const s = String(val).trim().toUpperCase();
    const romanMap = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6 };
    if (romanMap[s] !== undefined) return romanMap[s];
    const n = parseInt(s);
    return isNaN(n) ? 1 : n;
};

// POST /api/subjects/import-excel
router.post('/import-excel', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { data } = req.body; // Array of rows from Excel
        if (!Array.isArray(data) || data.length === 0) {
            return res.status(400).json({ error: 'Invalid data format. Expected array of subject records.' });
        }

        // Pre-load all departments for name/code lookup
        const allDepts = await Department.find({}).lean();
        console.log(`📚 Departments loaded for import: ${allDepts.map(d => d.code).join(', ')}`);

        const deptByCode = {};
        const deptByName = {};
        allDepts.forEach(d => {
            if (d.code) deptByCode[d.code.trim().toLowerCase()] = d.id;
            if (d.name) {
                const nameLow = d.name.trim().toLowerCase();
                deptByName[nameLow] = d.id;
                // Add alias for '&' vs 'and'
                if (nameLow.includes('&')) deptByName[nameLow.replace('&', 'and')] = d.id;
                if (nameLow.includes('and')) deptByName[nameLow.replace('and', '&')] = d.id;
            }
        });

        const results = { success: 0, failed: 0, errors: [] };

        for (let i = 0; i < data.length; i++) {
            const record = data[i];

            // Normalize fields from possible aliases
            const name = String(record.name || record['Course Name'] || '').trim();
            const code = String(record.code || record['Course Code'] || '').trim();
            const typeRaw = String(record.type || record.Type || record['Type (Theory/Lab)'] || '').trim().toLowerCase();
            const weeklyFreq = parseInt(record.weeklyFrequency || record.WeeklyFrequency || record['Weekly Frequency']);
            const durationRaw = record.duration || record.Duration;
            const yearRaw = record.year || record.Year;
            const deptRaw = String(record.department || record.Department || record.departmentId || record.DepartmentId || '').trim();

            // Validate required fields
            if (!name || !code || !typeRaw) {
                results.failed++;
                results.errors.push(`Row ${i + 1}: Missing name, code, or type`);
                continue;
            }

            // Validate type — handle "Theory", "Lab", or variants
            let typeVal = 'theory';
            if (typeRaw.includes('lab')) {
                typeVal = 'lab';
            } else if (typeRaw.includes('theory')) {
                typeVal = 'theory';
            } else {
                // Fallback or keep as theory if not specified clearly
                typeVal = 'theory';
            }

            // Resolve department
            let deptId = null;
            if (deptRaw) {
                // Try code lookup first (e.g. "CSE", "ECE"), then name lookup
                deptId = deptByCode[deptRaw.toLowerCase()]
                    || deptByName[deptRaw.toLowerCase()]
                    || null;

                // If still not found, check if the raw value IS a real DB id (starts with 'dept-')
                if (!deptId && deptRaw.startsWith('dept-')) {
                    deptId = deptRaw;
                }

                if (!deptId) {
                    // Warn but DO NOT skip — import with null department
                    results.errors.push(`Row ${i + 1}: Warning — Department "${deptRaw}" not found in system, imported without department.`);
                }
            }

            try {
                await Subject.create({
                    id: `sub-${uuidv4().slice(0, 8)}`,
                    name: name,
                    code: code,
                    type: typeVal,
                    weeklyFrequency: weeklyFreq || (typeVal === 'lab' ? 1 : 3),
                    year: parseYear(yearRaw),
                    departmentId: deptId,
                    duration: parseInt(durationRaw) || (typeVal === 'lab' ? 2 : 1)
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

export default router;

