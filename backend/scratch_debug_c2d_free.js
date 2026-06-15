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

    // Let's find the current entries for II CSE D
    const c2d = allClasses.find(c => c.name === 'II CSE D');
    const c2dEntries = res.entries.filter(e => e.classId === c2d.id);
    
    // For each slot of the week, let's see which subjects of II CSE D are scheduled,
    // and who is the faculty, and where else that faculty is teaching.
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const classSlots = timeSlotConfigs.find(cfg => Number(cfg.year) === 2).slots.map((s, i) => ({ ...s, index: i })).filter(s => s.type === 'class');
    
    console.log("II CSE D Current Schedule & Faculty availability:");
    for (const d of days) {
        console.log(`  ${d}:`);
        for (const slot of classSlots) {
            const entry = c2dEntries.find(e => e.day === d && slot.index >= e.slotIndex && slot.index < e.slotIndex + (e.duration || 1));
            if (entry) {
                const sub = subjects.find(s => s.id === entry.subjectId);
                // Find if faculty is busy at this slot in other classes
                const facId = entry.facultyId;
                const otherTeach = res.entries.filter(e => e.facultyId === facId && e.classId !== c2d.id && e.day === d && slot.index >= e.slotIndex && slot.index < e.slotIndex + (e.duration || 1));
                const otherClsNames = otherTeach.map(e => allClasses.find(c => c.id === e.classId)?.name).join(', ');
                console.log(`    Slot ${slot.index}: ${sub?.name || 'COE'} [Fac: ${facId || 'None'}] ${otherClsNames ? `(Also teaching: ${otherClsNames})` : '(Free elsewhere)'}`);
            } else {
                console.log(`    Slot ${slot.index}: Free`);
            }
        }
    }

    // Let's check the deficit subjects
    // Discrete Mathematics (sub-259fcf05) needs 1 more slot.
    // Let's print for Dr. Revathi (fac-ae0aef66) her weekly schedule in other classes:
    console.log("\nDr. A. Revathi (Discrete Mathematics) weekly schedule in other classes:");
    for (const d of days) {
        for (const slot of classSlots) {
            const teach = res.entries.filter(e => e.facultyId === 'fac-ae0aef66' && e.classId !== c2d.id && e.day === d && slot.index >= e.slotIndex && slot.index < e.slotIndex + (e.duration || 1));
            if (teach.length > 0) {
                const clsNames = teach.map(e => allClasses.find(c => c.id === e.classId)?.name).join(', ');
                console.log(`  ${d} Slot ${slot.index}: teaching in ${clsNames}`);
            }
        }
    }

    await mongoose.disconnect();
}
run();
