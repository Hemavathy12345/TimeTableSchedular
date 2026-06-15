import mongoose from 'mongoose';
import connectDB from './db.js';
import { Subject } from './models/index.js';

async function run() {
    await connectDB();
    const subjects = await Subject.find().lean();
    for (const s of subjects) {
        console.log(`ID: ${s.id}, Name: ${s.name}, Type: ${s.type}, Duration: ${s.duration}, WeeklyHours: ${s.weeklyHours}`);
    }
    await mongoose.disconnect();
}
run();
