import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Class } from '../models/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/classes
router.get('/', authenticateToken, async (req, res) => {
    try {
        const filter = {};
        // Auto-scope for department_user — they only see their department's classes by default
        if (req.query.departmentId && req.query.departmentId !== 'null' && req.query.departmentId !== 'undefined') {
            filter.departmentId = req.query.departmentId;
        } else if (req.user.role === 'department_user' && req.user.departmentId && req.query.all !== 'true') {
            filter.departmentId = req.user.departmentId;
        }
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
router.post('/', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { name, year, section, departmentId, defaultRoomId, advisorId, tutor1Id, tutor2Id } = req.body;
        if (!name || !year || !section) return res.status(400).json({ error: 'Name, year, and section required' });

        let targetDeptId = departmentId || null;
        if (req.user.role === 'department_user') {
            if (departmentId && departmentId !== req.user.departmentId) {
                return res.status(403).json({ error: 'Access denied. Cannot create class for another department.' });
            }
            targetDeptId = req.user.departmentId;
        }

        const cls = await Class.create({
            id: `cls-${uuidv4().slice(0, 8)}`,
            name, year, section,
            departmentId: targetDeptId,
            defaultRoomId: defaultRoomId || null,
            advisorId: advisorId || null,
            tutor1Id: tutor1Id || null,
            tutor2Id: tutor2Id || null
        });
        res.status(201).json(cls.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/classes/:id
router.put('/:id', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const query = { id: req.params.id };
        if (req.user.role === 'department_user') {
            const existing = await Class.findOne({ id: req.params.id }).lean();
            if (!existing) return res.status(404).json({ error: 'Class not found' });
            if (existing.departmentId !== req.user.departmentId) {
                return res.status(403).json({ error: 'Access denied. Cannot edit class from another department.' });
            }
            if (req.body.departmentId && req.body.departmentId !== req.user.departmentId) {
                return res.status(403).json({ error: 'Access denied. Cannot change class department to another department.' });
            }
            query.departmentId = req.user.departmentId;
        }
        const cls = await Class.findOneAndUpdate(
            query,
            { $set: req.body },
            { new: true, lean: true }
        );
        if (!cls) return res.status(404).json({ error: 'Class not found or access denied' });
        res.json(cls);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/classes/:id
router.delete('/:id', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const query = { id: req.params.id };
        if (req.user.role === 'department_user') {
            query.departmentId = req.user.departmentId;
        }
        const result = await Class.deleteOne(query);
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Class not found or access denied' });
        res.json({ message: 'Class deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/classes/bulk-delete
router.post('/bulk-delete', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });
        const query = { id: { $in: ids } };
        if (req.user.role === 'department_user') {
            query.departmentId = req.user.departmentId;
        }
        const result = await Class.deleteMany(query);
        res.json({ message: `${result.deletedCount} classes deleted` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
