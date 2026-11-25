---
id: "PLAN-mobile-029"
type: "test-plan"
title: "Mobile · 29. Spreadsheet and data-analysis workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "29"
---
# Mobile · 29. Spreadsheet and data-analysis workspace

3 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S29.27 Python analysis panel.

- **Expected:** A panel lets the user run Python analysis on data and see code, output and charts.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:438 (quoted code not found in the file now)
- **Where to find it:** Chat screen > send a message asking for Python analysis of some data > under the assistant's reply, the block titled "Code Execution" (status "Running Python…"); tap it to expand "Output"; the run's code is in the tool row, where "Run again" re-runs it (labels found in the code)
- **Needs:** a Free or paid account; the run may ask for approval first (plan requirement not verified in the code); a phone or Mac with the app signed in
- **Steps:**
  1. Sign in and open a chat on the main chat screen.
  2. Send a request that needs Python, for example: "Using this small table of numbers I type, calculate the average and draw a chart in Python." Type the numbers in the message.
  3. Wait for the reply. Look for the block titled "Code Execution" under the reply; it shows "Running Python…" while it runs.
  4. Tap the "Code Execution" block to expand it and check that the "Output" heading shows the printed result.
  5. Look for the code the run used (its code card in the tool row) and for any chart drawn below the output, and compare with Expected: code, output and charts all visible. Optionally tap "Run again" to repeat the run.

## S29.35 Export CSV.

- **Expected:** The user can download tabular data as a CSV file.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:394 (quoted code not found in the file now)
- **Where to find it:** Chat screen > an assistant answer that contains a table > tap the table's "Download table as CSV" button (an icon; its label is that text), then the share sheet opens. Or open a CSV/spreadsheet file in the answer's artifact view and tap the share icon labeled "Share as CSV" (labels found in the code)
- **Needs:** a signed-in account and a chat that contains a table; a phone or Mac to see the share sheet
- **Steps:**
  1. Sign in and open a chat where the assistant has returned a table (ask for a small table, e.g. "make a table of 3 fruits and their prices").
  2. Find the table's action buttons in the table header area and tap the one labeled "Download table as CSV".
  3. Check that the share sheet opens with a file ending in .csv (the file name is built from the table title or "table").
  4. Optional route: open a CSV file artifact and tap the icon labeled "Share as CSV", then check the share sheet and that a .csv file is offered.

## S29.36 Export chart.

- **Expected:** The user can export a chart as an image or file.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ReportChart.tsx:823; apps/mobile/src/features/chat/components/ReportChart.tsx (text found, layout changed); apps/mobile/src/features/chat/components/ReportChart.tsx:922; apps/mobile/services/fileCreation.ts:269
- **Where to find it:** Chat screen > an assistant answer that shows a chart > tap "Show data" to see the numbers, and tap "Save image" at the bottom of the chart to save it as a picture through the share sheet (labels found in the code)
- **Needs:** a signed-in account and a chat answer that contains a chart; a phone or Mac to see the share sheet
- **Steps:**
  1. Sign in and open a chat where the assistant returns a chart (ask for a simple bar or line chart of a few values).
  2. Look at the chart's footer row for the buttons "Show data" and "Save image".
  3. Tap "Save image"; the label changes to "Saving…" while it works, then the share sheet opens with a PNG picture of the chart.
  4. If saving fails, check that the alert "Could not save the chart" appears instead of a share sheet.
  5. Compare with Expected: the user can export the chart as an image file. Tap "Show data" to confirm the table of values is also visible.
