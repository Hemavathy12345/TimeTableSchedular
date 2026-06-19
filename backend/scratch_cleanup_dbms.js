import mongoose from 'mongoose';
import connectDB from './db.js';
import { FacultySubjectMapping, Timetable } from './models/index.js';

async function run() {
    await connectDB();

    const classId = 'cls-0c8b2bdd'; // II CYS
    const wrongTheorySubjectId = 'sub-fb7a029a'; // DBMS (CSE)
    const wrongLabSubjectId = 'sub-9a6debae'; // DBMS Lab (CSE)

    console.log("=== DELETING INCORRECT MAPPINGS ===");
    const deletedMappings = await FacultySubjectMapping.deleteMany({
        classId: classId,
        subjectId: { $in: [wrongTheorySubjectId, wrongLabSubjectId] }
    });
    console.log(`Deleted ${deletedMappings.deletedCount} incorrect mapping records.`);

    console.log("\n=== CLEANING UP TIMETABLE ENTRIES ===");
    const timetables = await Timetable.find();
    let totalEntriesRemoved = 0;
    
    for (const tt of timetables) {
        const originalLength = tt.entries.length;
        // Keep only entries that are NOT the wrong DBMS subjects for II CYS class
        tt.entries = tt.entries.filter(e => {
            const isWrongEntry = (e.classId === classId && (e.subjectId === wrongTheorySubjectId || e.subjectId === wrongLabSubjectId));
            return !isWrongEntry;
        });

        const removedCount = originalLength - tt.entries.length;
        if (removedCount > 0) {
            await tt.save();
            console.log(`Updated timetable "${tt.name}" (ID: ${tt.id}) - removed ${removedCount} wrong entries.`);
            totalEntriesRemoved += removedCount;
        }
    }
    console.log(`Total timetable entries removed: ${totalEntriesRemoved}`);

    await mongoose.disconnect();
}
run().catch(console.error);
