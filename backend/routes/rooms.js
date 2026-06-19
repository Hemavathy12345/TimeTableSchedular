import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Room } from '../models/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/rooms
router.get('/', authenticateToken, async (req, res) => {
    try {
        const filter = {};
        if (req.query.type) filter.type = req.query.type;
        if (req.query.departmentId) filter.departmentId = req.query.departmentId;
        const rooms = await Room.find(filter).lean();
        res.json(rooms);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/rooms/:id
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const room = await Room.findOne({ id: req.params.id }).lean();
        if (!room) return res.status(404).json({ error: 'Room not found' });
        res.json(room);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/rooms — admin: any dept; dept_user: only their dept
router.post('/', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { name, type, capacity, departmentId } = req.body;
        if (!name || !type) return res.status(400).json({ error: 'Name and type required' });

        // dept_user can only add rooms to their own department
        const effectiveDeptId = req.user.role === 'department_user'
            ? req.user.departmentId
            : (departmentId || null);

        const room = await Room.create({
            id: `room-${uuidv4().slice(0, 8)}`,
            name,
            type,
            capacity: capacity || 60,
            departmentId: effectiveDeptId
        });
        res.status(201).json(room.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/rooms/:id — admin: any room; dept_user: only their dept's rooms
router.put('/:id', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const room = await Room.findOne({ id: req.params.id }).lean();
        if (!room) return res.status(404).json({ error: 'Room not found' });

        // dept_user can only edit rooms belonging to their department
        if (req.user.role === 'department_user' && room.departmentId !== req.user.departmentId) {
            return res.status(403).json({ error: 'You can only edit rooms in your own department' });
        }

        // dept_user cannot change departmentId to another dept
        const updateData = { ...req.body };
        if (req.user.role === 'department_user') {
            updateData.departmentId = req.user.departmentId;
        }

        const updated = await Room.findOneAndUpdate(
            { id: req.params.id },
            { $set: updateData },
            { new: true, lean: true }
        );
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/rooms/:id — admin: any room; dept_user: only their dept's rooms
router.delete('/:id', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const room = await Room.findOne({ id: req.params.id }).lean();
        if (!room) return res.status(404).json({ error: 'Room not found' });

        // dept_user can only delete rooms belonging to their department
        if (req.user.role === 'department_user' && room.departmentId !== req.user.departmentId) {
            return res.status(403).json({ error: 'You can only delete rooms in your own department' });
        }

        await Room.deleteOne({ id: req.params.id });
        res.json({ message: 'Room deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/rooms/bulk-delete — admin: any; dept_user: only their dept's rooms
router.post('/bulk-delete', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });

        let filter = { id: { $in: ids } };
        // dept_user can only bulk-delete their own dept's rooms
        if (req.user.role === 'department_user') {
            filter.departmentId = req.user.departmentId;
        }

        const result = await Room.deleteMany(filter);
        res.json({ message: `${result.deletedCount} rooms deleted` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
