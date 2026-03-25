import mongoose from 'mongoose';
import connectDB from './db.js';
import { TimeSlotConfig } from './models/index.js';

async function verify() {
    await connectDB();
    
    const countModel = await TimeSlotConfig.countDocuments();
    console.log(`Mongoose TimeSlotConfig count: ${countModel}`);

    const coll = mongoose.connection.db.collection('timeslotconfigs');
    const countDirect = await coll.countDocuments();
    console.log(`Direct 'timeslotconfigs' count: ${countDirect}`);

    const allDirect = await coll.find().toArray();
    console.log(`Direct docs found: ${allDirect.length}`);
    if (allDirect.length > 0) {
        console.log(`Sample doc: ${JSON.stringify(allDirect[0], null, 2)}`);
    }

    process.exit(0);
}

verify();
