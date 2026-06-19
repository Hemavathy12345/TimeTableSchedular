import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Coe } from '../models/index.js';
import Faculty from '../models/Faculty.js';
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

// POST /api/coe  – create a new COE entry (admin or department_user)
router.post('/', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { year, label, day, startSlotIndex, endSlotIndex, coFacultyId, section, sections } = req.body;

        if (!year || !day || startSlotIndex === undefined || endSlotIndex === undefined) {
            return res.status(400).json({ error: 'year, day, startSlotIndex and endSlotIndex are required' });
        }
        if (Number(startSlotIndex) > Number(endSlotIndex)) {
            return res.status(400).json({ error: 'startSlotIndex must be <= endSlotIndex' });
        }
        if (![1, 2, 3, 4].includes(Number(year))) {
            return res.status(400).json({ error: 'year must be 1, 2, 3, or 4' });
        }

        // Validate coFacultyId if provided
        if (coFacultyId) {
            const faculty = await Faculty.findOne({ id: coFacultyId }).lean();
            if (!faculty) {
                return res.status(400).json({ error: `Faculty with id "${coFacultyId}" not found` });
            }
        }

        // Resolve target sections array
        let targetSections = sections;
        if (!targetSections || !Array.isArray(targetSections) || targetSections.length === 0) {
            targetSections = [section || 'All'];
        }

        // Check for overlapping COE entries for the same year+day+sections
        const existing = await Coe.find({ year: Number(year), day }).lean();
        const overlap = existing.some(e => {
            const timeOverlap = Number(startSlotIndex) <= e.endSlotIndex && Number(endSlotIndex) >= e.startSlotIndex;
            const eSections = e.sections && e.sections.length > 0 ? e.sections : [e.section || 'All'];
            const sectionOverlap = targetSections.includes('All') || eSections.includes('All') || targetSections.some(s => eSections.includes(s));
            return timeOverlap && sectionOverlap;
        });
        if (overlap) {
            return res.status(409).json({ error: 'COE entry overlaps with an existing COE slot for this year/section on this day' });
        }

        const entry = await Coe.create({
            id:             `coe-${uuidv4().slice(0, 8)}`,
            year:           Number(year),
            label:          label || 'COE',
            day,
            startSlotIndex: Number(startSlotIndex),
            endSlotIndex:   Number(endSlotIndex),
            coFacultyId:    coFacultyId || null,
            section:        targetSections[0],
            sections:       targetSections
        });

        res.status(201).json(entry.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/coe/:id — admin or department_user can edit
router.put('/:id', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { label, day, startSlotIndex, endSlotIndex, coFacultyId, section, sections } = req.body;
        const coe = await Coe.findOne({ id: req.params.id });
        if (!coe) return res.status(404).json({ error: 'COE entry not found' });

        const newStart = startSlotIndex !== undefined ? Number(startSlotIndex) : coe.startSlotIndex;
        const newEnd   = endSlotIndex   !== undefined ? Number(endSlotIndex)   : coe.endSlotIndex;
        const newDay   = day || coe.day;

        let newSections = sections;
        if (newSections === undefined) {
            if (section !== undefined) {
                newSections = [section || 'All'];
            } else {
                newSections = coe.sections && coe.sections.length > 0 ? coe.sections : [coe.section || 'All'];
            }
        } else if (!Array.isArray(newSections) || newSections.length === 0) {
            newSections = [section || 'All'];
        }

        if (newStart > newEnd) {
            return res.status(400).json({ error: 'startSlotIndex must be <= endSlotIndex' });
        }

        // Validate coFacultyId if provided (null clears it)
        if (coFacultyId !== undefined && coFacultyId !== null && coFacultyId !== '') {
            const faculty = await Faculty.findOne({ id: coFacultyId }).lean();
            if (!faculty) {
                return res.status(400).json({ error: `Faculty with id "${coFacultyId}" not found` });
            }
        }

        // Overlap check (exclude self)
        const existing = await Coe.find({ year: coe.year, day: newDay, id: { $ne: coe.id } }).lean();
        const overlap = existing.some(e => {
            const timeOverlap = newStart <= e.endSlotIndex && newEnd >= e.startSlotIndex;
            const eSections = e.sections && e.sections.length > 0 ? e.sections : [e.section || 'All'];
            const sectionOverlap = newSections.includes('All') || eSections.includes('All') || newSections.some(s => eSections.includes(s));
            return timeOverlap && sectionOverlap;
        });
        if (overlap) {
            return res.status(409).json({ error: 'Updated COE entry would overlap with an existing COE slot' });
        }

        if (label          !== undefined) coe.label          = label;
        if (day            !== undefined) coe.day            = day;
        if (startSlotIndex !== undefined) coe.startSlotIndex = newStart;
        if (endSlotIndex   !== undefined) coe.endSlotIndex   = newEnd;

        // Update both fields to remain in sync
        coe.sections = newSections;
        coe.section  = newSections[0];

        // Allow clearing (null/'') or setting coFacultyId
        if (coFacultyId !== undefined) coe.coFacultyId = coFacultyId || null;

        await coe.save();
        res.json(coe.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/coe/:id  – remove a COE entry (admin or department_user)
router.delete('/:id', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const deleted = await Coe.findOneAndDelete({ id: req.params.id });
        if (!deleted) return res.status(404).json({ error: 'COE entry not found' });
        res.json({ message: 'COE entry deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
