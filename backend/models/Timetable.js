import mongoose from 'mongoose';

const timetableEntrySchema = new mongoose.Schema({
    classId: String,
    subjectId: String,
    facultyId: String,
    labFaculty2Id: { type: String, default: null },
    roomId: String,
    day: String,
    slotIndex: Number,
    duration: { type: Number, default: 1 }
}, { _id: false });

const conflictSchema = new mongoose.Schema({
    type: String,
    message: String,
    classId: { type: String, default: null },
    subjectId: { type: String, default: null }
}, { _id: false });

const timetableSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    generatedAt: { type: String },
    entries: [timetableEntrySchema],
    conflicts: [conflictSchema]
}, { timestamps: true });

export default mongoose.model('Timetable', timetableSchema);
