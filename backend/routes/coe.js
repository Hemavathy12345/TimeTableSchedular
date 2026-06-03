import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Coe } from '../models/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/coe  – list all COE entries (optionally filter by year)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const filter = {};
        if (req.query.year) filter.year = Number(req.query.year);
        const entries = await Coe.find(filter).lean();
        res.json(entries);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/coe  – create a new COE entry (admin only)
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { year, label, day, startSlotIndex, endSlotIndex } = req.body;

        if (!year || !day || startSlotIndex === undefined || endSlotIndex === undefined) {
            return res.status(400).json({ error: 'year, day, startSlotIndex and endSlotIndex are required' });
        }
        if (Number(startSlotIndex) > Number(endSlotIndex)) {
            return res.status(400).json({ error: 'startSlotIndex must be <= endSlotIndex' });
        }
        if (![1, 2, 3, 4].includes(Number(year))) {
            return res.status(400).json({ error: 'year must be 1, 2, 3, or 4' });
        }

        // Check for overlapping COE entries for the same year+day
        const existing = await Coe.find({ year: Number(year), day }).lean();
        const overlap = existing.some(e =>
            Number(startSlotIndex) <= e.endSlotIndex && Number(endSlotIndex) >= e.startSlotIndex
        );
        if (overlap) {
            return res.status(409).json({ error: 'COE entry overlaps with an existing COE slot for this year on this day' });
        }

        const entry = await Coe.create({
            id:             `coe-${uuidv4().slice(0, 8)}`,
            year:           Number(year),
            label:          label || 'COE',
            day,
            startSlotIndex: Number(startSlotIndex),
            endSlotIndex:   Number(endSlotIndex)
        });

        res.status(201).json(entry.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/coe/:id  – update an existing COE entry (admin only)
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { label, day, startSlotIndex, endSlotIndex } = req.body;
        const coe = await Coe.findOne({ id: req.params.id });
        if (!coe) return res.status(404).json({ error: 'COE entry not found' });

        const newStart = startSlotIndex !== undefined ? Number(startSlotIndex) : coe.startSlotIndex;
        const newEnd   = endSlotIndex   !== undefined ? Number(endSlotIndex)   : coe.endSlotIndex;
        const newDay   = day || coe.day;

        if (newStart > newEnd) {
            return res.status(400).json({ error: 'startSlotIndex must be <= endSlotIndex' });
        }

        // Overlap check (exclude self)
        const existing = await Coe.find({ year: coe.year, day: newDay, id: { $ne: coe.id } }).lean();
        const overlap = existing.some(e =>
            newStart <= e.endSlotIndex && newEnd >= e.startSlotIndex
        );
        if (overlap) {
            return res.status(409).json({ error: 'Updated COE entry would overlap with an existing COE slot' });
        }

        if (label          !== undefined) coe.label          = label;
        if (day            !== undefined) coe.day            = day;
        if (startSlotIndex !== undefined) coe.startSlotIndex = newStart;
        if (endSlotIndex   !== undefined) coe.endSlotIndex   = newEnd;

        await coe.save();
        res.json(coe.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/coe/:id  – remove a COE entry (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const deleted = await Coe.findOneAndDelete({ id: req.params.id });
        if (!deleted) return res.status(404).json({ error: 'COE entry not found' });
        res.json({ message: 'COE entry deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
