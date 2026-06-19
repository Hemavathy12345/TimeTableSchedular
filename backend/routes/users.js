import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { User, Department } from '../models/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/users - List all users (Admin only)
router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const users = await User.find().lean();
        const formatted = users.map(u => ({
            id: u.id,
            name: u.name,
            username: u.username,
            email: u.email,
            role: u.role,
            departmentId: u.departmentId
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/users - Create new user account (Admin only)
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, username, email, password, role, departmentId } = req.body;
        if (!name || !username || !email || !password || !role) {
            return res.status(400).json({ error: 'Name, username, email, password, and role are required' });
        }

        const exists = await User.findOne({ $or: [{ username }, { email }] });
        if (exists) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        let targetDeptId = departmentId || null;
        if (role === 'department_user' && !targetDeptId) {
            return res.status(400).json({ error: 'Department is required for department users' });
        }
        if (role === 'admin') {
            targetDeptId = null;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            id: `usr-${uuidv4().slice(0, 8)}`,
            name,
            username,
            email,
            password: hashedPassword,
            role,
            departmentId: targetDeptId
        });

        res.status(201).json({
            id: newUser.id,
            name: newUser.name,
            username: newUser.username,
            email: newUser.email,
            role: newUser.role,
            departmentId: newUser.departmentId
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/users/:id - Update user account (Admin only)
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { name, username, email, password, role, departmentId } = req.body;
        const user = await User.findOne({ id: req.params.id });
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (username && username !== user.username) {
            const exists = await User.findOne({ username });
            if (exists) return res.status(400).json({ error: 'Username already in use' });
            user.username = username;
        }

        if (email && email !== user.email) {
            const exists = await User.findOne({ email });
            if (exists) return res.status(400).json({ error: 'Email already in use' });
            user.email = email;
        }

        if (name) user.name = name;
        if (role) {
            user.role = role;
            if (role === 'admin') user.departmentId = null;
        }
        if (role === 'department_user' && departmentId !== undefined) {
            user.departmentId = departmentId;
        }
        if (password) {
            user.password = await bcrypt.hash(password, 10);
        }

        await user.save();

        res.json({
            id: user.id,
            name: user.name,
            username: user.username,
            email: user.email,
            role: user.role,
            departmentId: user.departmentId
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/users/:id - Delete user account (Admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        if (req.params.id === 'usr-admin-001' || req.params.id === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete primary admin or currently logged in account' });
        }

        const result = await User.deleteOne({ id: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ message: 'User account deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
