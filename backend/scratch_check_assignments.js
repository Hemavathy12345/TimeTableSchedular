import mongoose from 'mongoose';
import connectDB from './db.js';
import { Subject, Room } from './models/index.js';

async function run() {
    await connectDB();
    const labs = await Subject.find({ type: 'lab' }).lean();
    const rooms = await Room.find({ type: 'lab' }).lean();
    const roomById = {};
    rooms.forEach(r => roomById[r.id] = r.name);
    
    console.log('Lab subjects and their assigned rooms:');
    labs.forEach(s => {
        console.log(`  ${s.name} -> ${roomById[s.assignedLabId] || 'NONE'} (${s.assignedLabId || 'none'})`);
    });
    await mongoose.disconnect();
}
run();
