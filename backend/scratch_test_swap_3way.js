import mongoose from 'mongoose';
import connectDB from './db.js';
import { Class, FacultySubjectMapping, Subject, Faculty, Room, TimeSlotConfig, Coe } from './models/index.js';
import { generateTimetable, checkConstraints } from './engine/scheduler.js';

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
    const c2d = allClasses.find(c => c.name === 'II CSE D');
    const entries = res.entries;
    
    // Find the indices
    const idxDaaSat5 = entries.findIndex(e => e.classId === c2d.id && e.day === 'Saturday' && e.slotIndex === 5);
    const idxDbmsSat4 = entries.findIndex(e => e.classId === c2d.id && e.day === 'Saturday' && e.slotIndex === 4);
    const idxDbmsFri4 = entries.findIndex(e => e.classId === c2d.id && e.day === 'Friday' && e.slotIndex === 4);
    
    console.log("Current Entry Sat 5:", entries[idxDaaSat5]);
    console.log("Current Entry Sat 4:", entries[idxDbmsSat4]);
    console.log("Current Entry Fri 4:", entries[idxDbmsFri4]);

    // Let's modify them:
    const testEntries = entries.map(e => ({ ...e }));
    
    // Put DM on Saturday Slot 5
    testEntries[idxDaaSat5] = {
        ...testEntries[idxDaaSat5],
        subjectId: 'sub-259fcf05', // DM
        facultyId: 'fac-ae0aef66',
        schedulingNote: 'Test DM Sat 5'
    };
    
    // Put DAA on Saturday Slot 4
    testEntries[idxDbmsSat4] = {
        ...testEntries[idxDbmsSat4],
        subjectId: 'sub-1b136774', // DAA
        facultyId: 'fac-0e0b95a4',
        schedulingNote: 'Test DAA Sat 4'
    };
    
    // Put DBMS on Friday Slot 4
    testEntries[idxDbmsFri4] = {
        ...testEntries[idxDbmsFri4],
        subjectId: 'sub-fb7a029a', // DBMS
        facultyId: 'fac-5ab2baa5',
        schedulingNote: 'Test DBMS Fri 4'
    };

    const violations = checkConstraints(testEntries, {
        subjects,
        rooms,
        faculty,
        classes: allClasses,
        configs: timeSlotConfigs
    });

    console.log("\nViolations with 3-way swap:", violations);

    await mongoose.disconnect();
}
run();
