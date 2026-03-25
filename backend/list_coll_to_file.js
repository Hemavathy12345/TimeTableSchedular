import mongoose from 'mongoose';
import connectDB from './db.js';
import fs from 'fs';

async function listCollections() {
    await connectDB();
    const collections = await mongoose.connection.db.listCollections().toArray();
    let out = "COLLECTIONS_LIST:\n";
    for (let c of collections) {
        const count = await mongoose.connection.db.collection(c.name).countDocuments();
        out += `- ${c.name}: ${count}\n`;
    }
    fs.writeFileSync('db_collections.txt', out);
    console.log("Wrote to db_collections.txt");
    process.exit(0);
}

listCollections();
