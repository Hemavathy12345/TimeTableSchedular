import mongoose from 'mongoose';
import connectDB from './db.js';

async function listCollections() {
    await connectDB();
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("Collections in database:");
    for (let c of collections) {
        const count = await mongoose.connection.db.collection(c.name).countDocuments();
        console.log(`- ${c.name}: ${count} docs`);
    }
    process.exit(0);
}

listCollections();
