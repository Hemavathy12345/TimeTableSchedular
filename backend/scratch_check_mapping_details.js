import mongoose from 'mongoose';
import connectDB from './db.js';
import { FacultySubjectMapping, Class } from './models/index.js';

async function run() {
    await connectDB();
    const mappings = await FacultySubjectMapping.find().lean();
    console.log("Total mappings in DB:", mappings.length);
    const missingSubjects = [];
    const Subject = mongoose.model('Subject');
    for (const m of mappings) {
        const sub = await Subject.findOne({ id: m.subjectId });
        if (!sub) {
            missingSubjects.push(m);
        }
    }
    console.log("Mappings referencing missing subjects:", missingSubjects.length);
    for (const m of missingSubjects.slice(0, 20)) {
        const cls = await Class.findOne({ id: m.classId });
        console.log(`  Mapping ID: ${m._id || m.id}, class: ${cls?.name || m.classId}, subjectId: ${m.subjectId}, facultyId: ${m.facultyId}`);
    }
    await mongoose.disconnect();
}
run();
