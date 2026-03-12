import { generateTimetable } from './engine/scheduler.js';

const mockData = {
    classes: [{ id: 'cls-1', name: 'Test Class', year: 1 }],
    subjects: [
        { id: 's1', name: 'S1', type: 'theory', weeklyFrequency: 3, credits: 3 },
        { id: 's2', name: 'S2', type: 'theory', weeklyFrequency: 3, credits: 3 },
        { id: 's3', name: 'S3', type: 'lab', weeklyFrequency: 4, credits: 2, duration: 2 }
    ],
    faculty: [{ id: 'f1', name: 'F1' }],
    rooms: [{ id: 'r1', name: 'R1', type: 'theory' }, { id: 'r2', name: 'R2', type: 'lab' }],
    timeSlotConfigs: [{
        year: 1,
        days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        slots: [
            {"start":"08:40","end":"09:35","type":"class"},
            {"start":"09:35","end":"10:25","type":"class"},
            {"start":"10:25","end":"10:45","type":"break"},
            {"start":"10:45","end":"11:35","type":"class"},
            {"start":"11:35","end":"12:35","type":"class"},
            {"start":"12:35","end":"13:10","type":"lunch"},
            {"start":"13:10","end":"13:40","type":"activity"},
            {"start":"13:40","end":"14:30","type":"class"},
            {"start":"14:30","end":"15:20","type":"class"},
            {"start":"15:20","end":"16:10","type":"class"}
        ]
    }],
    defaultClasses: [],
    facultySubjectMapping: [
        { subjectId: 's1', facultyId: 'f1', classId: 'cls-1' },
        { subjectId: 's2', facultyId: 'f1', classId: 'cls-1' },
        { subjectId: 's3', facultyId: 'f1', classId: 'cls-1' }
    ]
};

console.log('--- REPRO MOCK TEST ---');
const result = generateTimetable(mockData);
console.log(`\nSummary:`);
console.log(`Generated Entries: ${result.entries.length}`);
console.log(`Conflicts: ${result.conflicts.length}`);
result.conflicts.forEach(c => console.log(`- ${c.reason}`));

console.log('\nEntries:');
result.entries.forEach(e => {
    console.log(`- ${e.day} Slot ${e.slotIndex}: ${e.activityLabel || e.subjectId}`);
});

process.exit();
