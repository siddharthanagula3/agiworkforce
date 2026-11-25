---
id: "PLAN-vscode-025"
type: "test-plan"
title: "VS Code · 25. File previews and readers"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "25"
---
# VS Code · 25. File previews and readers

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S25.04 Source-code reader.

- **Expected:** Source-code files open with syntax-aware display.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/artifacts/artifactActions.ts:135; apps/extension-vscode/src/features/artifacts/artifactActions.ts:207; apps/extension-vscode/src/features/artifacts/artifactActions.ts:57
- **Where to find it:** Command palette (Cmd+Shift+P) > Code: Show Artifacts > pick a code artifact (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with at least one code artifact
- **Steps:**
  1. Sign in to AGI Cloud if asked. Artifacts belong to that account.
  2. Press Cmd+Shift+P, type "Code: Show Artifacts" and press Enter.
  3. Pick an artifact that holds source code (its row shows a code type) and press Enter.
  4. Look at the opened tab: it should show as a read-only text tab with syntax colouring for the code language, the same as Expected.

## S25.20 Select text for a question.

- **Expected:** Users can select text in a file and ask a question about it.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1145; apps/extension-vscode/src/core/commandSetup.ts:291
- **Where to find it:** Open a file > select some text > right-click the selection > Code: Send Selection to a New Chat (labels found in the code)
- **Needs:** a file open in the editor; a signed-in account to send the chat (not confirmed in the code)
- **Steps:**
  1. Open any source file in the editor.
  2. Select a few lines of text with the mouse.
  3. Right-click the selection and choose "Code: Send Selection to a New Chat" (or press Cmd+Shift+Alt+E for "Code: Explain Selection").
  4. Look at the chat composer: it should show a reference to the file and the selected range, with an empty place to type your question. Type a question and send it to compare with Expected.

## S25.21 Ask about selected page or range.

- **Expected:** Users can ask about a selected page or range of a file.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1145; apps/extension-vscode/src/core/commandSetup.ts:291
- **Where to find it:** Open a file > select a range of lines > right-click the selection > Code: Send Selection to a New Chat (labels found in the code)
- **Needs:** a file open in the editor with several lines; a signed-in account to send the chat (not confirmed in the code)
- **Steps:**
  1. Open a long file in the editor.
  2. Select a range of lines, for example from line 10 to line 20.
  3. Right-click the selection and choose "Code: Send Selection to a New Chat".
  4. Look at the chat composer: the file reference should carry the selected start and end lines. Type a question about that range and compare with Expected.

## S25.28 Copy selected content.

- **Expected:** Users can copy selected content from a preview.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/artifacts/artifactActions.ts:135; apps/extension-vscode/src/features/artifacts/artifactActions.ts:57
- **Where to find it:** Command palette > Code: Show Artifacts > click the copy icon on an artifact row (tooltip Copy the content) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with at least one artifact
- **Steps:**
  1. Sign in to AGI Cloud if asked.
  2. Press Cmd+Shift+P, type "Code: Show Artifacts" and press Enter.
  3. Click the copy icon on an artifact row. Its tooltip reads "Copy the content".
  4. Paste somewhere (Cmd+V). The whole artifact text should appear, and a notice should say it was copied; compare with Expected.

## S25.29 Open in native application.

- **Expected:** Users can open a file in its native application.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/artifacts/artifactActions.ts:207; apps/extension-vscode/src/features/artifacts/artifactActions.ts:57
- **Where to find it:** not found in the code. No command opens an artifact or file in its native application. I searched apps/extension-vscode/src for revealFileInOS, openPath, openWith, "Open With", "Reveal in", "native app" and "Open in". The nearest match is "Code: Open Published Artifact" (openPublishedArtifact), which opens the share web page in the browser, not a native app.
- **Needs:** a signed-in AGI Cloud account with at least one artifact
