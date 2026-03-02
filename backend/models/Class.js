import mongoose from 'mongoose';

const classSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    year: { type: Number, required: true },
    section: { type: String, required: true },
    departmentId: { type: String, default: null }
}, { timestamps: true });

export default mongoose.model('Class', classSchema);
