import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'faculty', 'student'], default: 'student' },
    departmentId: { type: String, default: null }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
