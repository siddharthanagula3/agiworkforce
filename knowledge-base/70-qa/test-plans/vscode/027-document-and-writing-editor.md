---
id: "PLAN-vscode-027"
type: "test-plan"
title: "VS Code · 27. Document and writing editor"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "27"
---
# VS Code · 27. Document and writing editor

4 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S27.01 Document title.

- **Expected:** A document shows its title in its card and viewer, falling back to a default when it has none.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/artifacts/artifactsTree.ts:37; apps/extension-vscode/src/features/artifacts/artifactPresentation.ts:78
- **Where to find it:** Command Palette > Code: Show Artifacts > pick a row in the "Code, Artifacts" list (placeholder "Open an artifact…") (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with artifacts, including one with no title
- **Steps:**
  1. Sign in to AGI Cloud with an account that has artifacts.
  2. Open the Command Palette and run "Code: Show Artifacts".
  3. Look at each row: the row name should be the artifact's title.
  4. Find an artifact with no title and check the row shows "Untitled" followed by its type.
  5. Click a row to open it and check the editor tab name matches the title.

## S27.15 Selection toolbar.

- **Expected:** Selecting text in a document shows a toolbar of actions for that selection.
- **Code:** done. Evidence present: apps/extension-vscode/src/providers/codeActionProvider.ts:42
- **Where to find it:** Select some text in an editor > right-click > Code: Explain Selection or Code: Refactor Code; or click the lightbulb (or press Cmd+.) and look for Refactor with Code (labels found in the code)
- **Steps:**
  1. Open any code file and select several lines.
  2. Right-click inside the selection.
  3. Look for "Code: Explain Selection" and "Code: Refactor Code" in the menu.
  4. Press Cmd+. (or click the lightbulb) with the selection still active.
  5. Look for "Refactor with" followed by the product name "Code" and "Explain with" in the list.

## S27.37 Export to Markdown.

- **Expected:** A document can be exported as a Markdown file.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:713; apps/extension-vscode/src/features/artifacts/artifactActions.ts:199
- **Where to find it:** Command Palette > Code: Show Artifacts > hover a row > click the save icon "Save into the workspace" (command "Code: Save Artifact into Workspace") (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with a Markdown artifact
- **Steps:**
  1. Sign in to AGI Cloud with an account that has a Markdown artifact.
  2. Run "Code: Show Artifacts" from the Command Palette.
  3. Hover the Markdown artifact row and click the save icon labelled "Save into the workspace".
  4. In the save dialog, choose a folder and keep the suggested name.
  5. Check the saved file name ends in .md and that its content matches the artifact.

## S27.41 Send-email review step.

- **Expected:** Before an email is sent on the user's behalf, they review the final message (recipients, subject, body) and confirm.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** credential
- **Where to find it:** not found in the code. Searched apps/extension-vscode/src for send-email, sendEmail, recipient, draft-email and email-confirm patterns and packages/ui for the same words; found no review-before-send step, only a resend confirmation in ChatStateManager.ts. The ledger gives no code location.
- **Needs:** a connected email account
