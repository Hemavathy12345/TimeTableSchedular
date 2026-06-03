import mongoose from 'mongoose';

async function run() {
    await mongoose.connect('mongodb://localhost:27017/timetable_db');
    console.log("Connected to MongoDB.");

    const mappings = await mongoose.connection.collection('facultysubjectmappings').find().toArray();
    console.log("Number of mappings:", mappings.length);
    console.log("Keys in first mapping:", Object.keys(mappings[0] || {}));
    
    // Find all mappings that are for a lab subject
    const subjects = await mongoose.connection.collection('subjects').find({ type: 'lab' }).toArray();
    const labSubjectIds = new Set(subjects.map(s => s.id));

    const labMappings = mappings.filter(m => labSubjectIds.has(m.subjectId));
    console.log(`Found ${labMappings.length} lab mappings. Details of first 5:`);
    labMappings.slice(0, 5).forEach(m => {
        const sub = subjects.find(s => s.id === m.subjectId);
        console.log(`Mapping ID: ${m.id}, Subject: ${sub ? sub.name : m.subjectId}, Keys: ${Object.keys(m)}`);
        // print extra keys
        const extras = {};
        for (const k in m) {
            if (!['_id', 'id', 'facultyId', 'subjectId', 'classId', 'labFaculty2Id', 'createdAt', 'updatedAt', '__v'].includes(k)) {
                extras[k] = m[k];
            }
        }
        if (Object.keys(extras).length > 0) {
            console.log("  Extras:", extras);
        }
    });

    await mongoose.disconnect();
}

run().catch(console.error);
