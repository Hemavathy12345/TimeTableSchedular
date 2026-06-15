import mongoose from 'mongoose';
import connectDB from './db.js';
import { Class, FacultySubjectMapping, Subject } from './models/index.js';

const SEMESTER_WEEKS = 15;
const periodsPerWeek = (subject) =>
    Math.max(1, Math.ceil((subject.totalHours || 1) / SEMESTER_WEEKS));

async function run() {
    await connectDB();
    const c2d = await Class.findOne({ name: 'II CSE D' }).lean();
    if (!c2d) { console.log("Class not found"); return; }
    
    const mappings = await FacultySubjectMapping.find({ classId: c2d.id }).lean();
    const subjects = await Subject.find().lean();
    
    console.log("II CSE D Subject hours:");
    let totalPeriods = 0;
    for (const m of mappings) {
        const sub = subjects.find(s => s.id === m.subjectId);
        if (!sub) continue;
        const periods = periodsPerWeek(sub);
        console.log(`  Subject: ${sub.name} (type: ${sub.type}, totalHours: ${sub.totalHours}, calculated periods: ${periods})`);
        totalPeriods += periods;
    }
    console.log(`Total calculated periods required: ${totalPeriods}`);
    await mongoose.disconnect();
}
run();
