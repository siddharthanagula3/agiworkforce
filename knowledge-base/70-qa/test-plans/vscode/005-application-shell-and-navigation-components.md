---
id: "PLAN-vscode-005"
type: "test-plan"
title: "VS Code · 5. Application shell and navigation components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "5"
---
# VS Code · 5. Application shell and navigation components

16 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S5.01 Application header.

- **Expected:** A persistent top header shows where the user is (brand/conversation title) and the primary actions for the current view.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2910; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6571
- **Where to find it:** Sidebar header at the top of the AGI Code panel: "Chat" title, then the Sessions, Settings, New chat and More buttons (labels found in the code)
- **Steps:**
  1. Open the AGI Code icon in the VS Code activity bar and sign in if asked.
  2. Look at the top bar of the panel: the "Chat" title is on the left.
  3. Look at the buttons on the right: Sessions (clock icon), Settings (gear), New chat (+) and More (...).
  4. Hover each button to see its tooltip, then compare with Expected: the header shows where you are and the main actions for this view.

## S5.07 Sidebar search input.

- **Expected:** The navigation sidebar has a search entry that filters or searches conversations.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3044; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6206
- **Where to find it:** Sessions (clock icon in the header) > Search sessions (labels found in the code)
- **Needs:** a few saved sessions in this workspace
- **Steps:**
  1. Click the Sessions button (clock icon) in the top-right of the panel.
  2. Click the "Search sessions" box at the top of the Sessions list.
  3. Type part of a conversation title you can see in the list.
  4. Compare with Expected: only matching sessions stay in the list.

## S5.08 New-chat action.

- **Expected:** A persistent New chat action starts a fresh conversation from anywhere in the shell.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2934; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6571
- **Where to find it:** Header "+" button, title "New chat" (labels found in the code)
- **Steps:**
  1. Send a message in a chat so the conversation has content.
  2. Click the New chat (+) button in the top-right of the panel.
  3. Compare with Expected: the transcript clears and the composer is empty for a fresh conversation.
  4. Optional: press cmd+shift+alt+n (Mac) and check the same result.

## S5.10 Recent-item section.

- **Expected:** Navigation shows a list of recent conversations that open on selection.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2928; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6344
- **Where to find it:** Start screen of an empty chat > "Recent chats" section (labels found in the code)
- **Needs:** at least one saved conversation
- **Steps:**
  1. Make sure you have at least one saved conversation.
  2. Open a new chat with no messages so the start screen shows.
  3. Look for the "Recent chats" heading and its list of rows with titles and ages.
  4. Click a row and compare with Expected: that conversation opens.

## S5.13 Conversation row.

- **Expected:** Each conversation row shows its title, indicates the active one, and opens the conversation.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6296; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6344
- **Where to find it:** Sessions (clock icon in the header) > any session row (labels found in the code)
- **Needs:** at least two saved sessions
- **Steps:**
  1. Click the Sessions button (clock icon) in the header.
  2. Look at a row: it shows the title and an age on the right.
  3. Click the row and compare with Expected: the conversation opens.
  4. Look at the list for a marker showing which conversation is the active one.

## S5.14 Project row.

- **Expected:** Navigation shows project rows that open the project (and expose its actions).
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2593; apps/extension-vscode/src/features/projects/projectsTree.ts:40
- **Where to find it:** More (...) > Projects, then pick a project row (labels found in the code)
- **Needs:** a project in the workspace
- **Steps:**
  1. Click the More (...) button in the header.
  2. Click "Projects" in the menu.
  3. A list titled "Code, Projects" opens; pick a project row.
  4. Compare with Expected: the project opens, and the row's rocket button ("Use this project in the chat") is available as a project action.

## S5.15 Task row.

- **Expected:** Background work/tasks appear as rows marked as tasks (distinct from chats) with their state, and open on selection.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2549; apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:59
- **Where to find it:** More (...) > Work, then the "Cloud tasks" section (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with at least one cloud task
- **Steps:**
  1. Click the More (...) button in the header.
  2. Click "Work" in the menu.
  3. A list titled "Code, Work" opens with the "Cloud tasks" section and the "Schedules" section.
  4. Look at a cloud task row: it shows its title and a description, and it opens when picked. Compare with Expected: tasks look different from chats.

## S5.17 Running-task indicator.

- **Expected:** Navigation marks items whose task or response is still running, visually and for screen readers.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2549; apps/extension-vscode/src/features/cloud-tasks/cloudRunPresentation.ts:26
- **Where to find it:** More (...) > Work, then the "Working" group under "Cloud tasks" (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with a running cloud task
- **Steps:**
  1. Start a cloud task that is still running.
  2. Click the More (...) button, then "Work".
  3. Look under the "Working" group for the task row; it shows a spinning icon and its state text.
  4. Compare with Expected: a running item is marked. For a chat message, the word "Running" appears on the message while it is sent.

## S5.18 Needs-input indicator.

- **Expected:** Navigation marks items that are blocked waiting for the user (approval or input).
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2549; apps/extension-vscode/src/features/cloud-tasks/cloudRunPresentation.ts:32; apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:60
- **Where to find it:** More (...) > Work, then the "Needs you" group (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with a cloud task that is waiting for approval or input
- **Steps:**
  1. Start a cloud task that will wait for approval or input.
  2. Click the More (...) button, then "Work".
  3. Look for the "Needs you" group and the task row in it.
  4. Click the row's "Approve this run" button if it is shown and compare with Expected: the item is clearly marked as waiting for you.

## S5.26 Global command palette.

- **Expected:** A global command palette (keyboard-invoked) searches and runs app commands and destinations.
- **Code:** done. Evidence moved: apps/extension-vscode/package.json:627 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2309 (quoted code not found in the file now)
- **Where to find it:** VS Code Command Palette, type "Code:" (for example "Code: Show Cloud Tasks") (labels found in the code)
- **Steps:**
  1. Press the Command Palette shortcut (VS Code default, cmd+shift+p on Mac; this extension does not set it).
  2. Type "Code:".
  3. Look at the list of AGI Code commands and pick one, for example "Code: Show Cloud Tasks".
  4. Compare with Expected: the command runs and the matching panel opens.

## S5.27 Keyboard-shortcut help.

- **Expected:** A keyboard-shortcut help view lists the available shortcuts and is reachable from the app.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:1488; apps/extension-vscode/src/core/commandSetup.ts:1302
- **Where to find it:** More (...) > Help > Keyboard shortcuts (labels found in the code)
- **Steps:**
  1. Click the More (...) button in the header.
  2. Click "Help" in the menu.
  3. Click "Keyboard shortcuts" in the list titled "Code, Help".
  4. Compare with Expected: VS Code opens its Keyboard Shortcuts tab filtered to this app. Check that shortcuts such as "Code: Open Chat" are listed.

## S5.29 User/profile menu.

- **Expected:** A user/profile menu shows who is signed in and offers account actions (settings, plan, sign out).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2989; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2992
- **Where to find it:** More (...) menu, top account block ("Not signed in" or the account name) with "Sign in" or "Sign out" and "Account & usage"; Settings is the gear in the header (labels found in the code)
- **Needs:** none (a signed-in account to see the name and plan)
- **Steps:**
  1. Click the More (...) button in the header.
  2. Read the account block at the top of the menu: the name and a plan line such as "<plan> plan" (or "AGI Cloud account").
  3. Click "Account & usage" and check the plan and usage shown.
  4. Click the More (...) button again and look at the last account action: "Sign out" when signed in, "Sign in" when not. Compare with Expected: settings, plan and sign out are all reachable.

## S5.30 Help menu.

- **Expected:** A help menu gathers help centre, support contact, feedback and shortcuts in one place.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/help/helpMenu.ts:13; apps/extension-vscode/src/features/surfaces/surfaceMenu.ts:55
- **Where to find it:** More (...) > Help, a list titled "Code, Help" (labels found in the code)
- **Needs:** none; a browser for the web pages
- **Steps:**
  1. Click the More (...) button in the header.
  2. Click "Help" in the menu.
  3. Look at the list: Documentation, Help center, Keyboard shortcuts, Service status, What's new, Send feedback, Export diagnostics, Contact support.
  4. Pick "Help center" or "Send feedback" and compare with Expected: the help centre, support, feedback and shortcuts are all in this one place.

## S5.31 Upgrade entry.

- **Expected:** A visible Upgrade entry in the shell takes an eligible user into the plan upgrade flow.
- **Code:** partial. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3150; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4229
- **Known to be unfinished:** Upgrade button opens web pricing, where checkout sits behind the beta_redemptions waitlist gate.
- **Where to find it:** Usage meter banner in the sidebar > "Upgrade" button (shown only in some usage states) (labels found in the code)
- **Needs:** an account whose usage meter shows the Upgrade button (I did not check which plan or state)
- **Steps:**
  1. Find the usage meter banner in the panel (it shows the Usage label when collapsed).
  2. Look for an "Upgrade" button; it appears only in some usage states, for example when a plan limit applies.
  3. Click "Upgrade" and compare with Expected: the plan upgrade flow opens (this code opens the web pricing page).
  4. Alternative: Command Palette, type "Code: Upgrade Your Plan" and compare the result.

## S5.32 Connection-status indicator.

- **Expected:** A status indicator shows whether the app is connected to its backend/runtime and offers reconnect when not.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3122; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3614
- **Where to find it:** Status box under the panel header, shown when the developer runtime is not ready: "Try again" (also "Open setup" and "Get help") (labels found in the code)
- **Needs:** a state where the developer runtime is not ready (for example, no workspace folder)
- **Steps:**
  1. Open AGI Code in a state where the developer runtime is not ready (for example, no folder open or the CLI missing).
  2. Look for the status box with the title "Developer runtime needs setup".
  3. Click "Try again" and watch the button read "Checking" and then the result.
  4. Compare with Expected: the box disappears once the runtime is ready, and "Try again" is the reconnect path.

## S5.38 Resource deep links.

- **Expected:** Each resource (conversation, project, task) has a stable link that opens it directly in the app.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/sessionReceipt.ts:83
- **Where to find it:** VS Code Command Palette > "Code: Show Session Activity" > "Copy a link to this session" (labels found in the code)
- **Needs:** an open or started session
- **Steps:**
  1. Open or start a session in the AGI Code panel and send a message.
  2. Press the Command Palette shortcut (VS Code default, cmd+shift+p) and type "Show Session Activity".
  3. Pick "Code: Show Session Activity", then pick "Copy a link to this session".
  4. Paste the link in a text editor and compare with Expected: the link points back to this session in VS Code on this machine.
