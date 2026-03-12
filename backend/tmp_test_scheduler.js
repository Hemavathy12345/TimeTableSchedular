import { generateTimetable } from './engine/scheduler.js';

// Setup Mock Data
const data = {
    classes: [
        { id: 'c1', name: 'CS-A', year: 1, section: 'A', departmentId: 'cs' }
    ],
    subjects: [
        { id: 's1', name: 'Software Eng', code: 'SE123', type: 'theory', duration: 1, weeklyFrequency: 3, departmentId: 'cs' },
        { id: 's2', name: 'Algorithms Lab', code: 'ALab12', type: 'lab', duration: 2, weeklyFrequency: 2, departmentId: 'cs' },
        { id: 's3', name: 'Database', code: 'DB123', type: 'theory', duration: 2, weeklyFrequency: 1, departmentId: 'cs' }, // duration 2 theory
    ],
    faculty: [
        { id: 'f1', name: 'Dr. Smith' },
        { id: 'f2', name: 'Prof. Jones' }
    ],
    rooms: [
        { id: 'r1', name: 'Room 101', type: 'classroom', departmentId: 'cs' },
        { id: 'r2', name: 'Lab 1', type: 'lab', departmentId: 'cs' }
    ],
    timeSlotConfigs: [
        {
            year: 1,
            days: ['Monday', 'Tuesday', 'Wednesday'],
            slots: [
                { type: 'class' },
                { type: 'class' },
                { type: 'break' },
                { type: 'class' },
                { type: 'class' }
            ]
        }
    ],
    facultySubjectMapping: [
        { id: 'm1', facultyId: 'f1', subjectId: 's1', classId: 'c1' },
        { id: 'm2', facultyId: 'f2', subjectId: 's2', classId: 'c1', labFaculty2Id: 'f1' },
        { id: 'm3', facultyId: 'f2', subjectId: 's3', classId: 'c1' },
    ],
    defaultClasses: []
};

console.log("Generating Timetable...");
const result = generateTimetable(data);

console.log(`Generated ${result.entries.length} entries.`);
console.dir(result.entries, { depth: null });

if (result.conflicts.length > 0) {
    console.log("Conflicts:", result.conflicts);
} else {
    console.log("No placement conflicts.");
}

import { checkConstraints } from './engine/scheduler.js';

console.log("\n--- Testing Constraints with Invalid Data ---");
const invalidEntries = [
    // Double booked Faculty (Constraint 1)
    { classId: 'c1', subjectId: 's1', facultyId: 'f1', roomId: 'r1', day: 'Monday', slotIndex: 0, isLab: false, isFixed: false },
    { classId: 'c2', subjectId: 's3', facultyId: 'f1', roomId: 'r2', day: 'Monday', slotIndex: 0, isLab: false, isFixed: false },

    // Double booked Class (Constraint 1)
    { classId: 'c3', subjectId: 's1', facultyId: 'f2', roomId: 'r1', day: 'Tuesday', slotIndex: 0, isLab: false, isFixed: false },
    { classId: 'c3', subjectId: 's2', facultyId: 'f3', roomId: 'r2', day: 'Tuesday', slotIndex: 0, isLab: false, isFixed: false },

    // Wrong Room Type (Constraint 3)
    { classId: 'c1', subjectId: 's2', facultyId: 'f2', roomId: 'r1', day: 'Wednesday', slotIndex: 1, isLab: true, isFixed: false }, // s2 is lab, r1 is classroom

    // Invalid Faculty Mapping (Constraint 4)
    { classId: 'c1', subjectId: 's1', facultyId: 'unqualified_faculty', roomId: 'r1', day: 'Wednesday', slotIndex: 2, isLab: false, isFixed: false }
];

const mockData = {
    subjects: [
        { id: 's1', type: 'theory', duration: 1, weeklyFrequency: 1 },
        { id: 's2', type: 'lab', duration: 2, weeklyFrequency: 1 },
        { id: 's3', type: 'theory', duration: 1, weeklyFrequency: 1 }
    ],
    rooms: [
        { id: 'r1', type: 'classroom' },
        { id: 'r2', type: 'lab' }
    ],
    facultySubjectMapping: [
        { id: 'm1', classId: 'c1', subjectId: 's1', facultyId: 'f1' },
        { id: 'm2', classId: 'c1', subjectId: 's2', facultyId: 'f2' }
        // s3 for c2 and s1 for c3 are unmapped intentionally or mapped correctly based on test
    ]
};

const violations = checkConstraints(invalidEntries, mockData);
import fs from 'fs';
fs.writeFileSync('test_out.txt', JSON.stringify({ entries: result.entries, conflicts: result.conflicts, violations }, null, 2), 'utf-8');
console.log("Violations written to test_out.txt");


