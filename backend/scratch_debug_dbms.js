import mongoose from 'mongoose';
import connectDB from './db.js';
import { Subject, Class, FacultySubjectMapping, Faculty } from './models/index.js';

async function run() {
    await connectDB();
    const subjects = await Subject.find({ name: /Database Management System/i }).lean();
    console.log("=== DBMS SUBJECTS IN DB ===");
    console.log(subjects);

    const subjectIds = subjects.map(s => s.id);
    const mappings = await FacultySubjectMapping.find({ subjectId: { $in: subjectIds } }).lean();
    console.log("\n=== MAPPINGS FOR DBMS SUBJECTS ===");
    
    const classes = await Class.find().lean();
    const classMap = Object.fromEntries(classes.map(c => [c.id, c]));

    const faculties = await Faculty.find().lean();
    const facMap = Object.fromEntries(faculties.map(f => [f.id, f.name]));

    for (const m of mappings) {
        const sub = subjects.find(s => s.id === m.subjectId);
        const cls = classMap[m.classId];
        console.log({
            mappingId: m.id,
            class: cls ? `${cls.name} (ID: ${cls.id}, Dept: ${cls.departmentId})` : `Unknown class ${m.classId}`,
            subject: `${sub.name} (Code: ${sub.code}, ID: ${sub.id}, Dept: ${sub.departmentId})`,
            faculty: facMap[m.facultyId] || m.facultyId,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt
        });
    }

    await mongoose.disconnect();
}
run();
