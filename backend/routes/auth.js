import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { JWT_SECRET, authenticateToken } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await User.findOne({ email }).lean();
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, departmentId: user.departmentId }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ id: req.user.id }).lean();
        if (!user) return res.status(404).json({ error: 'User not found' });
        const { password, ...userData } = user;
        res.json(userData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
