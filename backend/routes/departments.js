import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Department } from '../models/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/departments
router.get('/', authenticateToken, async (req, res) => {
    try {
        const filter = {};
        const departments = await Department.find(filter).lean();
        res.json(departments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/departments/:id
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const dept = await Department.findOne({ id: req.params.id }).lean();
        if (!dept) return res.status(404).json({ error: 'Department not found' });
        res.json(dept);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/departments
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, code } = req.body;
        if (!name || !code) return res.status(400).json({ error: 'Name and code are required' });

        const dept = await Department.create({ id: `dept-${uuidv4().slice(0, 8)}`, name, code });
        res.status(201).json(dept.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/departments/:id
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const dept = await Department.findOneAndUpdate(
            { id: req.params.id },
            { $set: req.body },
            { new: true, lean: true }
        );
        if (!dept) return res.status(404).json({ error: 'Department not found' });
        res.json(dept);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/departments/:id
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await Department.deleteOne({ id: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Department not found' });
        res.json({ message: 'Department deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/departments/bulk-delete
router.post('/bulk-delete', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });
        const result = await Department.deleteMany({ id: { $in: ids } });
        res.json({ message: `${result.deletedCount} departments deleted` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
