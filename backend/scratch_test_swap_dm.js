import mongoose from 'mongoose';
import connectDB from './db.js';
import { Class, FacultySubjectMapping, Subject, Faculty, Room, TimeSlotConfig, Coe } from './models/index.js';
import { generateTimetable, validateSwap, checkConstraints } from './engine/scheduler.js';

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
    
    // Let's find the DAA entry on Saturday Slot 5 for II CSE D
    const c2d = allClasses.find(c => c.name === 'II CSE D');
    const daaSub = subjects.find(s => s.name === 'Design and Analysis of Algorithm');
    const dmSub = subjects.find(s => s.name === 'Discrete Mathematics');
    
    const entries = res.entries;
    
    const daaSatIndex = entries.findIndex(e => e.classId === c2d.id && e.day === 'Saturday' && e.slotIndex === 5);
    console.log("DAA Entry on Saturday Slot 5:", entries[daaSatIndex]);

    // Let's find the gap-filled DBMS entry or the free slot
    // Wait, on Friday Slot 4, we have a gap-filled DBMS entry:
    const dbmsFriIndex = entries.findIndex(e => e.classId === c2d.id && e.day === 'Friday' && e.slotIndex === 4);
    console.log("DBMS Entry on Friday Slot 4:", entries[dbmsFriIndex]);

    // Let's see what happens if we swap them:
    // 1. Put DAA on Friday Slot 4
    // 2. Put DM on Saturday Slot 5
    // Let's create a modified copy of entries
    const testEntries = entries.map(e => ({ ...e }));
    
    // Replace Friday Slot 4 with DAA
    testEntries[dbmsFriIndex] = {
        ...testEntries[dbmsFriIndex],
        subjectId: daaSub.id,
        facultyId: 'fac-0e0b95a4', // DAA faculty
        subjectType: 'theory',
        schedulingNote: 'Test DAA'
    };
    
    // Replace Saturday Slot 5 with DM
    testEntries[daaSatIndex] = {
        ...testEntries[daaSatIndex],
        subjectId: dmSub.id,
        facultyId: 'fac-ae0aef66', // DM faculty
        subjectType: 'theory',
        schedulingNote: 'Test DM'
    };

    const violations = checkConstraints(testEntries, {
        subjects,
        rooms,
        faculty,
        classes: allClasses,
        configs: timeSlotConfigs
    });

    console.log("\nViolations with this test schedule:", violations);

    await mongoose.disconnect();
}
run();
