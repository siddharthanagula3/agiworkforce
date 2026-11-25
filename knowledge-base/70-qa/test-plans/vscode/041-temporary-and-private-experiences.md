---
id: "PLAN-vscode-041"
type: "test-plan"
title: "VS Code · 41. Temporary and private experiences"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "41"
---
# VS Code · 41. Temporary and private experiences

4 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S41.14 Local-only conversation.

- **Expected:** The user can keep conversations only on their device, never uploaded to the account.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1627; apps/extension-vscode/src/features/trees/conversationTreeProvider.ts:105 (quoted code not found in the file now)
- **Where to find it:** Code: Open Settings > Runtime > Where your data goes > Session history (labels found in the code)
- **Steps:**
  1. Open the Command Palette and run "Code: Open Settings".
  2. Click "Runtime" in the Settings navigation on the left.
  3. Scroll to the card "Where your data goes".
  4. Read the "Session history" row and compare it with Expected: it should say developer sessions are saved on this computer and are not uploaded to the account.

## S41.18 Separate history, training, and retention controls.

- **Expected:** History, model training and data retention each have their own clearly separate control or statement.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1604; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1612
- **Where to find it:** Code: Open Settings > Runtime > Where your data goes (Session history, Memory, AGI Cloud rows; buttons Privacy settings and Memory) (labels found in the code)
- **Needs:** none to read the panel; a web browser for the "Privacy settings" button, which opens a Web page
- **Steps:**
  1. Open the Command Palette and run "Code: Open Settings".
  2. Click "Runtime" in the Settings navigation, then scroll to "Where your data goes".
  3. Look at the separate rows: "Session history" and "Memory" each have their own row, and the "AGI Cloud" row states the model-training position.
  4. Click the "Privacy settings" button and the "Memory" button in that card; compare with Expected: history, training and retention each need a clear control or statement.

## S41.19 Privacy-setting education.

- **Expected:** The product explains, in context, what each privacy setting does.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1596
- **Where to find it:** Code: Open Settings > Runtime > Where your data goes (labels found in the code)
- **Steps:**
  1. Open the Command Palette and run "Code: Open Settings".
  2. Click "Runtime" in the Settings navigation, then scroll to "Where your data goes".
  3. Read the intro line and each row: "Local models", "Your own provider key", "AGI Cloud", "Session history", "Memory".
  4. Compare with Expected: each row should say, in place, what that setting or path does to the data.

## S41.20 Per-feature processing-location disclosure.

- **Expected:** For each feature the product says where the data is processed (on device, AGI cloud, a named provider).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1596; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1604
- **Where to find it:** Code: Open Settings > Runtime > Where your data goes (labels found in the code)
- **Steps:**
  1. Open the Command Palette and run "Code: Open Settings".
  2. Click "Runtime" in the Settings navigation, then scroll to "Where your data goes".
  3. Read each row for where it is processed: "Local models" (this computer), "Your own provider key" (that provider), "AGI Cloud" (AGI servers, then the provider serving the chosen model).
  4. Compare with Expected: each feature should say on device, AGI cloud or a named provider; the AGI Cloud row names no provider, only "the provider that serves the model you picked".
