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

    const daaFacId = 'fac-0e0b95a4';
    const slots = res.entries.filter(e => e.facultyId === daaFacId || e.labFaculty2Id === daaFacId || e.labFaculty3Id === daaFacId);
    console.log("DAA Faculty (fac-0e0b95a4) scheduled slots:");
    for (const e of slots) {
        const cls = allClasses.find(c => c.id === e.classId);
        const sub = subjects.find(s => s.id === e.subjectId);
        console.log(`  ${e.day} Slot ${e.slotIndex} (dur: ${e.duration}) in Class ${cls?.name} for ${sub?.name}`);
    }
    await mongoose.disconnect();
}

run();
