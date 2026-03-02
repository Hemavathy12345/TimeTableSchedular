import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['classroom', 'lab'], required: true },
    capacity: { type: Number, default: 60 },
    departmentId: { type: String, default: null }
}, { timestamps: true });

export default mongoose.model('Room', roomSchema);
