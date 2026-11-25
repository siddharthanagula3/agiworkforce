---
id: "PLAN-vscode-084"
type: "test-plan"
title: "VS Code · 84. General and appearance settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "84"
---
# VS Code · 84. General and appearance settings

4 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S84.10 Default model.

- **Expected:** The user can set a default model that new conversations start with.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:1219; apps/extension-vscode/src/core/commandSetup.ts:1302
- **Where to find it:** Settings (gear icon, title "Settings", at the top of the AGI Code panel) > General > Model preference > Choose. Also the command "Code: Select Model". (labels found in the code)
- **Steps:**
  1. Click the gear icon titled Settings at the top of the AGI Code panel.
  2. Click General in the left list.
  3. Under Model and reasoning, find Model preference and click Choose.
  4. Pick a model from the list and confirm it.
  5. Close Settings, open a new chat, and check that the model shown is the one you picked.
  6. Compare with Expected: a new conversation should start with the chosen model.

## S84.11 Default effort.

- **Expected:** The user can set a default reasoning effort used for new turns.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:1428; apps/extension-vscode/src/features/settings/SettingsPanel.ts:363
- **Where to find it:** Settings (gear icon, title "Settings") > General > Reasoning effort. Also the slash command /effort in the composer. (labels found in the code)
- **Steps:**
  1. Click the gear icon titled Settings at the top of the AGI Code panel.
  2. Click General in the left list.
  3. Under Model and reasoning, find Reasoning effort and open its dropdown.
  4. Pick a different level, for example High.
  5. Close Settings, then reopen it and check that Reasoning effort still shows High.
  6. Compare with Expected: the chosen level should be used for new turns.

## S84.12 Default mode.

- **Expected:** The user can choose the default mode new conversations start in (e.g. chat vs agent/work, ask vs auto).
- **Code:** done. Evidence present: apps/extension-vscode/package.json:1404; apps/extension-vscode/src/features/settings/SettingsPanel.ts:363
- **Where to find it:** Settings (gear icon, title "Settings") > General > Agent mode. (labels found in the code)
- **Steps:**
  1. Click the gear icon titled Settings at the top of the AGI Code panel.
  2. Click General in the left list.
  3. Under Model and reasoning, find Agent mode and open its dropdown.
  4. Pick Plan from the list.
  5. Close Settings, then reopen it and check that Agent mode still shows Plan.
  6. Compare with Expected: the mode chosen should be the one new conversations start in.

## S84.15 Keyboard shortcuts.

- **Expected:** Settings let the user view and customise (disable or rebind) keyboard shortcuts.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:1488; apps/extension-vscode/src/core/commandSetup.ts:1302
- **Where to find it:** More (ellipsis icon, title "More", at the top of the AGI Code panel) > Help > Keyboard shortcuts. The item opens VS Code's own Keyboard Shortcuts editor filtered to AGI Code. (labels found in the code)
- **Steps:**
  1. Click the More icon (ellipsis) at the top of the AGI Code panel.
  2. Click Help.
  3. Click Keyboard shortcuts. VS Code's Keyboard Shortcuts tab opens filtered to AGI Code.
  4. Pick an AGI command row and use the pencil icon or the right-click menu to change its key, or remove its key to disable it.
  5. Compare with Expected: you should be able to view, rebind and disable AGI shortcuts.
