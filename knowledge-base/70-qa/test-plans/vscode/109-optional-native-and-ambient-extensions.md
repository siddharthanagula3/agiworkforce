---
id: "PLAN-vscode-109"
type: "test-plan"
title: "VS Code · 109. Optional native and ambient extensions"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "109"
---
# VS Code · 109. Optional native and ambient extensions

2 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S109.04 Desktop companion.

- **Expected:** A desktop companion pairs with the user's phone so desktop work can be started, watched or approved from the phone.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/remote-control/remoteControlService.ts:236; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:418
- **Where to find it:** Command Palette (Cmd+Shift+P) > Code: Remote Control. The same command is also typed in the chat as /remote-control. The panel shows the Pair a phone link. (labels found in the code)
- **Needs:** a trusted folder open in VS Code, an AGI account signed in, and a phone with the AGI Mobile app signed in to the same account
- **Steps:**
  1. Open a folder in VS Code and trust it (a trusted workspace is required), then sign in to your AGI account.
  2. Press Cmd+Shift+P, type Code: Remote Control, and press Enter.
  3. In the panel that opens, read the text that starts 'Open the Mobile app on your phone, choose Pair with Desktop, and scan this code' and check that a pairing code appears.
  4. Click Pair a phone if no code is shown, then (with the phone) scan the code, confirm the phone in the dialog, and check that the status bar item shows 'Remote Control: waiting for your phone', then 'Remote Control: {phone}' once connected.

## S109.22 Local runtime health.

- **Expected:** The app shows whether the local model runtime is running and healthy, with errors when it is not.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2060; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:7017
- **Where to find it:** Chat panel > model button (shows Auto) > On this device group. Ollama and LM Studio status rows appear in that group. (labels found in the code)
- **Needs:** Ollama or LM Studio installed on this computer (to see the running state); with neither installed, the not-running row still appears
- **Steps:**
  1. Make sure Ollama is not running (quit it), then open the AGI chat panel.
  2. Click the model button that shows Auto, and look at the group named On this device.
  3. Check for a row that reads 'Ollama is not running. Start it to use its models.' (the same shape shows 'LM Studio is not running' for LM Studio), and check that the reason text appears if the server does not respond ('Ollama is not responding: ...').
  4. Start Ollama, reopen the model menu, and check that the row now reads 'Ollama is running · N models' (or 'Ollama is running with no models loaded') to compare with Expected.
