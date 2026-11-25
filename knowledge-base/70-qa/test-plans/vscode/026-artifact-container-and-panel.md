---
id: "PLAN-vscode-026"
type: "test-plan"
title: "VS Code · 26. Artifact container and panel"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "26"
---
# VS Code · 26. Artifact container and panel

10 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S26.02 Artifact title.

- **Expected:** The artifact's title is shown on its card and in the viewer, with a fallback when the artifact has none.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/artifacts/artifactsTree.ts:37; apps/extension-vscode/src/features/artifacts/artifactPresentation.ts:78
- **Where to find it:** Chat panel > More > Artifacts, then read the row title (labels found in the code)
- **Needs:** a signed-in account with at least one artifact, and one artifact with no title for the fallback check
- **Steps:**
  1. Sign in and make sure the account has at least one artifact.
  2. Click More in the chat panel.
  3. Click Artifacts. The list opens under the title Code, Artifacts.
  4. Read the title on each row. Rows with no title should show Untitled followed by the type.
  5. Open a row and compare the file name shown on the viewer tab with the title. The tab shows the title turned into a file name with an extension, not the title text itself.

## S26.03 Artifact type.

- **Expected:** The artifact's kind (HTML, React, diagram, document, code, spreadsheet...) is shown on its card and in the viewer.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/artifacts/artifactsTree.ts:42 (quoted code not found in the file now); apps/extension-vscode/src/features/artifacts/artifactPresentation.ts:120
- **Where to find it:** Chat panel > More > Artifacts, then read the row description (labels found in the code)
- **Needs:** a signed-in account with artifacts of different types
- **Steps:**
  1. Sign in and make sure the account has artifacts of more than one type.
  2. Click More in the chat panel, then click Artifacts.
  3. Read the text after the icon on each row. The first word is the artifact type.
  4. Open a row and look at the language shown in the status bar of the viewer.
  5. Compare the type word and icon with Expected.

## S26.05 Open artifact.

- **Expected:** User can open an artifact from the chat or from an artifact list into a view that shows its content.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2645; apps/extension-vscode/src/features/artifacts/artifactActions.ts:104
- **Where to find it:** Chat panel > More > Artifacts, then click a row. The palette command is Code: Open Artifact (labels found in the code)
- **Needs:** a signed-in account with an artifact
- **Steps:**
  1. Sign in and make sure the account has an artifact.
  2. Click More in the chat panel, then click Artifacts.
  3. Click an artifact row.
  4. Look for a read-only text tab that shows the artifact content.

## S26.06 Close artifact without deleting it.

- **Expected:** Closing the artifact viewer hides it without deleting the artifact, which stays available to reopen.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/artifacts/artifactActions.ts:135; apps/extension-vscode/src/features/artifacts/artifactActions.ts:99 (quoted code not found in the file now)
- **Where to find it:** Artifacts > click a row > close the viewer tab with its close button or Cmd+W (labels found in the code)
- **Needs:** a signed-in account with an artifact
- **Steps:**
  1. Open an artifact from More > Artifacts.
  2. Close its editor tab with the tab close button or Cmd+W.
  3. Click More, then Artifacts again.
  4. Look for the same row still in the list.
  5. Click the row and check that the content opens again.

## S26.07 Reopen artifact.

- **Expected:** After closing, the user can reopen the same artifact later (from the chat, a toggle, or a list), including after a reload.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2638; apps/extension-vscode/src/core/commandSetup.ts:2645
- **Where to find it:** Chat panel > More > Artifacts, then click the same row again (labels found in the code)
- **Needs:** a signed-in account with an artifact; the reload step needs VS Code's Developer: Reload Window command
- **Steps:**
  1. Open an artifact, then close its tab.
  2. Click More, then Artifacts, and click the same row.
  3. Run Developer: Reload Window from the Command Palette, then repeat the Artifacts step.
  4. Compare the reopened content with the first view.

## S26.12 Multiple-artifact switching.

- **Expected:** When a conversation has several artifacts, the user can switch between them without leaving the viewer.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/index.ts:284; apps/extension-vscode/src/features/artifacts/artifactsTree.ts:49
- **Where to find it:** Chat panel > More > Artifacts, then click a different row (labels found in the code)
- **Needs:** a signed-in account with a conversation that has several artifacts
- **Steps:**
  1. Use a conversation with at least two artifacts.
  2. Click More, then Artifacts, and click the first artifact.
  3. Click More, then Artifacts again, and click the second artifact.
  4. Compare the second content with the first and check that both can be opened.

## S26.16 Read-only mode.

- **Expected:** An artifact can be viewed in a read-only state where its content cannot be changed (e.g. a viewer, an older version, or a shared copy).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/artifacts/artifactActions.ts:70; apps/extension-vscode/src/features/artifacts/artifactPresentation.ts:138
- **Where to find it:** Chat panel > More > Artifacts, then hover a row (labels found in the code)
- **Needs:** a signed-in account with an artifact
- **Steps:**
  1. Sign in and open More, then Artifacts.
  2. Hover a row and read its tooltip.
  3. Click the row to open the artifact.
  4. Try to type into the viewer tab.
  5. Compare the tooltip and the viewer with Expected.

## S26.30 Copy content.

- **Expected:** A copy control puts the artifact's own content on the clipboard and confirms it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/artifacts/artifactActions.ts:138
- **Where to find it:** Chat panel > More > Artifacts, then hover a row and click the Copy the content icon (labels found in the code)
- **Needs:** a signed-in account with an artifact
- **Steps:**
  1. Open More, then Artifacts.
  2. Hover the row of an artifact and click its copy icon, tooltip Copy the content.
  3. Paste into any editor.
  4. Compare the pasted text with the artifact content, and check for a confirmation message that says copied with the title.

## S26.32 Public/private state.

- **Expected:** Wherever an artifact is shown, the user can see whether it is private, published to anyone, or shared with the workspace.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/artifacts/artifactPresentation.ts:118 (quoted code not found in the file now)
- **Where to find it:** Chat panel > More > Artifacts, then read the row description (labels found in the code)
- **Needs:** a signed-in account with at least one published artifact and one unpublished artifact
- **Steps:**
  1. Sign in with an account that has a published artifact and one that is not published.
  2. Click More, then Artifacts.
  3. Read the end of each row description for the visibility words.
  4. Hover a published row and read the tooltip explanation.
  5. Compare the labels with Expected.

## S26.39 Live updates from ongoing work.

- **Expected:** While a reply or run is still producing an artifact, the artifact view updates live as content arrives.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/treeQuickPick.ts:178
- **Where to find it:** not found in the code. The viewer loads the content once when opened and does not change as a reply streams; the list refreshes every 60 seconds while the picker is open (ARTIFACTS_REFRESH_INTERVAL_MS in apps/extension-vscode/src/features/artifacts/artifactsTree.ts), and treeQuickPick.ts:178 only turns that timer on. Searched apps/extension-vscode/src for artifact in the chat webview and chatSetup.ts: no live content path found.
- **Needs:** a reply that is still producing an artifact
