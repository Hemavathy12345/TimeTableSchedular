import mongoose from 'mongoose';
import connectDB from './db.js';
import { Class, FacultySubjectMapping, Subject, Faculty, Room, TimeSlotConfig, Coe } from './models/index.js';

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

import fs from 'fs';
let content = fs.readFileSync('engine/scheduler.js', 'utf8');

// Replace with regex to avoid CRLF issues
content = content.replace(/\/\/ Try 3-way swap!\r?\n\s*let success3Way = false;/, `// Try 3-way swap!
            let success3Way = false;
            const isTargetClass = cls.name === 'II CSE D' && subject.id === 'sub-259fcf05';
            if (isTargetClass) {
                console.log(\`  [Trace 3-Way] Blocker blocker=\${blockerSubject?.name} (\${blocker.day} Slot \${blocker.slotIndex}). candidates count=\${secondaryCandidates.length}\`);
            }`);

content = content.replace(/const secondaryMoved = secondarySubject && secondaryClass && placeTask\(/, `if (isTargetClass) {
                    console.log(\`    [Trace 3-Way] Trying secondary=\${secondarySubject?.name} (\${secondary.day} Slot \${secondary.slotIndex})\`);
                }
                const secondaryMoved = secondarySubject && secondaryClass && placeTask(`);

content = content.replace(/if \(secondaryMoved\) \{/, `if (secondaryMoved) {
                    if (isTargetClass) {
                        console.log(\`    [Trace 3-Way]   Relocated secondary to: \${entries[entries.length-1].day} Slot \${entries[entries.length-1].slotIndex}\`);
                    }
`);

content = content.replace(/if \(blockerFits\) \{/, `if (isTargetClass) {
                        console.log(\`    [Trace 3-Way]   blockerFits=\${blockerFits}\`);
                    }
                    if (blockerFits) {`);

fs.writeFileSync('scratch_scheduler_trace_2.js', content, 'utf8');

const traceMod = await import('./scratch_scheduler_trace_2.js');
const res = traceMod.generateTimetable(data);

console.log("\nFinished. Deficits count:", res.conflicts.length);

await mongoose.disconnect();
fs.unlinkSync('scratch_scheduler_trace_2.js');
