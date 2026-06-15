import mongoose from 'mongoose';
import connectDB from './db.js';

async function run() {
    await connectDB();
    const mappings = await mongoose.connection.collection('facultysubjectmappings').find().toArray();
    const subjects = await mongoose.connection.collection('subjects').find().toArray();
    const classes = await mongoose.connection.collection('classes').find().toArray();
    console.log("Mappings total:", mappings.length);
    
    // Find all distinct subjectIds in mappings
    const distinctSubIdsInMappings = [...new Set(mappings.map(m => m.subjectId))];
    console.log("Distinct subjectIds in mappings:", distinctSubIdsInMappings.length);
    
    const missing = distinctSubIdsInMappings.filter(id => !subjects.some(s => s.id === id));
    console.log("Distinct missing subjectIds:", missing.length);
    console.log("Missing subjectIds:", missing);

    // Let's print classes that have missing subject mappings
    const classesWithMissing = {};
    for (const m of mappings) {
        if (!subjects.some(s => s.id === m.subjectId)) {
            const cls = classes.find(c => c.id === m.classId);
            const className = cls ? cls.name : m.classId;
            classesWithMissing[className] = (classesWithMissing[className] || 0) + 1;
        }
    }
    console.log("Classes with missing subject mappings:", classesWithMissing);
    
    await mongoose.disconnect();
}
run();
