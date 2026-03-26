/**
 * Timetable Generation Engine
 *
 * PHASES:
 *   1. Fixed placement      — Pin user-defined sessions
 *   2. Task building        — Compute required sessions per mapping
 *   3. Task ordering (MRV)  — Hardest-to-fit sessions scheduled first
 *   4. Greedy placement     — Hard + soft constraints enforced
 *   5. Relaxed placement    — Soft constraints dropped; hard kept
 *   6. Swap repair          — Depth-1 backtracking via targeted eviction
 *   7. Gap fill             — Round-robin extra sessions in empty slots
 *
 * HARD CONSTRAINTS (always enforced):
 *   HC1  No faculty double-booking (primary faculty and lab co-faculty)
 *   HC2  No room double-booking
 *   HC3  No class double-booking
 *   HC4  Multi-period subjects require consecutive class-type slots
 *   HC5  Lab subjects use lab rooms; all other subjects use classrooms
 *
 * SOFT CONSTRAINTS:
 *   SC1  At most MAX_SAME_SUBJECT_PER_DAY periods of the same subject per class per day
 *         — Phase 4: enforced  |  Phases 5-6: dropped  |  Phase 7: tried first, relaxed if needed
 *   SC2  At most one lab/project block per class per day (Phase 4 only; dropped in Phases 5-7)
 */

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

// --- Occupancy helpers -------------------------------------------------------

const slotKey    = (day, idx) => `${day}-${idx}`;
const isOccupied = (map, key, id) => !!(map[key] && map[key].has(id));
const occupy     = (map, key, id) => { if (!map[key]) map[key] = new Set(); map[key].add(id); };
const release    = (map, key, id) => { if (map[key]) map[key].delete(id); };

// Time-based occupancy helpers for mixed-schedule school systems
const timeToMins = (h, m) => h * 60 + m;
const timeStrMins = (str) => {
    if (!str) return 0;
    const [h, m] = str.split(':').map(Number);
    return timeToMins(h, m);
};

// Map structure for time based checks: maps.facultyTime[day][id] = [{s, e}, ...]
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
    // Current class slot details
    const slots = config ? (config.slots.toObject ? config.slots.toObject() : config.slots) : [];
    const startTimeStr = slots[slotIndex]?.start;
    const endTimeStr = slots[slotIndex + duration - 1]?.end;
    const startM = timeStrMins(startTimeStr);
    const endM = timeStrMins(endTimeStr);

    for (let i = 0; i < duration; i++) {
        const k = slotKey(day, slotIndex + i);
        // Use Index-based for Class (class is always self-consistent)
        if (ids.classId) occupy(maps.class, k, ids.classId);
        
        // Use Time-based for Global Resources (Faculty, Room) to catch mixed-schedule overlaps
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

// --- Time-slot helpers -------------------------------------------------------

const getRawSlots      = (cfg) => cfg.slots.toObject ? cfg.slots.toObject() : cfg.slots;
const getClassTypeSlots = (cfg) =>
    getRawSlots(cfg).map((s, i) => ({ ...s, index: i })).filter(s => s.type === 'class');

// --- Period calculation ------------------------------------------------------

const periodsPerWeek = (subject) =>
    Math.max(1, Math.ceil((subject.totalHours || 1) / SEMESTER_WEEKS));

// --- Room finder -------------------------------------------------------------

/**
 * Find an available room of the correct type for `duration` consecutive slots.
 * Classroom preference: (1) class default room, (2) same-dept room, (3) any room
 * Lab preference:       (1) same-dept lab,      (2) any lab
 */
function findRoom(rooms, subject, day, slotIndex, roomMap, cls, duration, config) {
    const needsLab = subject.type === 'lab';
    const roomType = needsLab ? 'lab' : 'classroom';

    const slots = config ? (config.slots.toObject ? config.slots.toObject() : config.slots) : [];
    const startTimeStr = slots[slotIndex]?.start;
    const endTimeStr = slots[slotIndex + duration - 1]?.end;
    const startM = timeStrMins(startTimeStr);
    const endM = timeStrMins(endTimeStr);

    const freeForBlock = (roomId) => {
        if (!startM) return true; // Fallback if times missing
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

// --- Entry & note builders ---------------------------------------------------

/**
 * Build a normalized timetable entry.
 * Centralises all field defaults for consistency across phases.
 */
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

// --- Main entry point --------------------------------------------------------

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

    // --- Advisor Override ---------------------------------------------------
    // "Library" and "Tutor Ward Meeting" are defaulted to the Class Advisor
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
    // Harder-to-fit sessions go first: labs > projects > theory > elective ...
    // Within same type: longer duration first, then more required periods first.
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
/**
 * Try to place one session into the timetable.
 *
 * Hard constraints (HC, always enforced):
 *   HC1  No faculty double-booking
 *   HC2  No room double-booking  (via findRoom)
 *   HC3  No class double-booking
 *   HC4  duration consecutive class-type slots must exist
 *   HC5  Correct room type      (via findRoom)
 *
 * Soft constraints (SC, enforced only when relaxed=false):
 *   SC1  <= MAX_SAME_SUBJECT_PER_DAY periods of same subject per day (theory/elective/Non-Academic)
 *   SC2  <= 1 lab/project block per class per day
 *
 * Heuristics (always applied, influence slot ordering):
 *   H1  Prefer lighter days (fewer total entries for this class)
 *   H2  Prefer days where this subject hasn't appeared yet
 *   H3  Labs/projects prefer later slots in the day
 *   H4  Theory/elective prefer less-loaded slot indices
 *   H5  Projects prefer Saturday
 *
 * @returns {boolean} true if placed successfully
 */
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

    const sortedSlots = isBlock
        ? classSlots.slice().sort((a, b) => b.index - a.index)
        : classSlots.slice().sort((a, b) => {
              const ld = (slotLoad[a.index] || 0) - (slotLoad[b.index] || 0);
              return ld !== 0 ? ld : a.index - b.index;
          });

    for (const day of sortedDays) {
        // SC1
        if (!relaxed && isTheoryLike && (dayCount[day] || 0) >= MAX_SAME_SUBJECT_PER_DAY) continue;
        // SC2
        if (!relaxed && isBlock && dayHasOtherBlock(day)) continue;

        for (const slot of sortedSlots) {
            const start = slot.index;

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

            // All constraints satisfied — place the entry
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
/**
 * Try to place task by evicting a movable entry from a slot the task needs,
 * then re-placing that entry elsewhere (depth-1 backtracking).
 *
 * For each candidate blocker entry (non-fixed, same class):
 *   1. Check our faculty is free at the blocker slot (HC1 - cannot bypass)
 *   2. Temporarily remove blocker from entries + occupancy
 *   3. Try to re-place blocker elsewhere (relaxed = true)
 *   4. If blocker moved AND task fits -> commit; return true
 *   5. Otherwise undo all changes and try next candidate
 *
 * @returns {boolean} true if placed successfully
 */
function swapRepair(task, entries, maps, subjects, classes, rooms, getSlotConfig, getClassSlots) {
    const { mapping, subject, cls } = task;
    const config = getSlotConfig(cls.year);
    if (!config) return false;

    const duration = subject.duration || 1;
    const rawSlots = getRawSlots(config);
    const movable  = entries.filter(e => !e.isFixed && e.classId === cls.id);

    for (const blocker of movable) {
        const blockerDur = blocker.duration || 1;

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

            // Task still doesn't fit — undo blocker's new placement
            // placeTask always appends, so find the most-recently-added entry for the blocker
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

        // Restore blocker to its original position
        entries.splice(blockerIdx, 0, blocker);
        occupyBlock(maps, blocker.day, blocker.slotIndex, blockerDur, {
            facultyId: blocker.facultyId, labFaculty2Id: blocker.labFaculty2Id,
            roomId: blocker.roomId, classId: blocker.classId
        }, blockerConfig);
    }

    return false;
}

// --- Phase 7: Fill remaining free slots -------------------------------------
/**
 * Scan every empty non-break/lunch slot and fill it with an extra session.
 *
 * Distribution:
 *   Weighted round-robin where each subject's weight = periodsPerWeek(subject).
 *   Subjects with more total hours therefore appear proportionally more often,
 *   naturally distributing extra sessions in the same ratio as the curriculum load.
 *
 *   SC1 (max MAX_SAME_SUBJECT_PER_DAY per day) is tried first so no subject
 *   clusters into consecutive slots.  If every subject in the pool has already
 *   hit the daily cap the slot is retried without the cap, ensuring free slots
 *   are always filled when faculty/room permits.
 *
 * Rules:
 *   'activity' slots → only activity-type subjects
 *   'class' slots    → all non-lab, non-project, non-activity subjects
 *   Labs and projects are excluded (multi-slot blocks, handled in phases 4-6).
 *   Hard constraints HC1-HC5 are always respected.
 */
function fillFreeSlots(entries, maps, classes, subjects, rooms, facultySubjectMapping, getSlotConfig) {
    for (const cls of classes) {
        const config = getSlotConfig(cls.year);
        if (!config) continue;

        const days     = config.days;
        const allSlots = getRawSlots(config);
        const fillable = allSlots.map((s, i) => ({ type: s.type, index: i }))
                                 .filter(s => s.type !== 'break' && s.type !== 'lunch');

        // Base pool: theory and activity subjects only (as requested: only theory for gap-filling).
        // activity is kept to ensure activity slots can still be filled.
        const pool = facultySubjectMapping
            .filter(m => m.classId === cls.id)
            .map(m => ({ mapping: m, subject: subjects.find(s => s.id === m.subjectId) }))
            .filter(({ subject }) => subject && (subject.type === 'theory' || subject.type === 'activity'))
            .sort((a, b) => {
                const pd = (PRIORITY[a.subject.type] || 99) - (PRIORITY[b.subject.type] || 99);
                return pd !== 0 ? pd : (b.subject.totalHours || 0) - (a.subject.totalHours || 0);
            });

        if (pool.length === 0) continue;

        // Weighted pool: each subject repeated periodsPerWeek(subject) times.
        // e.g. Math(45h)→3 repeats, Physics(30h)→2 repeats, Elective(30h)→2 repeats
        // → rotation ratio 3:2:2 mirrors the curriculum hour ratio.
        const weightedPool = [];
        for (const p of pool) {
            const w = periodsPerWeek(p.subject);
            for (let i = 0; i < w; i++) weightedPool.push(p);
        }

        let rrIdx = 0;

        for (const day of days) {
            // Per-day count: initialised from phases 1-6 entries, updated as
            // gap-fill sessions are placed so SC1 is tracked live.
            const dayCount = {};
            for (const e of entries) {
                if (e.classId === cls.id && e.day === day && e.subjectId) {
                    dayCount[e.subjectId] = (dayCount[e.subjectId] || 0) + (e.duration || 1);
                }
            }

            for (const slot of fillable) {
                const k = slotKey(day, slot.index);
                if (isOccupied(maps.class, k, cls.id)) continue;

                // Two passes: pass 0 enforces SC1 (spread subjects across the day);
                // pass 1 relaxes SC1 so the slot is never left empty due to the cap alone.
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

// --- Public utilities --------------------------------------------------------

/**
 * Validate a swap between two timetable entries.
 * @returns {{ valid: boolean, reason?: string, violations?: string[] }}
 */
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

/**
 * Check all hard constraints across a complete set of entries.
 * Returns an array of human-readable violation strings (empty = no violations).
 */
export function checkConstraints(entries, data) {
    const violations  = [];
    const facultyReg  = {};
    const roomReg     = {};
    const classReg    = {};
    const periodCount = {};

    for (const e of entries) {
        const subject  = data.subjects ? data.subjects.find(s => s.id === e.subjectId) : null;
        const duration = e.duration || (subject && subject.duration) || 1;
        const freqKey  = e.classId + '-' + e.subjectId;
        periodCount[freqKey] = (periodCount[freqKey] || 0) + duration;

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
            if (classReg[ck]) violations.push('Class ' + e.classId + ' double-booked at ' + k);
            classReg[ck] = true;

            if (e.roomId) {
                const rk = e.roomId + '-' + k;
                if (roomReg[rk]) violations.push('Room ' + e.roomId + ' double-booked at ' + k);
                roomReg[rk] = true;
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

/**
 * Build a per-subject allocation summary for a timetable.
 * Returns one row per unique class+subject combination mapped in the system.
 */
export function buildAllocationSummary(entries, subjects, mappings, classes) {
    const summary = [];

    // Group mappings by class to make it easier to process
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
