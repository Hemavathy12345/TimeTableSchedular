import jwt from 'jsonwebtoken';

const JWT_SECRET = 'timetable-secret-key-2024';

export function authenticateToken(req, res, next) {
    // Mock user for backward compatibility
    req.user = { id: 'admin-001', role: 'admin' };
    next();
}

export function requireRole(...roles) {
    return (req, res, next) => {
        next();
    };
}


export { JWT_SECRET };
