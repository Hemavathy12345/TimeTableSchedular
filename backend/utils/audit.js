import { v4 as uuidv4 } from 'uuid';
import { AuditLog, Department } from '../models/index.js';

export async function logAction(user, action, details = {}) {
    try {
        let departmentName = null;
        if (user.departmentId) {
            const dept = await Department.findOne({ id: user.departmentId }).lean();
            if (dept) departmentName = dept.name;
        }

        await AuditLog.create({
            id: `aud-${uuidv4().slice(0, 8)}`,
            userId: user.id,
            username: user.username,
            role: user.role,
            departmentId: user.departmentId || null,
            departmentName,
            action,
            details
        });
    } catch (err) {
        console.error('Failed to write audit log:', err);
    }
}
