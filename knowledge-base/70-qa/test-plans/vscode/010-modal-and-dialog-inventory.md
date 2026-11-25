---
id: "PLAN-vscode-010"
type: "test-plan"
title: "VS Code · 10. Modal and dialog inventory"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "10"
---
# VS Code · 10. Modal and dialog inventory

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S10.01 Create Project.

- **Expected:** A create-project dialog (or command) asks for a name and creates the project in the account.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2606; apps/extension-vscode/src/features/projects/projectActions.ts:460
- **Where to find it:** Command palette (Cmd+Shift+P) > "Code: New Project" (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: New Project" and press Enter.
  2. In the box titled "Code, New Project", type a name and confirm.
  3. Watch for the progress notice "creating project…".
  4. Check for the message that the project is on your account, on every client, and that the new project appears in the projects list.

## S10.04 Duplicate resource.

- **Expected:** A duplicate action creates an independent copy of a conversation or project and says where the copy is.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1452; apps/extension-vscode/src/core/commandSetup.ts:1462
- **Where to find it:** Command palette (Cmd+Shift+P) > "Code: Fork Conversation" (labels found in the code)
- **Needs:** an existing developer session to copy
- **Steps:**
  1. Press Cmd+Shift+P and type "Code: Fork Conversation".
  2. Pick a session from the list, or run it on an open chat.
  3. In the box "Name for the forked session", keep the suggested name or change it, then confirm.
  4. Check that the new copy opens as its own session, and compare with the Expected line.

## S10.05 Archive confirmation.

- **Expected:** Archiving asks to confirm, or confirms afterwards with a way to undo, and says where archived items can be found.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1406; apps/extension-vscode/src/core/commandSetup.ts:1412
- **Where to find it:** Command palette (Cmd+Shift+P) > "Code: Archive Conversation" (labels found in the code)
- **Needs:** an existing developer session
- **Steps:**
  1. Press Cmd+Shift+P and type "Code: Archive Conversation".
  2. Pick a developer session.
  3. In the dialog that names the session, check it says Archive developer session with the session title, then click Archive or Cancel.
  4. Run "Code: Archived Sessions" from the palette and check the session is listed there, with a Restore button.

## S10.06 Delete confirmation.

- **Expected:** Deleting asks for confirmation that names the item before anything is removed.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1431; apps/extension-vscode/src/core/commandSetup.ts:1441
- **Where to find it:** Command palette (Cmd+Shift+P) > "Code: Archive Conversation" (labels found in the code)
- **Needs:** an existing developer session
- **Steps:**
  1. Press Cmd+Shift+P and type "Code: Archive Conversation".
  2. Pick a developer session.
  3. Check the dialog names the session in quotes before anything changes.
  4. Click Cancel and check the session is still in the list.

## S10.07 Permanent-delete confirmation.

- **Expected:** An irreversible delete says plainly that it cannot be undone and needs an explicit second confirmation.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1435; apps/extension-vscode/src/core/commandSetup.ts:1441
- **Where to find it:** Command palette (Cmd+Shift+P) > "Code: Permanently Delete Conversation" (labels found in the code)
- **Needs:** an existing developer session you can afford to lose in a test
- **Steps:**
  1. Press Cmd+Shift+P and type "Code: Permanently Delete Conversation".
  2. Pick a developer session.
  3. Read the dialog: it names the session, says the transcript and file changes are removed, and says this cannot be undone.
  4. Check that nothing is removed until you click "Delete Permanently"; Cancel should leave it in place.

## S10.17 Upload from device.

- **Expected:** Choosing upload opens the device file chooser and the picked files attach to the message.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3200; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2171; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6601
- **Where to find it:** Chat: the + button in the message box > "Attach workspace files" (labels found in the code)
- **Needs:** a file to upload and a trusted workspace (the picker does nothing in an untrusted one)
- **Steps:**
  1. Open the AGI chat in the sidebar and click the + button beside the message box.
  2. Click "Attach workspace files" in the menu.
  3. In the file chooser titled "Attach Workspace Files to Chat", pick one or more files and click Attach.
  4. Check that the picked files appear as attachments on the message before you send.

## S10.26 Model incompatibility warning.

- **Expected:** Switching to a model that cannot handle the conversation (images, tools, context) warns and asks before switching.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/model-picker/modelConstants.ts:347; apps/extension-vscode/src/core/commandSetup.ts:1359
- **Where to find it:** Command palette (Cmd+Shift+P) > "Code: Select Model" (labels found in the code)
- **Needs:** a conversation that uses tools or images, and a model without those capabilities in the list
- **Steps:**
  1. Press Cmd+Shift+P and type "Code: Select Model", then Enter.
  2. In a chat that uses a model with tools or images, pick a model that cannot do those things.
  3. Check the dialog "Switch to <model>?" with the detail "Unlike <model>, it cannot use tools..." appears before the switch.
  4. Click Cancel and check the model is unchanged; or click "Switch anyway" and check the new model is used.

## S10.27 Context-limit warning.

- **Expected:** As a conversation nears or passes the model's context limit, the user gets a clear warning with what to do (trim, compact, new chat).
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3564 (quoted code not found in the file now)
- **Where to find it:** Chat: the context counter ("x / y") near the message box; an inline notice appears above the message box at the warning level (labels found in the code)
- **Needs:** a long conversation that reaches the warning threshold
- **Steps:**
  1. Open a long chat in the AGI sidebar, or send many long messages until the context counter nears the model's window.
  2. Watch the context counter turn to the warning colour.
  3. Read the notice above the message box: "This chat has used N% of the model's context... start a new chat to keep full context."
  4. Compare with Expected: the notice names a new chat but does not mention trimming, and the summarize command is "Code: Summarize Session to Free Context" in the palette.

## S10.28 Usage-limit notice.

- **Expected:** When a usage limit is reached, the user sees which limit, when it resets, and what they can do.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4166; apps/extension-vscode/src/core/cloudUtilityErrorActions.ts:270; apps/extension-vscode/src/utils/api.ts:1544
- **Where to find it:** Chat: the usage banner or the error message in the chat when a usage limit is hit ("Managed Cloud quota exhausted" or "You have reached a usage limit on your account.") (labels found in the code)
- **Needs:** an account that has hit a usage limit (hard to reach in a test; a Free or near-limit account)
- **Steps:**
  1. Use an account that has reached its usage limit (or wait until a limit is hit during a chat).
  2. Send a message and read the error or the usage banner at the top of the chat.
  3. Check that it names the limit, says when it resets ("It resets <time>" or "Check your usage"), and offers an action such as Upgrade.
  4. Compare with Expected: the banner shows "· <reset>" when the reset time is known.

## S10.37 Folder-access permission.

- **Expected:** Before the assistant reads or writes a local folder, the user is asked to grant access to that folder.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7033; apps/extension-vscode/src/features/permissions/approvalScope.ts:21
- **Where to find it:** Sidebar AGI chat in an untrusted workspace > "Manage trust" (labels found in the code)
- **Needs:** an untrusted folder (a folder not yet trusted in VS Code)
- **Steps:**
  1. Open a folder that VS Code has not trusted (untrusted workspace).
  2. Open the AGI chat in the sidebar.
  3. Read the line "Trust this workspace before AGI can use project files or tools." and the button "Manage trust".
  4. Click "Manage trust" and check that VS Code asks you to trust the folder before the assistant can read or write it.

## S10.38 Tool-action approval.

- **Expected:** When a tool action needs approval, a prompt shows the action and the user approves or denies that one call.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7033; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3398
- **Where to find it:** Chat: send a request that makes the agent run a shell command or edit a file; an approval card appears in the chat (labels found in the code)
- **Needs:** a trusted workspace and a model that can use tools
- **Steps:**
  1. In a trusted workspace, ask the chat to run a shell command or edit a file (for example, "create a file named test.txt").
  2. Read the approval card that shows the action.
  3. Click "Approve once" or "Deny" for that call only; compare with Expected.
  4. Optionally click "Approve for session" on a second request and check that the next call of the same tool runs without asking.

## S10.40 Remote-device pairing.

- **Expected:** A pairing dialog links a phone or another device to this machine by code or QR, bound to the signed-in account.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/remote-control/index.ts:156; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:173 (quoted code not found in the file now)
- **Where to find it:** Command palette (Cmd+Shift+P) > "Code: Remote Control" (labels found in the code)
- **Needs:** a phone with the Mobile app signed in to the same account, and a signed-in desktop account
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Remote Control", then Enter.
  2. Read the panel titled "Remote Control" with its QR code and the words "Pair with Desktop".
  3. On the phone, open the Mobile app, choose "Pair with Desktop", and scan the code.
  4. Check that the phone appears as paired on this computer and that the code expires; "Cancel pairing" stops the pairing.

## S10.45 Feedback submission.

- **Expected:** A feedback dialog, reachable product-wide, sends the user's message to the team's feedback store.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/feedback/submitFeedback.ts:30
- **Where to find it:** Command palette (Cmd+Shift+P) > "Code: Send Feedback" (labels found in the code)
- **Needs:** a signed-in account (feedback is refused when signed out)
- **Steps:**
  1. Press Cmd+Shift+P and type "Code: Send Feedback", then Enter.
  2. Pick "Report a Bug", "Feature Request" or "General Feedback".
  3. Type a message in the box "Describe your feedback" (placeholder "Your feedback here…") and press Enter.
  4. Check the confirmation that the feedback was sent.

## S10.46 Diagnostic-sharing consent.

- **Expected:** Before diagnostics or crash reports leave the device, the user is told what is included and chooses (or sets a preference that is honoured).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1969
- **Where to find it:** Command palette (Cmd+Shift+P) > "Code: Export Diagnostics" (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in to the AGI account in VS Code.
  2. Press Cmd+Shift+P, type "Code: Export Diagnostics", then Enter.
  3. Watch for a save dialog; the file is written only after you choose a location.
  4. Compare with Expected: no text before the send says what is included; the only other choice in Settings is the "Share usage events" toggle.
