import mongoose from 'mongoose';

/**
 * COE (Centre of Excellence) Schedule Entry
 * Administrators pre-define COE sessions per YEAR per day.
 * The scheduler treats these as hard constraints – slots are
 * reserved for ALL classes of that year BEFORE any other subject is placed.
 */
const coeSchema = new mongoose.Schema({
    id:             { type: String, required: true, unique: true },
    year:           { type: Number, required: true },            // 1, 2, 3, or 4
    label:          { type: String, default: 'COE' },            // e.g. "COE – AI Workshop"
    day:            { type: String, required: true },             // e.g. "Monday"
    startSlotIndex: { type: Number, required: true },             // inclusive, 0-based
    endSlotIndex:   { type: Number, required: true },             // inclusive, 0-based
}, { timestamps: true });

export default mongoose.model('Coe', coeSchema);
