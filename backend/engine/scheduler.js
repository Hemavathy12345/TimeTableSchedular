
const FIXED_ACTIVITIES = [
    { label: 'Library',             periodsPerWeek: 1, duration: 1 },
    { label: 'Tutor Ward Meeting',  periodsPerWeek: 1, duration: 1 },
    { label: 'Aptitude',            periodsPerWeek: 1, duration: 1 },
    { label: 'Soft Skills',         periodsPerWeek: 2, duration: 2 }, // 2 consecutive
];
// Total fixed = 5 slots/week → 42 - 5 = 37 available for subjects

export function generateTimetable(data) {
    const { classes, subjects, faculty, rooms, timeSlotConfigs, defaultClasses, facultySubjectMapping } = data;

    const entries = [];
    const conflicts = [];

    // Track occupancy: key = "day-slotIndex"
    const facultyOccupancy = {};
    const roomOccupancy = {};
    const classOccupancy = {};  // per-class occupancy map

    const getKey = (day, slotIdx) => `${day}-${slotIdx}`;

    const isOccupied = (map, key, id) => map[key] && map[key].has(id);

    const occupy = (map, key, id) => {
        if (!map[key]) map[key] = new Set();
        map[key].add(id);
    };

    const unoccupy = (map, key, id) => {
        if (map[key]) map[key].delete(id);
    };

    const getSlotConfig = (year) =>
        timeSlotConfigs.find(c => c.year === year) || timeSlotConfigs[0];

    // Get only 'class'-type slot indices for a given year config
    const getClassSlots = (year) => {
        const config = getSlotConfig(year);
        if (!config) return [];
        const slotsArray = config.slots.toObject ? config.slots.toObject() : config.slots;
        return slotsArray
            .map((s, idx) => ({ type: s.type, index: idx }))
            .filter(s => s.type === 'class');
    };

    // ─── Step 1: Inject fixed activity slots for each class ──────────────────
    for (const cls of classes) {
        const config = getSlotConfig(cls.year);
        if (!config) continue;
        const classSlots = getClassSlots(cls.year);
        const days = config.days;

        // We'll try to spread fixed activities to the last available slots of distinct days
        // to keep mornings free for subject classes
        const sortedDays = [...days]; // iterate in order
        let fixedActivityDayIdx = 0;

        const configObj = config.toObject ? config.toObject() : config;
        const slots = configObj.slots || [];
        
        for (const activity of FIXED_ACTIVITIES) {
            let remainingPeriods = activity.periodsPerWeek;

            while (remainingPeriods > 0) {
                let placed = false;

                for (let di = 0; di < sortedDays.length && !placed; di++) {
                    const day = sortedDays[di];

                    const slotsToTry = [...classSlots].sort((a, b) => a.index - b.index);
                    for (const slot of slotsToTry) {
                        if (placed) break;
                        const slotIdx = Number(slot.index);
                        
                        let allFree = true;
                        for (let d = 0; d < activity.duration; d++) {
                            const currentIdx = slotIdx + d;
                            const nextSlot = slots[currentIdx];
                            if (!nextSlot || nextSlot.type !== 'class') { 
                                allFree = false; 
                                break; 
                            }
                            if (isOccupied(classOccupancy, getKey(day, currentIdx), cls.id)) { 
                                allFree = false; 
                                break; 
                            }
                        }
                        
                        if (allFree) {
                            const entry = {
                                classId: cls.id,
                                subjectId: null,
                                facultyId: null,
                                roomId: null,
                                day,
                                slotIndex: slotIdx,
                                isLab: false,
                                labFaculty2Id: null,
                                isFixed: true,
                                isActivity: true,
                                activityLabel: activity.label,
                                duration: activity.duration,
                                schedulingNote: 'Fixed activity'
                            };
                            entries.push(entry);

                            for (let d = 0; d < activity.duration; d++) {
                                occupy(classOccupancy, getKey(day, slotIdx + d), cls.id);
                            }
                            placed = true;
                            // Update shared day pointer for the NEXT fixed activity (if we still want to spread them)
                            fixedActivityDayIdx = (di + 1) % sortedDays.length;
                        }
                    }
                }

                if (!placed) {
                    conflicts.push({
                        classId: cls.id,
                        className: cls.name,
                        reason: `Could not place fixed activity: ${activity.label}. Insufficient slots for duration ${activity.duration}.`
                    });
                }
                remainingPeriods -= activity.duration; 
            }
        }
    }

    // ─── Step 2: Place user-defined default (fixed) classes ──────────────────
    for (const dc of defaultClasses) {
        const mapping = facultySubjectMapping.find(
            m => m.subjectId === dc.subjectId && m.classId === dc.classId
        );
        if (!mapping) continue;

        const subject = subjects.find(s => s.id === dc.subjectId);
        const cls = classes.find(c => c.id === dc.classId);
        if (!subject || !cls) continue;

        const room = findAvailableRoom(rooms, subject, dc.day, dc.slotIndex, roomOccupancy, getKey, cls);

        if (room) {
            const entry = {
                classId: dc.classId,
                subjectId: dc.subjectId,
                facultyId: mapping.facultyId,
                roomId: room.id,
                day: dc.day,
                slotIndex: dc.slotIndex,
                isLab: subject.type === 'lab',
                labFaculty2Id: mapping.labFaculty2Id || null,
                isFixed: true,
                duration: subject.duration || 1,
                schedulingNote: buildNote(subject, false)
            };

            entries.push(entry);
            occupy(facultyOccupancy, getKey(dc.day, dc.slotIndex), mapping.facultyId);
            occupy(roomOccupancy, getKey(dc.day, dc.slotIndex), room.id);
            occupy(classOccupancy, getKey(dc.day, dc.slotIndex), dc.classId);

            if (mapping.labFaculty2Id) {
                occupy(facultyOccupancy, getKey(dc.day, dc.slotIndex), mapping.labFaculty2Id);
            }

            if (subject.duration > 1) {
                for (let d = 1; d < subject.duration; d++) {
                    occupy(facultyOccupancy, getKey(dc.day, dc.slotIndex + d), mapping.facultyId);
                    occupy(roomOccupancy, getKey(dc.day, dc.slotIndex + d), room.id);
                    occupy(classOccupancy, getKey(dc.day, dc.slotIndex + d), dc.classId);
                    if (mapping.labFaculty2Id) {
                        occupy(facultyOccupancy, getKey(dc.day, dc.slotIndex + d), mapping.labFaculty2Id);
                    }
                }
            }
        }
    }

    const tasks = [];
    for (const mapping of facultySubjectMapping) {
        const subject = subjects.find(s => s.id === mapping.subjectId);
        const cls = classes.find(c => c.id === mapping.classId);
        if (!subject || !cls) continue;

        const alreadyPlacedPeriods = entries
            .filter(e => e.classId === mapping.classId && e.subjectId === mapping.subjectId)
            .reduce((sum, e) => sum + (e.duration || 1), 0);

        const remainingPeriods = subject.weeklyFrequency - alreadyPlacedPeriods;
        const dur = subject.duration || 1;
        const numSessions = Math.ceil(remainingPeriods / dur);

        for (let i = 0; i < numSessions; i++) {
            // If the last session has to be shorter than regular duration
            const sessionDur = (i === numSessions - 1 && remainingPeriods % dur !== 0) 
                               ? (remainingPeriods % dur) 
                               : dur;
            
            tasks.push({ 
                mapping, 
                subject: { ...subject, duration: sessionDur }, 
                cls 
            });
        }
    }

    // Sort: labs/projects first (harder to place), then by lower frequency
    tasks.sort((a, b) => {
        const aIsBlock = a.subject.type === 'lab' || a.subject.type === 'project';
        const bIsBlock = b.subject.type === 'lab' || b.subject.type === 'project';
        if (aIsBlock && !bIsBlock) return -1;
        if (!aIsBlock && bIsBlock) return 1;
        return a.subject.weeklyFrequency - b.subject.weeklyFrequency;
    });

    // ─── Step 4: Assign each task ─────────────────────────────────────────────
    const unplacedTasks = [];

    for (const task of tasks) {
        const placed = tryPlaceTask(task, entries, conflicts, facultyOccupancy, roomOccupancy, classOccupancy, subjects, classes, rooms, timeSlotConfigs, getKey, isOccupied, occupy, getSlotConfig, getClassSlots, false);
        if (!placed) {
            unplacedTasks.push(task);
        }
    }

    // ─── Step 5: Redistribution — retry unplaced tasks ────────────────────────
    const stillUnplaced = [];
    for (const task of unplacedTasks) {
        const placed = tryPlaceTask(task, entries, conflicts, facultyOccupancy, roomOccupancy, classOccupancy, subjects, classes, rooms, timeSlotConfigs, getKey, isOccupied, occupy, getSlotConfig, getClassSlots, true /* redistribution mode */);
        if (!placed) {
            stillUnplaced.push(task);
        }
    }

    // Report truly unplaceable tasks as conflicts
    for (const task of stillUnplaced) {
        const { mapping, subject, cls } = task;
        conflicts.push({
            classId: cls.id,
            className: cls.name,
            subjectId: subject.id,
            subjectName: subject.name,
            reason: 'Could not find a valid slot — all constraints violated after redistribution'
        });
    }

    return { entries, conflicts };
}

/**
 * Attempt to place a single task (subject occurrence) into the timetable.
 * @param {boolean} redistributionMode - if true, relaxes the "prefer new days" soft constraint
 */
function tryPlaceTask(task, entries, conflicts, facultyOccupancy, roomOccupancy, classOccupancy,
    subjects, classes, rooms, timeSlotConfigs, getKey, isOccupied, occupy, getSlotConfig, getClassSlots, redistributionMode) {

    const { mapping, subject, cls } = task;
    const config = getSlotConfig(cls.year);
    if (!config) return false;

    const classSlots = getClassSlots(cls.year);
    const days = config.days;

    const isTheoryLike = subject.type === 'theory' || subject.type === 'elective';
    const isBlockType  = subject.type === 'lab' || subject.type === 'project';

    // Soft constraint: track which days this subject already appears (spread constraint)
    const existingDays = new Set(
        entries
            .filter(e => e.classId === cls.id && e.subjectId === subject.id)
            .map(e => e.day)
    );

    // Count how many times subject appears per day (for theory ≤ 2 per day constraint)
    const dayCount = {};
    entries
        .filter(e => e.classId === cls.id && e.subjectId === subject.id)
        .forEach(e => { dayCount[e.day] = (dayCount[e.day] || 0) + 1; });

    // Prefer days where this subject hasn't appeared yet
    const sortedDays = [...days].sort((a, b) => {
        const aHas = existingDays.has(a) ? 1 : 0;
        const bHas = existingDays.has(b) ? 1 : 0;
        return aHas - bHas;
    });

    for (const day of sortedDays) {
        // Theory/elective: skip day if already appearing ≥ 2 times (unless in redistribution with no choice)
        if (isTheoryLike && !redistributionMode && (dayCount[day] || 0) >= 2) continue;

        // Slot ordering: labs/projects prefer later slots, theory prefers morning
        let sortedSlots;
        if (isBlockType) {
            sortedSlots = [...classSlots].sort((a, b) => b.index - a.index);
        } else {
            sortedSlots = [...classSlots].sort((a, b) => a.index - b.index);
        }

        for (const slot of sortedSlots) {
            const slotIdx = slot.index;
            const slotsNeeded = subject.duration || 1;

            // Verify consecutive class-type slots are available for multi-slot subjects
            if (slotsNeeded > 1) {
                let consecutiveOk = true;
                for (let d = 0; d < slotsNeeded; d++) {
                    const nextSlot = config.slots[slotIdx + d];
                    if (!nextSlot || nextSlot.type !== 'class') { consecutiveOk = false; break; }
                }
                if (!consecutiveOk) continue;
            }

            // Check hard constraints for all required slots
            let allClear = true;
            for (let d = 0; d < slotsNeeded; d++) {
                const key = getKey(day, slotIdx + d);
                if (isOccupied(classOccupancy, key, cls.id)) { allClear = false; break; }
                if (isOccupied(facultyOccupancy, key, mapping.facultyId)) { allClear = false; break; }
                if (mapping.labFaculty2Id && isOccupied(facultyOccupancy, key, mapping.labFaculty2Id)) {
                    allClear = false; break;
                }
            }
            if (!allClear) continue;

            // Find an available room for all required slots
            const room = findAvailableRoomForSlots(rooms, subject, day, slotIdx, slotsNeeded, roomOccupancy, getKey, cls);
            if (!room) continue;

            // ✅ Place it
            const entry = {
                classId: cls.id,
                subjectId: subject.id,
                facultyId: mapping.facultyId,
                roomId: room.id,
                day,
                slotIndex: slotIdx,
                isLab: subject.type === 'lab',
                labFaculty2Id: mapping.labFaculty2Id || null,
                isFixed: false,
                duration: slotsNeeded,
                schedulingNote: buildNote(subject, redistributionMode)
            };

            entries.push(entry);

            for (let d = 0; d < slotsNeeded; d++) {
                const key = getKey(day, slotIdx + d);
                occupy(facultyOccupancy, key, mapping.facultyId);
                occupy(roomOccupancy, key, room.id);
                occupy(classOccupancy, key, cls.id);
                if (mapping.labFaculty2Id) occupy(facultyOccupancy, key, mapping.labFaculty2Id);
            }

            return true;
        }
    }

    return false;
}

/** Build a human-readable scheduling note based on subject type and placement mode */
function buildNote(subject, redistributed) {
    let note = '';
    if (subject.type === 'lab') {
        note = `Lab: consecutive ${subject.duration || 2}-slot block`;
    } else if (subject.type === 'project') {
        note = `Project: consecutive ${subject.duration || 2}-slot block`;
    } else if (subject.type === 'elective') {
        note = 'Elective: spread across week';
    } else {
        note = 'Theory: spread across week';
    }
    if (redistributed) note += '; Redistributed';
    return note;
}

function findAvailableRoom(rooms, subject, day, slotIdx, roomOccupancy, getKey, cls) {
    if (subject.type === 'theory' || subject.type === 'elective') {
        if (!cls || !cls.defaultRoomId) return null;
        const room = rooms.find(r => r.id === cls.defaultRoomId);
        if (!room) return null;
        const key = getKey(day, slotIdx);
        return (!roomOccupancy[key] || !roomOccupancy[key].has(room.id)) ? room : null;
    }

    const type = 'lab';
    const available = rooms.filter(r => {
        if (r.type !== type) return false;
        const key = getKey(day, slotIdx);
        return !roomOccupancy[key] || !roomOccupancy[key].has(r.id);
    });
    const deptRoom = available.find(r => r.departmentId === subject.departmentId);
    return deptRoom || available[0] || null;
}

function findAvailableRoomForSlots(rooms, subject, day, slotIdx, slotsNeeded, roomOccupancy, getKey, cls) {
    // If theory or elective, use class default room
    if (subject.type === 'theory' || subject.type === 'elective') {
        if (!cls || !cls.defaultRoomId) return null;
        const targetRoomId = cls.defaultRoomId;
        const room = rooms.find(r => r.id === targetRoomId);
        if (!room) return null;

        // Check availability for all slots
        for (let d = 0; d < slotsNeeded; d++) {
            const key = getKey(day, slotIdx + d);
            if (roomOccupancy[key] && roomOccupancy[key].has(room.id)) return null;
        }
        return room;
    }

    // If lab, find any available lab room
    const type = 'lab';
    const available = rooms.filter(r => {
        if (r.type !== type) return false;
        for (let d = 0; d < slotsNeeded; d++) {
            const key = getKey(day, slotIdx + d);
            if (roomOccupancy[key] && roomOccupancy[key].has(r.id)) return false;
        }
        return true;
    });

    const deptRoom = available.find(r => r.departmentId === subject.departmentId);
    return deptRoom || available[0] || null;
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
        if (entry.isActivity) continue; // Skip fixed activity slots

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

    // Weekly frequency constraint
    if (data.facultySubjectMapping && data.subjects) {
        for (const mapping of data.facultySubjectMapping) {
            const subject = data.subjects.find(s => s.id === mapping.subjectId);
            if (!subject) continue;
            const key = `${mapping.classId}-${mapping.subjectId}`;
            const count = frequencyCount[key] || 0;
            if (count !== subject.weeklyFrequency) {
                violations.push(`Subject ${mapping.subjectId} for class ${mapping.classId} scheduled ${count}× but requires ${subject.weeklyFrequency}×`);
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
    const FIXED_LABEL_PERIODS = { 'Library': 1, 'Tutor Ward Meeting': 1, 'Aptitude': 1, 'Soft Skills': 2 };

    // Fixed activities (one row per activity label, class-agnostic summary)
    const activitySeen = new Set();
    for (const entry of entries) {
        if (entry.isActivity && entry.activityLabel && !activitySeen.has(entry.activityLabel)) {
            activitySeen.add(entry.activityLabel);
            summary.push({
                courseTitle: entry.activityLabel,
                courseCode: '-',
                credits: 0,
                allocatedPeriods: FIXED_LABEL_PERIODS[entry.activityLabel] || 1,
                schedulingNote: 'Fixed activity slot'
            });
        }
    }

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
            credits: subject.credits || 0,
            allocatedPeriods,
            schedulingNote: notes || buildNote(subject, false)
        });
    }

    return summary;
}
