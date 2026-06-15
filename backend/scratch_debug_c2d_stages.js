import mongoose from 'mongoose';
import connectDB from './db.js';
import { Class, FacultySubjectMapping, Subject, Faculty, Room, TimeSlotConfig, Coe } from './models/index.js';
import { generateTimetable } from './engine/scheduler.js';

async function run() {
    await connectDB();
    
    const allClasses = await Class.find().lean();
    const allMappings = await FacultySubjectMapping.find().lean();
    const subjects = await Subject.find().lean();
    const faculty = await Faculty.find().lean();
    const rooms = await Room.find().lean();
    const timeSlotConfigs = await TimeSlotConfig.find().lean();
    const coeEntries = await Coe.find().lean();

    // Let's modify the generateTimetable call to add logs for II CSE D DM
    // Wait, since we can't easily modify the console logs of generateTimetable, we can just run it.
    // Wait, let's look at why Saturday Slot 5 wasn't chosen.
    // Let's check: is there a consecutive violation or overlap?
    // Dr. Revathi has Saturday Slot 4 busy in II CSE C.
    // So on Saturday:
    // Slot 0: II CSE D (DM)
    // Slot 1: II CSE D (DM)
    // Slot 4: II CSE C (DM)
    // If we place DM for II CSE D at Slot 5:
    // Then Dr. Revathi will be teaching:
    // Slot 4 (II CSE C) and Slot 5 (II CSE D).
    // These are consecutive slots (Slot 4 and Slot 5).
    // And since she is teaching the same subject (Discrete Mathematics), it is NOT a consecutive violation.
    // But wait! Is there a consecutive violation check on the CLASS side?
    // No, classes don't have consecutive teaching violations.
    // Let's check the room!
    // What room is assigned for II CSE D Saturday Slot 5?
    // If DM is placed at Saturday Slot 5, it needs a classroom.
    // Is the classroom free?
    // Let's check which classroom is assigned to II CSE D.
    // II CSE D's defaultRoomId is room-f657adc4.
    // Let's check if room-f657adc4 is free at Saturday Slot 5!
    // Wait, on Saturday:
    // Slot 0: DM (Room: room-f657adc4)
    // Slot 1: DM (Room: room-f657adc4)
    // Slot 2: Softskills (Room: room-f657adc4)
    // Slot 4: DBMS (Room: room-f657adc4)
    // Slot 5: DAA (Room: room-f657adc4)
    // Slot 8, 9: Java Project (Room: room-f657adc4)
    // So indeed, room-f657adc4 is occupied by DAA at Slot 5, and by DBMS at Slot 4.
    // But DBMS and DAA are scheduled in Stage 2 (Gap Filling)!
    // At Stage 1, before Stage 2 runs, Saturday Slot 5 is free!
    // So why didn't Stage 1 place DM at Saturday Slot 5?
    // Let's print out what happens during Stage 1 for II CSE D and DM.
    
    await mongoose.disconnect();
}
run();
