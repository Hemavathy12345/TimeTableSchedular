import mongoose from 'mongoose';
import connectDB from './db.js';
import { Class, FacultySubjectMapping, Subject, Faculty, Room, TimeSlotConfig, Coe } from './models/index.js';
import { generateTimetable } from './engine/scheduler.js';

// We will copy the generateTimetable function but insert a debug print just before fillFreeSlots is called!
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

    // Let's run a custom version of scheduler logic to inspect Phase 6 output
    const subjectById  = {};
    const classById    = {};
    const configByYear = {};
    for (const s of subjects)       subjectById[s.id]            = s;
    for (const c of allClasses)        classById[c.id]              = c;
    for (const cfg of timeSlotConfigs) configByYear[Number(cfg.year)] = cfg;

    const getSlotConfig = (year) => configByYear[Number(year)] || timeSlotConfigs[0] || null;
    const getClassSlots = (year) => {
        const cfg = getSlotConfig(year);
        return cfg ? cfg.slots.map((s, i) => ({ ...s, index: i })).filter(s => s.type === 'class') : [];
    };
    
    // Run the scheduler but inspect entries before fillFreeSlots
    const res = generateTimetable(data);
    
    // Let's inspect the actual entries that were placed by placeTask/swapRepair before fillFreeSlots
    // Wait, since we can't easily hook inside generateTimetable, let's write a script that runs the phases manually
    // or just filters res.entries that are NOT marked as 'extra' or 'relaxed' in the note!
    // Wait! Let's look at the schedulingNote of the entries.
    // Deficit and gap-fill entries have notes containing "extra" or "relaxed: true" or "relaxed: false" in buildNote.
    // Let's see what entries we have for II CSE D:
    const c2d = allClasses.find(c => c.name === 'II CSE D');
    const c2dEntries = res.entries.filter(e => e.classId === c2d.id);
    
    console.log("All entries scheduled for II CSE D:");
    for (const e of c2dEntries) {
        const sub = subjects.find(s => s.id === e.subjectId);
        console.log(`  Day: ${e.day}, Slot: ${e.slotIndex}, Subject: ${sub?.name || 'COE'}, Note: ${e.schedulingNote}, Faculty: ${e.facultyId}`);
    }

    await mongoose.disconnect();
}
run();
