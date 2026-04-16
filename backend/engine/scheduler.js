const SEMESTER_WEEKS = 15;
const MAX_SAME_SUBJECT_PER_DAY = 2;

const PRIORITY = {
    lab: 1,
    project: 2,
    theory: 3,
    elective: 4,
    'Non-Academic': 5,
    activity: 6
};
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

function occupyTime(reg, day, id, start, end) {
    if (!reg[day]) reg[day] = {};
    if (!reg[day][id]) reg[day][id] = [];
    reg[day][id].push({ s: start, e: end });
}

function releaseTime(reg, day, id, start, end) {
    if (!reg[day] || !reg[day][id]) return;
    reg[day][id] = reg[day][id].filter(block => !(block.s === start && block.e === end));
}

function occupyBlock(maps, day, slotIndex, duration, ids, config) {
    const slots = config ? (config.slots.toObject ? config.slots.toObject() : config.slots) : [];
    const startTimeStr = slots[slotIndex]?.start;
    const endTimeStr = slots[slotIndex + duration - 1]?.end;
    const startM = timeStrMins(startTimeStr);
    const endM = timeStrMins(endTimeStr);

    for (let i = 0; i < duration; i++) {
        const k = slotKey(day, slotIndex + i);
        if (ids.classId) occupy(maps.class, k, ids.classId);
        if (ids.facultyId && startM > 0) occupyTime(maps.faculty, day, ids.facultyId, startM, endM);
        if (ids.labFaculty2Id && startM > 0) occupyTime(maps.faculty, day, ids.labFaculty2Id, startM, endM);
        if (ids.roomId && startM > 0) occupyTime(maps.room, day, ids.roomId, startM, endM);
    }
}

function releaseBlock(maps, day, slotIndex, duration, ids, config) {
    const slots = config ? (config.slots.toObject ? config.slots.toObject() : config.slots) : [];
    const startTimeStr = slots[slotIndex]?.start;
    const endTimeStr = slots[slotIndex + duration - 1]?.end;
    const startM = timeStrMins(startTimeStr);
    const endM = timeStrMins(endTimeStr);

    for (let i = 0; i < duration; i++) {
        const k = slotKey(day, slotIndex + i);
        if (ids.classId) release(maps.class, k, ids.classId);
        if (ids.facultyId && startM > 0) releaseTime(maps.faculty, day, ids.facultyId, startM, endM);
        if (ids.labFaculty2Id && startM > 0) releaseTime(maps.faculty, day, ids.labFaculty2Id, startM, endM);
        if (ids.roomId && startM > 0) releaseTime(maps.room, day, ids.roomId, startM, endM);
    }
}
const getRawSlots      = (cfg) => cfg.slots.toObject ? cfg.slots.toObject() : cfg.slots;
const getClassTypeSlots = (cfg) =>
    getRawSlots(cfg).map((s, i) => ({ ...s, index: i })).filter(s => s.type === 'class');
const periodsPerWeek = (subject) =>
    Math.max(1, Math.ceil((subject.totalHours || 1) / SEMESTER_WEEKS));

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

    if (!needsLab) {
        if (cls && cls.defaultRoomId) {
            const def = rooms.find(r => r.id === cls.defaultRoomId);
            if (def && freeForBlock(def.id)) return def;
        }
        const deptRoom = rooms.find(r => r.type === 'classroom' && r.departmentId === subject.departmentId && freeForBlock(r.id));
        if (deptRoom) return deptRoom;
        return rooms.find(r => r.type === 'classroom' && freeForBlock(r.id)) || null;
    }

    return (
        rooms.find(r => r.type === 'lab' && r.departmentId === subject.departmentId && freeForBlock(r.id)) ||
        rooms.find(r => r.type === 'lab' && freeForBlock(r.id)) ||
        null
    );
}
function makeEntry({ classId, subjectId, facultyId, labFaculty2Id, roomId,
                     day, slotIndex, duration, subjectType,
                     isFixed, isExtra, schedulingNote }) {
    return {
        classId,
        subjectId,
        facultyId,
        labFaculty2Id:  labFaculty2Id  || null,
        roomId:         roomId         || null,
        day,
        slotIndex,
        duration:       duration  || 1,
        isLab:          subjectType === 'lab',
        subjectType:    subjectType || null,
        isFixed:        !!isFixed,
        isExtra:        !!isExtra,
        isActivity:     subjectType === 'activity',
        schedulingNote: schedulingNote || null
    };
}

function buildNote(subjectType, duration, flags) {
    flags = flags || {};
    const base = {
        lab:            'Lab: ' + duration + '-slot consecutive block',
        project:        'Project: ' + duration + '-slot consecutive block',
        theory:         'Theory: spread across week',
        elective:       'Elective: spread across week',
        'Non-Academic': 'Non-Academic: spread across week',
        activity:       'Activity session'
    }[subjectType] || 'Session';

    const parts = [];
    if (flags.relaxed)    parts.push('constraint-relaxed');
    if (flags.swapRepair) parts.push('swap-repaired');
    if (flags.extra)      parts.push('gap-fill');

    return parts.length ? base + '; ' + parts.join('; ') : base;
}

/**
 * Generate a complete timetable from the supplied data.
 * @param {object} data
 * @param {object[]} data.classes
 * @param {object[]} data.subjects
 * @param {object[]} data.rooms
 * @param {object[]} data.timeSlotConfigs
 * @param {object[]} data.defaultClasses
 * @param {object[]} data.facultySubjectMapping
 * @returns {{ entries: object[], conflicts: object[] }}
 */
export function generateTimetable(data) {
    const { classes, subjects, rooms, timeSlotConfigs, defaultClasses, facultySubjectMapping } = data;

    const subjectById  = {};
    const classById    = {};
    const configByYear = {};
    for (const s of subjects)       subjectById[s.id]            = s;
    for (const c of classes)        classById[c.id]              = c;
    for (const cfg of timeSlotConfigs) configByYear[Number(cfg.year)] = cfg;

    const getSlotConfig = (year) => configByYear[Number(year)] || timeSlotConfigs[0] || null;
    const getClassSlots = (year) => {
        const cfg = getSlotConfig(year);
        return cfg ? getClassTypeSlots(cfg) : [];
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

    // --- Phase 1: Fixed / pinned entries ------------------------------------
    for (const dc of (defaultClasses || [])) {
        const mapping = mappings.find(m => m.subjectId === dc.subjectId && m.classId === dc.classId);
        const subject = subjectById[dc.subjectId];
        const cls     = classById[dc.classId];
        if (!mapping || !subject || !cls) continue;

        const duration = subject.duration || 1;
        const config   = getSlotConfig(cls.year);
        const room     = findRoom(rooms, subject, dc.day, dc.slotIndex, maps.room, cls, duration, config);
        if (!room) continue;

        entries.push(makeEntry({
            classId:        dc.classId,
            subjectId:      dc.subjectId,
            facultyId:      mapping.facultyId,
            labFaculty2Id:  mapping.labFaculty2Id,
            roomId:         room.id,
            day:            dc.day,
            slotIndex:      dc.slotIndex,
            duration,
            subjectType:    subject.type,
            isFixed:        true,
            schedulingNote: buildNote(subject.type, duration)
        }));
        occupyBlock(maps, dc.day, dc.slotIndex, duration, {
            facultyId: mapping.facultyId, labFaculty2Id: mapping.labFaculty2Id,
            roomId: room.id, classId: dc.classId
        }, config);
    }

    // --- Phase 2: Build task list -------------------------------------------
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

        const baseDur   = subject.duration || 1;
        const sessions  = Math.ceil(remaining / baseDur);
        for (let i = 0; i < sessions; i++) {
            const dur = (i === sessions - 1 && remaining % baseDur !== 0) ? (remaining % baseDur) : baseDur;
            tasks.push({ mapping, subject: { ...subject, duration: dur }, cls });
        }
    }

    // --- Phase 3: Sort tasks (MRV heuristic) --------------------------------
    tasks.sort((a, b) => {
        const pd = (PRIORITY[a.subject.type] || 99) - (PRIORITY[b.subject.type] || 99);
        if (pd !== 0) return pd;
        const dd = (b.subject.duration || 1) - (a.subject.duration || 1);
        if (dd !== 0) return dd;
        return periodsPerWeek(b.subject) - periodsPerWeek(a.subject);
    });

    // --- Phase 4: Greedy placement (all constraints) ------------------------
    const unplacedPass1 = [];
    for (const task of tasks) {
        if (!placeTask(task, entries, maps, rooms, getSlotConfig, getClassSlots, false))
            unplacedPass1.push(task);
    }

    // --- Phase 5: Retry with soft constraints relaxed -----------------------
    const unplacedPass2 = [];
    for (const task of unplacedPass1) {
        if (!placeTask(task, entries, maps, rooms, getSlotConfig, getClassSlots, true))
            unplacedPass2.push(task);
    }

    // --- Phase 6: Swap-based repair -----------------------------------------
    const unplacedFinal = [];
    for (const task of unplacedPass2) {
        if (!swapRepair(task, entries, maps, subjects, classes, rooms, getSlotConfig, getClassSlots))
            unplacedFinal.push(task);
    }

    // --- Phase 7: Fill remaining free slots ---------------------------------
    fillFreeSlots(entries, maps, classes, subjects, rooms, mappings, getSlotConfig);

    // --- Report unresolvable sessions ---------------------------------------
    for (const { cls, subject } of unplacedFinal) {
        conflicts.push({
            classId:     cls.id,
            className:   cls.name,
            subjectId:   subject.id,
            subjectName: subject.name,
            reason:      'No valid slot found — hard constraints cannot be satisfied (insufficient rooms or all faculty/class slots exhausted)'
        });
    }

    return { entries, conflicts };
}

// --- Phase 4/5: Place a single task -----------------------------------------
function placeTask(task, entries, maps, rooms, getSlotConfig, getClassSlots, relaxed) {
    const { mapping, subject, cls } = task;
    const config = getSlotConfig(cls.year);
    if (!config) return false;

    const duration   = subject.duration || 1;
    const rawSlots   = getRawSlots(config);
    const classSlots = getClassSlots(cls.year);
    const days       = config.days;

    const isTheoryLike = ['theory', 'elective', 'Non-Academic'].includes(subject.type);
    const isBlock      = subject.type === 'lab' || subject.type === 'project';

    // Count how many times this subject already appears per day (for SC1)
    const dayCount = {};
    for (const e of entries) {
        if (e.classId === cls.id && e.subjectId === subject.id) {
            dayCount[e.day] = (dayCount[e.day] || 0) + 1;
        }
    }
    const daysWithSubject = new Set(Object.keys(dayCount));

    // SC2: does this day already have a different lab/project for this class?
    const dayHasOtherBlock = (day) =>
        entries.some(e =>
            e.classId !== undefined && e.classId === cls.id &&
            e.subjectId !== subject.id &&
            e.day === day &&
            (e.subjectType === 'lab' || e.subjectType === 'project')
        );

    // H1: Day load (total entries for this class per day)
    const dayLoad = {};
    for (const day of days)
        dayLoad[day] = entries.filter(e => e.classId === cls.id && e.day === day).length;

    // Sort days: lighter days first (H1), then days without this subject first (H2)
    const sortedDays = days.slice().sort((a, b) => {
        const ld = (dayLoad[a] || 0) - (dayLoad[b] || 0);
        if (ld !== 0) return ld;
        return (daysWithSubject.has(a) ? 1 : 0) - (daysWithSubject.has(b) ? 1 : 0);
    });
    // H5: Projects prefer Saturday
    if (subject.type === 'project')
        sortedDays.sort((a, b) => (a === 'Saturday' ? 0 : 1) - (b === 'Saturday' ? 0 : 1));

    // H3/H4: Slot ordering
    const slotLoad = {};
    for (const s of classSlots)
        slotLoad[s.index] = entries.filter(e => e.classId === cls.id && e.slotIndex === s.index).length;

    // For both blocks and theory: sort by load (lighter slots first), then by index ascending.
    // Labs/projects are NOT forced to the last period anymore.
    const sortedSlots = classSlots.slice().sort((a, b) => {
        const ld = (slotLoad[a.index] || 0) - (slotLoad[b.index] || 0);
        return ld !== 0 ? ld : a.index - b.index;
    });

    // HC-FIRST: The minimum class-type slot index (first period).
    // Labs and projects must NOT be placed in the first period.
    const firstClassSlotIndex = classSlots.length > 0
        ? Math.min(...classSlots.map(s => s.index))
        : -1;

    for (const day of sortedDays) {
        // SC1
        if (!relaxed && isTheoryLike && (dayCount[day] || 0) >= MAX_SAME_SUBJECT_PER_DAY) continue;
        // SC2
        if (!relaxed && isBlock && dayHasOtherBlock(day)) continue;

        for (const slot of sortedSlots) {
            const start = slot.index;

            // HC-FIRST: Skip first period for labs and projects
            if (isBlock && start === firstClassSlotIndex) continue;

            // HC4: consecutive class-type slots
            let ok = true;
            for (let i = 0; i < duration && ok; i++) {
                const s = rawSlots[start + i];
                if (!s || s.type !== 'class') ok = false;
            }
            if (!ok) continue;

            // HC1 + HC3: no faculty/class double-booking
            let clear = true;
            const startTimeStr = rawSlots[start]?.start;
            const endTimeStr = rawSlots[start + duration - 1]?.end;
            const startM = timeStrMins(startTimeStr);
            const endM = timeStrMins(endTimeStr);

            for (let i = 0; i < duration && clear; i++) {
                const k = slotKey(day, start + i);
                if (isOccupied(maps.class,   k, cls.id))              clear = false;
            }
            if (!clear) continue;

            if (startM > 0) {
                if (checkTimeOverlap(maps.faculty, day, mapping.facultyId, startM, endM)) clear = false;
                if (mapping.labFaculty2Id && checkTimeOverlap(maps.faculty, day, mapping.labFaculty2Id, startM, endM)) clear = false;
            }
            if (!clear) continue;

            // HC2 + HC5: find a free room of the correct type
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
                schedulingNote: buildNote(subject.type, duration, { relaxed: relaxed })
            }));
            occupyBlock(maps, day, start, duration, {
                facultyId: mapping.facultyId, labFaculty2Id: mapping.labFaculty2Id,
                roomId: room.id, classId: cls.id
            }, config);
            return true;
        }
    }
    return false;
}

// --- Phase 6: Swap-based repair ---------------------------------------------

function swapRepair(task, entries, maps, subjects, classes, rooms, getSlotConfig, getClassSlots) {
    const { mapping, subject, cls } = task;
    const config = getSlotConfig(cls.year);
    if (!config) return false;

    const duration   = subject.duration || 1;
    const rawSlots   = getRawSlots(config);
    const classSlots = getClassSlots(cls.year);
    const movable    = entries.filter(e => !e.isFixed && e.classId === cls.id);
    const isBlock    = subject.type === 'lab' || subject.type === 'project';

    // HC-FIRST: first class-type slot index — labs/projects must not land here
    const firstClassSlotIndex = classSlots.length > 0
        ? Math.min(...classSlots.map(s => s.index))
        : -1;

    for (const blocker of movable) {
        const blockerDur = blocker.duration || 1;

        // HC-FIRST: Skip first period for labs and projects
        if (isBlock && blocker.slotIndex === firstClassSlotIndex) continue;

        // HC4: our task needs duration consecutive class-type slots at this position
        let ok = true;
        for (let i = 0; i < duration && ok; i++) {
            const s = rawSlots[blocker.slotIndex + i];
            if (!s || s.type !== 'class') ok = false;
        }
        if (!ok) continue;

        // HC1: our faculty must be free at the blocker's slots
        let facultyFree = true;
        const startTimeStr = rawSlots[blocker.slotIndex]?.start;
        const endTimeStr = rawSlots[blocker.slotIndex + duration - 1]?.end;
        const startM = timeStrMins(startTimeStr);
        const endM = timeStrMins(endTimeStr);

        if (startM > 0) {
            if (checkTimeOverlap(maps.faculty, blocker.day, mapping.facultyId, startM, endM)) facultyFree = false;
            if (mapping.labFaculty2Id && checkTimeOverlap(maps.faculty, blocker.day, mapping.labFaculty2Id, startM, endM)) facultyFree = false;
        }
        if (!facultyFree) continue;

        // Temporarily evict the blocker
        const blockerConfig = getSlotConfig(blocker.classId ? classById[blocker.classId].year : '1');
        releaseBlock(maps, blocker.day, blocker.slotIndex, blockerDur, {
            facultyId: blocker.facultyId, labFaculty2Id: blocker.labFaculty2Id,
            roomId: blocker.roomId, classId: blocker.classId
        }, blockerConfig);
        const blockerIdx     = entries.indexOf(blocker);
        entries.splice(blockerIdx, 1);

        const blockerSubject = subjects.find(s => s.id === blocker.subjectId);
        const blockerClass   = classes.find(c => c.id === blocker.classId);

        const blockerMoved = blockerSubject && blockerClass && placeTask(
            {
                mapping: {
                    facultyId:     blocker.facultyId,
                    labFaculty2Id: blocker.labFaculty2Id,
                    subjectId:     blocker.subjectId,
                    classId:       blocker.classId
                },
                subject: { ...blockerSubject, duration: blockerDur },
                cls:     blockerClass
            },
            entries, maps, rooms, getSlotConfig, getClassSlots,
            true /* relaxed */
        );

        if (blockerMoved) {
            // Check if our task fits at blocker's former slot
            let classFree = true;
            for (let i = 0; i < duration && classFree; i++) {
                if (isOccupied(maps.class, slotKey(blocker.day, blocker.slotIndex + i), cls.id))
                    classFree = false;
            }

            if (classFree) {
                const room = findRoom(rooms, subject, blocker.day, blocker.slotIndex, maps.room, cls, duration, config);
                if (room) {
                    // Swap succeeded
                    entries.push(makeEntry({
                        classId:        cls.id,
                        subjectId:      subject.id,
                        facultyId:      mapping.facultyId,
                        labFaculty2Id:  mapping.labFaculty2Id,
                        roomId:         room.id,
                        day:            blocker.day,
                        slotIndex:      blocker.slotIndex,
                        duration,
                        subjectType:    subject.type,
                        isFixed:        false,
                        schedulingNote: buildNote(subject.type, duration, { swapRepair: true })
                    }));
                    occupyBlock(maps, blocker.day, blocker.slotIndex, duration, {
                        facultyId: mapping.facultyId, labFaculty2Id: mapping.labFaculty2Id,
                        roomId: room.id, classId: cls.id
                    }, config);
                    return true;
                }
            }

            let relocated = null;
            for (let i = entries.length - 1; i >= 0; i--) {
                const e = entries[i];
                if (e.classId === blocker.classId && e.subjectId === blocker.subjectId && !e.isFixed) {
                    relocated = e;
                    break;
                }
            }
            if (relocated) {
                const rDur = relocated.duration || 1;
                releaseBlock(maps, relocated.day, relocated.slotIndex, rDur, {
                    facultyId: relocated.facultyId, labFaculty2Id: relocated.labFaculty2Id,
                    roomId: relocated.roomId, classId: relocated.classId
                }, blockerConfig);
                const rIdx = entries.indexOf(relocated);
                if (rIdx !== -1) entries.splice(rIdx, 1);
            }
        }
        entries.splice(blockerIdx, 0, blocker);
        occupyBlock(maps, blocker.day, blocker.slotIndex, blockerDur, {
            facultyId: blocker.facultyId, labFaculty2Id: blocker.labFaculty2Id,
            roomId: blocker.roomId, classId: blocker.classId
        }, blockerConfig);
    }

    return false;
}

// --- Phase 7: Fill remaining free slots -------------------------------------

function fillFreeSlots(entries, maps, classes, subjects, rooms, facultySubjectMapping, getSlotConfig) {
    for (const cls of classes) {
        const config = getSlotConfig(cls.year);
        if (!config) continue;

        const days     = config.days;
        const allSlots = getRawSlots(config);
        const fillable = allSlots.map((s, i) => ({ type: s.type, index: i }))
                                 .filter(s => s.type !== 'break' && s.type !== 'lunch');

        // Build pool: theory + activity subjects for this class.
        // Weight each subject by its DEFICIT (required - already placed) so that
        // under-served subjects get priority in gap-fill over already-satisfied ones.
        const alreadyPlacedCount = {};
        for (const e of entries) {
            if (e.classId === cls.id && e.subjectId) {
                alreadyPlacedCount[e.subjectId] = (alreadyPlacedCount[e.subjectId] || 0) + (e.duration || 1);
            }
        }

        const pool = facultySubjectMapping
            .filter(m => m.classId === cls.id)
            .map(m => {
                const subject = subjects.find(s => s.id === m.subjectId);
                if (!subject) return null;
                const required  = periodsPerWeek(subject);
                const placed    = alreadyPlacedCount[subject.id] || 0;
                const deficit   = Math.max(0, required - placed);
                return { mapping: m, subject, required, placed, deficit };
            })
            .filter(p => p && (p.subject.type === 'theory' || p.subject.type === 'activity'))
            .sort((a, b) => {
                // Primary: subject type priority
                const pd = (PRIORITY[a.subject.type] || 99) - (PRIORITY[b.subject.type] || 99);
                if (pd !== 0) return pd;
                // Secondary: highest deficit first (most under-served gets priority)
                if (b.deficit !== a.deficit) return b.deficit - a.deficit;
                // Tertiary: highest totalHours as tiebreaker
                return (b.subject.totalHours || 0) - (a.subject.totalHours || 0);
            });

        if (pool.length === 0) continue;

        // Weight by deficit; already-satisfied subjects get weight=1 so they can
        // still fill truly empty slots but yield to under-served subjects.
        const weightedPool = [];
        for (const p of pool) {
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
                if (isOccupied(maps.class, k, cls.id)) continue
                let sessionPlaced = false;
                for (let pass = 0; pass <= 1 && !sessionPlaced; pass++) {
                    for (let attempt = 0; attempt < weightedPool.length; attempt++) {
                        const pi = (rrIdx + attempt) % weightedPool.length;
                        const { mapping, subject } = weightedPool[pi];
                        // SC1: max MAX_SAME_SUBJECT_PER_DAY appearances per day (pass 0 only)
                        if (pass === 0 && (dayCount[subject.id] || 0) >= MAX_SAME_SUBJECT_PER_DAY) continue;
                        if (slot.type === 'activity' && subject.type !== 'activity') continue;
                        if (slot.type === 'class'    && subject.type === 'activity') continue;

                        const startTimeStr = allSlots[slot.index]?.start;
                        const endTimeStr = allSlots[slot.index]?.end;
                        const startM = timeStrMins(startTimeStr);
                        const endM = timeStrMins(endTimeStr);

                        if (startM > 0) {
                            if (checkTimeOverlap(maps.faculty, day, mapping.facultyId, startM, endM)) continue;
                            if (mapping.labFaculty2Id && checkTimeOverlap(maps.faculty, day, mapping.labFaculty2Id, startM, endM)) continue;
                        }

                        const room = findRoom(rooms, subject, day, slot.index, maps.room, cls, 1, config);
                        if (!room) continue;

                        entries.push(makeEntry({
                            classId:        cls.id,
                            subjectId:      subject.id,
                            facultyId:      mapping.facultyId,
                            labFaculty2Id:  mapping.labFaculty2Id,
                            roomId:         room.id,
                            day,
                            slotIndex:      slot.index,
                            duration:       1,
                            subjectType:    subject.type,
                            isFixed:        false,
                            isExtra:        true,
                            schedulingNote: buildNote(subject.type, 1, { extra: true })
                        }));
                        dayCount[subject.id] = (dayCount[subject.id] || 0) + 1;
                        occupyBlock(maps, day, slot.index, 1, {
                            facultyId: mapping.facultyId, labFaculty2Id: mapping.labFaculty2Id,
                            roomId: room.id, classId: cls.id
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
export function validateSwap(entries, entryIndex1, entryIndex2, data) {
    const e1 = entries[entryIndex1];
    const e2 = entries[entryIndex2];

    if (!e1 || !e2)               return { valid: false, reason: 'Invalid entry indices' };
    if (e1.isFixed || e2.isFixed) return { valid: false, reason: 'Cannot swap fixed slots' };

    const swapped       = entries.slice();
swapped[entryIndex1] = { ...e1, day: e2.day, slotIndex: e2.slotIndex, roomId: e2.roomId };
    swapped[entryIndex2] = { ...e2, day: e1.day, slotIndex: e1.slotIndex, roomId: e1.roomId };

    const violations = checkConstraints(swapped, data);
    if (violations.length > 0) return { valid: false, reason: 'Swap creates conflicts', violations };
    return { valid: true };
}

export function checkConstraints(entries, data) {
    const { subjects, rooms, faculty, classes, configs } = data;
    const violations  = [];
    const facultyReg  = {}; // day -> id -> Array<{s, e}>
    const roomReg     = {}; 
    const classReg    = {}; 
    const periodCount = {};

    const checkOverlap = (reg, day, id, s, e, type, label) => {
        if (!id) return;
        if (!reg[day]) reg[day] = {};
        if (!reg[day][id]) reg[day][id] = [];
        const overlaps = reg[day][id].some(b => s < b.e && e > b.s);
        if (overlaps) {
            violations.push(`${type} ${label || id} double-booked on ${day} (overlapping period)`);
        }
        reg[day][id].push({ s, e });
    };

    for (const e of entries) {
        const subject  = subjects ? subjects.find(s => s.id === e.subjectId) : null;
        const duration = e.duration || (subject && subject.duration) || 1;
        const freqKey  = e.classId + '-' + e.subjectId;
        periodCount[freqKey] = (periodCount[freqKey] || 0) + duration;

        // Try to get clock times for this entry
        const cls = classes ? classes.find(c => c.id === e.classId) : null;
        const config = (configs && cls) ? configs.find(c => Number(c.year) === Number(cls.year)) : null;

        if (config && config.slots) {
            const startSlot = config.slots[e.slotIndex];
            const endSlot = config.slots[e.slotIndex + duration - 1];
            if (startSlot && endSlot) {
                const sM = timeStrMins(startSlot.start);
                const eM = timeStrMins(endSlot.end);

                checkOverlap(facultyReg, e.day, e.facultyId, sM, eM, 'Faculty');
                if (e.labFaculty2Id) checkOverlap(facultyReg, e.day, e.labFaculty2Id, sM, eM, 'Faculty');
                checkOverlap(classReg, e.day, e.classId, sM, eM, 'Class', cls?.name);
                checkOverlap(roomReg, e.day, e.roomId, sM, eM, 'Room');
            }
        } else {
            // Fallback to slotIndex check if config is missing
            for (let i = 0; i < duration; i++) {
                const k = e.day + '-' + (e.slotIndex + i);
                if (e.facultyId) {
                    const fk = e.facultyId + '-' + k;
                    if (facultyReg[fk]) violations.push('Faculty ' + e.facultyId + ' double-booked at ' + k);
                    facultyReg[fk] = true;
                }
                if (e.labFaculty2Id) {
                    const f2k = e.labFaculty2Id + '-' + k;
                    if (facultyReg[f2k]) violations.push('Lab faculty ' + e.labFaculty2Id + ' double-booked at ' + k);
                    facultyReg[f2k] = true;
                }
                const ck = e.classId + '-' + k;
                if (classReg[ck]) violations.push('Class ' + (cls?.name || e.classId) + ' double-booked at ' + k);
                classReg[ck] = true;
                if (e.roomId) {
                    const rk = e.roomId + '-' + k;
                    if (roomReg[rk]) violations.push('Room ' + e.roomId + ' double-booked at ' + k);
                    roomReg[rk] = true;
                }
            }
        }

        if (data.rooms && e.roomId && subject) {
            const room         = data.rooms.find(r => r.id === e.roomId);
            const expectedType = subject.type === 'lab' ? 'lab' : 'classroom';
            if (room && room.type !== expectedType)
                violations.push('Room ' + e.roomId + ' is ' + room.type + ' but subject requires ' + expectedType);
        }

        if (data.facultySubjectMapping) {
            const hasMapping = data.facultySubjectMapping.some(
                m => m.classId === e.classId && m.subjectId === e.subjectId && m.facultyId === e.facultyId
            );
            if (!hasMapping)
                violations.push('Faculty ' + e.facultyId + ' not mapped to teach ' + e.subjectId + ' for class ' + e.classId);
        }
    }

    if (data.facultySubjectMapping && data.subjects) {
        for (const m of data.facultySubjectMapping) {
            const subject = data.subjects.find(s => s.id === m.subjectId);
            if (!subject) continue;
            const key     = m.classId + '-' + m.subjectId;
            const placed  = periodCount[key] || 0;
            const needed  = periodsPerWeek(subject);
            if (placed < needed)
                violations.push(
                    'Subject ' + m.subjectId + ' for class ' + m.classId +
                    ' scheduled ' + placed + ' period(s) but requires ' + needed +
                    ' weekly periods (from ' + subject.totalHours + ' total hours)'
                );
        }
    }

    return violations;
}

export function buildAllocationSummary(entries, subjects, mappings, classes) {
    const summary = [];
    for (const cls of classes) {
        const classMappings = mappings.filter(m => m.classId === cls.id);
        
        for (const mapping of classMappings) {
            const subject = subjects.find(s => s.id === mapping.subjectId);
            if (!subject) continue;

            const classSubjectEntries = entries.filter(e => e.classId === cls.id && e.subjectId === subject.id);
            const allocatedPeriods = classSubjectEntries.reduce((sum, e) => sum + (e.duration || 1), 0);
            const required = periodsPerWeek(subject);
            const notes = Array.from(new Set(classSubjectEntries.map(e => e.schedulingNote).filter(Boolean))).join('; ');

            summary.push({
                classId: cls.id,
                className: cls.name,
                subjectId: subject.id,
                courseTitle: subject.name,
                courseCode: subject.code,
                requiredPeriods: required,
                allocatedPeriods,
                remainingPeriods: Math.max(0, required - allocatedPeriods),
                isFullyAllocated: allocatedPeriods >= required,
                schedulingNote: notes || (allocatedPeriods > 0 ? '' : 'Not allocated')
            });
        }
    }

    return summary;
}

/**
 * Finds all subjects that could potentially be placed in a specific slot for a class.
 * Used for the manual slot-replacement feature.
 */
export function findValidSubjectsForSlot(entries, classId, day, slotIndex, data) {
    const { subjects, faculty, rooms, mappings, classes, configs } = data;
    
    const cls = classes.find(c => c.id === classId);
    if (!cls) return [];
    
    const config = configs.find(cfg => Number(cfg.year) === Number(cls.year)) || configs[0];
    if (!config) return [];

    const slot = config.slots[slotIndex];
    if (!slot || slot.type === 'break' || slot.type === 'lunch') return [];

    const startM = timeStrMins(slot.start);
    const endM   = timeStrMins(slot.end);

    // Build registry of CURRENT occupancy, EXCLUDING the current slot for THIS class
    const facReg = {};
    const roomReg = {};
    
    entries.forEach(e => {
        // Skip the specific slot we are looking to replace (if it exists)
        if (e.classId === classId && e.day === day && e.slotIndex === slotIndex) return;

        const dur = e.duration || 1;
        const eCfg = configs.find(c => Number(c.year) === Number(classes.find(cl => cl.id === e.classId)?.year)) || config;
        const sSlot = eCfg.slots[e.slotIndex];
        const eSlot = eCfg.slots[e.slotIndex + dur - 1];
        
        if (!sSlot || !eSlot) return;
        
        const sM = timeStrMins(sSlot.start);
        const eM = timeStrMins(eSlot.end);

        if (e.day === day) {
            if (e.facultyId) {
                if (!facReg[e.facultyId]) facReg[e.facultyId] = [];
                facReg[e.facultyId].push({ s: sM, e: eM });
            }
            if (e.labFaculty2Id) {
                if (!facReg[e.labFaculty2Id]) facReg[e.labFaculty2Id] = [];
                facReg[e.labFaculty2Id].push({ s: sM, e: eM });
            }
            if (e.roomId) {
                if (!roomReg[e.roomId]) roomReg[e.roomId] = [];
                roomReg[e.roomId].push({ s: sM, e: eM });
            }
        }
    });

    const checkFac = (id) => {
        if (!id || !facReg[id]) return true;
        return !facReg[id].some(b => startM < b.e && endM > b.s);
    };

    const classMappings = mappings.filter(m => m.classId === classId);
    const validOptions = [];
    const seen = new Set();

    for (const m of classMappings) {
        const sub = subjects.find(s => s.id === m.subjectId);
        if (!sub) continue;

        // Deduplicate: Don't show the exact same subject name (ignoring case) + faculty combo twice
        const key = `${sub.name.toLowerCase()}-${m.facultyId}-${m.labFaculty2Id || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        
        // Activity slots only for activity subjects
        if (slot.type === 'activity' && sub.type !== 'activity') continue;
        if (slot.type === 'class' && sub.type === 'activity') continue;

        // Check faculty
        if (!checkFac(m.facultyId)) continue;
        if (m.labFaculty2Id && !checkFac(m.labFaculty2Id)) continue;

        // Check room
        const room = findRoom(rooms, sub, day, slotIndex, roomReg, cls, 1, config);
        if (!room) continue;

        validOptions.push({
            subjectId: sub.id,
            subjectName: sub.name,
            subjectCode: sub.code,
            subjectType: sub.type,
            facultyId: m.facultyId,
            facultyName: faculty.find(f => f.id === m.facultyId)?.name || '',
            labFaculty2Id: m.labFaculty2Id,
            labFaculty2Name: m.labFaculty2Id ? faculty.find(f => f.id === m.labFaculty2Id)?.name || '' : '',
            roomId: room.id,
            roomName: room.name
        });
    }

    return validOptions;
}
