import mongoose from 'mongoose';

const timetableReservationSchema = new mongoose.Schema({
    day: { type: String, required: true },
    slot: { type: Number, required: true },
    faculty: { type: String, default: null },
    room: { type: String, default: null },
    lab: { type: String, default: null },
    department: { type: String, required: true },
    classId: { type: String, default: null },
    year: { type: Number, default: null }
}, { timestamps: true });

timetableReservationSchema.index({ day: 1, slot: 1 });

export default mongoose.model('TimetableReservation', timetableReservationSchema);
