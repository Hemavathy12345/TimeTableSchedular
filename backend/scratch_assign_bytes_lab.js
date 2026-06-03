import mongoose from 'mongoose';
import connectDB from './db.js';
import { Subject, Room } from './models/index.js';

async function run() {
    await connectDB();
    const rooms = await Room.find({ type: 'lab' }).lean();
    const bytesRoom = rooms.find(r => r.name.toLowerCase() === 'bytes lab');
    if (!bytesRoom) {
        console.error('Bytes Lab room not found');
        process.exit(1);
    }
    const targetNames = [
        'Database Management System Laboratory',
        'Design and Analysis of Algorithm Laboratory'
    ];
    const subs = await Subject.find({ name: { $in: targetNames } }).lean();
    console.log('Found subjects to reassign:', subs.map(s => s.name));
    for (const sub of subs) {
        await Subject.updateOne({ _id: sub._id }, { assignedLabId: bytesRoom.id });
        console.log(`Reassigned ${sub.name} to Bytes Lab (${bytesRoom.id})`);
    }
    await mongoose.disconnect();
}
run().catch(err => { console.error(err); process.exit(1); });
