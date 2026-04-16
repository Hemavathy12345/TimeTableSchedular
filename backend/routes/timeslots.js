import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { TimeSlotConfig } from '../models/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/timeslots
router.get('/', authenticateToken, async (req, res) => {
    try {
        const filter = {};
        if (req.query.year) filter.year = parseInt(req.query.year);
        const configs = await TimeSlotConfig.find(filter).lean();
        res.json(configs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/timeslots/:id
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const config = await TimeSlotConfig.findOne({ id: req.params.id }).lean();
        if (!config) return res.status(404).json({ error: 'Time slot config not found' });
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/timeslots
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { year, days, slots } = req.body;
        if (!year || !days || !slots) return res.status(400).json({ error: 'Year, days, and slots required' });

        // Remove existing config for this year
        await TimeSlotConfig.deleteMany({ year });

        if (!days.includes('Saturday')) {
            days.push('Saturday');
        }

        const config = await TimeSlotConfig.create({
            id: `ts-${uuidv4().slice(0, 8)}`,
            year, days, slots
        });
        res.status(201).json(config.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/timeslots/:id
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const updateData = req.body;
        if (updateData.days && !updateData.days.includes('Saturday')) {
            updateData.days.push('Saturday');
        }

        const config = await TimeSlotConfig.findOneAndUpdate(
            { id: req.params.id },
            { $set: updateData },
            { new: true, lean: true }
        );
        if (!config) return res.status(404).json({ error: 'Time slot config not found' });
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/timeslots/:id
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await TimeSlotConfig.deleteOne({ id: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Config not found' });
        res.json({ message: 'Config deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/timeslots/bulk-delete
router.post('/bulk-delete', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });
        const result = await TimeSlotConfig.deleteMany({ id: { $in: ids } });
        res.json({ message: `${result.deletedCount} configs deleted` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
