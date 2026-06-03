import mongoose from 'mongoose';
mongoose.connect('mongodb://localhost:27017/timetable_db').then(async () => {
    const cls = await mongoose.connection.collection('classes').findOne({ name: 'III CSE C' });
    if (!cls) { console.log('Class not found'); process.exit(); }
    const subs = await mongoose.connection.collection('subjects').find({
        year: cls.year,
        $or: [{ departmentId: null }, { departmentId: cls.departmentId }],
        type: { $in: ['theory', 'lab', 'project', 'elective', 'Non-Academic'] }
    }).toArray();
    console.log('Class:', cls.name, cls.year, cls.departmentId);
    console.log('Subjects count:', subs.length);
    console.log('Subjects:', subs.map(s => s.name + ' - ' + s.type));
    process.exit();
});
