# Excel Import Instructions for Faculty

## Quick Start

1. **Open Excel** and create a new workbook
2. **Add column headers** in the first row: `Name`, `Department`, `Designation`
3. **Fill in faculty data** - see examples below
4. **Save as Excel file** (.xlsx format)
5. **Import** using the "📊 Import Excel" button on the Faculty page

## Column Details

| Column | Required | Format | Examples |
|--------|----------|--------|----------|
| **Name** | ✅ Yes | Text | Dr. John Smith, Prof. Sarah |
| **Department** | ✅ Yes | Dept Code, Name, or ID | CSE, Computer Science & Engineering, dept-001 |
| **Designation** | ❌ No | Text | Professor, Assistant Professor, Lecturer |

## Important Notes

### Department Column - Flexible Formats
You can use **any** of these formats for the Department column:

✅ **Department Code:** `CSE`, `ECE`, `EEE`
✅ **Department Name:** `Computer Science & Engineering`, `Electronics & Communication`
✅ **Department ID:** `dept-001`, `dept-002`

The system will automatically match your input to the correct department.

### Available Departments
From your database:
- **CSE** - Computer Science & Engineering (dept-001)
- **ECE** - Electronics & Communication (dept-002)
- **EEE** - ELECTRIC & ELECTRONICS (dept-11857e25)

## Sample Data

Copy this into Excel:

```
Name                    | Department                      | Designation
Dr. John Smith          | CSE                             | Professor
Dr. Sarah Johnson       | Computer Science & Engineering  | Associate Professor
Dr. Michael Brown       | ECE                             | Assistant Professor
Dr. Emily Davis         | Electronics & Communication     | Lecturer
Dr. Robert Wilson       | dept-001                        | Professor
Prof. Alice Williams    | EEE                             | Assistant Professor
```

## Troubleshooting

### "Import failed" errors
1. Open browser console (F12)
2. Look for error messages starting with "Row X:"
3. Common issues:
   - Missing Name or Department
   - Department not found (check spelling)
   - Empty rows

### Best Practices
- ✅ Remove empty rows before importing
- ✅ Use consistent department names/codes
- ✅ Test with 2-3 rows first
- ✅ Check console (F12) for detailed error messages

## What Gets Imported

Each successful row creates a faculty record with:
- Auto-generated unique ID
- Name from your Excel
- Department (matched automatically)
- Designation from your Excel (or empty if not provided)
- Empty email field (for backward compatibility)

## After Import

- Success toast shows: "✅ Import complete: X successful, Y failed"
- If errors occur: "⚠️ N errors occurred. Check console."
- Table automatically refreshes
- View detailed errors in browser console (F12)
