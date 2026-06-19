import mongoose from 'mongoose';
import connectDB from './db.js';
import { Subject, Department, Class, FacultySubjectMapping, Faculty } from './models/index.js';

async function run() {
    await connectDB();
    const depts = await Department.find().lean();
    const deptMap = Object.fromEntries(depts.map(d => [d.id, `${d.name} (${d.code})`]));
    
    const faculties = await Faculty.find().lean();
    const facMap = Object.fromEntries(faculties.map(f => [f.id, f.name]));

    const subjects = await Subject.find().lean();
    const subMap = Object.fromEntries(subjects.map(s => [s.id, s]));

    const classes = await Class.find().lean();
    const mappings = await FacultySubjectMapping.find().lean();

    console.log("=== CLASSES ===");
    for (const c of classes) {
        console.log(`Class ID: ${c.id}, Name: ${c.name}, Year: ${c.year}, Dept: ${deptMap[c.departmentId]}`);
        const classMappings = mappings.filter(m => m.classId === c.id);
        if (classMappings.length === 0) {
            console.log("  (No mappings)");
        } else {
            for (const m of classMappings) {
                const sub = subMap[m.subjectId];
                if (sub) {
                    console.log(`  Mapping ID: ${m.id}, Subject ID: ${sub.id}, Code: ${sub.code}, Name: ${sub.name}, Type: ${sub.type}, Faculty: ${facMap[m.facultyId] || m.facultyId}`);
                } else {
                    console.log(`  Mapping ID: ${m.id}, Unknown Subject ID: ${m.subjectId}`);
                }
            }
        }
        console.log("------------------------");
    }
    await mongoose.disconnect();
}
run();
