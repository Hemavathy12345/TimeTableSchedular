import express from 'express';
import cors from 'cors';
import connectDB from './db.js';
import authRoutes from './routes/auth.js';
import departmentRoutes from './routes/departments.js';
import facultyRoutes from './routes/faculty.js';
import roomRoutes from './routes/rooms.js';
import subjectRoutes from './routes/subjects.js';
import classRoutes from './routes/classes.js';
import timeslotRoutes from './routes/timeslots.js';
import timetableRoutes from './routes/timetable.js';

const app = express();
const PORT = process.env.PORT || 5050;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/timeslots', timeslotRoutes);
app.use('/api/timetable', timetableRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// Connect to MongoDB, then start the server
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(` Timetable Backend running on http://localhost:${PORT}`);
    });
});
