
const SEMESTER_WEEKS = 15;

/** Convert total semester hours → weekly periods */
const weeklyPeriods = (subject) => Math.ceil((subject.totalHours || 1) / SEMESTER_WEEKS);

/**
 * Scheduling priority — lower number = place first.
 * Multi-slot blocks (lab, project) are placed before single-slot subjects
 * because they have fewer valid starting positions (harder to fit).
 */
const PRIORITY_MAP = { lab: 1, project: 2, theory: 3, elective: 4, 'Non-Academic': 5, activity: 6 };

// ─── Occupancy helpers ────────────────────────────────────────────────────────
const getKey     = (day, slotIdx) => `${day}-${slotIdx}`;
const isOccupied = (map, key, id) => !!(map[key] && map[key].has(id));
const occupy     = (map, key, id) => { if (!map[key]) map[key] = new Set(); map[key].add(id); };
const unoccupy   = (map, key, id) => { if (map[key]) map[key].delete(id); };

// ─── Main entry point ─────────────────────────────────────────────────────────
export function generateTimetable(data) {
    const { classes, subjects, rooms, timeSlotConfigs, defaultClasses, facultySubjectMapping } = data;

    const entries          = [];
    const conflicts        = [];
    const facultyOccupancy = {};
    const roomOccupancy    = {};
    const classOccupancy   = {};
    const occupancies      = { faculty: facultyOccupancy, room: roomOccupancy, class: classOccupancy };

    const getSlotConfig = (year) =>
        timeSlotConfigs.find(c => c.year === year) || timeSlotConfigs[0];

    const getClassSlots = (year) => {
        const config = getSlotConfig(year);
        if (!config) return [];
        const arr = config.slots.toObject ? config.slots.toObject() : config.slots;
        return arr.map((s, i) => ({ type: s.type, index: i })).filter(s => s.type === 'class');
    };

    // ─── Phase 1: Place fixed/default classes ─────────────────────────────────
    for (const dc of defaultClasses) {
        const mapping = facultySubjectMapping.find(
            m => m.subjectId === dc.subjectId && m.classId === dc.classId
        );
        if (!mapping) continue;

        const subject = subjects.find(s => s.id === dc.subjectId);
        const cls     = classes.find(c => c.id === dc.classId);
        if (!subject || !cls) continue;

        const dur  = subject.duration || 1;
        const room = findRoom(rooms, subject, dc.day, dc.slotIndex, roomOccupancy, cls, dur);
        if (!room) continue;

        entries.push({
            classId:       dc.classId,
            subjectId:     dc.subjectId,
            facultyId:     mapping.facultyId,
            roomId:        room.id,
            day:           dc.day,
            slotIndex:     dc.slotIndex,
            isLab:         subject.type === 'lab',
            labFaculty2Id: mapping.labFaculty2Id || null,
            isFixed:       true,
            duration:      dur,
            schedulingNote: buildNote(subject, false)
        });

        for (let d = 0; d < dur; d++) {
            const key = getKey(dc.day, dc.slotIndex + d);
            occupy(facultyOccupancy, key, mapping.facultyId);
            occupy(roomOccupancy,    key, room.id);
            occupy(classOccupancy,   key, dc.classId);
            if (mapping.labFaculty2Id) occupy(facultyOccupancy, key, mapping.labFaculty2Id);
        }
    }

    // ─── Phase 2: Build task list ──────────────────────────────────────────────
    // Each task = one session of a subject that still needs to be placed.
    const tasks = [];
    for (const mapping of facultySubjectMapping) {
        const subject = subjects.find(s => s.id === mapping.subjectId);
        const cls     = classes.find(c => c.id === mapping.classId);
        if (!subject || !cls) continue;

        const alreadyPlaced = entries
            .filter(e => e.classId === mapping.classId && e.subjectId === mapping.subjectId)
            .reduce((sum, e) => sum + (e.duration || 1), 0);

        const remaining   = weeklyPeriods(subject) - alreadyPlaced;
        if (remaining <= 0) continue;

        const dur         = subject.duration || 1;
        const numSessions = Math.ceil(remaining / dur);

        for (let i = 0; i < numSessions; i++) {
            const sessionDur = (i === numSessions - 1 && remaining % dur !== 0)
                ? (remaining % dur)
                : dur;
            tasks.push({ mapping, subject: { ...subject, duration: sessionDur }, cls });
        }
    }

    // ─── Phase 3: Order tasks — MRV heuristic (most constrained first) ─────────
    //
    // Ordering rules (in priority):
    //   1. Subject type priority  (lab → project → theory → elective → Non-Academic)
    //   2. Session duration       (longer blocks have fewer valid starting positions)
    //   3. Weekly periods needed  (more periods = more sessions to squeeze in)
    //
    // This approximates the Minimum Remaining Values (MRV) heuristic from CSP
    // theory: schedule the variable with the fewest legal values first, so
    // constraint violations are detected early and easy tasks fill open slots last.
    tasks.sort((a, b) => {
        const aPri = PRIORITY_MAP[a.subject.type] ?? 5;
        const bPri = PRIORITY_MAP[b.subject.type] ?? 5;
        if (aPri !== bPri) return aPri - bPri;

        const aDur = a.subject.duration ?? 1;
        const bDur = b.subject.duration ?? 1;
        if (bDur !== aDur) return bDur - aDur;   // longer duration first

        return weeklyPeriods(b.subject) - weeklyPeriods(a.subject); // more periods first
    });

    // ─── Phase 4: Greedy placement (hard + soft constraints) ──────────────────
    const unplacedAfterGreedy = [];
    for (const task of tasks) {
        const placed = placeTask(
            task, entries, occupancies, subjects, rooms,
            getSlotConfig, getClassSlots, false /* relaxed = false */
        );
        if (!placed) unplacedAfterGreedy.push(task);
    }

    // ─── Phase 5: Retry with relaxed soft constraints ─────────────────────────
    // Soft constraints dropped: max-2-theory-per-day and no-two-blocks-per-day.
    // Hard constraints (no double-booking) are NEVER relaxed.
    const unplacedAfterRelax = [];
    for (const task of unplacedAfterGreedy) {
        const placed = placeTask(
            task, entries, occupancies, subjects, rooms,
            getSlotConfig, getClassSlots, true /* relaxed = true */
        );
        if (!placed) unplacedAfterRelax.push(task);
    }

    // ─── Phase 6: Swap-based repair (depth-1 backtracking) ────────────────────
    // For each still-unplaced task, try to evict a movable entry from a slot
    // that our task could use, then re-place that entry elsewhere.
    // This is the key improvement over the old algorithm: instead of giving up
    // or over-filling, we make one targeted swap to create room.
    const finalUnplaced = [];
    for (const task of unplacedAfterRelax) {
        const placed = swapRepair(
            task, entries, occupancies, subjects, classes, rooms,
            getSlotConfig, getClassSlots
        );
        if (!placed) finalUnplaced.push(task);
    }

    // ─── Report truly unplaceable tasks ───────────────────────────────────────
    for (const { cls, subject } of finalUnplaced) {
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

// ─── Phase 4 / 5: Place a single task ─────────────────────────────────────────
/**
 * Try to place one session of a subject into the timetable.
 *
 * Hard constraints (always enforced):
 *   - No class double-booking
 *   - No faculty double-booking
 *   - Consecutive class-type slots must exist for multi-slot subjects
 *
 * Soft constraints (enforced when relaxed=false, dropped when relaxed=true):
 *   - Theory/elective: at most 2 periods of the same subject per day per class
 *   - Lab/project: at most one block-type session per day per class
 *
 * Placement preferences (slot ordering heuristics):
 *   - Labs/projects → prefer later slots in the day
 *   - Theory/elective → prefer earlier slots (mornings)
 *   - All types → prefer days where the subject has not appeared yet (spread)
 *   - Projects → prefer Saturday
 */
function placeTask(task, entries, { faculty: fOcc, room: rOcc, class: cOcc },
                   subjects, rooms, getSlotConfig, getClassSlots, relaxed) {
    const { mapping, subject, cls } = task;
    const config     = getSlotConfig(cls.year);
    if (!config)     return false;

    const classSlots  = getClassSlots(cls.year);
    const days        = config.days;
    const slotsNeeded = subject.duration || 1;
    const slotsArr    = config.slots.toObject ? config.slots.toObject() : config.slots;

    const isTheoryLike = ['theory', 'elective', 'Non-Academic'].includes(subject.type);
    const isBlockType  = ['lab', 'project'].includes(subject.type);
    const isProject    = subject.type === 'project';

    // Per-day occurrence count for this subject+class (used by soft constraints)
    const dayCount = {};
    entries
        .filter(e => e.classId === cls.id && e.subjectId === subject.id)
        .forEach(e => { dayCount[e.day] = (dayCount[e.day] || 0) + 1; });

    const existingDays = new Set(Object.keys(dayCount));

    // Returns true if `day` already has a different lab/project for this class
    const dayHasOtherBlock = (day) =>
        entries.some(e =>
            e.classId    === cls.id &&
            e.subjectId  !== subject.id &&
            e.subjectId  != null &&
            !e.isActivity &&
            e.day        === day &&
            subjects.find(s => s.id === e.subjectId &&
                (s.type === 'lab' || s.type === 'project'))
        );

    // Day ordering: prefer days where this subject hasn't appeared (spread)
    let sortedDays = [...days].sort(
        (a, b) => (existingDays.has(a) ? 1 : 0) - (existingDays.has(b) ? 1 : 0)
    );
    // Projects prefer Saturday
    if (isProject) {
        sortedDays.sort((a, b) => (a === 'Saturday' ? 0 : 1) - (b === 'Saturday' ? 0 : 1));
    }

    // Slot ordering: block types prefer later slots; theory prefers earlier
    const sortedSlots = isBlockType
        ? [...classSlots].sort((a, b) => b.index - a.index)
        : [...classSlots].sort((a, b) => a.index - b.index);

    for (const day of sortedDays) {
        // Soft constraint: theory/elective max 2 of the same subject per day
        if (!relaxed && isTheoryLike && (dayCount[day] || 0) >= 2) continue;
        // Soft constraint: only one block-type session per day per class
        if (!relaxed && isBlockType  && dayHasOtherBlock(day))       continue;

        for (const slot of sortedSlots) {
            const slotIdx = slot.index;

            // Hard constraint: consecutive class-type slots must exist
            if (slotsNeeded > 1) {
                let ok = true;
                for (let d = 0; d < slotsNeeded && ok; d++) {
                    const s = slotsArr[slotIdx + d];
                    if (!s || s.type !== 'class') ok = false;
                }
                if (!ok) continue;
            }

            // Hard constraint: no double-booking
            let allClear = true;
            for (let d = 0; d < slotsNeeded && allClear; d++) {
                const key = getKey(day, slotIdx + d);
                if (isOccupied(cOcc, key, cls.id))              allClear = false;
                if (isOccupied(fOcc, key, mapping.facultyId))  allClear = false;
                if (mapping.labFaculty2Id &&
                    isOccupied(fOcc, key, mapping.labFaculty2Id)) allClear = false;
            }
            if (!allClear) continue;

            // Find a suitable room for all required slots
            const room = findRoom(rooms, subject, day, slotIdx, rOcc, cls, slotsNeeded);
            if (!room) continue;

            // ✅ Place the entry
            entries.push({
                classId:       cls.id,
                subjectId:     subject.id,
                facultyId:     mapping.facultyId,
                roomId:        room.id,
                day,
                slotIndex:     slotIdx,
                isLab:         subject.type === 'lab',
                labFaculty2Id: mapping.labFaculty2Id || null,
                isFixed:       false,
                duration:      slotsNeeded,
                schedulingNote: buildNote(subject, relaxed)
            });

            for (let d = 0; d < slotsNeeded; d++) {
                const key = getKey(day, slotIdx + d);
                occupy(fOcc, key, mapping.facultyId);
                occupy(rOcc, key, room.id);
                occupy(cOcc, key, cls.id);
                if (mapping.labFaculty2Id) occupy(fOcc, key, mapping.labFaculty2Id);
            }

            return true;
        }
    }

    return false;
}

// ─── Phase 6: Swap-based repair (depth-1 backtracking) ────────────────────────
/**
 * Attempt to place `task` by evicting a movable (non-fixed) entry that is
 * blocking a slot the task needs, then re-placing that entry elsewhere.
 *
 * This is a depth-1 backtracking step: we try ONE swap per candidate slot.
 * Hard constraints are never violated — the evicted entry must find a valid
 * new home before we commit the swap.
 */
function swapRepair(task, entries, occupancies, subjects, classes, rooms,
                    getSlotConfig, getClassSlots) {
    const { mapping, subject, cls } = task;
    const { faculty: fOcc, room: rOcc, class: cOcc } = occupancies;
    const config      = getSlotConfig(cls.year);
    if (!config)      return false;

    const slotsNeeded = subject.duration || 1;
    const slotsArr    = config.slots.toObject ? config.slots.toObject() : config.slots;

    // Candidate blockers: non-fixed entries belonging to the same class
    const movable = entries.filter(e => !e.isFixed && e.classId === cls.id);

    for (const blocker of movable) {
        const blockerDur = blocker.duration || 1;

        // Skip if our task needs more slots than available starting from this position
        if (slotsNeeded > 1) {
            let ok = true;
            for (let d = 0; d < slotsNeeded && ok; d++) {
                const s = slotsArr[blocker.slotIndex + d];
                if (!s || s.type !== 'class') ok = false;
            }
            if (!ok) continue;
        }

        // Our faculty must be free at the blocker's slot (hard constraint — cannot swap around this)
        let facultyFree = true;
        for (let d = 0; d < slotsNeeded && facultyFree; d++) {
            const key = getKey(blocker.day, blocker.slotIndex + d);
            if (isOccupied(fOcc, key, mapping.facultyId))    facultyFree = false;
            if (mapping.labFaculty2Id &&
                isOccupied(fOcc, key, mapping.labFaculty2Id)) facultyFree = false;
        }
        if (!facultyFree) continue;

        // Temporarily remove the blocker from occupancy
        for (let d = 0; d < blockerDur; d++) {
            const key = getKey(blocker.day, blocker.slotIndex + d);
            unoccupy(cOcc, key, blocker.classId);
            unoccupy(fOcc, key, blocker.facultyId);
            if (blocker.labFaculty2Id) unoccupy(fOcc, key, blocker.labFaculty2Id);
            unoccupy(rOcc, key, blocker.roomId);
        }

        const blockerSubject = subjects.find(s => s.id === blocker.subjectId);
        const blockerCls     = classes.find(c  => c.id  === blocker.classId);
        const blockerIdx     = entries.indexOf(blocker);
        entries.splice(blockerIdx, 1);

        // Try to re-place the blocker in a different slot (relaxed = true)
        const blockerMoved = blockerSubject && blockerCls && placeTask(
            {
                mapping:  { facultyId: blocker.facultyId, labFaculty2Id: blocker.labFaculty2Id,
                            subjectId: blocker.subjectId, classId: blocker.classId },
                subject:  { ...blockerSubject, duration: blockerDur },
                cls:      blockerCls
            },
            entries, occupancies, subjects, rooms, getSlotConfig, getClassSlots, true
        );

        if (blockerMoved) {
            // Check whether the task fits at the blocker's old position now
            let canFit = true;
            for (let d = 0; d < slotsNeeded && canFit; d++) {
                const key = getKey(blocker.day, blocker.slotIndex + d);
                if (isOccupied(cOcc, key, cls.id)) canFit = false;
            }

            if (canFit) {
                const room = findRoom(rooms, subject, blocker.day, blocker.slotIndex, rOcc, cls, slotsNeeded);
                if (room) {
                    // ✅ Swap successful — place the task
                    entries.push({
                        classId:       cls.id,
                        subjectId:     subject.id,
                        facultyId:     mapping.facultyId,
                        roomId:        room.id,
                        day:           blocker.day,
                        slotIndex:     blocker.slotIndex,
                        isLab:         subject.type === 'lab',
                        labFaculty2Id: mapping.labFaculty2Id || null,
                        isFixed:       false,
                        duration:      slotsNeeded,
                        schedulingNote: buildNote(subject, true) + '; swap-repaired'
                    });
                    for (let d = 0; d < slotsNeeded; d++) {
                        const key = getKey(blocker.day, blocker.slotIndex + d);
                        occupy(fOcc, key, mapping.facultyId);
                        occupy(rOcc, key, room.id);
                        occupy(cOcc, key, cls.id);
                        if (mapping.labFaculty2Id) occupy(fOcc, key, mapping.labFaculty2Id);
                    }
                    return true;
                }
            }

            // Task still doesn't fit — undo the blocker's new placement
            const relocatedBlocker = entries.findLast(
                e => e.classId === blocker.classId && e.subjectId === blocker.subjectId && !e.isFixed
            );
            if (relocatedBlocker) {
                const rDur = relocatedBlocker.duration || 1;
                for (let d = 0; d < rDur; d++) {
                    const key = getKey(relocatedBlocker.day, relocatedBlocker.slotIndex + d);
                    unoccupy(cOcc, key, relocatedBlocker.classId);
                    unoccupy(fOcc, key, relocatedBlocker.facultyId);
                    if (relocatedBlocker.labFaculty2Id) unoccupy(fOcc, key, relocatedBlocker.labFaculty2Id);
                    unoccupy(rOcc, key, relocatedBlocker.roomId);
                }
                const rIdx = entries.indexOf(relocatedBlocker);
                if (rIdx !== -1) entries.splice(rIdx, 1);
            }
        }

        // Restore the blocker to its original position
        entries.splice(blockerIdx, 0, blocker);
        for (let d = 0; d < blockerDur; d++) {
            const key = getKey(blocker.day, blocker.slotIndex + d);
            occupy(cOcc, key, blocker.classId);
            occupy(fOcc, key, blocker.facultyId);
            if (blocker.labFaculty2Id) occupy(fOcc, key, blocker.labFaculty2Id);
            occupy(rOcc, key, blocker.roomId);
        }
    }

    return false;
}

// ─── Room finder ──────────────────────────────────────────────────────────────
/**
 * Find an available room of the correct type for `slotsNeeded` consecutive slots.
 * Preference order for classrooms: (1) class default room, (2) same-department
 * classroom, (3) any classroom.  Labs prefer same-department lab.
 */
function findRoom(rooms, subject, day, slotIdx, rOcc, cls, slotsNeeded) {
    const isLab    = subject.type === 'lab';
    const roomType = isLab ? 'lab' : 'classroom';

    const freeForAll = (roomId) => {
        for (let d = 0; d < slotsNeeded; d++) {
            if (rOcc[getKey(day, slotIdx + d)]?.has(roomId)) return false;
        }
        return true;
    };

    if (!isLab) {
        // 1. Class default room
        if (cls?.defaultRoomId) {
            const def = rooms.find(r => r.id === cls.defaultRoomId);
            if (def && freeForAll(def.id)) return def;
        }
        // 2. Same-department classroom
        const deptRoom = rooms.find(
            r => r.type === roomType && r.departmentId === subject.departmentId && freeForAll(r.id)
        );
        if (deptRoom) return deptRoom;
        // 3. Any free classroom
        return rooms.find(r => r.type === roomType && freeForAll(r.id)) || null;
    }

    // Lab: prefer same-department lab
    const deptLab = rooms.find(
        r => r.type === 'lab' && r.departmentId === subject.departmentId && freeForAll(r.id)
    );
    return deptLab || rooms.find(r => r.type === 'lab' && freeForAll(r.id)) || null;
}

// ─── Note builder ─────────────────────────────────────────────────────────────
/** Build a human-readable scheduling note based on subject type and placement mode. */
function buildNote(subject, relaxed) {
    const typeNotes = {
        lab:            `Lab: ${subject.duration || 2}-slot consecutive block`,
        project:        `Project: ${subject.duration || 2}-slot consecutive block`,
        elective:       'Elective: spread across week',
        'Non-Academic': 'Non-Academic: spread across week',
    };
    let note = typeNotes[subject.type] || 'Theory: spread across week';
    if (relaxed) note += '; constraint-relaxed';
    return note;
}

/**
 * Validate a swap operation
 */
export function validateSwap(entries, entryIndex1, entryIndex2, data) {
    const e1 = entries[entryIndex1];
    const e2 = entries[entryIndex2];

    if (!e1 || !e2) return { valid: false, reason: 'Invalid entry indices' };
    if (e1.isFixed || e2.isFixed) return { valid: false, reason: 'Cannot swap fixed slots' };

    const swapped = [...entries];
    swapped[entryIndex1] = { ...e1, day: e2.day, slotIndex: e2.slotIndex, roomId: e2.roomId };
    swapped[entryIndex2] = { ...e2, day: e1.day, slotIndex: e1.slotIndex, roomId: e1.roomId };

    const violations = checkConstraints(swapped, data);
    if (violations.length > 0) {
        return { valid: false, reason: 'Swap creates conflicts', violations };
    }

    return { valid: true };
}

export function checkConstraints(entries, data) {
    const violations = [];
    const facultySlots = {};
    const roomSlots = {};
    const classSlots = {};
    const frequencyCount = {};

    for (const entry of entries) {
        const freqKey = `${entry.classId}-${entry.subjectId}`;
        frequencyCount[freqKey] = (frequencyCount[freqKey] || 0) + 1;

        const subject = data.subjects ? data.subjects.find(s => s.id === entry.subjectId) : null;
        const duration = entry.duration || subject?.duration || 1;

        for (let d = 0; d < duration; d++) {
            const key = `${entry.day}-${entry.slotIndex + d}`;

            // Faculty double-booking
            if (entry.facultyId) {
                const fKey = `${entry.facultyId}-${key}`;
                if (facultySlots[fKey]) violations.push(`Faculty ${entry.facultyId} double-booked at ${key}`);
                facultySlots[fKey] = true;
            }

            if (entry.labFaculty2Id) {
                const f2Key = `${entry.labFaculty2Id}-${key}`;
                if (facultySlots[f2Key]) violations.push(`Lab faculty ${entry.labFaculty2Id} double-booked at ${key}`);
                facultySlots[f2Key] = true;
            }

            // Class double-booking
            const cKey = `${entry.classId}-${key}`;
            if (classSlots[cKey]) violations.push(`Class ${entry.classId} double-booked at ${key}`);
            classSlots[cKey] = true;

            // Room double-booking
            if (entry.roomId) {
                const rKey = `${entry.roomId}-${key}`;
                if (roomSlots[rKey]) violations.push(`Room ${entry.roomId} double-booked at ${key}`);
                roomSlots[rKey] = true;
            }
        }

        // Room type validation
        if (data.rooms && entry.roomId) {
            const room = data.rooms.find(r => r.id === entry.roomId);
            const expectedType = subject?.type === 'lab' ? 'lab' : 'classroom';
            if (room && room.type !== expectedType) {
                violations.push(`Room ${entry.roomId} is ${room.type} but subject requires ${expectedType}`);
            }
        }

        // Faculty qualification check
        if (data.facultySubjectMapping) {
            const mapping = data.facultySubjectMapping.find(m =>
                m.classId === entry.classId &&
                m.subjectId === entry.subjectId &&
                m.facultyId === entry.facultyId
            );
            if (!mapping) {
                violations.push(`Faculty ${entry.facultyId} not mapped to teach ${entry.subjectId} for class ${entry.classId}`);
            }
        }
    }

    // Weekly periods constraint (totalHours ÷ SEMESTER_WEEKS)
    if (data.facultySubjectMapping && data.subjects) {
        for (const mapping of data.facultySubjectMapping) {
            const subject = data.subjects.find(s => s.id === mapping.subjectId);
            if (!subject) continue;
            const key = `${mapping.classId}-${mapping.subjectId}`;
            const count = frequencyCount[key] || 0;
            const expected = weeklyPeriods(subject);
            if (count !== expected) {
                violations.push(`Subject ${mapping.subjectId} for class ${mapping.classId} scheduled ${count} period(s) but requires ${expected} weekly periods (from ${subject.totalHours} total hours)`);
            }
        }
    }

    return violations;
}

/**
 * Build an allocation summary for a timetable — returns per-subject stats with notes
 */
export function buildAllocationSummary(entries, subjects, facultySubjectMapping) {
    const summary = [];

    // Subject entries
    const seen = new Set();
    for (const entry of entries) {
        if (!entry.subjectId || entry.isActivity) continue;
        const key = `${entry.classId}-${entry.subjectId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const subject = subjects.find(s => s.id === entry.subjectId);
        if (!subject) continue;

        const subjectEntries = entries.filter(e => e.classId === entry.classId && e.subjectId === entry.subjectId);
        const allocatedPeriods = subjectEntries.reduce((sum, e) => sum + (e.duration || 1), 0);

        const notes = [...new Set(subjectEntries.map(e => e.schedulingNote).filter(Boolean))].join('; ');

        summary.push({
            courseTitle: subject.name,
            courseCode: subject.code,
            allocatedPeriods,
            schedulingNote: notes || buildNote(subject, false)
        });
    }

    return summary;
}
