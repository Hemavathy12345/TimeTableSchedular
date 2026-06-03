import mongoose from 'mongoose';
mongoose.connect('mongodb://localhost:27017/timetable_db').then(async () => {
    const classes = await mongoose.connection.collection('classes').find().toArray();
    const subjects = await mongoose.connection.collection('subjects').find().toArray();
    const mappings = await mongoose.connection.collection('mappings').find().toArray();

    const classMappings = {};
    const initialMappings = {};

    mappings.forEach(mapping => {
        if (!initialMappings[mapping.classId]) initialMappings[mapping.classId] = {};
        initialMappings[mapping.classId][mapping.subjectId] = {
            facultyId: mapping.facultyId,
            labFaculty2Id: mapping.labFaculty2Id || ''
        };
    });

    classes.forEach(cls => {
        if (!initialMappings[cls.id]) initialMappings[cls.id] = {};
        subjects.forEach(sub => {
            const subName = sub.name.toLowerCase();
            if (cls.advisorId && (subName === 'library' || subName === 'tutor ward meeting')) {
                if (!initialMappings[cls.id][sub.id]?.facultyId) {
                    initialMappings[cls.id][sub.id] = {
                        facultyId: cls.advisorId,
                        labFaculty2Id: ''
                    };
                }
            }
        });
    });

    Object.assign(classMappings, initialMappings);

    for (const cls of classes) {
        if (cls.name === 'III CSE C' || cls.name === 'III CSE B') {
            const REQUIRED_TYPES = ['theory', 'lab', 'project', 'elective', 'Non-Academic'];
            const clsSubjects = subjects.filter(s =>
                Number(s.year) === Number(cls.year) &&
                (!s.departmentId || s.departmentId === cls.departmentId) &&
                REQUIRED_TYPES.includes(s.type)
            );
            const mappedCount = clsSubjects.filter(s => classMappings[cls.id]?.[s.id]?.facultyId).length;
            const isComplete = clsSubjects.length > 0 && mappedCount === clsSubjects.length;

            console.log(`Class: ${cls.name}`);
            console.log(`Total required subjects: ${clsSubjects.length}`);
            console.log(`Mapped count: ${mappedCount}`);
            console.log(`Is Complete: ${isComplete}`);
        }
    }
    process.exit();
});
