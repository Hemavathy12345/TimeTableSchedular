import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/timetable').then(async () => {
    const subjects = mongoose.connection.collection('subjects');
    const types = await subjects.distinct('type');
    const softSkills = await subjects.find({ name: /soft/i }).toArray();
    console.log("Distinct types:", types);
    console.log("Soft skill subjects:", softSkills);
    process.exit(0);
});
