import mongoose from 'mongoose';
import connectDB from './db.js';
import { Class, FacultySubjectMapping, Subject, Faculty, Room, TimeSlotConfig, Coe } from './models/index.js';
import { generateTimetable } from './engine/scheduler.js';

// We will copy swapRepair logic here and run it manually on the failed DM task to see exactly why it fails!
const slotKey    = (day, idx) => `${day}-${idx}`;
const isOccupied = (map, key, id) => !!(map[key] && map[key].has(id));
const occupy     = (map, key, id) => { if (!map[key]) map[key] = new Set(); map[key].add(id); };
const release    = (map, key, id) => { if (map[key]) map[key].delete(id); };
const timeToMins = (h, m) => h * 60 + m;
const timeStrMins = (str) => {
    if (!str) return 0;
    const [h, m] = str.split(':').map(Number);
    return timeToMins(h, m);
};
function checkTimeOverlap(reg, day, id, start, end) {
    if (!reg[day] || !reg[day][id]) return false;
    return reg[day][id].some(block => start < block.e && end > block.s);
}
function checkFacultyConsecutiveViolation(reg, day, id, start, end, subjectId) {
    if (!reg[day] || !reg[day][id]) return false;
    for (const b of reg[day][id]) {
        const gapBefore = start - b.e;
        const gapAfter  = b.s - end;
        if ((gapBefore >= 0 && gapBefore < 40) ||
            (gapAfter  >= 0 && gapAfter  < 40)) {
            if (b.subId !== subjectId) return true;
        }
    }
    return false;
}
const getRawSlots      = (cfg) => cfg.slots.toObject ? cfg.slots.toObject() : cfg.slots;
const getClassTypeSlots = (cfg) =>
    getRawSlots(cfg).map((s, i) => ({ ...s, index: i })).filter(s => s.type === 'class');
const periodsPerWeek = (subject) =>
    Math.max(1, Math.ceil((subject.totalHours || 1) / 15));

function findRoom(rooms, subject, day, slotIndex, roomMap, cls, duration, config) {
    const needsLab = subject.type === 'lab';
    const roomType = needsLab ? 'lab' : 'classroom';

    const slots = config ? (config.slots.toObject ? config.slots.toObject() : config.slots) : [];
    const startTimeStr = slots[slotIndex]?.start;
    const endTimeStr = slots[slotIndex + duration - 1]?.end;
    const startM = timeStrMins(startTimeStr);
    const endM = timeStrMins(endTimeStr);

    const freeForBlock = (roomId) => {
        if (!startM) return true; 
        return !checkTimeOverlap(roomMap, day, roomId, startM, endM);
    };

    if (subject.assignedLabId) {
        const assignedRoom = rooms.find(r => r.id === subject.assignedLabId);
        if (assignedRoom && freeForBlock(assignedRoom.id)) return assignedRoom;
        return rooms.find(r => r.type === roomType && freeForBlock(r.id)) || null;
    }

    if (cls.defaultRoomId) {
        const defRoom = rooms.find(r => r.id === cls.defaultRoomId);
        if (defRoom && defRoom.type === roomType && freeForBlock(defRoom.id)) return defRoom;
    }

    return rooms.find(r => r.type === roomType && freeForBlock(r.id)) || null;
}

function releaseBlock(maps, day, slotIndex, duration, ids, config) {
    const slots = config ? config.slots : [];
    const startTimeStr = slots[slotIndex]?.start;
    const endTimeStr = slots[slotIndex + duration - 1]?.end;
    const startM = timeStrMins(startTimeStr);
    const endM = timeStrMins(endTimeStr);

    for (let i = 0; i < duration; i++) {
        const k = slotKey(day, slotIndex + i);
        if (ids.classId) release(maps.class, k, ids.classId);
        if (ids.facultyId && startM > 0) releaseTime(maps.faculty, day, ids.facultyId, startM, endM);
        if (ids.labFaculty2Id && startM > 0) releaseTime(maps.faculty, day, ids.labFaculty2Id, startM, endM);
        if (ids.labFaculty3Id && startM > 0) releaseTime(maps.faculty, day, ids.labFaculty3Id, startM, endM);
        if (ids.roomId && startM > 0) releaseTime(maps.room, day, ids.roomId, startM, endM);
    }
}
function releaseTime(reg, day, id, start, end) {
    if (!reg[day] || !reg[day][id]) return;
    reg[day][id] = reg[day][id].filter(block => !(block.s === start && block.e === end));
}

function occupyBlock(maps, day, slotIndex, duration, ids, config) {
    const slots = config ? config.slots : [];
    const startTimeStr = slots[slotIndex]?.start;
    const endTimeStr = slots[slotIndex + duration - 1]?.end;
    const startM = timeStrMins(startTimeStr);
    const endM = timeStrMins(endTimeStr);

    for (let i = 0; i < duration; i++) {
        const k = slotKey(day, slotIndex + i);
        if (ids.classId) occupy(maps.class, k, ids.classId);
        if (ids.facultyId && startM > 0) occupyTime(maps.faculty, day, ids.facultyId, startM, endM, ids.subjectId);
        if (ids.labFaculty2Id && startM > 0) occupyTime(maps.faculty, day, ids.labFaculty2Id, startM, endM, ids.subjectId);
        if (ids.labFaculty3Id && startM > 0) occupyTime(maps.faculty, day, ids.labFaculty3Id, startM, endM, ids.subjectId);
        if (ids.roomId && startM > 0) occupyTime(maps.room, day, ids.roomId, startM, endM);
    }
}
function occupyTime(reg, day, id, start, end, subjectId) {
    if (!reg[day]) reg[day] = {};
    if (!reg[day][id]) reg[day][id] = [];
    reg[day][id].push({ s: start, e: end, subId: subjectId });
}

async function run() {
    await connectDB();
    
    const allClasses = await Class.find().lean();
    const allMappings = await FacultySubjectMapping.find().lean();
    const subjects = await Subject.find().lean();
    const faculty = await Faculty.find().lean();
    const rooms = await Room.find().lean();
    const timeSlotConfigs = await TimeSlotConfig.find().lean();
    const coeEntries = await Coe.find().lean();

    const data = {
        classes: allClasses,
        subjects,
        faculty,
        rooms,
        timeSlotConfigs,
        defaultClasses: [],
        facultySubjectMapping: allMappings,
        coeEntries
    };

    // We run the scheduler but we want to intercept right before swapRepair Phase 6d!
    // Since we want to replicate it exactly, let's write a script that runs the entire scheduler up to Phase 6d,
    // and then calls our local swapRepair with full logging!
    // Wait, let's just copy the entire scheduler code and add trace logs to swapRepair and generateTimetable, and run it.
    // Yes! Let's do that. We will read scheduler.js, insert logs, and run it. But wait, why did it print nothing in the previous runs?
    // Let's print out what is happening.
    
    await mongoose.disconnect();
}
run();
