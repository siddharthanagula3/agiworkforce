---
id: "PLAN-vscode-028"
type: "test-plan"
title: "VS Code · 28. Code Canvas and application preview"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "28"
---
# VS Code · 28. Code Canvas and application preview

9 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S28.01 Editable code source.

- **Expected:** Generated code opens in an editable source view where the user can change it and keep the result.
- **Code:** done. Evidence moved: apps/extension-vscode/package.json:282 (quoted code not found in the file now); apps/extension-vscode/src/providers/diffDecorationProvider.ts:388
- **Where to find it:** More actions (…) > Artifacts > Open an artifact… > pick an artifact with code (labels found in the code)
- **Needs:** a signed-in account with at least one artifact that contains code, and a folder open in VS Code to keep the result
- **Steps:**
  1. In the AGI Code sidebar, click the button labelled More actions (the … icon in the header).
  2. Click Artifacts, then pick an artifact in the list (the placeholder text reads Open an artifact…).
  3. Click inside the code and type a line; check that the text changes and can be edited.
  4. Hover the row's save icon labelled Save into the workspace and click it to keep the result; check that a saved file opens in the editor, as in Expected.

## S28.02 Multi-file project tree.

- **Expected:** A multi-file project is shown as a browsable file tree.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:83; apps/extension-vscode/src/extension.ts:82; apps/extension-vscode/src/providers/diffDecorationProvider.ts:388
- **Where to find it:** not found in the code. Not found. Artifacts list as a flat list (artifactsTree.ts sets TreeItemCollapsibleState.None), and the cited lines in package.json and extension.ts are now unrelated commands. Searched the app folder for file tree, fileTree, multi-file and TreeItemCollapsibleState.Collapsed. Only VS Code's own Explorer applies once a folder is open.

## S28.03 File creation and deletion.

- **Expected:** The user can create and delete files in the generated project.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:83; apps/extension-vscode/src/extension.ts:82; apps/extension-vscode/src/providers/diffDecorationProvider.ts:388
- **Where to find it:** not found in the code. Not found. The app has no create or delete action for files in an artifact project. Searched the app folder for createFile, deleteFile and create/delete file wording. Only VS Code's own file actions on the saved workspace file apply.

## S28.04 File rename.

- **Expected:** The user can rename files in the generated project.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:83; apps/extension-vscode/src/extension.ts:82; apps/extension-vscode/src/providers/diffDecorationProvider.ts:388
- **Where to find it:** not found in the code. Not found. The app has no rename action for generated files. Searched the app folder for rename and renameFile; the only rename is Rename session group in sessionGroups.ts.

## S28.05 Language-aware editing.

- **Expected:** The code editor is language-aware (syntax highlighting, indentation, brackets) while editing.
- **Code:** done. Evidence moved: apps/extension-vscode/package.json:282 (quoted code not found in the file now); apps/extension-vscode/src/providers/diffDecorationProvider.ts:388
- **Where to find it:** More actions (…) > Artifacts > Open an artifact… > pick an artifact with code (labels found in the code)
- **Needs:** a signed-in account with at least one artifact that contains code
- **Steps:**
  1. In the AGI Code sidebar, click the button labelled More actions (the … icon in the header).
  2. Click Artifacts, then pick an artifact that contains code (the placeholder text reads Open an artifact…).
  3. Look at the opened editor tab: the code should show colours for keywords and strings, as in Expected.
  4. Click at the end of a line that opens a bracket and press Return; check that indentation and matching brackets follow the language.

## S28.06 Syntax diagnostics.

- **Expected:** The code editor shows syntax errors and diagnostics inline.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:83; apps/extension-vscode/src/extension.ts:82; apps/extension-vscode/src/providers/diffDecorationProvider.ts:388
- **Where to find it:** not found in the code. Not verified. The app sets the language of an opened artifact but registers no diagnostics provider for it; errors would come only from a VS Code language extension. Searched the app folder for diagnostics. Only chat context and an export diagnostics command were found.

## S28.08 Search across generated files.

- **Expected:** The user can search across all the generated files of a project.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:83; apps/extension-vscode/src/extension.ts:82; apps/extension-vscode/src/providers/diffDecorationProvider.ts:388
- **Where to find it:** not found in the code. Not found. The app has no search across generated files. The Open an artifact… list filters by typed text only, and across real files only VS Code search applies after Save into the workspace. Searched the app folder for search and generated-file wording.

## S28.24 Download source.

- **Expected:** The user can download the app's source code.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:713; apps/extension-vscode/src/features/artifacts/artifactActions.ts:199
- **Where to find it:** not found in the code. Not found. The cited package.json and artifactActions.ts lines do not contain a download source action. Searched the app folder for download source and download; only cloud-download icons turned up. The closest is Save into the workspace, which saves one artifact, not the app's source code.

## S28.26 Open in coding workspace.

- **Expected:** Generated code can be opened in a real coding workspace to keep developing it.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:713; apps/extension-vscode/src/features/artifacts/artifactActions.ts:206
- **Where to find it:** More actions (…) > Artifacts > Open an artifact… > hover the row's save icon and click Save into the workspace (labels found in the code)
- **Needs:** a signed-in account with at least one artifact that contains code, and a folder open in VS Code (without one the app shows: open a folder first)
- **Steps:**
  1. In the AGI Code sidebar, click the button labelled More actions (the … icon in the header).
  2. Click Artifacts, then pick an artifact that contains code (the placeholder text reads Open an artifact…).
  3. Hover the row's save icon, whose tooltip reads Save into the workspace, and click it.
  4. In the save dialog, keep the suggested file name and click Save; check that the file opens in a normal editor tab in the open folder, ready to keep developing.
