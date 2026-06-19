import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import connectDB from './db.js';
import { authRoutes } from './routes/auth.js';
import departmentRoutes from './routes/departments.js';
import facultyRoutes from './routes/faculty.js';
import roomRoutes from './routes/rooms.js';
import subjectRoutes from './routes/subjects.js';
import classRoutes from './routes/classes.js';
import timeslotRoutes from './routes/timeslots.js';
import timetableRoutes from './routes/timetable.js';
import coeRoutes from './routes/coe.js';
import userRoutes from './routes/users.js';
import auditRoutes from './routes/audit.js';
import { User, Department, Room, Faculty, Subject, Class, FacultySubjectMapping } from './models/index.js';

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
app.use('/api/coe', coeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit-logs', auditRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// Seed default departments if they don't exist
async function seedDefaultDepartments() {
    const defaultDepts = [
        { name: 'Computer Science & Engineering', code: 'CSE' },
        { name: 'Electronics Communication & Engineering', code: 'ECE' },
        { name: 'placement Department', code: 'Placement' },
        { name: 'Mathematics', code: 'Maths' },
        { name: 'CSE - CyberSecurity', code: 'CSE-CYS' }
    ];

    for (const d of defaultDepts) {
        const exists = await Department.findOne({ code: d.code });
        if (!exists) {
            await Department.create({
                id: d.code === 'CSE' ? 'dept-001' : `dept-${uuidv4().slice(0, 8)}`,
                name: d.name,
                code: d.code
            });
            console.log(` seeded department: ${d.name} (${d.code})`);
        }
    }
}

// Seed sample data for ECS so it has rooms, classes, subjects, faculty and mapping
async function seedECSSampleData() {
    const ecsDept = await Department.findOne({ code: 'ECS' }).lean();
    if (!ecsDept) return;

    // Check if classes exist for ECS
    const classesExist = await Class.findOne({ departmentId: ecsDept.id });
    if (!classesExist) {
        console.log(' Seeding sample data for Electronics and Computer Science (ECS) department...');

        // 1. Create a room
        const room = await Room.create({
            id: `room-${uuidv4().slice(0, 8)}`,
            name: 'ECS Room 101',
            type: 'classroom',
            capacity: 60,
            departmentId: ecsDept.id
        });
        console.log(` Created sample ECS room: ${room.name}`);

        // 2. Create a faculty member
        const faculty = await Faculty.create({
            id: `fac-${uuidv4().slice(0, 8)}`,
            name: 'Dr. John (ECS)',
            departmentId: ecsDept.id,
            email: 'john_ecs@institution.edu',
            designation: 'Professor'
        });
        console.log(` Created sample ECS faculty: ${faculty.name}`);

        // 3. Create a subject
        const subject = await Subject.create({
            id: `sub-${uuidv4().slice(0, 8)}`,
            name: 'Introduction to Electronics and Computer Science',
            code: 'ECS101',
            type: 'theory',
            totalHours: 45, // 3 periods per week
            year: 1,
            departmentId: ecsDept.id,
            duration: 1
        });
        console.log(` Created sample ECS subject: ${subject.name}`);

        // 4. Create a class
        const cls = await Class.create({
            id: `cls-${uuidv4().slice(0, 8)}`,
            name: 'I ECS A',
            year: 1,
            section: 'A',
            departmentId: ecsDept.id,
            defaultRoomId: room.id,
            advisorId: faculty.id
        });
        console.log(` Created sample ECS class: ${cls.name}`);

        // 5. Create mapping
        await FacultySubjectMapping.create({
            id: `fsm-${uuidv4().slice(0, 8)}`,
            facultyId: faculty.id,
            subjectId: subject.id,
            classId: cls.id
        });
        console.log(' Created sample ECS faculty-subject mapping');
    }
}

// Seed default accounts if they don't exist
async function seedDefaultUsers() {
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
        const hashed = await bcrypt.hash('admin123', 10);
        await User.create({
            id: `usr-admin-001`,
            name: 'Administrator',
            username: 'admin',
            email: 'admin@institution.edu',
            password: hashed,
            role: 'admin',
            departmentId: null
        });
        console.log(' Default admin account created (admin / admin123)');
    }

    // Seed department users based on existing departments
    const departments = await Department.find().lean();
    for (const dept of departments) {
        const deptUsername = dept.code.toLowerCase() + '_admin';
        const exists = await User.findOne({ username: deptUsername });
        if (!exists) {
            const hashed = await bcrypt.hash('dept123', 10);
            await User.create({
                id: `usr-${uuidv4().slice(0, 8)}`,
                name: `${dept.name} Admin`,
                username: deptUsername,
                email: `${deptUsername}@institution.edu`,
                password: hashed,
                role: 'department_user',
                departmentId: dept.id
            });
            console.log(` Department user created: ${deptUsername} / dept123`);
        }
    }
}

// Connect to MongoDB, then start the server
connectDB().then(async () => {
    await seedDefaultDepartments();
    await seedDefaultUsers();
    app.listen(PORT, () => {
        console.log(` Timetable Backend running on http://localhost:${PORT}`);
    });
});

