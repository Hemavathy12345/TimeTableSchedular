import mongoose from 'mongoose';
import connectDB from './db.js';
import { Class, FacultySubjectMapping, Subject, Faculty, Room, TimeSlotConfig, Coe } from './models/index.js';
import { generateTimetable } from './engine/scheduler.js';

async function run() {
    await connectDB();
    const allClasses = await Class.find().lean();
    const allMappings = await FacultySubjectMapping.find().lean();
    const subjects = await Subject.find().lean();
    const faculty = await Faculty.find().lean();
    const rooms = await Room.find().lean();
    const timeSlotConfigs = await TimeSlotConfig.find().lean();
    const coeEntries = await Coe.find().lean();

    const res = generateTimetable({
        classes: allClasses,
        subjects,
        faculty,
        rooms,
        timeSlotConfigs,
        defaultClasses: [],
        facultySubjectMapping: allMappings,
        coeEntries
    });

    const c2d = allClasses.find(c => c.name === 'II CSE D');
    const entries = res.entries.filter(e => e.classId === c2d.id);
    
    console.log("II CSE D entries and isFixed:");
    for (const e of entries) {
        const sub = subjects.find(s => s.id === e.subjectId);
        console.log(`  Subject: ${sub?.name || 'COE'}, isFixed: ${e.isFixed}`);
    }

    await mongoose.disconnect();
}
run();
