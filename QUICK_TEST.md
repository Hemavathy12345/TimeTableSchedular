# Quick Test: Excel Import

## Step 1: Convert CSV to Excel
1. Open the file: `d:\SCHEDULE\sample_faculty_import.csv`
2. In Excel/LibreOffice: File → Save As → Choose "Excel Workbook (.xlsx)"
3. Save it as: `sample_faculty_import.xlsx`

## Step 2: Import the Excel File
1. Go to http://localhost:5173 and navigate to Faculty page
2. **Open Browser Console (F12)** - This is important!
3. Click "📊 Import Excel" button
4. Select the `sample_faculty_import.xlsx` file you just created
5. Watch the console for messages

## What to Look For in Console

### ✅ Success Messages:
```
📁 File selected: sample_faculty_import.xlsx Type: ... Size: ...
📖 File read successfully, parsing...
📊 Excel rows parsed: [...]
📋 Available departments: [...]
📤 Sending data to backend: [...]
```

### ❌ Common Error Messages:

**"Excel file has no sheets"**
- The file wasn't saved properly as Excel

**"Excel file is empty"**
- The file has no data rows (only headers)

**"Row X: Could not find department for..."**
- Department name/code doesn't match any in database
- Check spelling: CSE, ECE, EEE

**"Row X: Missing name or departmentId"**
- Required columns are empty

## If You Still Get Errors:

1. Copy the **exact error message** from console
2. Check what the console shows for "Excel rows parsed"
3. Share the error with me so I can help debug

## Alternative: Manual Entry
If Excel import continues to have issues, you can add faculty one by one:
1. Click "+ Add Faculty"
2. Fill in: Name, Department (dropdown), Designation
3. Click Save
