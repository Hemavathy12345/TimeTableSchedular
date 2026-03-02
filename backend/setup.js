import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {
    User,
    Department,
    Faculty,
    Room,
    Subject,
    Class,
    TimeSlotConfig,
    FacultySubjectMapping,
    Timetable
} from './models/index.js';
import connectDB from './db.js';

const hash = bcrypt.hashSync('password123', 10);

const data = {
    users: [
        { id: "admin-001", name: "Admin User", email: "admin@college.edu", password: hash, role: "admin", departmentId: null },
        { id: "faculty-001", name: "Dr. Sharma", email: "sharma@college.edu", password: hash, role: "faculty", departmentId: "dept-001" },
        { id: "student-001", name: "Rahul Kumar", email: "rahul@college.edu", password: hash, role: "student", departmentId: "dept-001" }
    ],
    departments: [
        { id: "dept-001", name: "Computer Science & Engineering", code: "CSE" },
        { id: "dept-002", name: "Electronics & Communication", code: "ECE" }
    ],
    faculty: [
        { id: "fac-001", name: "Dr. Sharma", departmentId: "dept-001", email: "sharma@college.edu" },
        { id: "fac-002", name: "Prof. Gupta", departmentId: "dept-001", email: "gupta@college.edu" },
        { id: "fac-003", name: "Dr. Patel", departmentId: "dept-001", email: "patel@college.edu" },
        { id: "fac-004", name: "Prof. Singh", departmentId: "dept-001", email: "singh@college.edu" },
        { id: "fac-005", name: "Dr. Verma", departmentId: "dept-002", email: "verma@college.edu" },
        { id: "fac-006", name: "Prof. Reddy", departmentId: "dept-002", email: "reddy@college.edu" },
        { id: "fac-007", name: "Dr. Joshi", departmentId: "dept-002", email: "joshi@college.edu" },
        { id: "fac-008", name: "Prof. Mehta", departmentId: "dept-002", email: "mehta@college.edu" }
    ],
    rooms: [
        { id: "room-001", name: "Room 101", type: "classroom", capacity: 60, departmentId: "dept-001" },
        { id: "room-002", name: "Room 102", type: "classroom", capacity: 60, departmentId: "dept-001" },
        { id: "room-003", name: "Room 201", type: "classroom", capacity: 60, departmentId: "dept-002" },
        { id: "room-004", name: "Room 202", type: "classroom", capacity: 60, departmentId: "dept-002" },
        { id: "room-005", name: "CS Lab 1", type: "lab", capacity: 30, departmentId: "dept-001" },
        { id: "room-006", name: "CS Lab 2", type: "lab", capacity: 30, departmentId: "dept-001" },
        { id: "room-007", name: "ECE Lab 1", type: "lab", capacity: 30, departmentId: "dept-002" },
        { id: "room-008", name: "ECE Lab 2", type: "lab", capacity: 30, departmentId: "dept-002" }
    ],
    subjects: [
        { id: "sub-001", name: "Data Structures", code: "CS201", type: "theory", weeklyFrequency: 4, year: 2, departmentId: "dept-001", duration: 1 },
        { id: "sub-002", name: "Operating Systems", code: "CS301", type: "theory", weeklyFrequency: 3, year: 3, departmentId: "dept-001", duration: 1 },
        { id: "sub-003", name: "DBMS", code: "CS202", type: "theory", weeklyFrequency: 3, year: 2, departmentId: "dept-001", duration: 1 },
        { id: "sub-004", name: "DS Lab", code: "CS211", type: "lab", weeklyFrequency: 1, year: 2, departmentId: "dept-001", duration: 2 },
        { id: "sub-005", name: "DBMS Lab", code: "CS212", type: "lab", weeklyFrequency: 1, year: 2, departmentId: "dept-001", duration: 2 },
        { id: "sub-006", name: "Computer Networks", code: "CS302", type: "theory", weeklyFrequency: 3, year: 3, departmentId: "dept-001", duration: 1 },
        { id: "sub-007", name: "Digital Electronics", code: "EC201", type: "theory", weeklyFrequency: 4, year: 2, departmentId: "dept-002", duration: 1 },
        { id: "sub-008", name: "Signal Processing", code: "EC301", type: "theory", weeklyFrequency: 3, year: 3, departmentId: "dept-002", duration: 1 },
        { id: "sub-009", name: "DE Lab", code: "EC211", type: "lab", weeklyFrequency: 1, year: 2, departmentId: "dept-002", duration: 2 },
        { id: "sub-010", name: "Microprocessors", code: "EC202", type: "theory", weeklyFrequency: 3, year: 2, departmentId: "dept-002", duration: 1 }
    ],
    classes: [
        { id: "cls-001", name: "CSE 2nd Year A", year: 2, section: "A", departmentId: "dept-001" },
        { id: "cls-002", name: "CSE 2nd Year B", year: 2, section: "B", departmentId: "dept-001" },
        { id: "cls-003", name: "CSE 3rd Year A", year: 3, section: "A", departmentId: "dept-001" },
        { id: "cls-004", name: "ECE 2nd Year A", year: 2, section: "A", departmentId: "dept-002" },
        { id: "cls-005", name: "ECE 3rd Year A", year: 3, section: "A", departmentId: "dept-002" }
    ],
    timeSlotConfigs: [
        {
            id: "ts-001", year: 1,
            days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            slots: [
                { start: "08:00", end: "08:50", type: "class" },
                { start: "08:50", end: "09:40", type: "class" },
                { start: "09:40", end: "09:55", type: "break" },
                { start: "09:55", end: "10:45", type: "class" },
                { start: "10:45", end: "11:35", type: "class" },
                { start: "11:35", end: "12:25", type: "class" },
                { start: "12:25", end: "13:10", type: "lunch" },
                { start: "13:10", end: "14:00", type: "class" },
                { start: "14:00", end: "14:50", type: "class" }
            ]
        },
        {
            id: "ts-002", year: 2,
            days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            slots: [
                { start: "09:00", end: "09:50", type: "class" },
                { start: "09:50", end: "10:40", type: "class" },
                { start: "10:40", end: "10:55", type: "break" },
                { start: "10:55", end: "11:45", type: "class" },
                { start: "11:45", end: "12:35", type: "class" },
                { start: "12:35", end: "13:20", type: "lunch" },
                { start: "13:20", end: "14:10", type: "class" },
                { start: "14:10", end: "15:00", type: "class" },
                { start: "15:00", end: "15:50", type: "class" }
            ]
        },
        {
            id: "ts-003", year: 3,
            days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            slots: [
                { start: "09:30", end: "10:20", type: "class" },
                { start: "10:20", end: "11:10", type: "class" },
                { start: "11:10", end: "11:25", type: "break" },
                { start: "11:25", end: "12:15", type: "class" },
                { start: "12:15", end: "13:05", type: "class" },
                { start: "13:05", end: "13:50", type: "lunch" },
                { start: "13:50", end: "14:40", type: "class" },
                { start: "14:40", end: "15:30", type: "class" }
            ]
        },
        {
            id: "ts-004", year: 4,
            days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            slots: [
                { start: "10:00", end: "10:50", type: "class" },
                { start: "10:50", end: "11:40", type: "class" },
                { start: "11:40", end: "11:55", type: "break" },
                { start: "11:55", end: "12:45", type: "class" },
                { start: "12:45", end: "13:30", type: "lunch" },
                { start: "13:30", end: "14:20", type: "class" },
                { start: "14:20", end: "15:10", type: "class" }
            ]
        }
    ],
    facultySubjectMapping: [
        { id: "fsm-001", facultyId: "fac-001", subjectId: "sub-001", classId: "cls-001" },
        { id: "fsm-002", facultyId: "fac-001", subjectId: "sub-001", classId: "cls-002" },
        { id: "fsm-003", facultyId: "fac-002", subjectId: "sub-003", classId: "cls-001" },
        { id: "fsm-004", facultyId: "fac-002", subjectId: "sub-003", classId: "cls-002" },
        { id: "fsm-005", facultyId: "fac-003", subjectId: "sub-002", classId: "cls-003" },
        { id: "fsm-006", facultyId: "fac-003", subjectId: "sub-006", classId: "cls-003" },
        { id: "fsm-007", facultyId: "fac-004", subjectId: "sub-004", classId: "cls-001", labFaculty2Id: "fac-001" },
        { id: "fsm-008", facultyId: "fac-004", subjectId: "sub-005", classId: "cls-001", labFaculty2Id: "fac-002" },
        { id: "fsm-009", facultyId: "fac-004", subjectId: "sub-004", classId: "cls-002", labFaculty2Id: "fac-001" },
        { id: "fsm-010", facultyId: "fac-004", subjectId: "sub-005", classId: "cls-002", labFaculty2Id: "fac-002" },
        { id: "fsm-011", facultyId: "fac-005", subjectId: "sub-007", classId: "cls-004" },
        { id: "fsm-012", facultyId: "fac-006", subjectId: "sub-010", classId: "cls-004" },
        { id: "fsm-013", facultyId: "fac-007", subjectId: "sub-008", classId: "cls-005" },
        { id: "fsm-014", facultyId: "fac-008", subjectId: "sub-009", classId: "cls-004", labFaculty2Id: "fac-005" }
    ]
};

async function seed() {
    try {
        await connectDB();
        console.log('Clearing old data...');
        await Promise.all([
            User.deleteMany({}),
            Department.deleteMany({}),
            Faculty.deleteMany({}),
            Room.deleteMany({}),
            Subject.deleteMany({}),
            Class.deleteMany({}),
            TimeSlotConfig.deleteMany({}),
            FacultySubjectMapping.deleteMany({}),
            Timetable.deleteMany({})
        ]);

        console.log('Seeding new data...');
        await User.insertMany(data.users);
        await Department.insertMany(data.departments);
        await Faculty.insertMany(data.faculty);
        await Room.insertMany(data.rooms);
        await Subject.insertMany(data.subjects);
        await Class.insertMany(data.classes);
        await TimeSlotConfig.insertMany(data.timeSlotConfigs);
        await FacultySubjectMapping.insertMany(data.facultySubjectMapping);

        console.log('✅ MongoDB seeded successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error seeding data:', err);
        process.exit(1);
    }
}

seed();
