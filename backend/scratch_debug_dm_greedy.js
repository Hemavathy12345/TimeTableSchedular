import mongoose from 'mongoose';
import connectDB from './db.js';
import { Class, FacultySubjectMapping, Subject, Faculty, Room, TimeSlotConfig, Coe } from './models/index.js';

// Replicate helper functions and placeTask
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
function occupyTime(reg, day, id, start, end, subjectId) {
    if (!reg[day]) reg[day] = {};
    if (!reg[day][id]) reg[day][id] = [];
    reg[day][id].push({ s: start, e: end, subId: subjectId });
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
        // Fallback to any other free lab room
        return rooms.find(r => r.type === roomType && freeForBlock(r.id)) || null;
    }

    if (cls.defaultRoomId) {
        const defRoom = rooms.find(r => r.id === cls.defaultRoomId);
        if (defRoom && defRoom.type === roomType && freeForBlock(defRoom.id)) return defRoom;
    }

    return rooms.find(r => r.type === roomType && freeForBlock(r.id)) || null;
}

function makeEntry(opts) {
    return {
        classId:        opts.classId,
        subjectId:      opts.subjectId,
        facultyId:      opts.facultyId,
        labFaculty2Id:  opts.labFaculty2Id || null,
        labFaculty3Id:  opts.labFaculty3Id || null,
        roomId:         opts.roomId,
        day:            opts.day,
        slotIndex:      opts.slotIndex,
        duration:       opts.duration,
        isLab:          opts.subjectType === 'lab',
        isCOE:          false,
        isFixed:        opts.isFixed || false,
        isExtra:        opts.isExtra || false,
        isActivity:     opts.subjectType === 'activity',
        schedulingNote: opts.schedulingNote || ''
    };
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

    const subjectById  = {};
    const classById    = {};
    const configByYear = {};
    for (const s of subjects)       subjectById[s.id]            = s;
    for (const c of allClasses)        classById[c.id]              = c;
    for (const cfg of timeSlotConfigs) configByYear[Number(cfg.year)] = cfg;

    const getSlotConfig = (year) => configByYear[Number(year)] || timeSlotConfigs[0] || null;
    const getClassSlots = (year) => {
        const cfg = getSlotConfig(year);
        return cfg ? getClassTypeSlots(cfg) : [];
    };

    const mappings = allMappings.map(m => {
        const cls = classById[m.classId];
        const subject = subjectById[m.subjectId];
        const name = subject?.name?.toLowerCase();
        if (name === 'library' || name === 'tutor ward meeting') {
            const candidates = [cls?.advisorId, cls?.tutor1Id, cls?.tutor2Id].filter(Boolean);
            return {
                ...m,
                facultyId: cls?.advisorId || m.facultyId,
                facultyCandidates: candidates
            };
        }
        return m;
    });

    const entries   = [];
    const conflicts = [];
    const maps      = { faculty: {}, room: {}, class: {} };

    // Run Phase 0 (COE) and Phase 1 (defaultClasses, though here it's empty)
    for (const coe of (coeEntries || [])) {
        const yearClasses = allClasses.filter(c => Number(c.year) === Number(coe.year));
        if (yearClasses.length === 0) continue;
        const config   = getSlotConfig(coe.year);
        if (!config)   continue;
        const rawSlots = getRawSlots(config);
        const duration = coe.endSlotIndex - coe.startSlotIndex + 1;
        for (const cls of yearClasses) {
            for (let i = coe.startSlotIndex; i <= coe.endSlotIndex; i++) {
                occupy(maps.class, slotKey(coe.day, i), cls.id);
            }
            entries.push({
                classId:        cls.id,
                subjectId:      null,
                facultyId:      null,
                labFaculty2Id:  null,
                labFaculty3Id:  null,
                roomId:         null,
                day:            coe.day,
                slotIndex:      coe.startSlotIndex,
                duration,
                isLab:          false,
                isCOE:          true,
                isFixed:        true,
                isExtra:        false,
                isActivity:     false,
                coeLabel:       coe.label || 'COE'
            });
        }
    }

    // Build task list
    const tasks = [];
    for (const mapping of mappings) {
        const subject = subjectById[mapping.subjectId];
        const cls     = classById[mapping.classId];
        if (!subject || !cls) continue;
        const remaining = periodsPerWeek(subject);
        let baseDur = subject.duration || 1;
        if (subject.type === 'Non-Academic' && periodsPerWeek(subject) === 2) {
            baseDur = 2;
        }
        const sessions  = Math.ceil(remaining / baseDur);
        for (let i = 0; i < sessions; i++) {
            const dur = (i === sessions - 1 && remaining % baseDur !== 0) ? (remaining % baseDur) : baseDur;
            tasks.push({ mapping, subject: { ...subject, duration: dur }, cls });
        }
    }

    // Sort tasks
    tasks.sort((a, b) => {
        const pd = (a.subject.type === 'lab' || a.subject.type === 'project' ? 1 : 2) - (b.subject.type === 'lab' || b.subject.type === 'project' ? 1 : 2);
        if (pd !== 0) return pd;
        return periodsPerWeek(b.subject) - periodsPerWeek(a.subject);
    });

    const isBlockTask = (t) => t.subject.type === 'lab' || t.subject.type === 'project' || (t.subject.duration && t.subject.duration >= 2);
    const blockTasks = tasks.filter(isBlockTask);
    const theoryTasks = tasks.filter(t => !isBlockTask(t));

    // Place blocks first
    for (const task of blockTasks) {
        placeTask(task, false);
    }

    // Now trace theory placement for II CSE D DM
    console.log("\nStarting greedy theory placement...");
    for (const task of theoryTasks) {
        const isDM = task.subject.id === 'sub-259fcf05' && task.cls.name === 'II CSE D';
        if (isDM) {
            console.log(`\nAttempting to place DM task (required duration ${task.subject.duration})`);
        }
        const success = placeTask(task, false, isDM);
        if (isDM) {
            console.log(`Placement result: ${success ? 'SUCCESS' : 'FAILED'}`);
        }
    }

    function placeTask(task, relaxed, log = false) {
        const { mapping, subject, cls } = task;
        const config = getSlotConfig(cls.year);
        if (!config) return false;

        const duration   = subject.duration || 1;
        const rawSlots   = getRawSlots(config);
        const classSlots = getClassSlots(cls.year);
        const days       = config.days;

        const isTheoryLike = ['theory', 'elective', 'Non-Academic'].includes(subject.type);
        const isBlock      = subject.type === 'lab' || subject.type === 'project' || (subject.duration && subject.duration >= 2);
        const isLabOrProject = subject.type === 'lab' || subject.type === 'project';

        // Helper: day counts for subject
        const dayCount = {};
        for (const e of entries) {
            if (e.classId === cls.id && e.subjectId === subject.id) {
                dayCount[e.day] = (dayCount[e.day] || 0) + (e.duration || 1);
            }
        }

        const sortedDays = days.slice().sort((a, b) => {
            const loadA = entries.filter(e => e.classId === cls.id && e.day === a).length;
            const loadB = entries.filter(e => e.classId === cls.id && e.day === b).length;
            return loadA - loadB;
        });

        const buildCandidateStarts = () => {
            const firstClassSlotIndex = classSlots.length > 0 ? Math.min(...classSlots.map(s => s.index)) : -1;
            const valid = [];
            for (const slot of classSlots) {
                const i = slot.index;
                if (i + duration > rawSlots.length) continue;
                if ((isLabOrProject || subject.type === 'Non-Academic') && i === firstClassSlotIndex) continue;
                let allClass = true;
                for (let d = 0; d < duration; d++) {
                    const st = rawSlots[i + d]?.type;
                    if (st !== 'class') { allClass = false; break; }
                }
                if (allClass) valid.push(i);
            }
            const slotLoad = {};
            for (const v of valid) {
                slotLoad[v] = entries.filter(e => e.classId === cls.id && e.slotIndex === v).length;
            }
            return valid.sort((a, b) => {
                const ld = (slotLoad[a] || 0) - (slotLoad[b] || 0);
                return ld !== 0 ? ld : a - b;
            });
        };

        const candidateStarts = buildCandidateStarts();
        if (log) {
            console.log(`  Sorted days to check: ${JSON.stringify(sortedDays)}`);
            console.log(`  Candidate start slots: ${JSON.stringify(candidateStarts)}`);
            console.log(`  Current day counts: ${JSON.stringify(dayCount)}`);
        }

        for (const day of sortedDays) {
            if (subject.type === 'lab' && day === 'Saturday') continue;
            if (!relaxed && isTheoryLike && (dayCount[day] || 0) >= 2) {
                if (log) console.log(`  Skipping ${day} because dayCount is already ${dayCount[day]} (limit 2)`);
                continue;
            }

            for (const start of candidateStarts) {
                let clear = true;
                const startTimeStr = rawSlots[start]?.start;
                const endTimeStr   = rawSlots[start + duration - 1]?.end;
                const startM = timeStrMins(startTimeStr);
                const endM   = timeStrMins(endTimeStr);

                for (let i = 0; i < duration && clear; i++) {
                    const k = slotKey(day, start + i);
                    if (isOccupied(maps.class, k, cls.id)) {
                        if (log) console.log(`  Slot occupied on ${day} at index ${start + i} for class`);
                        clear = false;
                    }
                }
                if (!clear) continue;

                let chosenFacultyId = mapping.facultyId;
                if (startM > 0) {
                    if (mapping.facultyCandidates && mapping.facultyCandidates.length > 0) {
                        let foundFac = null;
                        for (const facId of mapping.facultyCandidates) {
                            const overlap = checkTimeOverlap(maps.faculty, day, facId, startM, endM);
                            const consecutive = checkFacultyConsecutiveViolation(maps.faculty, day, facId, startM, endM, mapping.subjectId);
                            if (!overlap && !consecutive) { foundFac = facId; break; }
                        }
                        if (foundFac) { chosenFacultyId = foundFac; } else {
                            if (log) console.log(`  No candidate faculty available on ${day} start index ${start}`);
                            clear = false;
                        }
                    } else {
                        const overlap = checkTimeOverlap(maps.faculty, day, mapping.facultyId, startM, endM);
                        const consecutive = checkFacultyConsecutiveViolation(maps.faculty, day, mapping.facultyId, startM, endM, mapping.subjectId);
                        if (overlap) {
                            if (log) console.log(`  Faculty ${mapping.facultyId} has overlap on ${day} slot start ${start}`);
                            clear = false;
                        }
                        if (clear && consecutive) {
                            if (log) console.log(`  Faculty ${mapping.facultyId} has consecutive violation on ${day} slot start ${start}`);
                            clear = false;
                        }
                    }
                }
                if (!clear) continue;

                const room = findRoom(rooms, subject, day, start, maps.room, cls, duration, config);
                if (!room) {
                    if (log) console.log(`  No room available on ${day} slot start ${start}`);
                    continue;
                }

                if (log) console.log(`  Placing DM on ${day} Slot ${start}`);
                entries.push(makeEntry({
                    classId:        cls.id,
                    subjectId:      subject.id,
                    facultyId:      chosenFacultyId,
                    roomId:         room.id,
                    day,
                    slotIndex:      start,
                    duration,
                    subjectType:    subject.type,
                    isFixed:        false
                }));
                occupyBlock(maps, day, start, duration, {
                    facultyId: chosenFacultyId, roomId: room.id, classId: cls.id, subjectId: mapping.subjectId
                }, config);
                return true;
            }
        }
        return false;
    }

    await mongoose.disconnect();
}
run();
