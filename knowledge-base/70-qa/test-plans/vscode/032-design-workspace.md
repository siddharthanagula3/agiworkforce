---
id: "PLAN-vscode-032"
type: "test-plan"
title: "VS Code · 32. Design workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "32"
---
# VS Code · 32. Design workspace

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S32.31 Export to HTML.

- **Expected:** The user can export the design as a standalone HTML file.
- **Code:** done. Evidence moved: apps/extension-vscode/package.json:593 (quoted code not found in the file now); apps/extension-vscode/src/features/artifacts/artifactPresentation.ts:48; apps/extension-vscode/src/features/artifacts/artifactActions.ts:193
- **Where to find it:** not found in the code. No Export to HTML control found. Searched apps/extension-vscode (src and package.json) for 'export', 'html export', 'standalone', 'Export to HTML'; only Code: Export Conversation (package.json:234) and Code: Export Diagnostics (package.json:459) exist. Nearest candidate is the artifact command 'Code: Save Artifact into Workspace' (package.json:714, handler saveArtifactToWorkspace in src/features/artifacts/artifactActions.ts:163, file extension from artifactFileExtension in artifactPresentation.ts:94), which writes the artifact text to a workspace file via a save dialog; it is not confirmed to produce a standalone HTML file, and the menu placement for it was not confirmed. The Code line's package.json:593 reference no longer matches a file entry.
