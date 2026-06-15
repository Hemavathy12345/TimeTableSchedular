import mongoose from 'mongoose';
import connectDB from './db.js';
import { Class, FacultySubjectMapping, Subject, Faculty } from './models/index.js';

async function run() {
    await connectDB();
    const c2d = await Class.findOne({ name: 'II CSE D' }).lean();
    if (!c2d) { console.log("Class not found"); return; }
    
    const mappings = await FacultySubjectMapping.find({ classId: c2d.id }).lean();
    const subjects = await Subject.find().lean();
    
    console.log("II CSE D Mappings:");
    let totalHours = 0;
    for (const m of mappings) {
        const sub = subjects.find(s => s.id === m.subjectId);
        if (!sub) continue;
        const req = sub.weeklyHours || (sub.type === 'lab' || sub.type === 'project' ? 2 : (sub.type === 'Non-Academic' ? 1 : 4)); // wait, what is the default weeklyHours or periods per week?
        // Let's use the periodsPerWeek logic from scheduler.js:
        // const periodsPerWeek = (sub) => {
        //     if (sub.weeklyHours) return Number(sub.weeklyHours);
        //     if (sub.type === 'lab') return 4;
        //     if (sub.type === 'project') return 2;
        //     if (sub.type === 'Non-Academic') {
        //         const name = sub.name.toLowerCase();
        //         if (name === 'aptitude' || name === 'softskill' || name === 'soft skills') return 2;
        //         return 1;
        //     }
        //     return 4;
        // };
        const periods = (() => {
            if (sub.weeklyHours) return Number(sub.weeklyHours);
            if (sub.type === 'lab') return 4;
            if (sub.type === 'project') return 2;
            if (sub.type === 'Non-Academic') {
                const name = sub.name.toLowerCase();
                if (name === 'aptitude' || name === 'softskill' || name === 'soft skills') return 2;
                return 1;
            }
            return 4;
        })();
        
        console.log(`  Subject: ${sub.name} (type: ${sub.type}, req: ${periods}), Faculty: ${m.facultyId}`);
        totalHours += periods;
    }
    console.log(`Total hours required for II CSE D: ${totalHours}`);
    await mongoose.disconnect();
}
run();
