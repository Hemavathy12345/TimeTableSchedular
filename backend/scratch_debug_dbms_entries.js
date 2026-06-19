import mongoose from 'mongoose';
import connectDB from './db.js';
import { Subject, Class, FacultySubjectMapping, Timetable } from './models/index.js';

async function run() {
    await connectDB();
    
    const classId = 'cls-0c8b2bdd'; // II CYS
    const wrongTheorySubjectId = 'sub-fb7a029a'; // DBMS (CSE)
    const wrongLabSubjectId = 'sub-9a6debae'; // DBMS Lab (CSE)
    const correctTheorySubjectId = 'sub-2b2bd0b0'; // DBMS (CYS)
    const correctLabSubjectId = 'sub-857065d7'; // DBMS Lab (CYS)

    console.log("=== CHECKING TIMETABLE ENTRIES FOR CLASS II CYS ===");
    const timetables = await Timetable.find().lean();
    for (const tt of timetables) {
        const wrongEntries = tt.entries.filter(e => e.classId === classId && (e.subjectId === wrongTheorySubjectId || e.subjectId === wrongLabSubjectId));
        if (wrongEntries.length > 0) {
            console.log(`Timetable: ${tt.name} (ID: ${tt.id}) has ${wrongEntries.length} wrong entries:`);
            console.log(wrongEntries);
        }
    }

    await mongoose.disconnect();
}
run();
