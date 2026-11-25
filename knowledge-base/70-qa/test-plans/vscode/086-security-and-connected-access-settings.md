---
id: "PLAN-vscode-086"
type: "test-plan"
title: "VS Code · 86. Security and connected-access settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "86"
---
# VS Code · 86. Security and connected-access settings

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S86.08 Remote paired devices.

- **Expected:** The user can see devices paired for remote use (phone to desktop, browser to desktop) and unpair them.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/remote-control/index.ts:41; apps/extension-vscode/src/features/remote-control/index.ts:65
- **Where to find it:** Command palette > Code: Remote Control (or type /remote-control in the chat box). The Remote Control panel shows Pair a phone, or Connected to {phone} with Disconnect phone. (labels found in the code)
- **Needs:** a paired phone (Mobile app) and a signed-in account; a second paired device is not shown in this panel
- **Steps:**
  1. Press Cmd+Shift+P and run Code: Remote Control. The panel titled Remote Control opens.
  2. If a phone is paired, look for the line Connected to {phone} and the button Disconnect phone. If none is paired, you see Pair a phone and a QR code.
  3. Click Disconnect phone. A dialog asks Disconnect {phone}? with the button Disconnect phone; confirm it.
  4. Check that the panel no longer shows Connected to {phone} and returns to the pairing state, to compare with Expected.

## S86.09 Sign out current device.

- **Expected:** The user can sign out of the current device or app.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1243; apps/extension-vscode/src/core/commandSetup.ts:1244
- **Where to find it:** More actions (icon in the sidebar header) > Sign out, in the account row at the bottom of the menu. Also Command palette > Code: Sign Out of AGI Cloud. (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Sign in to AGI Cloud from the sidebar so the account row shows your account.
  2. Click the More actions button in the sidebar header.
  3. Click Sign out in the menu, below the account name.
  4. Look at the menu again: the account name should read Not signed in and the item should now read Sign in, to compare with Expected.

## S86.23 Saved approvals.

- **Expected:** The user can review the approvals they chose to remember (always-allow/deny) and remove any of them.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7220; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6750; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2244 (quoted code not found in the file now); apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:725 (quoted code not found in the file now); apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1371
- **Where to find it:** Command palette > Code: Permissions (or type /permissions in the chat box). The picker opens with the title Saved approvals. (labels found in the code)
- **Needs:** a saved approval (made by choosing Always allow on an approval prompt) and a signed-in CLI
- **Steps:**
  1. Press Cmd+Shift+P and run Code: Permissions, or type /permissions in the chat box.
  2. Look for the picker titled Saved approvals with rows marked Always allowed or Always denied. If none are saved, the picker says No approvals are saved yet.
  3. To have one to remove, first choose Always allow on an approval prompt in chat, then reopen Code: Permissions.
  4. Click the remove action on a row and confirm Remove this saved approval?, then check the row is gone, to compare with Expected.

## S86.24 Default permission mode.

- **Expected:** The user can set the default approval posture for agent actions (ask every time, auto-approve safe, autonomous) and it is enforced.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/settings/settingsProtocol.ts:134; apps/extension-vscode/src/features/permissions/agentModeConsent.ts:64
- **Where to find it:** Command palette > Code: Choose Agent Mode, or Code: Open Settings > Agent mode. Mode names are Ask, Auto, Plan and Bypass permissions. (labels found in the code)
- **Needs:** a workspace folder open and trusted; Bypass permissions needs the separate risk confirmation
- **Steps:**
  1. Press Cmd+Shift+P and run Code: Choose Agent Mode.
  2. Pick Ask, then send a chat request that edits a file or runs a command.
  3. Check the agent asks for approval before it acts.
  4. Repeat with Auto (ordinary workspace edits run without prompting) and then Bypass permissions, which first asks for a risk confirmation; compare with Expected.

## S86.26 Advanced/hardened account-security mode.

- **Expected:** The user can turn on a hardened mode that tightens account and agent security beyond defaults.
- **Code:** done. Evidence present: apps/web/lib/api-auth.ts:349; apps/web/lib/api-auth.ts:394; apps/web/lib/server/account-security/gate.ts:220; apps/web/lib/server/account-security/service.ts:401; apps/web/lib/server/account-security/service.ts:404
- **Where to find it:** Web app (not inside VS Code): Settings > Security > Turn on Advanced Account Security (panel titled Advanced Account Security). (labels found in the code)
- **Needs:** a web account with at least two passkeys or security keys and access to the email on the account
- **Steps:**
  1. In the web app, sign in and open Settings, then the Security section.
  2. Find the Advanced Account Security panel.
  3. Click Turn on Advanced Account Security and follow its steps (passkeys or security keys, a code emailed to you, and recovery keys).
  4. Once on, sign in again and check that a password or email code alone no longer gets you in, to compare with Expected.
