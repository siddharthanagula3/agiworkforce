---
id: "PLAN-vscode-085"
type: "test-plan"
title: "VS Code · 85. Personalization and data settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "85"
---
# VS Code · 85. Personalization and data settings

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S85.01 Profile details.

- **Expected:** The user can view and edit their account profile (name, photo, email) on the surface, and the change is saved to the account.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2384
- **Where to find it:** Command Palette > Code: Account & Usage > AGI Cloud connected row > Edit your profile on Web (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Sign in to AGI Cloud in the editor, then open the Command Palette and run "Code: Account & Usage".
  2. Find the row "AGI Cloud connected" in the list that opens.
  3. Click "Edit your profile on Web".
  4. Your browser opens the account profile page on the AGI web app. Check that name, photo and email can be edited there and saved, and compare with Expected.

## S85.02 Custom instructions.

- **Expected:** The user can write custom instructions on the surface and they are applied to that surface's chats until changed or switched off.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1675; apps/extension-vscode/src/features/settings/SettingsPanel.ts:389; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2645 (quoted code not found in the file now)
- **Where to find it:** Command Palette > Code: Open Settings > Instructions & editor > Custom instructions (labels found in the code)
- **Steps:**
  1. Run "Code: Open Settings" from the Command Palette.
  2. Click "Instructions & editor" in the left list.
  3. In the "Custom instructions" card, type into the "Host default" box (or the workspace override box below it).
  4. Click "Save host instructions" (or "Save workspace override"). Then start or open a developer chat and check that the instruction applies, and that clearing the box or changing it stops or changes it, as Expected says.

## S85.05 Saved Memory.

- **Expected:** The user can see, add, edit and delete saved memories on the surface and turn memory on or off, and saved memories are used in that surface's chats.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:1863 (quoted code not found in the file now); apps/extension-vscode/src/memory/accountMemoryStore.ts:219; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2645 (quoted code not found in the file now)
- **Where to find it:** Command Palette > Code: Memory > List & remove facts (also Add a memory fact and Turn account memory on or off) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Sign in to AGI Cloud, then run "Code: Memory" from the Command Palette.
  2. Choose "Add a memory fact", type a fact, and confirm; then run "Code: Memory" again and choose "List & remove facts" to see it listed.
  3. In the Memory list in the sidebar, hover a fact and use the edit icon (tooltip "Edit this fact") to change it, then use the trash icon (tooltip "Delete this fact") to remove one.
  4. Run "Code: Memory" and choose "Turn account memory off" (it reads "Turn account memory on" when off), and check the placeholder line reads "Account memory off"/"on". Compare with Expected: memory on sends saved facts with chats, off stops them. The same switch is "Use saved memory facts" under Code: Open Settings > Instructions & editor > Memory.

## S85.14 Diagnostic-sharing choice.

- **Expected:** The user can choose whether crash reports and diagnostics are sent, and the choice is honoured.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1969
- **Where to find it:** not found in the code. No crash-report or diagnostic-sharing choice found: a search for "crash" in apps/extension-vscode/src found nothing. Nearest controls: the Telemetry card in Settings ("Share usage events", apps/extension-vscode/src/features/settings/settingsWebviewContent.ts), which covers usage events only, and the manual "Code: Export Diagnostics" command (apps/extension-vscode/package.json), which creates a redacted report and is not a sharing choice. The cited line 1969 is the usage-events toggle, not crash reports.

## S85.17 Archived-chat management.

- **Expected:** The user can list archived chats, restore them, and delete them.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/trees/conversationTreeProvider.ts:283; apps/extension-vscode/src/features/trees/sessionPickers.ts:202; apps/extension-vscode/src/features/trees/sessionPickers.ts:255
- **Where to find it:** Command Palette > Code: Archived Sessions (labels found in the code)
- **Needs:** a workspace with at least one archived chat
- **Steps:**
  1. Run "Code: Archived Sessions" from the Command Palette. A list titled "Archived sessions" opens; if there are none, the message "Code: there are no archived sessions in this workspace." appears.
  2. Select one or more sessions in the list, then click the "Restore" button (tooltip "Restore") or "Restore all listed sessions". Check that the session leaves the archived list and shows back in your sessions.
  3. Select a session and click "Delete permanently" (the delete button), then confirm in the dialog. Check that the session is removed from the list and the message "Code: ... was deleted." appears.
  4. Compare with Expected: list, restore and delete all work.
