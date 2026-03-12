import mongoose from 'mongoose';

const slotSchema = new mongoose.Schema({
    start: { type: String, required: true },
    end: { type: String, required: true },
    type: { type: String, enum: ['class', 'break', 'lunch', 'activity'], required: true }
}, { _id: false });

const timeSlotConfigSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    year: { type: Number, required: true },
    days: [{ type: String }],
    slots: [slotSchema]
}, { timestamps: true });

export default mongoose.model('TimeSlotConfig', timeSlotConfigSchema);
