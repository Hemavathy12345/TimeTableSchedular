import mongoose from 'mongoose';

const facultySchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    departmentId: { type: String, required: true },
    email: { type: String, default: '' },
    designation: { type: String, default: '' }
}, { timestamps: true });

export default mongoose.model('Faculty', facultySchema);
