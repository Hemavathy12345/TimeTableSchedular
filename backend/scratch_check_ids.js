import mongoose from 'mongoose';
import connectDB from './db.js';
import { Subject, FacultySubjectMapping, Class } from './models/index.js';

async function run() {
    await connectDB();
    const c = await Class.findOne({ name: 'III CSE B' }).lean();
    if (!c) { console.log("Class not found"); return; }
    const mappings = await FacultySubjectMapping.find({ classId: c.id }).lean();
    const subjects = await Subject.find().lean();
    console.log("Mappings count for class:", mappings.length);
    console.log("Subjects count:", subjects.length);
    for (const m of mappings) {
        const match = subjects.find(s => s.id === m.subjectId);
        console.log(`Mapping subjectId: ${m.subjectId}, matched name: ${match?.name}, matched type: ${match?.type}`);
    }
    await mongoose.disconnect();
}
run();
