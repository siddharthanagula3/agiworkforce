---
id: "PLAN-vscode-033"
type: "test-plan"
title: "VS Code · 33. Generated Sites and published applications"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "33"
---
# VS Code · 33. Generated Sites and published applications

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S33.26 Download source.

- **Expected:** The owner can download the app's source.
- **Code:** done. Evidence moved: apps/extension-vscode/package.json:593 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2653
- **Where to find it:** Command Palette > Code: Show Artifacts > pick an artifact row > hover it and click the save icon (tooltip: Save into the workspace) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with at least one artifact, and a folder open in VS Code
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Show Artifacts" and press Return.
  2. If the list says the artifacts belong to your AGI Cloud account, select that item and sign in first.
  3. Make sure a folder is open in VS Code, because the save needs a workspace folder (File > Open Folder).
  4. Select an artifact row, hover it, and click the save icon with the tooltip "Save into the workspace".
  5. In the save dialog, pick a place inside the open folder and click Save, then check the file appears in the Explorer with the artifact's content and compare with Expected.
