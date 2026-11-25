---
id: "PLAN-vscode-065"
type: "test-plan"
title: "VS Code · 65. Computer-use experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "65"
---
# VS Code · 65. Computer-use experience

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S65.12 Local-folder permission.

- **Expected:** The user grants the agent specific local folders and can revoke them.
- **Code:** done. Evidence present: apps/extension-vscode/src/extension.ts:353; apps/extension-vscode/src/integrations/localRuntimePool.ts:79; apps/cli/src/path_security.rs:648
- **Where to find it:** Command Palette (Cmd+Shift+P) > "Code: Permissions" (or type "/permissions" in the chat box) > "Trusted folders" section > trash icon on a folder > "Stop Trusting" (labels found in the code)
- **Needs:** A paid or Free account that can sign in, a folder that is trusted in VS Code, and an AGI CLI that offers trusted folders (the "Trusted folders" section only appears when the CLI reports it)
- **Steps:**
  1. Open the AGI chat panel in VS Code, then press Cmd+Shift+P and type "Code: Permissions". Press Enter. (Or type /permissions in the chat box.)
  2. Look for the separator "Trusted folders" in the list. Each trusted folder shows its path, with the description "The agent may read, edit and run commands here".
  3. Hover a folder row and click its trash icon (tooltip "Stop trusting").
  4. In the dialog, click "Stop Trusting". Then reopen Code: Permissions and check that the folder is gone from "Trusted folders". Also check that the folder now reads "No folders are trusted yet" if it was the only one.
  5. To grant a folder, open it in VS Code and accept VS Code's own Workspace Trust prompt (not AGI's). Then check that "Trusted folders" lists it under Code: Permissions.
