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

    // Let's run a custom scheduler trace
    // Let's check Saturday Slot 5 for II CSE D
    const cls = allClasses.find(c => c.name === 'II CSE D');
    const mapping = allMappings.find(m => m.classId === cls.id && m.subjectId === 'sub-259fcf05'); // DM
    const subject = subjects.find(s => s.id === 'sub-259fcf05');
    
    console.log("DM Mapping:", mapping);
    console.log("DM Subject:", subject);

    // Let's call generateTimetable and get the entries and maps
    // But we want to inspect the maps at the end of the main placement, before fillFreeSlots!
    // Let's write a modified function or look at the result entries first.
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

    const dmEntries = res.entries.filter(e => e.classId === cls.id && e.subjectId === subject.id);
    console.log(`\nScheduled DM entries for II CSE D (${dmEntries.length}):`);
    for (const e of dmEntries) {
        console.log(`  ${e.day} Slot ${e.slotIndex} (dur: ${e.duration})`);
    }

    // Who is scheduled on Saturday for II CSE D?
    const satEntries = res.entries.filter(e => e.classId === cls.id && e.day === 'Saturday').sort((a,b) => a.slotIndex - b.slotIndex);
    console.log("\nScheduled entries for II CSE D on Saturday:");
    for (const e of satEntries) {
        const sub = subjects.find(s => s.id === e.subjectId);
        console.log(`  Slot ${e.slotIndex} (dur: ${e.duration}): ${sub?.name || 'COE/PE'} (Faculty: ${e.facultyId}, Room: ${e.roomId})`);
    }

    // Who is scheduled on Saturday for II CSE C?
    const clsc = allClasses.find(c => c.name === 'II CSE C');
    const satEntriesC = res.entries.filter(e => e.classId === clsc.id && e.day === 'Saturday').sort((a,b) => a.slotIndex - b.slotIndex);
    console.log("\nScheduled entries for II CSE C on Saturday:");
    for (const e of satEntriesC) {
        const sub = subjects.find(s => s.id === e.subjectId);
        console.log(`  Slot ${e.slotIndex} (dur: ${e.duration}): ${sub?.name || 'COE/PE'} (Faculty: ${e.facultyId}, Room: ${e.roomId})`);
    }

    await mongoose.disconnect();
}
run();
