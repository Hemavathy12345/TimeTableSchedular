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

// Let's add a console log in generateTimetable where Phase 6d runs
content = content.replace(
    '    // --- Phase 6d: Swap-based repair for Theory/Electives -------------------',
    `    // --- Phase 6d: Swap-based repair for Theory/Electives -------------------
    console.log("Tasks entering Phase 6d (Theory Swap-based repair):", unplacedTheoryPass2.map(t => ({ class: t.cls.name, subject: t.subject.name })));`
);

fs.writeFileSync('scratch_scheduler_trace_3.js', content, 'utf8');

const traceMod = await import('./scratch_scheduler_trace_3.js');
const res = traceMod.generateTimetable(data);

await mongoose.disconnect();
fs.unlinkSync('scratch_scheduler_trace_3.js');
