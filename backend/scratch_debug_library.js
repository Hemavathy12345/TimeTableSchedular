import mongoose from 'mongoose';
import connectDB from './db.js';
import { Class, FacultySubjectMapping, Subject, Faculty } from './models/index.js';
import { generateTimetable } from './engine/scheduler.js';

async function run() {
    await connectDB();
    const allClasses = await Class.find().lean();
    const allMappings = await FacultySubjectMapping.find().lean();
    const subjects = await Subject.find().lean();
    const faculty = await Faculty.find().lean();

    const c3b = allClasses.find(c => c.name === 'III CSE B');
    console.log("III CSE B class details:", c3b);

    const c3bMappings = allMappings.filter(m => m.classId === c3b.id);
    console.log("\nMappings for III CSE B:");
    for (const m of c3bMappings) {
        const sub = subjects.find(s => s.id === m.subjectId);
        const fac = faculty.find(f => f.id === m.facultyId);
        console.log(`  Subject: ${sub?.name} (type: ${sub?.type}, req: ${sub?.weeklyHours}), Faculty: ${fac?.name} (${m.facultyId})`);
    }

    // Check where the advisor/tutors are teaching in the generated timetable
    const res = generateTimetable({
        classes: allClasses,
        subjects,
        faculty,
        rooms: await mongoose.model('Room').find().lean(),
        timeSlotConfigs: await mongoose.model('TimeSlotConfig').find().lean(),
        defaultClasses: [],
        facultySubjectMapping: allMappings,
        coeEntries: await mongoose.model('Coe').find().lean()
    });

    const advisorId = c3b.advisorId;
    const tutor1Id = c3b.tutor1Id;
    const tutor2Id = c3b.tutor2Id;
    console.log(`\nAdvisor/Tutor IDs: advisor=${advisorId}, tutor1=${tutor1Id}, tutor2=${tutor2Id}`);

    const advisorName = faculty.find(f => f.id === advisorId)?.name;
    const tutor1Name = faculty.find(f => f.id === tutor1Id)?.name;
    const tutor2Name = faculty.find(f => f.id === tutor2Id)?.name;
    console.log(`Names: advisor=${advisorName}, tutor1=${tutor1Name}, tutor2=${tutor2Name}`);

    console.log("\nAdvisor scheduled slots in the entire timetable:");
    const advisorSlots = res.entries.filter(e => e.facultyId === advisorId || e.labFaculty2Id === advisorId || e.labFaculty3Id === advisorId);
    for (const e of advisorSlots) {
        const cls = allClasses.find(c => c.id === e.classId);
        const sub = subjects.find(s => s.id === e.subjectId);
        console.log(`  ${e.day} Slot ${e.slotIndex} (dur: ${e.duration}) in Class ${cls?.name} for ${sub?.name}`);
    }

    console.log("\nTutor 1 scheduled slots in the entire timetable:");
    const t1Slots = res.entries.filter(e => e.facultyId === tutor1Id || e.labFaculty2Id === tutor1Id || e.labFaculty3Id === tutor1Id);
    for (const e of t1Slots) {
        const cls = allClasses.find(c => c.id === e.classId);
        const sub = subjects.find(s => s.id === e.subjectId);
        console.log(`  ${e.day} Slot ${e.slotIndex} (dur: ${e.duration}) in Class ${cls?.name} for ${sub?.name}`);
    }

    console.log("\nTutor 2 scheduled slots in the entire timetable:");
    const t2Slots = res.entries.filter(e => e.facultyId === tutor2Id || e.labFaculty2Id === tutor2Id || e.labFaculty3Id === tutor2Id);
    for (const e of t2Slots) {
        const cls = allClasses.find(c => c.id === e.classId);
        const sub = subjects.find(s => s.id === e.subjectId);
        console.log(`  ${e.day} Slot ${e.slotIndex} (dur: ${e.duration}) in Class ${cls?.name} for ${sub?.name}`);
    }

    await mongoose.disconnect();
}
run();
