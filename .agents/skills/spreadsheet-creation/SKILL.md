---
name: spreadsheet-creation
description: Create Excel workbooks with named sheets, working formulas and simple charts from verified data.
version: 1.0.0
requires:
  tools: [create_office_file]
---

# Spreadsheet creation

Use this skill when the user needs an `.xlsx` deliverable, such as a budget, tracker, model or data table.

1. Identify what the workbook is for, who will use it, and which numbers the user supplied or asked you to research.
2. Plan the sheets before building: one purpose per sheet, a header row, and inputs kept apart from calculations.
3. Write calculations as formulas, such as `=SUM(B2:B13)`, so the workbook stays live when the user edits it; a cell that starts with `=` is written as a real formula.
4. Add a chart only when it shows a real relationship, using one bar, line or pie chart per sheet drawn from that sheet's own cells.
5. Create the workbook with `create_office_file` and format `xlsx`; do not claim a file exists until the tool succeeds.
6. Check the returned file metadata and summarize the sheets, the key formulas, and any assumptions or gaps in the data.

Keep sheet names to 31 characters without `\ / ? * [ ] :`. Use format `csv` instead when the user asks for plain comma-separated rows.

Do not invent figures, rates or totals the user did not provide or you did not verify, and label every estimate as one.
