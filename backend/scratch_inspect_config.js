import mongoose from 'mongoose';
import connectDB from './db.js';
import { TimeSlotConfig } from './models/index.js';

async function run() {
    await connectDB();
    const configs = await TimeSlotConfig.find().lean();
    for (const c of configs) {
        console.log(`Year: ${c.year}, Days: ${JSON.stringify(c.days)}`);
        console.log(`Slots:`);
        c.slots.forEach((s, i) => {
            console.log(`  Index ${i}: start=${s.start}, end=${s.end}, type=${s.type}`);
        });
    }
    await mongoose.disconnect();
}
run();
