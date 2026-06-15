import jsPDF from 'jspdf';
import 'jspdf-autotable';

const COLORS = {
    primary: [139, 92, 246],
    header: [75, 45, 150],
    theory: [99, 102, 241],
    lab: [236, 72, 153],
    break: [245, 158, 11],
    lunch: [34, 197, 94],
    white: [255, 255, 255],
    light: [245, 243, 255],
    text: [30, 20, 50]
};

export function exportClassPDF(viewData) {
    const { className, classYear, timeSlotConfig, entries } = viewData;
    if (!timeSlotConfig) return;

    const doc = new jsPDF({ orientation: 'landscape' });
    const days = timeSlotConfig.days;
    const slots = timeSlotConfig.slots;

    // Title
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, 297, 25, 'F');
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`Class Timetable: ${className}`, 14, 16);
    doc.setFontSize(9);
    doc.text(`Year ${classYear} | Generated: ${new Date().toLocaleDateString()}`, 250, 16);

    // Build table data (Transposed: Days as rows, Times as columns)
    const head = [['Day', ...slots.map((s, idx) => {
        const hourNum = slots.slice(0, idx + 1).filter(xs => xs.type === 'class').length;
        const label = s.type === 'class' ? `Hour ${hourNum}` : s.type.charAt(0).toUpperCase() + s.type.slice(1);
        return `${label}\n${s.start}-${s.end}`;
    })]];
    const body = [];

    for (const day of days) {
        const row = [day];
        for (let sIdx = 0; sIdx < slots.length; sIdx++) {
            const slot = slots[sIdx];
            if (slot.type === 'break') {
                row.push('Break');
            } else if (slot.type === 'lunch') {
                row.push('Lunch');
            } else {
                const entry = entries.find(e => {
                    const start = e.slotIndex;
                    const dur = e.duration || 1;
                    return e.day === day && sIdx >= start && sIdx < start + dur;
                });
                if (entry) {
                    let text = `${entry.subjectCode || entry.subjectName}\n${entry.facultyName}`;
                    if (entry.labFaculty2Name) text += ` + ${entry.labFaculty2Name}`;
                    if (entry.labFaculty3Name) text += ` + ${entry.labFaculty3Name}`;
                    text += `\n${entry.roomName}`;
                    row.push(text);
                } else {
                    row.push('-');
                }
            }
        }
        body.push(row);
    }

    doc.autoTable({
        head,
        body,
        startY: 30,
        theme: 'grid',
        styles: {
            fontSize: 7,
            cellPadding: 2,
            textColor: COLORS.text,
            lineColor: [200, 190, 220],
            lineWidth: 0.3,
            halign: 'center',
            valign: 'middle',
            overflow: 'linebreak'
        },
        headStyles: {
            fillColor: COLORS.header,
            textColor: COLORS.white,
            fontSize: 7.5,
            fontStyle: 'bold'
        },
        columnStyles: {
            0: { cellWidth: 22, fontStyle: 'bold', fillColor: [250, 250, 250] }
        },
        didParseCell: function (data) {
            if (data.section === 'body') {
                const text = data.cell.raw;
                if (text === 'Break') {
                    data.cell.styles.fillColor = [255, 247, 230];
                    data.cell.styles.textColor = [180, 130, 20];
                } else if (text === 'Lunch') {
                    data.cell.styles.fillColor = [230, 255, 240];
                    data.cell.styles.textColor = [20, 130, 60];
                } else if (text !== '-' && data.column.index > 0) {
                    const day = days[data.row.index];
                    const slotIdx = data.column.index - 1;
                    const entry = entries.find(e => {
                        const start = e.slotIndex;
                        const dur = e.duration || 1;
                        return e.day === day && slotIdx >= start && slotIdx < start + dur;
                    });
                    if (entry?.isLab) {
                        data.cell.styles.fillColor = [255, 235, 245];
                    } else if (entry) {
                        data.cell.styles.fillColor = [235, 235, 255];
                    }
                }
            }
        }
    });

    // Legend
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.text);
    doc.setFillColor(235, 235, 255); doc.rect(14, finalY, 8, 5, 'F');
    doc.text('Theory', 24, finalY + 4);
    doc.setFillColor(255, 235, 245); doc.rect(50, finalY, 8, 5, 'F');
    doc.text('Lab', 60, finalY + 4);

    doc.save(`${className.replace(/\s+/g, '_')}_Timetable.pdf`);
}

export function exportFacultyPDF(viewData) {
    const { facultyName, timeSlotConfigs, entries } = viewData;
    if (!timeSlotConfigs || timeSlotConfigs.length === 0) return;

    const doc = new jsPDF({ orientation: 'landscape' });

    // Group identical configs
    const groupedConfigs = [];
    timeSlotConfigs.forEach(cfg => {
        const layoutKey = JSON.stringify({
            days: cfg.days,
            slots: cfg.slots.map(s => ({ start: s.start, end: s.end, type: s.type }))
        });
        const existing = groupedConfigs.find(g => g.layoutKey === layoutKey);
        if (existing) {
            if (!existing.years.includes(cfg.year)) existing.years.push(cfg.year);
        } else {
            groupedConfigs.push({ ...cfg, years: [cfg.year], layoutKey });
        }
    });

    groupedConfigs.forEach((config, configIdx) => {
        // Only keep entries for THIS group's years
        const yearEntries = entries.filter(e => config.years.includes(Number(e.classYear)));
        
        // Skip if no entries for this group and we have multiple groups
        if (yearEntries.length === 0 && groupedConfigs.length > 1) return;

        if (configIdx > 0) doc.addPage();

        const days = config.days;
        const slots = config.slots;

        // Title Section
        doc.setFillColor(...COLORS.primary);
        doc.rect(0, 0, 297, 25, 'F');
        doc.setTextColor(...COLORS.white);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(`Faculty Timetable: ${facultyName}`, 14, 16);
        doc.setFontSize(9);
        const yearStr = config.years.length > 1 ? `Years ${config.years.sort((a,b)=>a-b).join(', ')}` : `Year ${config.years[0]}`;
        doc.text(`${yearStr} Timings | Generated: ${new Date().toLocaleDateString()}`, 220, 16);

        // Transposed: Days as rows, Times as columns
        const head = [['Day', ...slots.map((s, idx) => {
            const hourNum = slots.slice(0, idx + 1).filter(xs => xs.type === 'class').length;
            const label = s.type === 'class' ? `Hour ${hourNum}` : s.type.charAt(0).toUpperCase() + s.type.slice(1);
            return `${label}\n${s.start}-${s.end}`;
        })]];
        const body = [];

        for (const day of days) {
            const row = [day];
            for (let sIdx = 0; sIdx < slots.length; sIdx++) {
                const slot = slots[sIdx];
                if (slot.type === 'break') {
                    row.push('Break');
                } else if (slot.type === 'lunch') {
                    row.push('Lunch');
                } else {
                    const cellEntries = yearEntries.filter(e => {
                        const start = e.slotIndex;
                        const dur = e.duration || 1;
                        return e.day === day && sIdx >= start && sIdx < start + dur;
                    });
                    if (cellEntries.length > 0) {
                        let text = cellEntries.map(entry => 
                            `${entry.subjectCode || entry.subjectName}\n${entry.className}\n${entry.roomName}`
                        ).join('\n---\n');
                        row.push(text);
                    } else {
                        row.push('-');
                    }
                }
            }
            body.push(row);
        }

        doc.autoTable({
            head,
            body,
            startY: 30,
            theme: 'grid',
            styles: {
                fontSize: 7,
                cellPadding: 2,
                textColor: COLORS.text,
                lineColor: [200, 190, 220],
                lineWidth: 0.3,
                halign: 'center',
                valign: 'middle',
                overflow: 'linebreak'
            },
            headStyles: {
                fillColor: COLORS.header,
                textColor: COLORS.white,
                fontSize: 7.5,
                fontStyle: 'bold'
            },
            columnStyles: {
                0: { cellWidth: 22, fontStyle: 'bold', fillColor: [250, 250, 250] }
            },
            didParseCell: function (data) {
                if (data.section === 'body') {
                    const text = data.cell.raw;
                    if (text === 'Break') {
                        data.cell.styles.fillColor = [255, 247, 230];
                        data.cell.styles.textColor = [180, 130, 20];
                    } else if (text === 'Lunch') {
                        data.cell.styles.fillColor = [230, 255, 240];
                        data.cell.styles.textColor = [20, 130, 60];
                    } else if (text !== '-' && data.column.index > 0) {
                        const day = days[data.row.index];
                        const slotIdx = data.column.index - 1;
                        const cellEntries = yearEntries.filter(e => {
                            const start = e.slotIndex;
                            const dur = e.duration || 1;
                            return e.day === day && slotIdx >= start && slotIdx < start + dur;
                        });
                        if (cellEntries.some(e => e.isLab)) {
                            data.cell.styles.fillColor = [255, 235, 245];
                        } else if (cellEntries.length > 0) {
                            data.cell.styles.fillColor = [235, 235, 255];
                        }
                    }
                }
            }
        });
    });

    doc.save(`${facultyName.replace(/\s+/g, '_')}_Timetable.pdf`);
}

export function exportLabPDF(viewData) {
    const { roomName, roomType, roomCapacity, timeSlotConfigs, entries } = viewData;
    if (!timeSlotConfigs || timeSlotConfigs.length === 0) return;

    const doc = new jsPDF({ orientation: 'landscape' });

    // Group identical configs
    const groupedConfigs = [];
    timeSlotConfigs.forEach(cfg => {
        const layoutKey = JSON.stringify({
            days: cfg.days,
            slots: cfg.slots.map(s => ({ start: s.start, end: s.end, type: s.type }))
        });
        const existing = groupedConfigs.find(g => g.layoutKey === layoutKey);
        if (existing) {
            if (!existing.years.includes(cfg.year)) existing.years.push(cfg.year);
        } else {
            groupedConfigs.push({ ...cfg, years: [cfg.year], layoutKey });
        }
    });

    groupedConfigs.forEach((config, configIdx) => {
        const yearEntries = entries.filter(e => config.years.includes(Number(e.classYear)));
        if (yearEntries.length === 0 && groupedConfigs.length > 1) return;

        if (configIdx > 0) doc.addPage();

        const days = config.days;
        const slots = config.slots;

        // Title Section
        doc.setFillColor(...COLORS.primary);
        doc.rect(0, 0, 297, 25, 'F');
        doc.setTextColor(...COLORS.white);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(`Lab Timetable: ${roomName}`, 14, 16);
        doc.setFontSize(9);
        const yearStr = config.years.length > 1 ? `Years ${config.years.sort((a,b)=>a-b).join(', ')}` : `Year ${config.years[0]}`;
        const capStr = roomCapacity ? ` | Capacity: ${roomCapacity}` : '';
        doc.text(`${roomType}${capStr} | ${yearStr} Timings | Generated: ${new Date().toLocaleDateString()}`, 180, 16);

        const head = [['Day', ...slots.map((s, idx) => {
            const hourNum = slots.slice(0, idx + 1).filter(xs => xs.type === 'class').length;
            const label = s.type === 'class' ? `Hour ${hourNum}` : s.type.charAt(0).toUpperCase() + s.type.slice(1);
            return `${label}\n${s.start}-${s.end}`;
        })]];
        const body = [];

        for (const day of days) {
            const row = [day];
            for (let sIdx = 0; sIdx < slots.length; sIdx++) {
                const slot = slots[sIdx];
                if (slot.type === 'break') {
                    row.push('Break');
                } else if (slot.type === 'lunch') {
                    row.push('Lunch');
                } else {
                    const cellEntries = yearEntries.filter(e => {
                        const start = e.slotIndex;
                        const dur = e.duration || 1;
                        return e.day === day && sIdx >= start && sIdx < start + dur;
                    });
                    if (cellEntries.length > 0) {
                        let text = cellEntries.map(entry => {
                            let line = `${entry.subjectCode || entry.subjectName}\n${entry.className}\n${entry.facultyName}`;
                            if (entry.labFaculty2Name) line += `\n+ ${entry.labFaculty2Name}`;
                            return line;
                        }).join('\n---\n');
                        row.push(text);
                    } else {
                        row.push('-');
                    }
                }
            }
            body.push(row);
        }

        doc.autoTable({
            head,
            body,
            startY: 30,
            theme: 'grid',
            styles: {
                fontSize: 7,
                cellPadding: 2,
                textColor: COLORS.text,
                lineColor: [200, 190, 220],
                lineWidth: 0.3,
                halign: 'center',
                valign: 'middle',
                overflow: 'linebreak'
            },
            headStyles: {
                fillColor: COLORS.header,
                textColor: COLORS.white,
                fontSize: 7.5,
                fontStyle: 'bold'
            },
            columnStyles: {
                0: { cellWidth: 22, fontStyle: 'bold', fillColor: [250, 250, 250] }
            },
            didParseCell: function (data) {
                if (data.section === 'body') {
                    const text = data.cell.raw;
                    if (text === 'Break') {
                        data.cell.styles.fillColor = [255, 247, 230];
                        data.cell.styles.textColor = [180, 130, 20];
                    } else if (text === 'Lunch') {
                        data.cell.styles.fillColor = [230, 255, 240];
                        data.cell.styles.textColor = [20, 130, 60];
                    } else if (text !== '-' && data.column.index > 0) {
                        data.cell.styles.fillColor = [255, 235, 245]; // Lab colors
                    }
                }
            }
        });
    });

    doc.save(`${roomName.replace(/\s+/g, '_')}_Lab_Timetable.pdf`);
}
