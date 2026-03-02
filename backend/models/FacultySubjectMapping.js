import mongoose from 'mongoose';

const facultySubjectMappingSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    facultyId: { type: String, required: true },
    subjectId: { type: String, required: true },
    classId: { type: String, required: true },
    labFaculty2Id: { type: String, default: null }
}, { timestamps: true });

export default mongoose.model('FacultySubjectMapping', facultySubjectMappingSchema);
