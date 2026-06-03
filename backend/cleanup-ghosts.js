import mongoose from 'mongoose';
mongoose.connect('mongodb://localhost:27017/timetable_db').then(async () => {
    const db = mongoose.connection.collection('facultysubjectmappings');
    const maps = await db.find().toArray();
    const subs = await mongoose.connection.collection('subjects').find().toArray();
    const classes = await mongoose.connection.collection('classes').find().toArray();
    let ghosts = [];
    maps.forEach(m => {
        const s = subs.find(sub => sub.id === m.subjectId);
        const c = classes.find(cls => cls.id === m.classId);
        if(s && c && Number(s.year) !== Number(c.year)) {
            ghosts.push(m._id);
        }
    });
    console.log('Ghosts identified:', ghosts.length);
    if(ghosts.length > 0) {
        await db.deleteMany({ _id: { $in: ghosts } });
        console.log('Deleted successfully.');
    }
    process.exit(0);
});
