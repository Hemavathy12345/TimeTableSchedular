import mongoose from 'mongoose';

const facultySubjectMappingSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    facultyId: { type: String, required: true },
    subjectId: { type: String, required: true },
    classId: { type: String, required: true },
    labFaculty2Id: { type: String, default: null },
    labFaculty3Id: { type: String, default: null },
    assignedLabId: { type: String, default: null }  // per-section lab room override
}, { timestamps: true });

export default mongoose.model('FacultySubjectMapping', facultySubjectMappingSchema);
