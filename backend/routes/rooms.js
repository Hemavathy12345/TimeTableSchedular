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

// POST /api/rooms
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, type, capacity, departmentId } = req.body;
        if (!name || !type) return res.status(400).json({ error: 'Name and type required' });

        const room = await Room.create({
            id: `room-${uuidv4().slice(0, 8)}`,
            name,
            type,
            capacity: capacity || 60,
            departmentId: departmentId || null
        });
        res.status(201).json(room.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/rooms/:id
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const room = await Room.findOneAndUpdate(
            { id: req.params.id },
            { $set: req.body },
            { new: true, lean: true }
        );
        if (!room) return res.status(404).json({ error: 'Room not found' });
        res.json(room);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/rooms/:id
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await Room.deleteOne({ id: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Room not found' });
        res.json({ message: 'Room deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
