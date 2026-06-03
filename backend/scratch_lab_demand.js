import mongoose from 'mongoose';
import connectDB from './db.js';
import { Subject, FacultySubjectMapping, Class, Room, TimeSlotConfig } from './models/index.js';

const SEMESTER_WEEKS = 15;
const periodsPerWeek = (subject) => Math.max(1, Math.ceil((subject.totalHours || 1) / SEMESTER_WEEKS));

async function run() {
    await connectDB();
    
    const subjects = await Subject.find({ type: 'lab' }).lean();
    const rooms = await Room.find({ type: 'lab' }).lean();
    const mappings = await FacultySubjectMapping.find().lean();
    const configs = await TimeSlotConfig.find().lean();

    const timeToMins = (h, m) => h * 60 + m;
    const timeStrMins = (str) => {
        if (!str) return 0;
        const [h, m] = str.split(':').map(Number);
        return timeToMins(h, m);
    };

    const getBlocksForYear = (year) => {
        const cfg = configs.find(c => Number(c.year) === year);
        if (!cfg) return [];
        const slots = cfg.slots;
        const classSlots = slots.map((s, i) => ({ ...s, index: i })).filter(s => s.type === 'class');
        const firstClassSlotIndex = classSlots.length > 0 ? Math.min(...classSlots.map(s => s.index)) : -1;
        const blocks = [];
        for (let i = 0; i <= slots.length - 2; i++) {
            if (i === firstClassSlotIndex) continue;
            if (slots[i]?.type === 'class' && slots[i + 1]?.type === 'class') {
                const startM = timeStrMins(slots[i].start);
                const endM = timeStrMins(slots[i + 1].end);
                blocks.push({ year, startSlot: i, start: slots[i].start, end: slots[i + 1].end, startM, endM });
            }
        }
        return blocks;
    };

    const checkOverlap = (b1, b2) => b1.startM < b2.endM && b2.startM < b1.endM;

    const getMaxDailyBlocks = () => {
        const allBlocks = [];
        for (let y = 1; y <= 4; y++) allBlocks.push(...getBlocksForYear(y));
        let maxSubset = [];
        const recurse = (index, current) => {
            if (index === allBlocks.length) {
                if (current.length > maxSubset.length) maxSubset = [...current];
                return;
            }
            recurse(index + 1, current);
            const block = allBlocks[index];
            if (!current.some(c => checkOverlap(c, block))) {
                recurse(index + 1, [...current, block]);
            }
        };
        recurse(0, []);
        return maxSubset.length;
    };

    const maxDailyBlocks = getMaxDailyBlocks();
    const maxWeeklyBlocks = maxDailyBlocks * 6;

    console.log(`Max capacity per lab room per week: ${maxWeeklyBlocks} blocks`);
    console.log(`\nRoom assignments and demand:\n`);

    for (const room of rooms) {
        const assignedSubjects = subjects.filter(s => s.assignedLabId === room.id);
        let totalDemand = 0;
        const rows = [];
        for (const sub of assignedSubjects) {
            const subMappings = mappings.filter(m => m.subjectId === sub.id);
            const blocksPerClass = periodsPerWeek(sub) / 2;
            const demand = subMappings.length * blocksPerClass;
            totalDemand += demand;
            rows.push({ name: sub.name, classes: subMappings.length, blocks: blocksPerClass, demand });
        }
        console.log(`Room: ${room.name}`);
        console.log(`  Total demand: ${totalDemand} / ${maxWeeklyBlocks} blocks`);
        if (totalDemand > maxWeeklyBlocks) {
            console.log(`  !!! EXCEEDS CAPACITY by ${totalDemand - maxWeeklyBlocks} blocks !!!`);
        }
        for (const r of rows) {
            console.log(`    ${r.name}: ${r.classes} classes × ${r.blocks} blocks = ${r.demand}`);
        }
    }

    await mongoose.disconnect();
}

run();
