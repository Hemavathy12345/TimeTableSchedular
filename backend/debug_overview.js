import mongoose from 'mongoose';
import { Timetable, Class, TimeSlotConfig } from './models/index.js';
import connectDB from './db.js';

async function debug() {
    await connectDB();
    const tt = await Timetable.findOne().lean();
    if (!tt) { console.log("No timetable found"); process.exit(0); }

    const [classes, configs] = await Promise.all([
        Class.find().lean(),
        TimeSlotConfig.find().lean()
    ]);

    console.log(`Found ${classes.length} classes, ${configs.length} configs`);
    
    // Check first entry
    const e = tt.entries[0];
    const cls = classes.find(c => c.id === e.classId);
    const config = configs.find(c => c.year === cls?.year);
    const startSlot = config?.slots[e.slotIndex];

    console.log("Sample Entry Debug:");
    console.log(`- classId: ${e.classId}, clsName: ${cls?.name}, clsYear: ${cls?.year}`);
    console.log(`- config found: ${!!config}, targetYear: ${cls?.year}`);
    if (config) {
        console.log(`- slotIndex: ${e.slotIndex}, slot found: ${!!startSlot}`);
        if (startSlot) {
            console.log(`- start: ${startSlot.start}, end: ${startSlot.end}`);
        }
    }

    process.exit(0);
}

debug();
