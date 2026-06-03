import mongoose from 'mongoose';
import { Subject, Room } from './models/index.js';

const MAPPING = {
    // Intel Lab
    'Data Structures Laboratory': 'Intel Lab',
    'DS Lab': 'Intel Lab',
    'Electronic and Microprocessore Lab': 'Intel Lab',
    'EMP Lab': 'Intel Lab',
    'Software Project Management Lab': 'Intel Lab',
    'SPM LAB': 'Intel Lab',
    'Python Programming Lab': 'Intel Lab',
    'PP Lab': 'Intel Lab',

    // Cloud Lab
    'Cryptography and Cyber Security Laboratory': 'Cloud Lab',
    'CCS LAB': 'Cloud Lab',
    'Software Testing Lab': 'Cloud Lab',
    'ST Lab': 'Cloud Lab',
    'Software Engineering Laboratory': 'Cloud Lab',
    'SE Lab': 'Cloud Lab',

    // FullStack Lab
    'Object Oriented Programming using  c++ Laboratory': 'FullStack Lab',
    'C++ Lab': 'FullStack Lab',
    'Java Lab': 'FullStack Lab',
    'JAVA Lab': 'FullStack Lab',
    'Artificial Intelligence and Machine Learning Lab': 'FullStack Lab',
    'AIML Lab': 'FullStack Lab',
    'Object Oriented Analysis and Design Lab': 'FullStack Lab',
    'OOAD LAB': 'FullStack Lab',

    // Bytes Lab
    'Database Management System Laboratory': 'Bytes Lab',
    'DBMS Lab': 'Bytes Lab',
    'Design and Analysis of Algorithm Laboratory': 'Bytes Lab',
    'DAA Lab': 'Bytes Lab'
};

async function run() {
    await mongoose.connect('mongodb://localhost:27017/timetable_db');
    console.log("Connected to MongoDB.");

    const rooms = await Room.find({ type: 'lab' }).lean();
    console.log(`Found ${rooms.length} lab rooms.`);

    const subjects = await Subject.find({ type: 'lab' });
    console.log(`Found ${subjects.length} lab subjects.`);

    let updatedCount = 0;
    for (const sub of subjects) {
        let targetLabName = MAPPING[sub.name] || MAPPING[sub.code.trim()];
        if (!targetLabName) {
            targetLabName = 'FullStack Lab';
        }

        const room = rooms.find(r => r.name.toLowerCase() === targetLabName.toLowerCase());
        if (room) {
            sub.assignedLabId = room.id;
            await sub.save();
            console.log(`✓ Assigned subject "${sub.name}" (${sub.code}) to room "${room.name}" (${room.id})`);
            updatedCount++;
        } else {
            console.log(`✗ Could not find room matching "${targetLabName}" for subject "${sub.name}"`);
        }
    }

    console.log(`Successfully seeded ${updatedCount} lab subjects with their assigned labs.`);
    await mongoose.disconnect();
}

run().catch(console.error);
