/**
 * Scheduling Engine — Greedy constraint-satisfaction with backtracking
 * 
 * Steps:
 * 1. Load all classes, subjects, faculty mappings, rooms, time slot configs
 * 2. Place "default classes" (fixed slots) first
 * 3. For each (class, subject, weeklyFrequency) combination, try to assign a valid (day, slot, room, faculty)
 * 4. Check hard constraints: no double-booking of faculty, rooms, or labs
 * 5. Return completed timetable or list of unresolved conflicts
 */

export function generateTimetable(data) {
    const { classes, subjects, faculty, rooms, timeSlotConfigs, defaultClasses, facultySubjectMapping } = data;

    const entries = [];
    const conflicts = [];

    // Track occupancy: key = "day-slotIndex", value = Set of IDs
    const facultyOccupancy = {};   // "day-slotIdx" -> Set<facultyId>
    const roomOccupancy = {};      // "day-slotIdx" -> Set<roomId>
    const classOccupancy = {};     // "day-slotIdx" -> Set<classId>

    const getKey = (day, slotIdx) => `${day}-${slotIdx}`;

    const isOccupied = (map, key, id) => {
        return map[key] && map[key].has(id);
    };

    const occupy = (map, key, id) => {
        if (!map[key]) map[key] = new Set();
        map[key].add(id);
    };

    const unoccupy = (map, key, id) => {
        if (map[key]) map[key].delete(id);
    };

    // Get the time slot config for a given year
    const getSlotConfig = (year) => {
        return timeSlotConfigs.find(c => c.year === year) || timeSlotConfigs[0];
    };

    // Get usable (class-type) slot indices for a year
    const getClassSlots = (year) => {
        const config = getSlotConfig(year);
        if (!config) return [];
        return config.slots
            .map((s, idx) => ({ ...s, index: idx }))
            .filter(s => s.type === 'class');
    };

    // Step 1: Place default (fixed) classes first
    for (const dc of defaultClasses) {
        const mapping = facultySubjectMapping.find(
            m => m.subjectId === dc.subjectId && m.classId === dc.classId
        );
        if (!mapping) continue;

        const subject = subjects.find(s => s.id === dc.subjectId);
        const cls = classes.find(c => c.id === dc.classId);
        if (!subject || !cls) continue;

        const room = findAvailableRoom(rooms, subject, dc.day, dc.slotIndex, roomOccupancy, getKey);

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
                isFixed: true
            };

            entries.push(entry);
            occupy(facultyOccupancy, getKey(dc.day, dc.slotIndex), mapping.facultyId);
            occupy(roomOccupancy, getKey(dc.day, dc.slotIndex), room.id);
            occupy(classOccupancy, getKey(dc.day, dc.slotIndex), dc.classId);

            if (mapping.labFaculty2Id) {
                occupy(facultyOccupancy, getKey(dc.day, dc.slotIndex), mapping.labFaculty2Id);
            }

            // For labs, also occupy the next slot
            if (subject.type === 'lab' && subject.duration > 1) {
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

    // Step 2: Build assignment tasks - (class, subject, faculty mapping) × weeklyFrequency
    const tasks = [];
    for (const mapping of facultySubjectMapping) {
        const subject = subjects.find(s => s.id === mapping.subjectId);
        const cls = classes.find(c => c.id === mapping.classId);
        if (!subject || !cls) continue;

        // Count how many times this subject is already placed for this class (from defaults)
        const alreadyPlaced = entries.filter(
            e => e.classId === mapping.classId && e.subjectId === mapping.subjectId
        ).length;

        const remaining = subject.weeklyFrequency - alreadyPlaced;
        for (let i = 0; i < remaining; i++) {
            tasks.push({ mapping, subject, cls });
        }
    }

    // Shuffle tasks to improve distribution (most constrained first - labs first, then rare subjects)
    tasks.sort((a, b) => {
        // Labs first (harder to place)
        if (a.subject.type === 'lab' && b.subject.type !== 'lab') return -1;
        if (a.subject.type !== 'lab' && b.subject.type === 'lab') return 1;
        // Then by lower weekly frequency (rarer subjects are harder to place)
        return a.subject.weeklyFrequency - b.subject.weeklyFrequency;
    });

    // Step 3: Assign each task
    for (const task of tasks) {
        const { mapping, subject, cls } = task;
        const config = getSlotConfig(cls.year);
        if (!config) {
            conflicts.push({ classId: cls.id, subjectId: subject.id, reason: 'No time slot config for year ' + cls.year });
            continue;
        }

        const classSlots = getClassSlots(cls.year);
        const days = config.days;
        let placed = false;

        // Track which days this subject already appears for this class (soft constraint: spread across week)
        const existingDays = new Set(
            entries
                .filter(e => e.classId === cls.id && e.subjectId === subject.id)
                .map(e => e.day)
        );

        // Try days where this subject doesn't already appear first
        const sortedDays = [...days].sort((a, b) => {
            const aHas = existingDays.has(a) ? 1 : 0;
            const bHas = existingDays.has(b) ? 1 : 0;
            return aHas - bHas;
        });

        for (const day of sortedDays) {
            if (placed) break;

            // Soft constraint: prefer morning for theory, afternoon for labs
            let sortedSlots;
            if (subject.type === 'lab') {
                sortedSlots = [...classSlots].sort((a, b) => b.index - a.index); // later slots first for labs
            } else {
                sortedSlots = [...classSlots].sort((a, b) => a.index - b.index); // earlier slots first for theory
            }

            for (const slot of sortedSlots) {
                if (placed) break;

                const slotIdx = slot.index;

                // For labs, check consecutive slots
                if (subject.type === 'lab' && subject.duration > 1) {
                    // Check that enough consecutive class-type slots exist
                    let consecutiveOk = true;
                    for (let d = 0; d < subject.duration; d++) {
                        const nextSlot = config.slots[slotIdx + d];
                        if (!nextSlot || nextSlot.type !== 'class') {
                            consecutiveOk = false;
                            break;
                        }
                    }
                    if (!consecutiveOk) continue;
                }

                // Check hard constraints for all required slots
                let allClear = true;
                const slotsToCheck = subject.type === 'lab' ? subject.duration : 1;

                for (let d = 0; d < slotsToCheck; d++) {
                    const key = getKey(day, slotIdx + d);

                    // Class not occupied
                    if (isOccupied(classOccupancy, key, cls.id)) { allClear = false; break; }

                    // Faculty 1 not occupied
                    if (isOccupied(facultyOccupancy, key, mapping.facultyId)) { allClear = false; break; }

                    // Faculty 2 not occupied (for labs)
                    if (mapping.labFaculty2Id && isOccupied(facultyOccupancy, key, mapping.labFaculty2Id)) {
                        allClear = false; break;
                    }
                }

                if (!allClear) continue;

                // Find an available room
                const room = findAvailableRoomForSlots(
                    rooms, subject, day, slotIdx, slotsToCheck, roomOccupancy, getKey
                );

                if (!room) continue;

                // Place it!
                const entry = {
                    classId: cls.id,
                    subjectId: subject.id,
                    facultyId: mapping.facultyId,
                    roomId: room.id,
                    day,
                    slotIndex: slotIdx,
                    isLab: subject.type === 'lab',
                    labFaculty2Id: mapping.labFaculty2Id || null,
                    isFixed: false
                };

                entries.push(entry);

                for (let d = 0; d < slotsToCheck; d++) {
                    const key = getKey(day, slotIdx + d);
                    occupy(facultyOccupancy, key, mapping.facultyId);
                    occupy(roomOccupancy, key, room.id);
                    occupy(classOccupancy, key, cls.id);
                    if (mapping.labFaculty2Id) {
                        occupy(facultyOccupancy, key, mapping.labFaculty2Id);
                    }
                }

                placed = true;
            }
        }

        if (!placed) {
            conflicts.push({
                classId: cls.id,
                className: cls.name,
                subjectId: subject.id,
                subjectName: subject.name,
                reason: 'Could not find a valid slot — all constraints violated'
            });
        }
    }

    return { entries, conflicts };
}

function findAvailableRoom(rooms, subject, day, slotIdx, roomOccupancy, getKey) {
    const type = subject.type === 'lab' ? 'lab' : 'classroom';
    const available = rooms.filter(r => {
        if (r.type !== type) return false;
        const key = getKey(day, slotIdx);
        return !roomOccupancy[key] || !roomOccupancy[key].has(r.id);
    });
    // Prefer rooms from same department
    const deptRoom = available.find(r => r.departmentId === subject.departmentId);
    return deptRoom || available[0] || null;
}

function findAvailableRoomForSlots(rooms, subject, day, slotIdx, slotsNeeded, roomOccupancy, getKey) {
    const type = subject.type === 'lab' ? 'lab' : 'classroom';
    const available = rooms.filter(r => {
        if (r.type !== type) return false;
        for (let d = 0; d < slotsNeeded; d++) {
            const key = getKey(day, slotIdx + d);
            if (roomOccupancy[key] && roomOccupancy[key].has(r.id)) return false;
        }
        return true;
    });
    // Prefer rooms from same department
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

    // Simulate the swap
    const swapped = [...entries];
    swapped[entryIndex1] = {
        ...e1,
        day: e2.day,
        slotIndex: e2.slotIndex,
        roomId: e2.roomId
    };
    swapped[entryIndex2] = {
        ...e2,
        day: e1.day,
        slotIndex: e1.slotIndex,
        roomId: e1.roomId
    };

    // Re-check constraints
    const violations = checkConstraints(swapped, data);
    if (violations.length > 0) {
        return { valid: false, reason: 'Swap creates conflicts', violations };
    }

    return { valid: true };
}

function checkConstraints(entries, data) {
    const violations = [];
    const facultySlots = {};
    const roomSlots = {};

    for (const entry of entries) {
        const duration = entry.isLab ? (data.subjects.find(s => s.id === entry.subjectId)?.duration || 2) : 1;

        for (let d = 0; d < duration; d++) {
            const key = `${entry.day}-${entry.slotIndex + d}`;

            // Check faculty
            const fKey = `${entry.facultyId}-${key}`;
            if (facultySlots[fKey]) {
                violations.push(`Faculty ${entry.facultyId} double-booked at ${key}`);
            }
            facultySlots[fKey] = true;

            if (entry.labFaculty2Id) {
                const f2Key = `${entry.labFaculty2Id}-${key}`;
                if (facultySlots[f2Key]) {
                    violations.push(`Lab faculty ${entry.labFaculty2Id} double-booked at ${key}`);
                }
                facultySlots[f2Key] = true;
            }

            // Check room
            const rKey = `${entry.roomId}-${key}`;
            if (roomSlots[rKey]) {
                violations.push(`Room ${entry.roomId} double-booked at ${key}`);
            }
            roomSlots[rKey] = true;
        }
    }

    return violations;
}
