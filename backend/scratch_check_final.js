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
    const summary = buildAllocationSummary(res.entries, subjects, allMappings, allClasses);
    const deficits = summary.filter(s => s.remainingPeriods > 0);

    console.log(`Deficits count in default run: ${deficits.length}`);
    for (const s of deficits) {
        console.log(`  Class: ${s.className}, Subject: ${s.courseTitle} (${s.subjectId}), Required: ${s.requiredPeriods}, Allocated: ${s.allocatedPeriods}`);
    }

    // Let's also print the room utilization count of Intel Lab and FullStack Lab
    const intelLabId = 'room-cb4df34e';
    const fullstackLabId = 'room-b2d3c55c';

    const intelEntries = res.entries.filter(e => e.roomId === intelLabId);
    const fullstackEntries = res.entries.filter(e => e.roomId === fullstackLabId);

    console.log(`\nIntel Lab utilization: ${intelEntries.length} blocks allocated`);
    console.log(`FullStack Lab utilization: ${fullstackEntries.length} blocks allocated`);

    await mongoose.disconnect();
}

run();
