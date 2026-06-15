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

    const revathiId = 'fac-ae0aef66';
    const revathiSlots = res.entries.filter(e => e.facultyId === revathiId);
    console.log("Dr. A. Revathi (Discrete Mathematics) slots:");
    for (const e of revathiSlots) {
        const cls = allClasses.find(c => c.id === e.classId);
        console.log(`  ${e.day} Slot ${e.slotIndex} in Class ${cls?.name}`);
    }
    await mongoose.disconnect();
}
run();
