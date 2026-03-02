import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    code: { type: String, required: true }
}, { timestamps: true });

export default mongoose.model('Department', departmentSchema);
