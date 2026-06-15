import mongoose from 'mongoose';
import connectDB from './db.js';
import { Class, FacultySubjectMapping, Subject, Faculty, Room, TimeSlotConfig, Coe } from './models/index.js';
import { generateTimetable } from './engine/scheduler.js';

// We want to run generateTimetable but we want to trace swapRepair calls for II CSE D DM task.
// To do this, let's copy the swapRepair function here, but add detailed console logs.
// Then we run the scheduler. Since we want to intercept swapRepair, let's copy the entire engine/scheduler.js and modify it in a scratch script, or just trace it.
// Let's copy engine/scheduler.js into scratch_scheduler_trace.js, add console.log and run it.
// Wait, that is very easy!
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

// Let's read scheduler.js and modify swapRepair to log details for cls.name === 'II CSE D' and task.subject.id === 'sub-259fcf05'.
// Wait! Let's view the file from our system and run it.
import fs from 'fs';
let content = fs.readFileSync('engine/scheduler.js', 'utf8');

// Insert a log inside the 3-way swap loop
const targetMarker = '            // Try 3-way swap!\n            let success3Way = false;';
const replacement = `            // Try 3-way swap!
            let success3Way = false;
            const isTargetClass = cls.name === 'II CSE D' && subject.id === 'sub-259fcf05';
            if (isTargetClass) {
                console.log(\`  [Trace 3-Way] Blocker blocker=\${blockerSubject?.name} (\${blocker.day} Slot \${blocker.slotIndex}). candidates count=\${secondaryCandidates.length}\`);
            }`;

content = content.replace(targetMarker, replacement);

// Also log inside the secondary loop
const loopMarker = '                const secondaryMoved = secondarySubject && secondaryClass && placeTask(';
const loopReplacement = `                if (isTargetClass) {
                    console.log(\`    [Trace 3-Way] Trying secondary=\${secondarySubject?.name} (\${secondary.day} Slot \${secondary.slotIndex})\`);
                }
                const secondaryMoved = secondarySubject && secondaryClass && placeTask(`;
content = content.replace(loopMarker, loopReplacement);

// Log secondaryMoved results
const checkMarker = '                if (secondaryMoved) {';
const checkReplacement = `                if (secondaryMoved) {
                    if (isTargetClass) {
                        console.log(\`    [Trace 3-Way]   Relocated secondary to: \${entries[entries.length-1].day} Slot \${entries[entries.length-1].slotIndex}\`);
                    }
`;
content = content.replace(checkMarker, checkReplacement);

// Log blocker fits check results
const fitsMarker = '                    if (blockerFits) {';
const fitsReplacement = `                    if (isTargetClass) {
                        console.log(\`    [Trace 3-Way]   blockerFits=\${blockerFits}\`);
                    }
                    if (blockerFits) {`;
content = content.replace(fitsMarker, fitsReplacement);

fs.writeFileSync('scratch_scheduler_trace.js', content, 'utf8');

// Now import the trace scheduler and run it!
const traceMod = await import('./scratch_scheduler_trace.js');
const res = traceMod.generateTimetable(data);

console.log("\nFinished. Deficits count:", res.conflicts.length);

await mongoose.disconnect();
fs.unlinkSync('scratch_scheduler_trace.js');
