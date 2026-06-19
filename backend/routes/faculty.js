import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Faculty, Department } from '../models/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/faculty
router.get('/', authenticateToken, async (req, res) => {
    try {
        const filter = {};
        if (req.query.departmentId && req.query.departmentId !== 'null' && req.query.departmentId !== 'undefined') {
            filter.departmentId = req.query.departmentId;
        } else if (req.user.role === 'department_user' && req.user.departmentId && req.query.all !== 'true') {
            filter.departmentId = req.user.departmentId;
        }
        const faculty = await Faculty.find(filter).lean();
        const departments = await Department.find().lean();

        const enriched = faculty.map(f => {
            const dept = departments.find(d => d.id === f.departmentId);
            return {
                ...f,
                departmentName: dept ? dept.name : null,
                departmentCode: dept ? dept.code : null
            };
        });

        res.json(enriched);
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
router.post('/', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { name, departmentId, email, designation } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        let targetDeptId = departmentId;
        if (req.user.role === 'department_user') {
            if (departmentId && departmentId !== req.user.departmentId) {
                return res.status(403).json({ error: 'Access denied. Cannot create faculty for another department.' });
            }
            targetDeptId = req.user.departmentId;
        }

        if (!targetDeptId) {
            return res.status(400).json({ error: 'Department ID is required' });
        }

        const fac = await Faculty.create({
            id: `fac-${uuidv4().slice(0, 8)}`,
            name,
            departmentId: targetDeptId,
            email: email || '',
            designation: designation || ''
        });
        res.status(201).json(fac.toObject());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/faculty/:id
router.put('/:id', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const query = { id: req.params.id };
        if (req.user.role === 'department_user') {
            query.departmentId = req.user.departmentId;
            // Prevent department modification if they try to change it
            if (req.body.departmentId && req.body.departmentId !== req.user.departmentId) {
                return res.status(400).json({ error: 'Cannot change faculty department to another department.' });
            }
        }

        const fac = await Faculty.findOneAndUpdate(
            query,
            { $set: req.body },
            { new: true, lean: true }
        );
        if (!fac) return res.status(404).json({ error: 'Faculty not found or access denied' });
        res.json(fac);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/faculty/:id
router.delete('/:id', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const query = { id: req.params.id };
        if (req.user.role === 'department_user') {
            query.departmentId = req.user.departmentId;
        }

        const result = await Faculty.deleteOne(query);
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Faculty not found or access denied' });
        res.json({ message: 'Faculty deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/faculty/import-excel
router.post('/import-excel', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { data } = req.body;
        if (!Array.isArray(data) || data.length === 0) {
            return res.status(400).json({ error: 'Invalid data format. Expected array of faculty records.' });
        }

        const results = { success: 0, failed: 0, errors: [] };

        for (let i = 0; i < data.length; i++) {
            const record = data[i];

            if (!record.name) {
                results.failed++;
                results.errors.push(`Row ${i + 1}: Missing name`);
                continue;
            }

            let targetDeptId = record.departmentId || record.department || record.DepartmentId;
            if (req.user.role === 'department_user') {
                targetDeptId = req.user.departmentId;
            }

            if (!targetDeptId) {
                results.failed++;
                results.errors.push(`Row ${i + 1}: Missing departmentId`);
                continue;
            }

            const deptExists = await Department.findOne({ id: targetDeptId }).lean();
            if (!deptExists) {
                results.failed++;
                results.errors.push(`Row ${i + 1}: Department ID ${targetDeptId} not found`);
                continue;
            }

            await Faculty.create({
                id: `fac-${uuidv4().slice(0, 8)}`,
                name: record.name,
                departmentId: targetDeptId,
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

// POST /api/faculty/bulk-delete
router.post('/bulk-delete', authenticateToken, requireRole('admin', 'department_user'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });
        
        const query = { id: { $in: ids } };
        if (req.user.role === 'department_user') {
            query.departmentId = req.user.departmentId;
        }

        const result = await Faculty.deleteMany(query);
        res.json({ message: `${result.deletedCount} faculty deleted` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
