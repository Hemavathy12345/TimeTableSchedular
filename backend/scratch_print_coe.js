import mongoose from 'mongoose';
import connectDB from './db.js';

async function run() {
    await connectDB();
    const coes = await mongoose.connection.collection('coes').find().toArray();
    console.log("COE entries:");
    for (const c of coes) {
        console.log(`  Year: ${c.year}, Day: ${c.day}, Start: ${c.startSlotIndex}, End: ${c.endSlotIndex}, Label: ${c.label}`);
    }
    await mongoose.disconnect();
}
run();
