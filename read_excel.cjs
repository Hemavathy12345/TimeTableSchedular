const XLSX = require('./backend/node_modules/xlsx');
const wb = XLSX.readFile('./course_list_timetable_project.xlsx');
console.log('Sheets:', JSON.stringify(wb.SheetNames));
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
if (data.length > 0) {
    console.log('Columns:', Object.keys(data[0]).join(' | '));
    console.log('Rows:', data.length);
    data.forEach((r, i) => console.log(i, JSON.stringify(r)));
} else {
    console.log('No data found');
    // Try raw mode
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    console.log('Raw rows:', JSON.stringify(raw.slice(0, 10)));
}
