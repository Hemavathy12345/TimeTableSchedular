import mongoose from 'mongoose';

const timetableEntrySchema = new mongoose.Schema({
    classId: String,
    subjectId: { type: String, default: null },
    facultyId: { type: String, default: null },
    labFaculty2Id: { type: String, default: null },
    labFaculty3Id: { type: String, default: null },
    roomId: { type: String, default: null },
    day: String,
    slotIndex: Number,
    duration: { type: Number, default: 1 },
    isLab: { type: Boolean, default: false },
    isFixed: { type: Boolean, default: false },
    isExtra: { type: Boolean, default: false },
    isActivity: { type: Boolean, default: false },
    isCOE: { type: Boolean, default: false },
    coeLabel: { type: String, default: null },
    activityLabel: { type: String, default: null },
    schedulingNote: { type: String, default: null }
}, { _id: false });

const conflictSchema = new mongoose.Schema({
    type: String,
    message: String,
    classId: { type: String, default: null },
    className: { type: String, default: null },
    subjectId: { type: String, default: null },
    subjectName: { type: String, default: null },
    reason: { type: String, default: null }
}, { _id: false });

const timetableSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    generatedAt: { type: String },
    isPublished: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false },
    departmentId: { type: String, default: null },
    entries: [timetableEntrySchema],
    conflicts: [conflictSchema]
}, { timestamps: true });

export default mongoose.model('Timetable', timetableSchema);
