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

    // Build table data
    const head = [['Time', ...days]];
    const body = [];

    for (const slot of slots) {
        const slotIdx = slots.indexOf(slot);
        const row = [`${slot.start} - ${slot.end}`];

        if (slot.type === 'break') {
            days.forEach(() => row.push('☕ Break'));
        } else if (slot.type === 'lunch') {
            days.forEach(() => row.push('🍽️ Lunch'));
        } else {
            for (const day of days) {
                const entry = entries.find(e => e.day === day && e.slotIndex === slotIdx);
                if (entry) {
                    let text = `${entry.subjectCode || entry.subjectName}\n${entry.facultyName}`;
                    if (entry.labFaculty2Name) text += ` + ${entry.labFaculty2Name}`;
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
            fontSize: 7.5,
            cellPadding: 3,
            textColor: COLORS.text,
            lineColor: [200, 190, 220],
            lineWidth: 0.3,
        },
        headStyles: {
            fillColor: COLORS.header,
            textColor: COLORS.white,
            fontSize: 8,
            fontStyle: 'bold',
            halign: 'center'
        },
        columnStyles: {
            0: { cellWidth: 25, fontStyle: 'bold', fontSize: 7 }
        },
        didParseCell: function (data) {
            if (data.section === 'body') {
                const text = data.cell.raw;
                if (text === '☕ Break') {
                    data.cell.styles.fillColor = [255, 247, 230];
                    data.cell.styles.textColor = [180, 130, 20];
                    data.cell.styles.halign = 'center';
                } else if (text === '🍽️ Lunch') {
                    data.cell.styles.fillColor = [230, 255, 240];
                    data.cell.styles.textColor = [20, 130, 60];
                    data.cell.styles.halign = 'center';
                } else if (text !== '-' && data.column.index > 0) {
                    // Check if it's a lab
                    const slotIdx = data.row.index;
                    const day = days[data.column.index - 1];
                    const entry = entries.find(e => e.day === day && e.slotIndex === slotIdx);
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
    const config = timeSlotConfigs?.[0];
    if (!config) return;

    const doc = new jsPDF({ orientation: 'landscape' });
    const days = config.days;
    const slots = config.slots;

    // Title
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, 297, 25, 'F');
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`Faculty Timetable: ${facultyName}`, 14, 16);
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 250, 16);

    const head = [['Time', ...days]];
    const body = [];

    for (const slot of slots) {
        const slotIdx = slots.indexOf(slot);
        const row = [`${slot.start} - ${slot.end}`];

        if (slot.type === 'break') {
            days.forEach(() => row.push('☕ Break'));
        } else if (slot.type === 'lunch') {
            days.forEach(() => row.push('🍽️ Lunch'));
        } else {
            for (const day of days) {
                const entry = entries.find(e => e.day === day && e.slotIndex === slotIdx);
                if (entry) {
                    let text = `${entry.subjectCode || entry.subjectName}\n${entry.className}\n${entry.roomName}`;
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
            fontSize: 7.5,
            cellPadding: 3,
            textColor: COLORS.text,
            lineColor: [200, 190, 220],
            lineWidth: 0.3,
        },
        headStyles: {
            fillColor: COLORS.header,
            textColor: COLORS.white,
            fontSize: 8,
            fontStyle: 'bold',
            halign: 'center'
        },
        columnStyles: {
            0: { cellWidth: 25, fontStyle: 'bold', fontSize: 7 }
        },
        didParseCell: function (data) {
            if (data.section === 'body') {
                const text = data.cell.raw;
                if (text === '☕ Break') {
                    data.cell.styles.fillColor = [255, 247, 230];
                    data.cell.styles.textColor = [180, 130, 20];
                    data.cell.styles.halign = 'center';
                } else if (text === '🍽️ Lunch') {
                    data.cell.styles.fillColor = [230, 255, 240];
                    data.cell.styles.textColor = [20, 130, 60];
                    data.cell.styles.halign = 'center';
                } else if (text !== '-' && data.column.index > 0) {
                    const slotIdx = data.row.index;
                    const day = days[data.column.index - 1];
                    const entry = entries.find(e => e.day === day && e.slotIndex === slotIdx);
                    if (entry?.isLab) {
                        data.cell.styles.fillColor = [255, 235, 245];
                    } else if (entry) {
                        data.cell.styles.fillColor = [235, 235, 255];
                    }
                }
            }
        }
    });

    doc.save(`${facultyName.replace(/\s+/g, '_')}_Timetable.pdf`);
}
