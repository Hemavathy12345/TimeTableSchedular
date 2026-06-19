import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'department_user', 'faculty', 'student'], default: 'student' },
    departmentId: { type: String, default: null }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
