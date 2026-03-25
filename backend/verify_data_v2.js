import mongoose from 'mongoose';
import connectDB from './db.js';
import { TimeSlotConfig } from './models/index.js';
import fs from 'fs';

async function verify() {
    await connectDB();
    
    // Explicitly re-register if needed though find() should use the one from models/index.js
    const countModel = await TimeSlotConfig.countDocuments();
    const coll = mongoose.connection.db.collection('timeslotconfigs');
    const countDirect = await coll.countDocuments();
    
    const res = `Mongoose count: ${countModel}\nDirect count: ${countDirect}\n`;
    fs.writeFileSync('verify_out.txt', res);
    console.log(res);
    process.exit(0);
}

verify();
