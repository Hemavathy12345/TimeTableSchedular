import mongoose from 'mongoose';

/**
 * COE (Centre of Excellence) Schedule Entry
 * Administrators pre-define COE sessions per YEAR per day.
 * The scheduler treats these as hard constraints – slots are
 * reserved for ALL classes of that year BEFORE any other subject is placed.
 * An optional coFacultyId can be assigned; that faculty's time will be
 * blocked during the COE slot so they cannot be double-booked.
 */
const coeSchema = new mongoose.Schema({
    id:             { type: String, required: true, unique: true },
    year:           { type: Number, required: true },            // 1, 2, 3, or 4
    label:          { type: String, default: 'COE' },            // e.g. "COE – AI Workshop"
    day:            { type: String, required: true },             // e.g. "Monday"
    startSlotIndex: { type: Number, required: true },             // inclusive, 0-based
    endSlotIndex:   { type: Number, required: true },             // inclusive, 0-based
    coFacultyId:    { type: String, default: null },              // optional faculty assigned to this COE block
    section:        { type: String, default: 'All' },             // 'All' or specific section (e.g. 'A') (for backward compatibility)
    sections:       { type: [String], default: ['All'] },         // list of sections (e.g. ['A', 'C'] or ['All'])
}, { timestamps: true });

export default mongoose.model('Coe', coeSchema);

