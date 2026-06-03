import mongoose from 'mongoose';
import connectDB from './db.js';
import { Class, FacultySubjectMapping, Subject, Faculty, Room, TimeSlotConfig, Coe } from './models/index.js';
import { buildAllocationSummary } from './engine/scheduler.js';

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

    console.log("---- RUNNING GENERATION WITH ROOM-DEMAND SORT (NO FALLBACK) ----");
    const res = generateTimetableCustom(data);
    const summ = buildAllocationSummary(res.entries, subjects, allMappings, allClasses);
    const deficits = summ.filter(s => s.remainingPeriods > 0);

    console.log(`Deficits count: ${deficits.length}`);
    for (const s of deficits) {
        console.log(`  Class: ${s.className}, Subject: ${s.courseTitle} (${s.subjectId}), Required: ${s.requiredPeriods}, Allocated: ${s.allocatedPeriods}`);
    }

    await mongoose.disconnect();
}

function generateTimetableCustom(data) {
    const { classes, subjects, rooms, timeSlotConfigs, defaultClasses, facultySubjectMapping, coeEntries } = data;

    const subjectById  = {};
    const classById    = {};
    const configByYear = {};
    for (const s of subjects)       subjectById[s.id]            = s;
    for (const c of classes)        classById[c.id]              = c;
    for (const cfg of timeSlotConfigs) configByYear[Number(cfg.year)] = cfg;

    const getSlotConfig = (year) => configByYear[Number(year)] || timeSlotConfigs[0] || null;
    const getClassSlots = (year) => {
        const cfg = getSlotConfig(year);
        return cfg ? cfg.slots.map((s, i) => ({ ...s, index: i })).filter(s => s.type === 'class') : [];
    };
    const mappings = facultySubjectMapping.map(m => {
        const cls = classById[m.classId];
        const subject = subjectById[m.subjectId];
        const name = subject?.name?.toLowerCase();
        if (cls?.advisorId && (name === 'library' || name === 'tutor ward meeting')) {
            return { ...m, facultyId: cls.advisorId };
        }
        return m;
    });

    const entries   = [];
    const conflicts = [];
    const maps      = { faculty: {}, room: {}, class: {} };

    // Helper functions
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
    function findRoom(rooms, subject, day, slotIndex, roomMap, cls, duration, config) {
        const needsLab = subject.type === 'lab';
        const slots = config ? config.slots : [];
        const startTimeStr = slots[slotIndex]?.start;
        const endTimeStr = slots[slotIndex + duration - 1]?.end;
        const startM = timeStrMins(startTimeStr);
        const endM = timeStrMins(endTimeStr);

        const freeForBlock = (roomId) => {
            if (!startM) return true;
            return !checkTimeOverlap(roomMap, day, roomId, startM, endM);
        };

        if (!needsLab) {
            if (cls && cls.defaultRoomId) {
                const def = rooms.find(r => r.id === cls.defaultRoomId);
                if (def && freeForBlock(def.id)) return def;
            }
            const deptRoom = rooms.find(r => r.type === 'classroom' && r.departmentId === subject.departmentId && freeForBlock(r.id));
            if (deptRoom) return deptRoom;
            return rooms.find(r => r.type === 'classroom' && freeForBlock(r.id)) || null;
        }

        // Hard constraint: assignedLabId only, NO fallback
        if (subject.assignedLabId) {
            const assignedRoom = rooms.find(r => r.id === subject.assignedLabId);
            if (assignedRoom && freeForBlock(assignedRoom.id)) return assignedRoom;
            return null;
        }

        return (
            rooms.find(r => r.type === 'lab' && r.departmentId === subject.departmentId && freeForBlock(r.id)) ||
            rooms.find(r => r.type === 'lab' && freeForBlock(r.id)) ||
            null
        );
    }
    function makeEntry({ classId, subjectId, facultyId, labFaculty2Id, labFaculty3Id, roomId,
                         day, slotIndex, duration, subjectType,
                         isFixed, isExtra, schedulingNote }) {
        return {
            classId, subjectId, facultyId, labFaculty2Id: labFaculty2Id || null, labFaculty3Id: labFaculty3Id || null,
            roomId: roomId || null, day, slotIndex, duration: duration || 1, isLab: subjectType === 'lab',
            subjectType: subjectType || null, isFixed: !!isFixed, isExtra: !!isExtra, isActivity: subjectType === 'activity',
            schedulingNote: schedulingNote || null
        };
    }

    const SEMESTER_WEEKS = 15;
    const periodsPerWeek = (subject) => Math.max(1, Math.ceil((subject.totalHours || 1) / SEMESTER_WEEKS));

    // Phase 0: COE blocks
    for (const coe of (coeEntries || [])) {
        const yearClasses = classes.filter(c => Number(c.year) === Number(coe.year));
        if (yearClasses.length === 0) continue;
        const config = getSlotConfig(coe.year);
        if (!config) continue;
        const duration = coe.endSlotIndex - coe.startSlotIndex + 1;
        for (const cls of yearClasses) {
            for (let i = coe.startSlotIndex; i <= coe.endSlotIndex; i++) {
                occupy(maps.class, slotKey(coe.day, i), cls.id);
            }
            entries.push({
                classId: cls.id, subjectId: null, facultyId: null, roomId: null,
                day: coe.day, slotIndex: coe.startSlotIndex, duration, isLab: false,
                isCOE: true, isFixed: true, isExtra: false, coeLabel: coe.label || 'COE'
            });
        }
    }

    // Phase 2: Tasks setup
    const tasks = [];
    for (const mapping of mappings) {
        const subject = subjectById[mapping.subjectId];
        const cls     = classById[mapping.classId];
        if (!subject || !cls) continue;

        const alreadyPlaced = entries
            .filter(e => e.classId === mapping.classId && e.subjectId === mapping.subjectId)
            .reduce((sum, e) => sum + (e.duration || 1), 0);

        const remaining = periodsPerWeek(subject) - alreadyPlaced;
        if (remaining <= 0) continue;

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

    // Calculate room demand (how many blocks are requested for each lab room)
    const roomDemand = {};
    for (const t of tasks) {
        if (t.subject.type === 'lab' && t.subject.assignedLabId) {
            roomDemand[t.subject.assignedLabId] = (roomDemand[t.subject.assignedLabId] || 0) + 1;
        }
    }

    const PRIORITY = { lab: 1, project: 2, theory: 3, elective: 3, 'Non-Academic': 3, activity: 4 };
    
    // Sort tasks
    tasks.sort((a, b) => {
        const pd = (PRIORITY[a.subject.type] || 99) - (PRIORITY[b.subject.type] || 99);
        if (pd !== 0) return pd;

        // If both are labs, sort by room demand descending
        if (a.subject.type === 'lab' && b.subject.type === 'lab') {
            const demA = roomDemand[a.subject.assignedLabId] || 0;
            const demB = roomDemand[b.subject.assignedLabId] || 0;
            if (demB !== demA) return demB - demA;
        }

        const dd = (b.subject.duration || 1) - (a.subject.duration || 1);
        if (dd !== 0) return dd;

        return periodsPerWeek(b.subject) - periodsPerWeek(a.subject);
    });

    const isBlockTask = (t) => t.subject.type === 'lab' || t.subject.type === 'project' || (t.subject.duration && t.subject.duration >= 2);
    const blockTasks = tasks.filter(isBlockTask);
    const theoryTasks = tasks.filter(t => !isBlockTask(t));

    // Greedy & relaxed & swap repair for blocks
    const unplacedBlocksPass1 = [];
    for (const task of blockTasks) {
        if (!placeTask(task, entries, maps, false)) unplacedBlocksPass1.push(task);
    }
    const unplacedBlocksPass2 = [];
    for (const task of unplacedBlocksPass1) {
        if (!placeTask(task, entries, maps, true)) unplacedBlocksPass2.push(task);
    }
    
    // Greedy & relaxed for theory
    const unplacedTheoryPass1 = [];
    for (const task of theoryTasks) {
        if (!placeTask(task, entries, maps, false)) unplacedTheoryPass1.push(task);
    }
    const unplacedTheoryPass2 = [];
    for (const task of unplacedTheoryPass1) {
        if (!placeTask(task, entries, maps, true)) unplacedTheoryPass2.push(task);
    }

    function placeTask(task, entries, maps, relaxed) {
        const { mapping, subject, cls } = task;
        const config = getSlotConfig(cls.year);
        if (!config) return false;

        const duration   = subject.duration || 1;
        const rawSlots   = config.slots;
        const classSlots = getClassSlots(cls.year);
        const days       = config.days;

        const isTheoryLike = ['theory', 'elective', 'Non-Academic'].includes(subject.type);
        const isBlock      = subject.type === 'lab' || subject.type === 'project' || (subject.duration && subject.duration >= 2);
        const isLabOrProject = subject.type === 'lab' || subject.type === 'project';

        const dayCount = {};
        for (const e of entries) {
            if (e.classId === cls.id && e.subjectId === subject.id) {
                dayCount[e.day] = (dayCount[e.day] || 0) + 1;
            }
        }
        const daysWithSubject = new Set(Object.keys(dayCount));

        const dayHasOtherBlock = (day) =>
            entries.some(e =>
                e.classId !== undefined && e.classId === cls.id &&
                e.subjectId !== subject.id &&
                e.day === day &&
                (e.subjectType === 'lab' || e.subjectType === 'project')
            );

        const dayLoad = {};
        for (const day of days)
            dayLoad[day] = entries.filter(e => e.classId === cls.id && e.day === day).length;

        const sortedDays = days.slice().sort((a, b) => {
            const ld = (dayLoad[a] || 0) - (dayLoad[b] || 0);
            if (ld !== 0) return ld;
            return (daysWithSubject.has(a) ? 1 : 0) - (daysWithSubject.has(b) ? 1 : 0);
        });

        const firstClassSlotIndex = classSlots.length > 0
            ? Math.min(...classSlots.map(s => s.index))
            : -1;

        const buildCandidateStarts = () => {
            if (!isBlock) {
                const slotLoad = {};
                for (const s of classSlots)
                    slotLoad[s.index] = entries.filter(e => e.classId === cls.id && e.slotIndex === s.index).length;
                return classSlots.slice().sort((a, b) => {
                    const ld = (slotLoad[a.index] || 0) - (slotLoad[b.index] || 0);
                    return ld !== 0 ? ld : a.index - b.index;
                }).map(s => s.index);
            }

            const valid = [];
            for (let i = 0; i <= rawSlots.length - duration; i++) {
                if (isLabOrProject && i === firstClassSlotIndex) continue;
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

        for (const day of sortedDays) {
            if (!relaxed && isTheoryLike && (dayCount[subject.id] || 0) >= 2) continue;
            if (!relaxed && isLabOrProject && dayHasOtherBlock(day)) continue;

            for (const start of candidateStarts) {
                if (isLabOrProject && start === firstClassSlotIndex) continue;

                let clear = true;
                const startTimeStr = rawSlots[start]?.start;
                const endTimeStr   = rawSlots[start + duration - 1]?.end;
                const startM = timeStrMins(startTimeStr);
                const endM   = timeStrMins(endTimeStr);

                for (let i = 0; i < duration && clear; i++) {
                    const k = slotKey(day, start + i);
                    if (isOccupied(maps.class, k, cls.id)) clear = false;
                }
                if (!clear) continue;

                if (startM > 0) {
                    if (checkTimeOverlap(maps.faculty, day, mapping.facultyId, startM, endM)) clear = false;
                    if (clear && !relaxed && checkFacultyConsecutiveViolation(maps.faculty, day, mapping.facultyId, startM, endM, mapping.subjectId)) clear = false;

                    if (clear && mapping.labFaculty2Id) {
                        if (checkTimeOverlap(maps.faculty, day, mapping.labFaculty2Id, startM, endM)) clear = false;
                        if (clear && !relaxed && checkFacultyConsecutiveViolation(maps.faculty, day, mapping.labFaculty2Id, startM, endM, mapping.subjectId)) clear = false;
                    }
                }
                if (!clear) continue;

                const room = findRoom(rooms, subject, day, start, maps.room, cls, duration, config);
                if (!room) continue;

                entries.push(makeEntry({
                    classId:        cls.id,
                    subjectId:      subject.id,
                    facultyId:      mapping.facultyId,
                    labFaculty2Id:  mapping.labFaculty2Id,
                    roomId:         room.id,
                    day,
                    slotIndex:      start,
                    duration,
                    subjectType:    subject.type,
                    isFixed:        false,
                    schedulingNote: relaxed ? 'relaxed' : 'greedy'
                }));
                occupyBlock(maps, day, start, duration, {
                    facultyId: mapping.facultyId, labFaculty2Id: mapping.labFaculty2Id,
                    roomId: room.id, classId: cls.id, subjectId: mapping.subjectId
                }, config);
                return true;
            }
        }
        return false;
    }

    fillFreeSlotsCustom(entries, maps, classes, subjects, rooms, mappings, getSlotConfig);

    return { entries };
}

function fillFreeSlotsCustom(entries, maps, classes, subjects, rooms, facultySubjectMapping, getSlotConfig) {
    const slotKey    = (day, idx) => `${day}-${idx}`;
    const occupyBlock = (maps, day, slotIndex, duration, ids, config) => {
        const slots = config ? config.slots : [];
        const startTimeStr = slots[slotIndex]?.start;
        const endTimeStr = slots[slotIndex + duration - 1]?.end;
        const timeToMins = (h, m) => h * 60 + m;
        const timeStrMins = (str) => {
            if (!str) return 0;
            const [h, m] = str.split(':').map(Number);
            return timeToMins(h, m);
        };
        const startM = timeStrMins(startTimeStr);
        const endM = timeStrMins(endTimeStr);
        const occupy = (map, key, id) => { if (!map[key]) map[key] = new Set(); map[key].add(id); };
        const occupyTime = (reg, day, id, start, end, subjectId) => {
            if (!reg[day]) reg[day] = {};
            if (!reg[day][id]) reg[day][id] = [];
            reg[day][id].push({ s: start, e: end, subId: subjectId });
        };

        for (let i = 0; i < duration; i++) {
            const k = slotKey(day, slotIndex + i);
            if (ids.classId) occupy(maps.class, k, ids.classId);
            if (ids.facultyId && startM > 0) occupyTime(maps.faculty, day, ids.facultyId, startM, endM, ids.subjectId);
            if (ids.labFaculty2Id && startM > 0) occupyTime(maps.faculty, day, ids.labFaculty2Id, startM, endM, ids.subjectId);
            if (ids.roomId && startM > 0) occupyTime(maps.room, day, ids.roomId, startM, endM);
        }
    };
    const isOccupied = (map, key, id) => !!(map[key] && map[key].has(id));
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
    function findRoom(rooms, subject, day, slotIndex, roomMap, cls, duration, config) {
        const slots = config ? config.slots : [];
        const startTimeStr = slots[slotIndex]?.start;
        const endTimeStr = slots[slotIndex + duration - 1]?.end;
        const startM = timeStrMins(startTimeStr);
        const endM = timeStrMins(endTimeStr);
        const freeForBlock = (roomId) => {
            if (!startM) return true;
            return !checkTimeOverlap(roomMap, day, roomId, startM, endM);
        };
        if (cls && cls.defaultRoomId) {
            const def = rooms.find(r => r.id === cls.defaultRoomId);
            if (def && freeForBlock(def.id)) return def;
        }
        return rooms.find(r => r.type === 'classroom' && freeForBlock(r.id)) || null;
    }
    const SEMESTER_WEEKS = 15;
    const periodsPerWeek = (subject) => Math.max(1, Math.ceil((subject.totalHours || 1) / SEMESTER_WEEKS));

    for (const cls of classes) {
        const config = getSlotConfig(cls.year);
        if (!config) continue;

        const days     = config.days;
        const allSlots = config.slots;
        const fillable = allSlots.map((s, i) => ({ type: s.type, index: i }))
                                 .filter(s => s.type !== 'break' && s.type !== 'lunch');

        const getAlreadyPlacedCount = () => {
            const counts = {};
            for (const e of entries) {
                if (e.classId === cls.id && e.subjectId) {
                    counts[e.subjectId] = (counts[e.subjectId] || 0) + (e.duration || 1);
                }
            }
            return counts;
        };

        // STAGE 1: Deficit Placement
        let placedAny = true;
        while (placedAny) {
            placedAny = false;
            const alreadyPlaced = getAlreadyPlacedCount();

            const deficitPool = facultySubjectMapping
                .filter(m => m.classId === cls.id)
                .map(m => {
                    const subject = subjects.find(s => s.id === m.subjectId);
                    if (!subject) return null;
                    const required = periodsPerWeek(subject);
                    const placed = alreadyPlaced[subject.id] || 0;
                    const deficit = Math.max(0, required - placed);
                    return { mapping: m, subject, required, placed, deficit };
                })
                .filter(p => p && p.deficit > 0 && ['theory', 'elective', 'Non-Academic', 'activity'].includes(p.subject.type))
                .sort((a, b) => b.deficit - a.deficit);

            if (deficitPool.length === 0) break;

            let sessionPlaced = false;
            for (const day of days) {
                if (sessionPlaced) break;
                const dayCount = {};
                for (const e of entries) {
                    if (e.classId === cls.id && e.day === day && e.subjectId) {
                        dayCount[e.subjectId] = (dayCount[e.subjectId] || 0) + (e.duration || 1);
                    }
                }

                for (const slot of fillable) {
                    if (sessionPlaced) break;
                    const k = slotKey(day, slot.index);
                    if (isOccupied(maps.class, k, cls.id)) continue;

                    for (let pass = 0; pass <= 2 && !sessionPlaced; pass++) {
                        for (const { mapping, subject } of deficitPool) {
                            if (pass === 0 && (dayCount[subject.id] || 0) >= 2) continue;

                            const isActivitySlot = slot.type === 'activity';
                            const isSubjectActivity = subject.type === 'activity';
                            if (isActivitySlot !== isSubjectActivity) continue;

                            const startTimeStr = allSlots[slot.index]?.start;
                            const endTimeStr = allSlots[slot.index]?.end;
                            const startM = timeStrMins(startTimeStr);
                            const endM = timeStrMins(endTimeStr);

                            if (startM > 0) {
                                if (checkTimeOverlap(maps.faculty, day, mapping.facultyId, startM, endM)) continue;
                                if (pass < 2 && checkFacultyConsecutiveViolation(maps.faculty, day, mapping.facultyId, startM, endM, mapping.subjectId)) continue;
                            }

                            const room = findRoom(rooms, subject, day, slot.index, maps.room, cls, 1, config);
                            if (!room) continue;

                            entries.push({
                                classId:        cls.id,
                                subjectId:      subject.id,
                                facultyId:      mapping.facultyId,
                                roomId:         room.id,
                                day,
                                slotIndex:      slot.index,
                                duration:       1,
                                isLab:          false,
                                subjectType:    subject.type,
                                isFixed:        false,
                                isExtra:        false,
                                schedulingNote: 'deficit'
                            });

                            occupyBlock(maps, day, slot.index, 1, {
                                facultyId: mapping.facultyId,
                                roomId: room.id, classId: cls.id, subjectId: mapping.subjectId
                            }, config);

                            sessionPlaced = true;
                            placedAny = true;
                            break;
                        }
                    }
                }
            }
        }

        // STAGE 2: Gap Filling
        const alreadyPlaced = getAlreadyPlacedCount();
        const fullPool = facultySubjectMapping
            .filter(m => m.classId === cls.id)
            .map(m => {
                const subject = subjects.find(s => s.id === m.subjectId);
                if (!subject) return null;
                const required = periodsPerWeek(subject);
                const placed = alreadyPlaced[subject.id] || 0;
                const deficit = Math.max(0, required - placed);
                return { mapping: m, subject, required, placed, deficit };
            })
            .filter(p => p && ['theory', 'elective', 'Non-Academic', 'activity'].includes(p.subject.type))
            .sort((a, b) => b.deficit - a.deficit);

        if (fullPool.length === 0) continue;

        const weightedPool = [];
        for (const p of fullPool) {
            const weight = p.deficit > 0 ? p.deficit : 1;
            for (let i = 0; i < weight; i++) weightedPool.push(p);
        }

        let rrIdx = 0;

        for (const day of days) {
            const dayCount = {};
            for (const e of entries) {
                if (e.classId === cls.id && e.day === day && e.subjectId) {
                    dayCount[e.subjectId] = (dayCount[e.subjectId] || 0) + (e.duration || 1);
                }
            }

            for (const slot of fillable) {
                const k = slotKey(day, slot.index);
                if (isOccupied(maps.class, k, cls.id)) continue;
                let sessionPlaced = false;

                for (let pass = 0; pass <= 2 && !sessionPlaced; pass++) {
                    for (let attempt = 0; attempt < weightedPool.length; attempt++) {
                        const pi = (rrIdx + attempt) % weightedPool.length;
                        const { mapping, subject } = weightedPool[pi];

                        if (pass === 0 && (dayCount[subject.id] || 0) >= 2) continue;

                        const isActivitySlot = slot.type === 'activity';
                        const isSubjectActivity = subject.type === 'activity';
                        if (isActivitySlot !== isSubjectActivity) continue;

                        const startTimeStr = allSlots[slot.index]?.start;
                        const endTimeStr = allSlots[slot.index]?.end;
                        const startM = timeStrMins(startTimeStr);
                        const endM = timeStrMins(endTimeStr);

                        if (startM > 0) {
                            if (checkTimeOverlap(maps.faculty, day, mapping.facultyId, startM, endM)) continue;
                            if (pass < 2 && checkFacultyConsecutiveViolation(maps.faculty, day, mapping.facultyId, startM, endM, mapping.subjectId)) continue;
                        }

                        const room = findRoom(rooms, subject, day, slot.index, maps.room, cls, 1, config);
                        if (!room) continue;

                        entries.push({
                            classId:        cls.id,
                            subjectId:      subject.id,
                            facultyId:      mapping.facultyId,
                            roomId:         room.id,
                            day,
                            slotIndex:      slot.index,
                            duration:       1,
                            isLab:          false,
                            subjectType:    subject.type,
                            isFixed:        false,
                            isExtra:        true,
                            schedulingNote: 'gap-fill'
                        });

                        dayCount[subject.id] = (dayCount[subject.id] || 0) + 1;
                        occupyBlock(maps, day, slot.index, 1, {
                            facultyId: mapping.facultyId,
                            roomId: room.id, classId: cls.id, subjectId: mapping.subjectId
                        }, config);

                        rrIdx = (pi + 1) % weightedPool.length;
                        sessionPlaced = true;
                        break;
                    }
                }
            }
        }
    }
}

run();
