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

    // Verify if any Non-Academic subject is scheduled in slot 1
    const configByYear = {};
    for (const cfg of timeSlotConfigs) configByYear[Number(cfg.year)] = cfg;
    const getSlotConfig = (year) => configByYear[Number(year)] || timeSlotConfigs[0] || null;
    const getClassSlots = (year) => {
        const cfg = getSlotConfig(year);
        if (!cfg) return [];
        const slots = cfg.slots.toObject ? cfg.slots.toObject() : cfg.slots;
        return slots.map((s, i) => ({ ...s, index: i })).filter(s => s.type === 'class');
    };

    let nonAcademicInSlot1Count = 0;
    const violations = [];

    for (const entry of res.entries) {
        const sub = subjects.find(s => s.id === entry.subjectId);
        if (!sub) continue;

        if (sub.type === 'Non-Academic') {
            const cls = allClasses.find(c => c.id === entry.classId);
            const classSlots = getClassSlots(cls.year);
            const firstClassSlotIndex = classSlots.length > 0 ? Math.min(...classSlots.map(s => s.index)) : -1;

            if (entry.slotIndex === firstClassSlotIndex) {
                nonAcademicInSlot1Count++;
                violations.push({
                    className: cls.name,
                    subjectName: sub.name,
                    day: entry.day,
                    slotIndex: entry.slotIndex
                });
            }
        }
    }

    console.log(`\nNon-Academic in slot 1 violations: ${nonAcademicInSlot1Count}`);
    if (violations.length > 0) {
        for (const v of violations) {
            console.log(`  Violation: Class ${v.className}, Subject ${v.subjectName} scheduled on ${v.day} at slot ${v.slotIndex}`);
        }
    } else {
        console.log(`  Success: No Non-Academic subjects placed in slot 1!`);
    }

    // Check Saturday allocations
    let satLabs = 0;
    let satProjects = 0;
    let satTheory = 0;
    
    for (const entry of res.entries) {
        if (entry.day === 'Saturday') {
            const sub = subjects.find(s => s.id === entry.subjectId);
            if (!sub) continue;
            if (sub.type === 'lab') {
                console.log(`  DEBUG Sat Lab: Class: ${entry.classId}, Subject: ${sub.name}, Slot: ${entry.slotIndex}`);
                satLabs++;
            }
            else if (sub.type === 'project') {
                console.log(`  DEBUG Sat Project: Class: ${entry.classId}, Subject: ${sub.name}, Slot: ${entry.slotIndex}`);
                satProjects++;
            }
            else if (['theory', 'elective', 'Non-Academic', 'activity'].includes(sub.type)) satTheory++;
        }
    }

    console.log(`\nSaturday Allocation Statistics:`);
    console.log(`  Labs on Saturday: ${satLabs}`);
    console.log(`  Projects on Saturday: ${satProjects}`);
    console.log(`  Theory/Other on Saturday: ${satTheory}`);

    await mongoose.disconnect();
}

run();
