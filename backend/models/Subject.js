import mongoose from 'mongoose';

const subjectSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    type: { type: String, enum: ['theory', 'lab', 'project', 'elective'], required: true },
    credits: { type: Number, default: 0 },
    weeklyFrequency: { type: Number, default: 1 },
    year: { type: Number, default: 1 },
    departmentId: { type: String, default: null },
    duration: { type: Number, default: 1 }
}, { timestamps: true });

export default mongoose.model('Subject', subjectSchema);
