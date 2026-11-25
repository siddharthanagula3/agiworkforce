---
id: "PLAN-chrome-021"
type: "test-plan"
title: "Chrome · 21. Code blocks and executable code presentation"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "21"
---
# Chrome · 21. Code blocks and executable code presentation

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S21.19 Generated-file output.

- **Expected:** Files produced by execution are listed and can be opened or downloaded.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/generatedFiles.ts:73; apps/extension/src/features/side-panel/generatedFiles.ts:317; apps/extension/src/features/side-panel/generatedFiles.ts:126 (quoted code not found in the file now)
- **Where to find it:** Top right of the side panel header > Outputs (icon button with the tooltip "Outputs"); it appears only once a chat has produced a file. Then, in the popover list, use the "Open <file name>" and "Download <file name>" icon buttons next to each file. The same files also appear as cards under the answer that produced them, under the label "Files from this answer", with the same Open and Download buttons. (labels found in the code)
- **Needs:** a chat whose answer produced a file (the tester must get the app to produce one)
- **Steps:**
  1. Sign in and open a chat whose answer produced a file.
  2. Look at the top right of the side panel header for the Outputs button; it is hidden when the chat has no files.
  3. Click Outputs. A popover titled "Outputs" opens with a list of the produced files.
  4. Hover a file and check its Open and Download icon buttons (tooltips read "Open <file name>" and "Download <file name>").
  5. Click Open to check a new tab opens with the file, then click Download and check the file is saved.
  6. Compare with Expected: the produced files are listed and can be opened or downloaded.
