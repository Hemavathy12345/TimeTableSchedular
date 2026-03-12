import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Class } from '../models/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/classes
router.get('/', authenticateToken, async (req, res) => {
    try {
        const filter = {};
        if (req.query.departmentId) filter.departmentId = req.query.departmentId;
        if (req.query.year) filter.year = parseInt(req.query.year);
        const classes = await Class.find(filter).lean();
        res.json(classes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/classes/:id
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const cls = await Class.findOne({ id: req.params.id }).lean();
        if (!cls) return res.status(404).json({ error: 'Class not found' });
        res.json(cls);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/classes
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
    const { name, year, section, departmentId, defaultRoomId } = req.body;
        if (!name || !year || !section) return res.status(400).json({ error: 'Name, year, and section required' });

        const cls = await Class.create({
            id: `cls-${uuidv4().slice(0, 8)}`,
            name, year, section,
            departmentId: departmentId || null,
            defaultRoomId: defaultRoomId || null
        });
        res.status(201).json(cls.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/classes/:id
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const cls = await Class.findOneAndUpdate(
            { id: req.params.id },
            { $set: req.body },
            { new: true, lean: true }
        );
        if (!cls) return res.status(404).json({ error: 'Class not found' });
        res.json(cls);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/classes/:id
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await Class.deleteOne({ id: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Class not found' });
        res.json({ message: 'Class deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
