const SEMESTER_WEEKS = 15;
const MAX_SAME_SUBJECT_PER_DAY = 2;

const PRIORITY = {
    lab: 1,
    project: 2,
    theory: 3,
    elective: 3,
    'Non-Academic': 3,
    activity: 4
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

function occupyTime(reg, day, id, start, end, subjectId) {
    if (!reg[day]) reg[day] = {};
    if (!reg[day][id]) reg[day][id] = [];
    reg[day][id].push({ s: start, e: end, subId: subjectId });
}

function releaseTime(reg, day, id, start, end) {
    if (!reg[day] || !reg[day][id]) return;
    reg[day][id] = reg[day][id].filter(block => !(block.s === start && block.e === end));
}

const CONSECUTIVE_THRESHOLD_MINS = 40;

function checkFacultyConsecutiveViolation(reg, day, id, start, end, subjectId) {
    if (!reg[day] || !reg[day][id]) return false;
    // Check all existing blocks for this faculty on this day
    for (const b of reg[day][id]) {
        const gapBefore = start - b.e;
        const gapAfter  = b.s - end;

        // If it's effectively consecutive (small gap < 40 mins)
        if ((gapBefore >= 0 && gapBefore < CONSECUTIVE_THRESHOLD_MINS) ||
            (gapAfter  >= 0 && gapAfter  < CONSECUTIVE_THRESHOLD_MINS)) {
            // Must be the same subject
            if (b.subId !== subjectId) return true;
        }
    }
    return false;
}

function occupyBlock(maps, day, slotIndex, duration, ids, config) {
    const slots = config ? (config.slots.toObject ? config.slots.toObject() : config.slots) : [];
    const startTimeStr = slots[slotIndex]?.start;
    const endTimeStr = slots[slotIndex + duration - 1]?.end;
    const startM = timeStrMins(startTimeStr);
    const endM = timeStrMins(endTimeStr);

    // Deduplicate faculty IDs assigned to this block
    const uniqueFaculties = [...new Set([ids.facultyId, ids.labFaculty2Id, ids.labFaculty3Id].filter(Boolean))];

    for (let i = 0; i < duration; i++) {
        const k = slotKey(day, slotIndex + i);
        if (ids.classId) occupy(maps.class, k, ids.classId);
        
        if (startM > 0) {
            uniqueFaculties.forEach(facId => {
                occupyTime(maps.faculty, day, facId, startM, endM, ids.subjectId);
            });
        }
        if (ids.roomId && startM > 0) occupyTime(maps.room, day, ids.roomId, startM, endM);
    }
}

function releaseBlock(maps, day, slotIndex, duration, ids, config) {
    const slots = config ? (config.slots.toObject ? config.slots.toObject() : config.slots) : [];
    const startTimeStr = slots[slotIndex]?.start;
    const endTimeStr = slots[slotIndex + duration - 1]?.end;
    const startM = timeStrMins(startTimeStr);
    const endM = timeStrMins(endTimeStr);

    // Deduplicate faculty IDs assigned to this block
    const uniqueFaculties = [...new Set([ids.facultyId, ids.labFaculty2Id, ids.labFaculty3Id].filter(Boolean))];

    for (let i = 0; i < duration; i++) {
        const k = slotKey(day, slotIndex + i);
        if (ids.classId) release(maps.class, k, ids.classId);
        
        if (startM > 0) {
            uniqueFaculties.forEach(facId => {
                releaseTime(maps.faculty, day, facId, startM, endM);
            });
        }
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

    if (subject.assignedLabId) {
        // STRICT CONSTRAINT: A lab with an assigned lab room must ONLY be placed in that specific room.
        // No fallback to any other lab is allowed — if the assigned room is busy, skip this slot.
        const assignedRoom = rooms.find(r => r.id === subject.assignedLabId);
        if (assignedRoom && freeForBlock(assignedRoom.id)) return assignedRoom;
        return null; // Assigned lab is busy — do NOT fall back to another room
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
        classId,
        subjectId,
        facultyId,
        labFaculty2Id:  labFaculty2Id  || null,
        labFaculty3Id:  labFaculty3Id  || null,
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
 * @param {object[]} [data.coeEntries]  – pre-fixed COE blocks (hard constraint)
 * @returns {{ entries: object[], conflicts: object[] }}
 */
export function generateTimetable(data) {
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
        return cfg ? getClassTypeSlots(cfg) : [];
    };
    const mappings = facultySubjectMapping.map(m => {
        const cls = classById[m.classId];
        const subject = subjectById[m.subjectId];
        const name = subject?.name?.toLowerCase();
        if (name === 'library' || name === 'tutor ward meeting') {
            // Build candidate list: original mapped faculty + advisor + tutors (deduplicated)
            // facultyId stays as the originally assigned faculty (primary fallback)
            const rawCandidates = [m.facultyId, cls?.advisorId, cls?.tutor1Id, cls?.tutor2Id].filter(Boolean);
            const candidates = [...new Set(rawCandidates)];
            return {
                ...m,
                facultyCandidates: candidates
            };
        }
        return m;
    });

    const entries   = [];
    const conflicts = [];
    const maps      = { faculty: {}, room: {}, class: {} };

    // --- Phase -1: Occupy existing reservations (Continuation / Incremental Mode) ---
    if (data.existingReservations && data.existingReservations.length > 0) {
        for (const resv of data.existingReservations) {
            const cfg = configByYear[Number(resv.year)] || timeSlotConfigs[0] || null;
            if (!cfg) continue;

            const duration = resv.duration || 1;
            const sIdx = resv.slotIndex !== undefined ? resv.slotIndex : resv.slot;
            occupyBlock(maps, resv.day, sIdx, duration, {
                facultyId: resv.facultyId || resv.faculty,
                labFaculty2Id: resv.labFaculty2Id,
                labFaculty3Id: resv.labFaculty3Id,
                roomId: resv.roomId || resv.room || resv.lab,
                subjectId: resv.subjectId
            }, cfg);
        }
    }

    // --- Phase 0: COE (Centre of Excellence) hard-constraint reservation ----
    // COE entries are year-based: one entry blocks the same slots for EVERY
    // class of that year. Slots are pre-filled BEFORE any other subject so
    // they can never be overwritten. Conflicts are reported, not auto-fixed.
    for (const coe of (coeEntries || [])) {
        // Find all classes that belong to this year & section & department
        const yearClasses = classes.filter(c => {
            const matchesYear = Number(c.year) === Number(coe.year);
            const sects = coe.sections && coe.sections.length > 0 ? coe.sections : [coe.section || 'All'];
            const matchesSection = sects.includes('All') || sects.includes(c.section);
            
            const depts = coe.departments && coe.departments.length > 0 ? coe.departments : ['All'];
            const matchesDept = depts.includes('All') || depts.includes(c.departmentId);
            
            return matchesYear && matchesSection && matchesDept;
        });
        if (yearClasses.length === 0) continue;

        // Use the time-slot config for this year to validate indices
        const config   = getSlotConfig(coe.year);
        if (!config)   continue;

        const rawSlots = getRawSlots(config);
        const duration = coe.endSlotIndex - coe.startSlotIndex + 1;

        // Validate slot indices are within range
        if (coe.startSlotIndex < 0 || coe.endSlotIndex >= rawSlots.length) {
            conflicts.push({
                type:   'coe',
                reason: `COE "${coe.label}" (Year ${coe.year}) on ${coe.day}: slot indices ${coe.startSlotIndex}–${coe.endSlotIndex} are out of range for this year's config`
            });
            continue;
        }

        // Validate co-faculty availability and occupy time if assigned
        let startM = 0;
        let endM = 0;
        if (coe.coFacultyId) {
            const startTimeStr = rawSlots[coe.startSlotIndex]?.start;
            const endTimeStr   = rawSlots[coe.endSlotIndex]?.end;
            startM = timeStrMins(startTimeStr);
            endM   = timeStrMins(endTimeStr);
            if (startM > 0) {
                if (checkTimeOverlap(maps.faculty, coe.day, coe.coFacultyId, startM, endM)) {
                    conflicts.push({
                        type:   'coe',
                        reason: `COE "${coe.label}" (Year ${coe.year}) on ${coe.day} cannot be scheduled: Co-Faculty is already occupied during slots ${coe.startSlotIndex + 1}–${coe.endSlotIndex + 1}`
                    });
                    continue;
                }
                // Occupy the co-faculty time once for the whole COE block
                occupyTime(maps.faculty, coe.day, coe.coFacultyId, startM, endM, null);
            }
        }

        // Apply the COE block to every class of this year
        for (const cls of yearClasses) {
            // Check if this class already has something in these slots
            // (e.g. overlapping COE blocks defined for the same year)
            let classConflict = false;
            for (let i = coe.startSlotIndex; i <= coe.endSlotIndex; i++) {
                if (isOccupied(maps.class, slotKey(coe.day, i), cls.id)) {
                    classConflict = true;
                    break;
                }
            }
            if (classConflict) {
                conflicts.push({
                    type:      'coe',
                    classId:   cls.id,
                    className: cls.name,
                    reason:    `COE "${coe.label}" on ${coe.day} slots ${coe.startSlotIndex}–${coe.endSlotIndex} conflicts with another COE block already placed for ${cls.name}`
                });
                continue;
            }

            // Reserve class slots (hard) — no room allocated for COE
            for (let i = coe.startSlotIndex; i <= coe.endSlotIndex; i++) {
                occupy(maps.class, slotKey(coe.day, i), cls.id);
            }

            // Push a visible COE entry for the timetable grid
            entries.push({
                classId:        cls.id,
                subjectId:      null,
                facultyId:      coe.coFacultyId || null,
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
                coeLabel:       coe.label || 'COE',
                coFacultyId:    coe.coFacultyId || null,
                schedulingNote: `COE hard block: ${coe.label || 'COE'} – Year ${coe.year} (${duration} slot${duration > 1 ? 's' : ''})${coe.coFacultyId ? ' [co-faculty assigned]' : ''}`
            });
        }
    }

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
            labFaculty3Id:  mapping.labFaculty3Id,
            roomId:         room.id,
            day:            dc.day,
            slotIndex:      dc.slotIndex,
            duration,
            subjectType:    subject.type,
            isFixed:        true,
            schedulingNote: buildNote(subject.type, duration)
        }));
        occupyBlock(maps, dc.day, dc.slotIndex, duration, {
            facultyId: mapping.facultyId, labFaculty2Id: mapping.labFaculty2Id, labFaculty3Id: mapping.labFaculty3Id,
            roomId: room.id, classId: dc.classId, subjectId: dc.subjectId
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

        let baseDur = subject.duration || 1;
        // Constraint: Non-Academic subjects with 2 periods per week must be scheduled as a continuous 2-slot block
        if (subject.type === 'Non-Academic' && periodsPerWeek(subject) === 2) {
            baseDur = 2;
        }

        const sessions  = Math.ceil(remaining / baseDur);
        for (let i = 0; i < sessions; i++) {
            const dur = (i === sessions - 1 && remaining % baseDur !== 0) ? (remaining % baseDur) : baseDur;
            // Per-section lab override: mapping.assignedLabId takes priority over subject.assignedLabId
            const effectiveAssignedLabId = mapping.assignedLabId || subject.assignedLabId || null;
            tasks.push({ mapping, subject: { ...subject, duration: dur, assignedLabId: effectiveAssignedLabId }, cls });
        }
    }

    // Calculate faculty load (how many mappings each faculty member has)
    const facultyLoad = {};
    for (const m of mappings) {
        if (m.facultyId) facultyLoad[m.facultyId] = (facultyLoad[m.facultyId] || 0) + 1;
        if (m.labFaculty2Id) facultyLoad[m.labFaculty2Id] = (facultyLoad[m.labFaculty2Id] || 0) + 1;
        if (m.labFaculty3Id) facultyLoad[m.labFaculty3Id] = (facultyLoad[m.labFaculty3Id] || 0) + 1;
    }

    // Calculate room demand (how many blocks are requested for each lab room)
    const roomDemand = {};
    for (const t of tasks) {
        if (t.subject.type === 'lab' && t.subject.assignedLabId) {
            roomDemand[t.subject.assignedLabId] = (roomDemand[t.subject.assignedLabId] || 0) + 1;
        }
    }

    // --- Phase 3: Sort tasks (MRV heuristic) --------------------------------
    tasks.sort((a, b) => {
        const pd = (PRIORITY[a.subject.type] || 99) - (PRIORITY[b.subject.type] || 99);
        if (pd !== 0) return pd;

        // If both are labs, sort by room demand descending (highly contested rooms scheduled first)
        if (a.subject.type === 'lab' && b.subject.type === 'lab') {
            const demA = roomDemand[a.subject.assignedLabId] || 0;
            const demB = roomDemand[b.subject.assignedLabId] || 0;
            if (demB !== demA) return demB - demA;
        }

        const dd = (b.subject.duration || 1) - (a.subject.duration || 1);
        if (dd !== 0) return dd;

        // If duration is 1 (theory-like), sort by faculty mapping count descending (shared faculty first)
        if (dd === 0) {
            const facA = facultyLoad[a.mapping.facultyId] || 0;
            const facB = facultyLoad[b.mapping.facultyId] || 0;
            if (facB !== facA) return facB - facA;
        }

        return periodsPerWeek(b.subject) - periodsPerWeek(a.subject);
    });



    const isBlockTask = (t) => t.subject.type === 'lab' || t.subject.type === 'project' || (t.subject.duration && t.subject.duration >= 2);
    const blockTasks = tasks.filter(isBlockTask);
    const theoryTasks = tasks.filter(t => !isBlockTask(t));

    // --- Phase 4: Greedy placement for Blocks (strict constraints) ----------
    const unplacedBlocksPass1 = [];
    for (const task of blockTasks) {
        if (!placeTask(task, entries, maps, rooms, getSlotConfig, getClassSlots, false))
            unplacedBlocksPass1.push(task);
    }

    // --- Phase 5: Retry Blocks with soft constraints relaxed -----------------
    const unplacedBlocksPass2 = [];
    for (const task of unplacedBlocksPass1) {
        if (!placeTask(task, entries, maps, rooms, getSlotConfig, getClassSlots, true))
            unplacedBlocksPass2.push(task);
    }

    // --- Phase 6: Swap-based repair for Blocks -------------------------------
    const unplacedBlocksFinal = [];
    for (const task of unplacedBlocksPass2) {
        if (!swapRepair(task, entries, maps, subjects, classes, rooms, getSlotConfig, getClassSlots))
            unplacedBlocksFinal.push(task);
    }

    // --- Phase 6b: Greedy placement for Theory/Electives (strict) -----------
    const unplacedTheoryPass1 = [];
    for (const task of theoryTasks) {
        if (!placeTask(task, entries, maps, rooms, getSlotConfig, getClassSlots, false))
            unplacedTheoryPass1.push(task);
    }

    // --- Phase 6c: Retry Theory/Electives with soft constraints relaxed -----
    const unplacedTheoryPass2 = [];
    for (const task of unplacedTheoryPass1) {
        if (!placeTask(task, entries, maps, rooms, getSlotConfig, getClassSlots, true))
            unplacedTheoryPass2.push(task);
    }

    // --- Phase 6d: Swap-based repair for Theory/Electives -------------------
    const unplacedTheoryFinal = [];
    for (const task of unplacedTheoryPass2) {
        if (!swapRepair(task, entries, maps, subjects, classes, rooms, getSlotConfig, getClassSlots))
            unplacedTheoryFinal.push(task);
    }

    const unplacedFinal = [...unplacedBlocksFinal, ...unplacedTheoryFinal];

    // --- Phase 7: Fill remaining free slots ---------------------------------
    fillFreeSlots(entries, maps, classes, subjects, rooms, mappings, getSlotConfig, getClassSlots);

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
    const isBlock      = subject.type === 'lab' || subject.type === 'project' || (subject.duration && subject.duration >= 2);
    const isLabOrProject = subject.type === 'lab' || subject.type === 'project';

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
    // H5: Projects Saturday preference constraint has been removed to allow flexible weekday scheduling.

    // HC-FIRST: The minimum class-type slot index (first period).
    // Labs and projects must NOT be placed in the first period.
    const firstClassSlotIndex = classSlots.length > 0
        ? Math.min(...classSlots.map(s => s.index))
        : -1;

    // Build the list of candidate starting slots based on subject type.
    // For labs/projects/2hr Non-Academic: scan every raw slot index to find valid contiguous blocks
    //   within THIS year's config, skipping any run that contains a break/lunch.
    // For theory-like: use the pre-filtered sorted classSlots list.
    const buildCandidateStarts = () => {
        if (!isBlock) {
            // Theory/elective: sort by load then index
            const slotLoad = {};
            for (const s of classSlots)
                slotLoad[s.index] = entries.filter(e => e.classId === cls.id && e.slotIndex === s.index).length;
            // Filter out first slot for Non-Academic subjects
            const filtered = classSlots.filter(s => !(subject.type === 'Non-Academic' && s.index === firstClassSlotIndex));
            return filtered.slice().sort((a, b) => {
                const ld = (slotLoad[a.index] || 0) - (slotLoad[b.index] || 0);
                return ld !== 0 ? ld : a.index - b.index;
            }).map(s => s.index);
        }

        // Enumerate every possible contiguous block within the year's raw slots.
        // A valid starting index requires `duration` consecutive slots all of type 'class'.
        const valid = [];
        for (let i = 0; i <= rawSlots.length - duration; i++) {
            // Skip first teaching period for labs/projects and Non-Academic blocks
            if ((isLabOrProject || subject.type === 'Non-Academic') && i === firstClassSlotIndex) continue;
            let allClass = true;
            for (let d = 0; d < duration; d++) {
                const st = rawSlots[i + d]?.type;
                if (st !== 'class') { allClass = false; break; }
            }
            if (allClass) valid.push(i);
        }
        
        // Distribute blocks uniformly across different times of the day
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
        // STRICT CONSTRAINT: Labs must never be scheduled on Saturday (hard constraint, no relaxation)
        if (subject.type === 'lab' && day === 'Saturday') continue;

        // SC1
        if (!relaxed && isTheoryLike && (dayCount[day] || 0) >= MAX_SAME_SUBJECT_PER_DAY) continue;
        // SC2 (applies only to actual labs/projects)
        if (!relaxed && isLabOrProject && dayHasOtherBlock(day)) continue;

        for (const start of candidateStarts) {
            // HC4: verify all slots in the block are class-type (already guaranteed for blocks above,
            //      but re-check here for theory in case classSlots contains stale data)
            if (!isBlock) {
                let ok = true;
                for (let i = 0; i < duration && ok; i++) {
                    const s = rawSlots[start + i];
                    if (!s || s.type !== 'class') ok = false;
                }
                if (!ok) continue;
            }

            // HC-FIRST: Skip first period for labs, projects, and Non-Academic subjects
            if ((isLabOrProject || subject.type === 'Non-Academic') && start === firstClassSlotIndex) continue;

            // HC1 + HC3: no faculty/class double-booking
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

            let chosenFacultyId = mapping.facultyId;
            if (startM > 0) {
                if (mapping.facultyCandidates && mapping.facultyCandidates.length > 0) {
                    let foundFac = null;
                    for (const facId of mapping.facultyCandidates) {
                        const overlap = checkTimeOverlap(maps.faculty, day, facId, startM, endM);
                        const consecutive = checkFacultyConsecutiveViolation(maps.faculty, day, facId, startM, endM, mapping.subjectId);
                        if (!overlap && !consecutive) {
                            foundFac = facId;
                            break;
                        }
                    }
                    if (foundFac) {
                        chosenFacultyId = foundFac;
                    } else {
                        clear = false;
                    }
                } else {
                    if (checkTimeOverlap(maps.faculty, day, mapping.facultyId, startM, endM)) clear = false;
                    if (clear && checkFacultyConsecutiveViolation(maps.faculty, day, mapping.facultyId, startM, endM, mapping.subjectId)) clear = false;
                }

                if (clear && mapping.labFaculty2Id) {
                    if (checkTimeOverlap(maps.faculty, day, mapping.labFaculty2Id, startM, endM)) clear = false;
                    if (clear && checkFacultyConsecutiveViolation(maps.faculty, day, mapping.labFaculty2Id, startM, endM, mapping.subjectId)) clear = false;
                }

                if (clear && mapping.labFaculty3Id) {
                    if (checkTimeOverlap(maps.faculty, day, mapping.labFaculty3Id, startM, endM)) clear = false;
                    if (clear && checkFacultyConsecutiveViolation(maps.faculty, day, mapping.labFaculty3Id, startM, endM, mapping.subjectId)) clear = false;
                }
            }
            if (!clear) continue;

            // HC2 + HC5: find a free room of the correct type
            const room = findRoom(rooms, subject, day, start, maps.room, cls, duration, config);
            if (!room) continue;

            entries.push(makeEntry({
                classId:        cls.id,
                subjectId:      subject.id,
                facultyId:      chosenFacultyId,
                labFaculty2Id:  mapping.labFaculty2Id,
                labFaculty3Id:  mapping.labFaculty3Id,
                roomId:         room.id,
                day,
                slotIndex:      start,
                duration,
                subjectType:    subject.type,
                isFixed:        false,
                schedulingNote: buildNote(subject.type, duration, { relaxed })
            }));
            occupyBlock(maps, day, start, duration, {
                facultyId: chosenFacultyId, labFaculty2Id: mapping.labFaculty2Id, labFaculty3Id: mapping.labFaculty3Id,
                roomId: room.id, classId: cls.id, subjectId: mapping.subjectId
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
    const isBlock    = subject.type === 'lab' || subject.type === 'project' || (subject.duration && subject.duration >= 2);
    // If scheduling a theory/elective/non-block task, do not allow evicting block tasks (labs/projects/etc.)
    const movable    = entries.filter(e => {
        if (e.isFixed || e.classId !== cls.id) return false;
        if (!isBlock) {
            const isEBlock = e.duration >= 2 || e.subjectType === 'lab' || e.subjectType === 'project';
            if (isEBlock) return false;
        }
        return true;
    });
    const isLabOrProject = subject.type === 'lab' || subject.type === 'project';

    // HC-FIRST: first class-type slot index — labs/projects must not land here
    const firstClassSlotIndex = classSlots.length > 0
        ? Math.min(...classSlots.map(s => s.index))
        : -1;

    for (const blocker of movable) {
        const blockerDur = blocker.duration || 1;

        // STRICT CONSTRAINT: Labs must never be scheduled on Saturday (hard constraint, no relaxation)
        if (subject.type === 'lab' && blocker.day === 'Saturday') continue;

        // HC-FIRST: Skip first period for labs, projects, and Non-Academic subjects
        if ((isLabOrProject || subject.type === 'Non-Academic') && blocker.slotIndex === firstClassSlotIndex) continue;

        // HC4: our task needs `duration` consecutive class-type slots at the blocker's position.
        // Use the TASK's year config (rawSlots), not the blocker's, since we are placing OUR subject here.
        let ok = true;
        for (let i = 0; i < duration && ok; i++) {
            const s = rawSlots[blocker.slotIndex + i];
            if (!s || s.type !== 'class') ok = false;
        }
        if (!ok) continue;

        // HC1: our faculty must be free at the blocker's slots
        let facultyFree = true;
        let chosenFacultyId = mapping.facultyId;
        const startTimeStr = rawSlots[blocker.slotIndex]?.start;
        const endTimeStr = rawSlots[blocker.slotIndex + duration - 1]?.end;
        const startM = timeStrMins(startTimeStr);
        const endM = timeStrMins(endTimeStr);

        if (startM > 0) {
            if (mapping.facultyCandidates && mapping.facultyCandidates.length > 0) {
                let foundFac = null;
                for (const facId of mapping.facultyCandidates) {
                    const overlap = checkTimeOverlap(maps.faculty, blocker.day, facId, startM, endM);
                    const consecutive = checkFacultyConsecutiveViolation(maps.faculty, blocker.day, facId, startM, endM, mapping.subjectId);
                    if (!overlap && !consecutive) { foundFac = facId; break; }
                }
                if (foundFac) { chosenFacultyId = foundFac; }
                else { facultyFree = false; }
            } else {
                if (checkTimeOverlap(maps.faculty, blocker.day, mapping.facultyId, startM, endM)) facultyFree = false;
                if (mapping.labFaculty2Id && checkTimeOverlap(maps.faculty, blocker.day, mapping.labFaculty2Id, startM, endM)) facultyFree = false;
                if (mapping.labFaculty3Id && checkTimeOverlap(maps.faculty, blocker.day, mapping.labFaculty3Id, startM, endM)) facultyFree = false;
            }
        }
        if (!facultyFree) continue;

        // Temporarily evict the blocker
        const blockerClassForConfig = classes.find(c => c.id === blocker.classId);
        const blockerConfig = getSlotConfig(blockerClassForConfig ? blockerClassForConfig.year : '1');
        releaseBlock(maps, blocker.day, blocker.slotIndex, blockerDur, {
            facultyId: blocker.facultyId, labFaculty2Id: blocker.labFaculty2Id, labFaculty3Id: blocker.labFaculty3Id,
            roomId: blocker.roomId, classId: blocker.classId
        }, blockerConfig);
        const blockerIdx     = entries.indexOf(blocker);
        entries.splice(blockerIdx, 1);

        const blockerSubject = subjects.find(s => s.id === blocker.subjectId);
        const blockerClass   = classes.find(c => c.id === blocker.classId);

        // Temporarily occupy blocker's former slot for this class so blocker cannot relocate back to it
        for (let i = 0; i < blockerDur; i++) {
            occupy(maps.class, slotKey(blocker.day, blocker.slotIndex + i), blocker.classId);
        }

        const blockerMoved = blockerSubject && blockerClass && placeTask(
            {
                mapping: {
                    facultyId:     blocker.facultyId,
                    labFaculty2Id: blocker.labFaculty2Id,
                    labFaculty3Id: blocker.labFaculty3Id,
                    subjectId:     blocker.subjectId,
                    classId:       blocker.classId
                },
                subject: { ...blockerSubject, duration: blockerDur },
                cls:     blockerClass
            },
            entries, maps, rooms, getSlotConfig, getClassSlots,
            true /* relaxed */
        );

        // Release blocker's former slot
        for (let i = 0; i < blockerDur; i++) {
            release(maps.class, slotKey(blocker.day, blocker.slotIndex + i), blocker.classId);
        }


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
                        facultyId:      chosenFacultyId,
                        labFaculty2Id:  mapping.labFaculty2Id,
                        labFaculty3Id:  mapping.labFaculty3Id,
                        roomId:         room.id,
                        day:            blocker.day,
                        slotIndex:      blocker.slotIndex,
                        duration,
                        subjectType:    subject.type,
                        isFixed:        false,
                        schedulingNote: buildNote(subject.type, duration, { swapRepair: true })
                    }));
                    occupyBlock(maps, blocker.day, blocker.slotIndex, duration, {
                        facultyId: chosenFacultyId, labFaculty2Id: mapping.labFaculty2Id, labFaculty3Id: mapping.labFaculty3Id,
                        roomId: room.id, classId: cls.id, subjectId: mapping.subjectId
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
                    facultyId: relocated.facultyId, labFaculty2Id: relocated.labFaculty2Id, labFaculty3Id: relocated.labFaculty3Id,
                    roomId: relocated.roomId, classId: relocated.classId
                }, blockerConfig);
                const rIdx = entries.indexOf(relocated);
                if (rIdx !== -1) entries.splice(rIdx, 1);
            }
        } else {
            // Try 3-way swap!
            let success3Way = false;
            const secondaryCandidates = entries.filter(e => {
                if (e.isFixed || e.classId !== cls.id || e.subjectId === subject.id) return false;
                if (!isBlock) {
                    const isEBlock = e.duration >= 2 || e.subjectType === 'lab' || e.subjectType === 'project';
                    if (isEBlock) return false;
                }
                return true;
            });
            
            for (const secondary of secondaryCandidates) {
                if (success3Way) break;
                const secondaryDur = secondary.duration || 1;
                
                const secondaryClassForConfig = classes.find(c => c.id === secondary.classId);
                const secondaryConfig = getSlotConfig(secondaryClassForConfig ? secondaryClassForConfig.year : '1');
                
                releaseBlock(maps, secondary.day, secondary.slotIndex, secondaryDur, {
                    facultyId: secondary.facultyId, labFaculty2Id: secondary.labFaculty2Id, labFaculty3Id: secondary.labFaculty3Id,
                    roomId: secondary.roomId, classId: secondary.classId
                }, secondaryConfig);
                
                const secondaryIdx = entries.indexOf(secondary);
                entries.splice(secondaryIdx, 1);
                
                const secondarySubject = subjects.find(s => s.id === secondary.subjectId);
                const secondaryClass   = classes.find(c => c.id === secondary.classId);
                
                
                const secondaryMoved = secondarySubject && secondaryClass && placeTask(
                    {
                        mapping: {
                            facultyId:     secondary.facultyId,
                            labFaculty2Id: secondary.labFaculty2Id,
                            labFaculty3Id: secondary.labFaculty3Id,
                            subjectId:     secondary.subjectId,
                            classId:       secondary.classId
                        },
                        subject: { ...secondarySubject, duration: secondaryDur },
                        cls:     secondaryClass
                    },
                    entries, maps, rooms, getSlotConfig, getClassSlots,
                    true /* relaxed */
                );
                
                if (secondaryMoved) {
                    let blockerFits = true;
                    // STRICT CONSTRAINT: Labs must never be scheduled on Saturday (hard constraint)
                    if (blockerSubject && blockerSubject.type === 'lab' && secondary.day === 'Saturday') {
                        blockerFits = false;
                    }
                    for (let i = 0; i < blockerDur && blockerFits; i++) {
                        if (isOccupied(maps.class, slotKey(secondary.day, secondary.slotIndex + i), blocker.classId)) {
                            blockerFits = false;
                        }
                    }
                    if (blockerFits) {
                        const startM_b = timeStrMins(rawSlots[secondary.slotIndex]?.start);
                        const endM_b = timeStrMins(rawSlots[secondary.slotIndex + blockerDur - 1]?.end);
                        if (startM_b > 0) {
                            if (checkTimeOverlap(maps.faculty, secondary.day, blocker.facultyId, startM_b, endM_b)) blockerFits = false;
                            if (blocker.labFaculty2Id && checkTimeOverlap(maps.faculty, secondary.day, blocker.labFaculty2Id, startM_b, endM_b)) blockerFits = false;
                        }
                    }
                    
                    if (blockerFits) {
                        const blockerRoom = blockerSubject ? findRoom(rooms, blockerSubject, secondary.day, secondary.slotIndex, maps.room, blockerClass, blockerDur, secondaryConfig) : null;
                        if (blockerRoom) {
                            entries.push(makeEntry({
                                classId:        blocker.classId,
                                subjectId:      blocker.subjectId,
                                facultyId:      blocker.facultyId,
                                labFaculty2Id:  blocker.labFaculty2Id,
                                labFaculty3Id:  blocker.labFaculty3Id,
                                roomId:         blockerRoom.id,
                                day:            secondary.day,
                                slotIndex:      secondary.slotIndex,
                                duration:       blockerDur,
                                subjectType:    blockerSubject.type,
                                isFixed:        false,
                                schedulingNote: buildNote(blockerSubject.type, blockerDur, { swapRepair: true })
                            }));
                            occupyBlock(maps, secondary.day, secondary.slotIndex, blockerDur, {
                                facultyId: blocker.facultyId, labFaculty2Id: blocker.labFaculty2Id, labFaculty3Id: blocker.labFaculty3Id,
                                roomId: blockerRoom.id, classId: blocker.classId, subjectId: blocker.subjectId
                            }, secondaryConfig);
                            
                            let classFree = true;
                            for (let i = 0; i < duration && classFree; i++) {
                                if (isOccupied(maps.class, slotKey(blocker.day, blocker.slotIndex + i), cls.id)) {
                                    classFree = false;
                                }
                            }
                            
                            if (classFree) {
                                const room = findRoom(rooms, subject, blocker.day, blocker.slotIndex, maps.room, cls, duration, config);
                                if (room) {
                                    entries.push(makeEntry({
                                        classId:        cls.id,
                                        subjectId:      subject.id,
                                        facultyId:      chosenFacultyId,
                                        labFaculty2Id:  mapping.labFaculty2Id,
                                        labFaculty3Id:  mapping.labFaculty3Id,
                                        roomId:         room.id,
                                        day:            blocker.day,
                                        slotIndex:      blocker.slotIndex,
                                        duration,
                                        subjectType:    subject.type,
                                        isFixed:        false,
                                        schedulingNote: buildNote(subject.type, duration, { swapRepair: true })
                                    }));
                                    occupyBlock(maps, blocker.day, blocker.slotIndex, duration, {
                                        facultyId: chosenFacultyId, labFaculty2Id: mapping.labFaculty2Id, labFaculty3Id: mapping.labFaculty3Id,
                                        roomId: room.id, classId: cls.id, subjectId: mapping.subjectId
                                    }, config);
                                    success3Way = true;
                                    return true;
                                }
                            }
                            
                            releaseBlock(maps, secondary.day, secondary.slotIndex, blockerDur, {
                                facultyId: blocker.facultyId, labFaculty2Id: blocker.labFaculty2Id, labFaculty3Id: blocker.labFaculty3Id,
                                roomId: blockerRoom.id, classId: blocker.classId
                            }, secondaryConfig);
                            const placedBlockerIdx = entries.findIndex(e => e.classId === blocker.classId && e.subjectId === blocker.subjectId && e.day === secondary.day && e.slotIndex === secondary.slotIndex);
                            if (placedBlockerIdx !== -1) entries.splice(placedBlockerIdx, 1);
                        }
                    }
                    
                    let relocatedSecondary = null;
                    for (let i = entries.length - 1; i >= 0; i--) {
                        const e = entries[i];
                        if (e.classId === secondary.classId && e.subjectId === secondary.subjectId && !e.isFixed) {
                            relocatedSecondary = e;
                            break;
                        }
                    }
                    if (relocatedSecondary) {
                        const rDur = relocatedSecondary.duration || 1;
                        releaseBlock(maps, relocatedSecondary.day, relocatedSecondary.slotIndex, rDur, {
                            facultyId: relocatedSecondary.facultyId, labFaculty2Id: relocatedSecondary.labFaculty2Id, labFaculty3Id: relocatedSecondary.labFaculty3Id,
                            roomId: relocatedSecondary.roomId, classId: relocatedSecondary.classId
                        }, secondaryConfig);
                        const rIdx = entries.indexOf(relocatedSecondary);
                        if (rIdx !== -1) entries.splice(rIdx, 1);
                    }
                }
                
                entries.splice(secondaryIdx, 0, secondary);
                occupyBlock(maps, secondary.day, secondary.slotIndex, secondaryDur, {
                    facultyId: secondary.facultyId, labFaculty2Id: secondary.labFaculty2Id, labFaculty3Id: secondary.labFaculty3Id,
                    roomId: secondary.roomId, classId: secondary.classId, subjectId: secondary.subjectId
                }, secondaryConfig);
            }
        }
        entries.splice(blockerIdx, 0, blocker);
        occupyBlock(maps, blocker.day, blocker.slotIndex, blockerDur, {
            facultyId: blocker.facultyId, labFaculty2Id: blocker.labFaculty2Id, labFaculty3Id: blocker.labFaculty3Id,
            roomId: blocker.roomId, classId: blocker.classId, subjectId: blocker.subjectId
        }, blockerConfig);
    }

    return false;
}

// --- Phase 7: Fill remaining free slots -------------------------------------

function fillFreeSlots(entries, maps, classes, subjects, rooms, facultySubjectMapping, getSlotConfig, getClassSlots) {
    for (const cls of classes) {
        const config = getSlotConfig(cls.year);
        if (!config) continue;

        const days     = config.days;
        const allSlots = getRawSlots(config);
        const fillable = allSlots.map((s, i) => ({ type: s.type, index: i }))
                                 .filter(s => s.type !== 'break' && s.type !== 'lunch');
        const classSlots = getClassSlots(cls.year);
        // Determine first teaching period index for this class
        const firstClassSlotIndex = classSlots.length > 0
            ? Math.min(...classSlots.map(s => s.index))
            : -1;

        // Helper to count how many periods of each subject are currently placed for this class
        const getAlreadyPlacedCount = () => {
            const counts = {};
            for (const e of entries) {
                if (e.classId === cls.id && e.subjectId) {
                    counts[e.subjectId] = (counts[e.subjectId] || 0) + (e.duration || 1);
                }
            }
            return counts;
        };

        // STAGE 1: Deficit Placement (Only place subjects that have deficit > 0)
        let placedAny = true;
        while (placedAny) {
            placedAny = false;
            const alreadyPlaced = getAlreadyPlacedCount();

            // Find all subjects with a deficit
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
                .sort((a, b) => {
                    const pd = (PRIORITY[a.subject.type] || 99) - (PRIORITY[b.subject.type] || 99);
                    if (pd !== 0) return pd;
                    if (b.deficit !== a.deficit) return b.deficit - a.deficit;
                    return (b.subject.totalHours || 0) - (a.subject.totalHours || 0);
                });

            if (deficitPool.length === 0) break;

            // Try to place exactly ONE deficit session in any free slot
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

                    // Pass 0: Standard constraints
                    // Pass 1: Relax MAX_SAME_SUBJECT_PER_DAY
                    // Pass 2: Relax MAX_SAME_SUBJECT_PER_DAY + consecutive violation
                    for (let pass = 0; pass <= 2 && !sessionPlaced; pass++) {
                        for (const { mapping, subject } of deficitPool) {
                            // STRICT CONSTRAINT: Labs must never be scheduled on Saturday
                            if (subject.type === 'lab' && day === 'Saturday') continue;
                            
                            // Skip first teaching period for Non-Academic subjects
                            if (subject.type === 'Non-Academic' && slot.index === firstClassSlotIndex) continue;

                            if (pass === 0 && (dayCount[subject.id] || 0) >= MAX_SAME_SUBJECT_PER_DAY) continue;

                            const isActivitySlot = slot.type === 'activity';
                            const isSubjectActivity = subject.type === 'activity';
                            if (isActivitySlot !== isSubjectActivity) continue;

                            const startTimeStr = allSlots[slot.index]?.start;
                            const endTimeStr = allSlots[slot.index]?.end;
                            const startM = timeStrMins(startTimeStr);
                            const endM = timeStrMins(endTimeStr);

                            let chosenFac = mapping.facultyId;
                            if (startM > 0) {
                                if (mapping.facultyCandidates && mapping.facultyCandidates.length > 0) {
                                    let foundFac = null;
                                    for (const facId of mapping.facultyCandidates) {
                                        const overlap = checkTimeOverlap(maps.faculty, day, facId, startM, endM);
                                        const consec = pass < 2 ? checkFacultyConsecutiveViolation(maps.faculty, day, facId, startM, endM, mapping.subjectId) : false;
                                        if (!overlap && !consec) { foundFac = facId; break; }
                                    }
                                    if (foundFac) { chosenFac = foundFac; }
                                    else continue;
                                } else {
                                    if (checkTimeOverlap(maps.faculty, day, mapping.facultyId, startM, endM)) continue;
                                    if (pass < 2) {
                                        if (checkFacultyConsecutiveViolation(maps.faculty, day, mapping.facultyId, startM, endM, mapping.subjectId)) continue;
                                    }
                                    if (mapping.labFaculty2Id) {
                                        if (checkTimeOverlap(maps.faculty, day, mapping.labFaculty2Id, startM, endM)) continue;
                                        if (pass < 2) {
                                            if (checkFacultyConsecutiveViolation(maps.faculty, day, mapping.labFaculty2Id, startM, endM, mapping.subjectId)) continue;
                                        }
                                    }
                                }
                            }

                            const room = findRoom(rooms, subject, day, slot.index, maps.room, cls, 1, config);
                            if (!room) continue;

                            // Place it!
                            entries.push(makeEntry({
                                classId:        cls.id,
                                subjectId:      subject.id,
                                facultyId:      chosenFac,
                                labFaculty2Id:  mapping.labFaculty2Id,
                                roomId:         room.id,
                                day,
                                slotIndex:      slot.index,
                                duration:       1,
                                subjectType:    subject.type,
                                isFixed:        false,
                                isExtra:        false,
                                schedulingNote: buildNote(subject.type, 1, { extra: false, relaxed: pass > 0 })
                            }));

                            occupyBlock(maps, day, slot.index, 1, {
                                facultyId: chosenFac, labFaculty2Id: mapping.labFaculty2Id,
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

        // STAGE 2: Gap Filling (Only fill slots that are still free, using any subjects in the pool)
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
            .sort((a, b) => {
                const pd = (PRIORITY[a.subject.type] || 99) - (PRIORITY[b.subject.type] || 99);
                if (pd !== 0) return pd;
                if (b.deficit !== a.deficit) return b.deficit - a.deficit;
                return (b.subject.totalHours || 0) - (a.subject.totalHours || 0);
            });

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
                        
                        // STRICT CONSTRAINT: Labs must never be scheduled on Saturday
                        if (subject.type === 'lab' && day === 'Saturday') continue;
                        // Skip first teaching period for Non-Academic subjects
                        if (subject.type === 'Non-Academic' && slot.index === firstClassSlotIndex) continue;

                        if (pass === 0 && (dayCount[subject.id] || 0) >= MAX_SAME_SUBJECT_PER_DAY) continue;

                        const isActivitySlot = slot.type === 'activity';
                        const isSubjectActivity = subject.type === 'activity';
                        if (isActivitySlot !== isSubjectActivity) continue;

                        const startTimeStr = allSlots[slot.index]?.start;
                        const endTimeStr = allSlots[slot.index]?.end;
                        const startM = timeStrMins(startTimeStr);
                        const endM = timeStrMins(endTimeStr);

                        let chosenFac2 = mapping.facultyId;
                        if (startM > 0) {
                            if (mapping.facultyCandidates && mapping.facultyCandidates.length > 0) {
                                let foundFac2 = null;
                                for (const facId of mapping.facultyCandidates) {
                                    const overlap = checkTimeOverlap(maps.faculty, day, facId, startM, endM);
                                    const consec = pass < 2 ? checkFacultyConsecutiveViolation(maps.faculty, day, facId, startM, endM, mapping.subjectId) : false;
                                    if (!overlap && !consec) { foundFac2 = facId; break; }
                                }
                                if (foundFac2) { chosenFac2 = foundFac2; }
                                else continue;
                            } else {
                                if (checkTimeOverlap(maps.faculty, day, mapping.facultyId, startM, endM)) continue;
                                if (pass < 2) {
                                    if (checkFacultyConsecutiveViolation(maps.faculty, day, mapping.facultyId, startM, endM, mapping.subjectId)) continue;
                                }
                                if (mapping.labFaculty2Id) {
                                    if (checkTimeOverlap(maps.faculty, day, mapping.labFaculty2Id, startM, endM)) continue;
                                    if (pass < 2) {
                                        if (checkFacultyConsecutiveViolation(maps.faculty, day, mapping.labFaculty2Id, startM, endM, mapping.subjectId)) continue;
                                    }
                                }
                            }
                        }

                        const room = findRoom(rooms, subject, day, slot.index, maps.room, cls, 1, config);
                        if (!room) continue;

                        entries.push(makeEntry({
                            classId:        cls.id,
                            subjectId:      subject.id,
                            facultyId:      chosenFac2,
                            labFaculty2Id:  mapping.labFaculty2Id,
                            roomId:         room.id,
                            day,
                            slotIndex:      slot.index,
                            duration:       1,
                            subjectType:    subject.type,
                            isFixed:        false,
                            isExtra:        true,
                            schedulingNote: buildNote(subject.type, 1, { extra: true, relaxed: pass > 0 })
                        }));

                        dayCount[subject.id] = (dayCount[subject.id] || 0) + 1;
                        occupyBlock(maps, day, slot.index, 1, {
                            facultyId: chosenFac2, labFaculty2Id: mapping.labFaculty2Id,
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
export function validateSwap(entries, entryIndex1, entryIndex2, data) {
    const e1 = entries[entryIndex1];
    const e2 = entries[entryIndex2];

    if (!e1 || !e2)               return { valid: false, reason: 'Invalid entry indices' };
    if (e1.isFixed || e2.isFixed) return { valid: false, reason: 'Cannot swap fixed slots' };

    const d1 = e1.duration || 1;
    const d2 = e2.duration || 1;

    // We swap the window of size d1 starting at e1.slotIndex with the window starting at e2.slotIndex
    // Identify all entries of the same class at the two windows
    const classId1 = e1.classId;
    const classId2 = e2.classId;

    const swapped = JSON.parse(JSON.stringify(entries));

    const indices1 = [];
    entries.forEach((e, idx) => {
        if (e.classId === classId1 && e.day === e1.day &&
            e.slotIndex < e1.slotIndex + d1 && e.slotIndex + (e.duration || 1) > e1.slotIndex) {
            indices1.push(idx);
        }
    });

    const indices2 = [];
    entries.forEach((e, idx) => {
        if (e.classId === classId2 && e.day === e2.day &&
            e.slotIndex < e2.slotIndex + d1 && e.slotIndex + (e.duration || 1) > e2.slotIndex) {
            indices2.push(idx);
        }
    });

    const finalSwapMoves = [];
    indices1.forEach(idx => {
        const e = entries[idx];
        finalSwapMoves.push({ idx, day: e2.day, slot: e.slotIndex - e1.slotIndex + e2.slotIndex });
    });
    indices2.forEach(idx => {
        const e = entries[idx];
        finalSwapMoves.push({ idx, day: e1.day, slot: e.slotIndex - e2.slotIndex + e1.slotIndex });
    });

    finalSwapMoves.forEach(m => {
        swapped[m.idx].day = m.day;
        swapped[m.idx].slotIndex = m.slot;
    });

    const originalViolations = checkConstraints(entries, data);
    const swappedViolations  = checkConstraints(swapped, data);
    const newViolations      = swappedViolations.filter(v => !originalViolations.includes(v));

    if (newViolations.length > 0) return { valid: false, reason: 'Swap creates conflicts', violations: newViolations };
    return { valid: true };
}

export function validateMove(entries, entryIndex, targetDay, targetSlotIndex, data) {
    const e = entries[entryIndex];
    if (!e) return { valid: false, reason: 'Invalid entry index' };
    if (e.isFixed) return { valid: false, reason: 'Cannot move fixed slots' };

    const classId = e.classId;
    const duration = e.duration || 1;

    // Clone entries to simulate the move
    const cloned = JSON.parse(JSON.stringify(entries));

    // Find all entries of the same class at the source day/slot window
    const sourceDay = e.day;
    const sourceSlot = e.slotIndex;
    
    const movingIndices = [];
    entries.forEach((entry, idx) => {
        if (entry.classId === classId && entry.day === sourceDay &&
            entry.slotIndex < sourceSlot + duration && entry.slotIndex + (entry.duration || 1) > sourceSlot) {
            movingIndices.push(idx);
        }
    });

    // Check if target slots are free for this class (ignoring moving entries)
    const targetOccupied = entries.some((entry, idx) => {
        if (movingIndices.includes(idx)) return false;
        if (entry.classId !== classId) return false;
        if (entry.day !== targetDay) return false;
        
        const entryDur = entry.duration || 1;
        return (entry.slotIndex < targetSlotIndex + duration && entry.slotIndex + entryDur > targetSlotIndex);
    });

    if (targetOccupied) {
        return { valid: false, reason: 'Target slots are not free for this class' };
    }

    // Apply the move
    movingIndices.forEach(idx => {
        cloned[idx].day = targetDay;
        cloned[idx].slotIndex = cloned[idx].slotIndex - sourceSlot + targetSlotIndex;
    });

    const originalViolations = checkConstraints(entries, data);
    const clonedViolations   = checkConstraints(cloned, data);
    const newViolations       = clonedViolations.filter(v => !originalViolations.includes(v));

    if (newViolations.length > 0) {
        return { valid: false, reason: 'Move creates conflicts', violations: newViolations };
    }
    return { valid: true };
}

export function checkConstraints(entries, data) {
    const { subjects, rooms, faculty, classes, configs } = data;
    const violations  = [];
    const facultyReg  = {}; // day -> id -> Array<{s, e}>
    const roomReg     = {}; 
    const classReg    = {}; 
    const periodCount = {};

    const checkOverlap = (reg, day, id, s, e, type, label, subjectId) => {
        if (!id) return;
        if (!reg[day]) reg[day] = {};
        if (!reg[day][id]) reg[day][id] = [];
        
        const overlaps = reg[day][id].some(b => s < b.e && e > b.s);
        if (overlaps) {
            violations.push(`${type} ${label || id} double-booked on ${day} (overlapping period)`);
        }
        
        if (type === 'Faculty') {
            const currentSub = subjects.find(su => su.id === subjectId);
            const currentSubName = currentSub ? currentSub.name : subjectId;

            // Helper: does a break or lunch slot cover any time within [gapStart, gapEnd)?
            const hasBreakOrLunchInGap = (gapStart, gapEnd) => {
                if (gapStart >= gapEnd) return false;
                if (!configs) return false;
                for (const cfg of configs) {
                    const rawSlots = cfg.slots?.toObject ? cfg.slots.toObject() : cfg.slots;
                    if (!rawSlots) continue;
                    for (const slot of rawSlots) {
                        if (slot.type !== 'break' && slot.type !== 'lunch') continue;
                        const slotS = timeStrMins(slot.start);
                        const slotE = timeStrMins(slot.end);
                        // Break/lunch overlaps the gap period
                        if (slotS < gapEnd && slotE > gapStart) return true;
                    }
                }
                return false;
            };

            for (const b of reg[day][id]) {
                const gapB = s - b.e;   // gap: b ends before s starts
                const gapA = b.s - e;   // gap: e ends before b starts

                if ((gapB >= 0 && gapB < CONSECUTIVE_THRESHOLD_MINS) ||
                    (gapA >= 0 && gapA < CONSECUTIVE_THRESHOLD_MINS)) {

                    // Determine the actual gap window in clock-time
                    const gapStart = gapB >= 0 ? b.e : e;
                    const gapEnd   = gapB >= 0 ? s   : b.s;

                    // If a break or lunch falls inside this gap, treat it as a free period — no violation
                    if (hasBreakOrLunchInGap(gapStart, gapEnd)) continue;

                    const prevSub = subjects.find(su => su.id === b.subId);
                    const prevSubName = prevSub ? prevSub.name : b.subId;

                    if (prevSubName !== currentSubName) {
                        violations.push(`Faculty ${label || id} teaching different subjects (${prevSubName} and ${currentSubName}) consecutively on ${day} without a mandatory free period gap`);
                    }
                }
            }
        }
        
        reg[day][id].push({ s, e, subId: subjectId });
    };

    for (const e of entries) {
        const subject  = subjects ? subjects.find(s => s.id === e.subjectId) : null;
        const duration = e.duration || (subject && subject.duration) || 1;
        const freqKey  = e.classId + '-' + e.subjectId;
        periodCount[freqKey] = (periodCount[freqKey] || 0) + duration;

        // Try to get clock times for this entry
        const cls = classes ? classes.find(c => c.id === e.classId) : null;
        const config = (configs && cls) ? configs.find(c => Number(c.year) === Number(cls.year)) || configs[0] : (configs ? configs[0] : null);
        const uniqueFacs = [...new Set([e.facultyId, e.labFaculty2Id, e.labFaculty3Id].filter(Boolean))];

        if (config && config.slots) {
            const rawSlots = config.slots?.toObject ? config.slots.toObject() : config.slots;
            const startSlot = rawSlots[e.slotIndex];
            const endSlot = rawSlots[e.slotIndex + duration - 1];
            if (startSlot && endSlot) {
                const sM = timeStrMins(startSlot.start);
                const eM = timeStrMins(endSlot.end);

                uniqueFacs.forEach(facId => {
                    checkOverlap(facultyReg, e.day, facId, sM, eM, 'Faculty', null, e.subjectId);
                });
                checkOverlap(classReg, e.day, e.classId, sM, eM, 'Class', cls?.name, e.subjectId);
                checkOverlap(roomReg, e.day, e.roomId, sM, eM, 'Room', null, e.subjectId);
            }
        } else {
            // Fallback to slotIndex check if config is missing
            for (let i = 0; i < duration; i++) {
                const k = e.day + '-' + (e.slotIndex + i);
                
                uniqueFacs.forEach(facId => {
                    const fk = facId + '-' + k;
                    if (facultyReg[fk]) {
                        if (facultyReg[fk] !== e.subjectId) {
                            violations.push(`Faculty ${facId} teaching different subjects consecutively (slots ${k})`);
                        } else {
                            violations.push('Faculty ' + facId + ' double-booked at ' + k);
                        }
                    }
                    facultyReg[fk] = e.subjectId;
                    
                    // Also check adjacency in slot indices
                    const prevK = e.day + '-' + (e.slotIndex + i - 1);
                    if (facultyReg[facId + '-' + prevK] && facultyReg[facId + '-' + prevK] !== e.subjectId) {
                        violations.push(`Faculty ${facId} teaching different subjects consecutively at ${prevK} and ${k}`);
                    }
                });

                const ck = e.classId + '-' + k;
                if (classReg[ck]) violations.push('Class ' + (cls ? cls.name : e.classId) + ' double-booked at ' + k);
                classReg[ck] = true;
                if (e.roomId) {
                    const rk = e.roomId + '-' + k;
                    if (roomReg[rk]) violations.push('Room ' + e.roomId + ' double-booked at ' + k);
                    roomReg[rk] = true;
                }
            }
        }

        if (subject && subject.type === 'lab' && e.day === 'Saturday') {
            violations.push(`Subject ${subject.name || e.subjectId} (${e.subjectId}) is a lab and cannot be scheduled on Saturday`);
        }

        if (data.rooms && e.roomId && subject) {
            const room         = data.rooms.find(r => r.id === e.roomId);
            const expectedType = subject.type === 'lab' ? 'lab' : 'classroom';
            if (room && room.type !== expectedType)
                violations.push('Room ' + e.roomId + ' is ' + room.type + ' but subject requires ' + expectedType);
            // STRICT CONSTRAINT: Lab with an assigned room must only be placed in that room
            if (subject.type === 'lab' && subject.assignedLabId && e.roomId !== subject.assignedLabId) {
                violations.push(`Lab subject "${subject.name || e.subjectId}" must only use its assigned lab room (${subject.assignedLabId}) but was placed in room ${e.roomId}`);
            }
        }

        if (data.facultySubjectMapping) {
            const mappingEntry = data.facultySubjectMapping.find(
                m => m.classId === e.classId && m.subjectId === e.subjectId
            );
            if (mappingEntry) {
                // For Library/TWM subjects that use facultyCandidates, allow any candidate faculty
                const validFaculties = mappingEntry.facultyCandidates && mappingEntry.facultyCandidates.length > 0
                    ? mappingEntry.facultyCandidates
                    : [mappingEntry.facultyId];
                if (!validFaculties.includes(e.facultyId)) {
                    violations.push('Faculty ' + e.facultyId + ' not mapped to teach ' + e.subjectId + ' for class ' + e.classId);
                }
            }
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
        
        // Deduplicate: if two mappings resolve to subjects with the same code+type,
        // prefer the one whose departmentId matches the class's own department.
        const seen = new Map(); // key: `${code}|${type}` → { mapping, subject }

        for (const mapping of classMappings) {
            const subject = subjects.find(s => s.id === mapping.subjectId);
            if (!subject) continue;
            const key = `${subject.code}|${subject.type}`;
            if (!seen.has(key)) {
                seen.set(key, { mapping, subject });
            } else {
                const existing = seen.get(key);
                // Prefer the subject that belongs to the class's own department
                const existingMatchesDept = existing.subject.departmentId === cls.departmentId;
                const newMatchesDept = subject.departmentId === cls.departmentId;
                if (newMatchesDept && !existingMatchesDept) {
                    seen.set(key, { mapping, subject });
                }
            }
        }

        for (const { mapping, subject } of seen.values()) {
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

        // For labs/projects/2hr Non-Academic: verify the requested slotIndex starts a run of `duration`
        // consecutive class-type slots within THIS year's config (no breaks/lunch in the block).
        let subDuration = sub.duration || 1;
        if (sub.type === 'Non-Academic' && periodsPerWeek(sub) === 2) {
            subDuration = 2;
        }

        if (sub.type === 'lab' || sub.type === 'project' || (sub.type === 'Non-Academic' && periodsPerWeek(sub) === 2)) {
            const rawSlotsForYear = getRawSlots(config);
            let blockOk = true;
            for (let d = 0; d < subDuration; d++) {
                const st = rawSlotsForYear[slotIndex + d]?.type;
                if (st !== 'class') { blockOk = false; break; }
            }
            if (!blockOk) continue;
        }

        // Check faculty
        if (!checkFac(m.facultyId)) continue;
        if (m.labFaculty2Id && !checkFac(m.labFaculty2Id)) continue;

        // Check room — use the subject's actual duration so lab blocks check availability across all slots
        const room = findRoom(rooms, sub, day, slotIndex, roomReg, cls, subDuration, config);
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
