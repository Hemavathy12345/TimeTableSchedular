import { Router } from 'express';
import { AuditLog } from '../models/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/audit-logs - Get all audit logs (Admin only)
router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const logs = await AuditLog.find().sort({ createdAt: -1 }).lean();
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
