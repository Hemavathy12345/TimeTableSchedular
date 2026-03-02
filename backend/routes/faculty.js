import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Faculty, Department } from '../models/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/faculty
router.get('/', authenticateToken, async (req, res) => {
    try {
        const filter = {};
        if (req.query.departmentId) filter.departmentId = req.query.departmentId;
        const faculty = await Faculty.find(filter).lean();
        res.json(faculty);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/faculty/:id
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const fac = await Faculty.findOne({ id: req.params.id }).lean();
        if (!fac) return res.status(404).json({ error: 'Faculty not found' });
        res.json(fac);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/faculty
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, departmentId, email, designation } = req.body;
        if (!name || !departmentId) return res.status(400).json({ error: 'Name and departmentId required' });

        const fac = await Faculty.create({
            id: `fac-${uuidv4().slice(0, 8)}`,
            name,
            departmentId,
            email: email || '',
            designation: designation || ''
        });
        res.status(201).json(fac.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/faculty/:id
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const fac = await Faculty.findOneAndUpdate(
            { id: req.params.id },
            { $set: req.body },
            { new: true, lean: true }
        );
        if (!fac) return res.status(404).json({ error: 'Faculty not found' });
        res.json(fac);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/faculty/:id
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await Faculty.deleteOne({ id: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Faculty not found' });
        res.json({ message: 'Faculty deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/faculty/import-excel
router.post('/import-excel', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { data } = req.body;
        if (!Array.isArray(data) || data.length === 0) {
            return res.status(400).json({ error: 'Invalid data format. Expected array of faculty records.' });
        }

        const results = { success: 0, failed: 0, errors: [] };

        for (let i = 0; i < data.length; i++) {
            const record = data[i];

            if (!record.name || !record.departmentId) {
                results.failed++;
                results.errors.push(`Row ${i + 1}: Missing name or departmentId`);
                continue;
            }

            const deptExists = await Department.findOne({ id: record.departmentId }).lean();
            if (!deptExists) {
                results.failed++;
                results.errors.push(`Row ${i + 1}: Department ID ${record.departmentId} not found`);
                continue;
            }

            await Faculty.create({
                id: `fac-${uuidv4().slice(0, 8)}`,
                name: record.name,
                departmentId: record.departmentId,
                email: record.email || '',
                designation: record.designation || ''
            });
            results.success++;
        }

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
