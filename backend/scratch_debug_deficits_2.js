import mongoose from 'mongoose';
import connectDB from './db.js';
import { Class, FacultySubjectMapping, Subject, Faculty, Room, TimeSlotConfig, Coe } from './models/index.js';
import { generateTimetable, buildAllocationSummary } from './engine/scheduler.js';

async function run() {
    await connectDB();

    const allClasses = await Class.find().lean();
    const allMappings = await FacultySubjectMapping.find().lean();
    const subjects = await Subject.find().lean();
    const faculty = await Faculty.find().lean();
    const rooms = await Room.find().lean();
    const timeSlotConfigs = await TimeSlotConfig.find().lean();
    const coeEntries = await Coe.find().lean();

    const data = {
        classes: allClasses,
        subjects,
        faculty,
        rooms,
        timeSlotConfigs,
        defaultClasses: [],
        facultySubjectMapping: allMappings,
        coeEntries
    };

    const res = generateTimetable(data);
    
    // Check entries for III CSE B (find its ID first)
    const c3b = allClasses.find(c => c.name === 'III CSE B');
    console.log(`\n=== III CSE B (ID: ${c3b?.id}) ===`);
    if (c3b) {
        const c3bEntries = res.entries.filter(e => e.classId === c3b.id);
        console.log(`Number of scheduled entries for III CSE B: ${c3bEntries.length}`);
        
        // Print schedule day-by-day
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        for (const d of days) {
            const dayEntries = c3bEntries.filter(e => e.day === d).sort((a,b) => a.slotIndex - b.slotIndex);
            console.log(`  ${d}:`);
            for (const e of dayEntries) {
                const sub = subjects.find(s => s.id === e.subjectId);
                console.log(`    Slot ${e.slotIndex} (dur: ${e.duration}): ${sub ? sub.name : (e.isCOE ? e.coeLabel : 'Free')} [Fac: ${e.facultyId}]`);
            }
        }
    }

    // Check entries for II CSE D (find its ID first)
    const c2d = allClasses.find(c => c.name === 'II CSE D');
    console.log(`\n=== II CSE D (ID: ${c2d?.id}) ===`);
    if (c2d) {
        const c2dEntries = res.entries.filter(e => e.classId === c2d.id);
        console.log(`Number of scheduled entries for II CSE D: ${c2dEntries.length}`);
        
        // Print schedule day-by-day
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        for (const d of days) {
            const dayEntries = c2dEntries.filter(e => e.day === d).sort((a,b) => a.slotIndex - b.slotIndex);
            console.log(`  ${d}:`);
            for (const e of dayEntries) {
                const sub = subjects.find(s => s.id === e.subjectId);
                console.log(`    Slot ${e.slotIndex} (dur: ${e.duration}): ${sub ? sub.name : (e.isCOE ? e.coeLabel : 'Free')} [Fac: ${e.facultyId}]`);
            }
        }
    }

    await mongoose.disconnect();
}

run();
