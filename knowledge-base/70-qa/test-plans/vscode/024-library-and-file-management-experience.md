---
id: "PLAN-vscode-024"
type: "test-plan"
title: "VS Code · 24. Library and file-management experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "24"
---
# VS Code · 24. Library and file-management experience

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S24.04 Artifact view.

- **Expected:** A view lists the user's artifacts and opens each one.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/chatSetup.ts:107; apps/extension-vscode/src/features/artifacts/artifactsTree.ts:112
- **Where to find it:** Chat panel > More actions ("More" button) > Artifacts; or Command Palette > "Code: Show Artifacts" (labels found in the code)
- **Needs:** a Free or paid AGI Cloud account; at least one artifact made by a chat (for the open step)
- **Steps:**
  1. Sign in to AGI Cloud (the Artifacts view needs an AGI Cloud account).
  2. Open the AGI Workforce chat panel in the editor sidebar and click the "More" button (aria-label "More actions").
  3. Click "Artifacts" in the menu. A quick pick titled "Code, Artifacts" opens, with the placeholder "Open an artifact…".
  4. Look for the artifacts list. Each row is an artifact title; with a signed-out account you see "Sign in to see your artifacts" instead, and with none you see "No artifacts yet".
  5. Click (or press Enter on) an artifact row. It opens read-only in an editor tab, which compares with Expected: the artifact opens.
