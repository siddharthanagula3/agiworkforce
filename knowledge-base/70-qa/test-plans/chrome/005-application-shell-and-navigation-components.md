---
id: "PLAN-chrome-005"
type: "test-plan"
title: "Chrome · 5. Application shell and navigation components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "5"
---
# Chrome · 5. Application shell and navigation components

18 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S5.01 Application header.

- **Expected:** A persistent top header shows where the user is (brand/conversation title) and the primary actions for the current view.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:10904; apps/extension/src/side_panel.ts:8968
- **Where to find it:** Side panel header: New chat, Recent chats and More buttons at the top; after the first message, the chat title shows in a row below the header (labels found in the code)
- **Needs:** a signed-in account; the title row needs at least one message
- **Steps:**
  1. Open the AGI side panel and sign in to a Managed Cloud account.
  2. Send one message in the chat box.
  3. Look at the top: the header shows the model button, Recent chats, New chat and More.
  4. Look just below the header for the chat title row. Compare with Expected: the header shows where you are and the main actions.

## S5.02 Product or mode switcher.

- **Expected:** A control lets the user switch between product areas or modes (chat, projects, code, work, etc.) from the shell.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:13489; apps/extension/src/side_panel.ts:13525
- **Where to find it:** Ctrl+K (Cmd+K on Mac) > type Computer Use > pick Computer Use under Go to (labels found in the code)
- **Steps:**
  1. Click inside the side panel.
  2. Press Cmd+K on Mac (Ctrl+K on Windows).
  3. Type Computer Use and pick it under Go to.
  4. Look for the two tabs Chat and Computer Use at the top, with Computer Use active.

## S5.07 Sidebar search input.

- **Expected:** The navigation sidebar has a search entry that filters or searches conversations.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6717 (quoted code not found in the file now); apps/extension/src/side_panel.ts:6700 (quoted code not found in the file now)
- **Where to find it:** Recent chats (clock icon in the header) > Search recent chats box (labels found in the code)
- **Needs:** a signed-in account or saved chats on this device
- **Steps:**
  1. Click the clock icon in the header (Recent chats).
  2. Click the box labelled Search recent chats.
  3. Type part of a chat title.
  4. Look that only matching chats stay in the list.

## S5.08 New-chat action.

- **Expected:** A persistent New chat action starts a fresh conversation from anywhere in the shell.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:11533; apps/extension/src/side_panel.ts:8968
- **Where to find it:** Header > New chat button (icon at the top right of the side panel) (labels found in the code)
- **Steps:**
  1. Open a chat that already has messages.
  2. Click the New chat button in the header.
  3. Look for an empty chat with no messages and no title row.

## S5.10 Recent-item section.

- **Expected:** Navigation shows a list of recent conversations that open on selection.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6351 (quoted code not found in the file now); apps/extension/src/side_panel.ts:6726 (quoted code not found in the file now)
- **Where to find it:** Recent chats (clock icon in the header) > list of chat rows (labels found in the code)
- **Needs:** some saved chats
- **Steps:**
  1. Click the clock icon (Recent chats).
  2. Look for the list of recent chats with dates.
  3. Click one chat row.
  4. Look that the chat opens in the chat view. Compare with Expected: recent items open on selection.

## S5.13 Conversation row.

- **Expected:** Each conversation row shows its title, indicates the active one, and opens the conversation.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:12845; apps/extension/src/side_panel.ts:12857; apps/extension/src/side_panel.ts:5315
- **Where to find it:** Recent chats (clock icon in the header) > a chat row (labels found in the code)
- **Needs:** two or more saved chats
- **Steps:**
  1. Click the clock icon (Recent chats).
  2. Look at a row: the title and the date.
  3. Look for the open chat: its row has a stronger background and is marked as the current page.
  4. Click another row's title and look that its chat opens.

## S5.14 Project row.

- **Expected:** Navigation shows project rows that open the project (and expose its actions).
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No project rows were found in the side panel navigation. Projects appear only in the @ mention menu under Projects and as a Project name chip. I searched apps/extension/src/side_panel.ts for project rows and Projects navigation.
- **Needs:** a signed-in account with a project

## S5.15 Task row.

- **Expected:** Background work/tasks appear as rows marked as tasks (distinct from chats) with their state, and open on selection.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** More (⋮) > Tasks (labels found in the code)
- **Needs:** a signed-in account that has background tasks
- **Steps:**
  1. Sign in to an AGI account.
  2. Click the More button (⋮) at the top right.
  3. Click Tasks.
  4. Look for task rows with a title, a state and a time, and an Open button. Compare with Expected: tasks are shown apart from chats.

## S5.17 Running-task indicator.

- **Expected:** Navigation marks items whose task or response is still running, visually and for screen readers.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** More (⋮) > Tasks > the state text under a task (labels found in the code)
- **Needs:** a signed-in account with a running task
- **Steps:**
  1. Start a background task that is still running.
  2. Click More (⋮) > Tasks.
  3. Look for the state text Running under that task.

## S5.18 Needs-input indicator.

- **Expected:** Navigation marks items that are blocked waiting for the user (approval or input).
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** More (⋮) > Tasks > the state text under a task (labels found in the code)
- **Needs:** a signed-in account and a task that needs input or approval
- **Steps:**
  1. Start a task that asks for your input or approval.
  2. Click More (⋮) > Tasks.
  3. Look for Waiting for input or Waiting for approval under that task.

## S5.20 Item overflow menu.

- **Expected:** Each row has an overflow (⋯) menu with its actions (share, rename, pin, archive, move, delete).
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:12685; apps/extension/src/side_panel.ts:12429; apps/extension/src/side_panel.ts:12189; apps/extension/src/features/background/conversation-history.ts:1918
- **Where to find it:** Recent chats (clock icon) > More actions (⋯) on a chat row (labels found in the code)
- **Needs:** a saved chat
- **Steps:**
  1. Click the clock icon (Recent chats).
  2. Click the ⋯ button at the right of a chat row.
  3. Look for Pin, Rename, Move to project, Share, Archive and Delete chat.
  4. Click Rename and look for the edit box.

## S5.26 Global command palette.

- **Expected:** A global command palette (keyboard-invoked) searches and runs app commands and destinations.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/commandPalette.ts:116; apps/extension/src/side_panel.ts:13585; apps/extension/src/side_panel.ts:13635
- **Where to find it:** Cmd+K on Mac (Ctrl+K on Windows) with the side panel focused (labels found in the code)
- **Needs:** none; the Chats list needs a signed-in account
- **Steps:**
  1. Click inside the side panel.
  2. Press Cmd+K (Ctrl+K on Windows).
  3. Look for the Commands box with the placeholder Search commands and chats.
  4. Type New or a chat name and look for matching Go to items and Chats.

## S5.27 Keyboard-shortcut help.

- **Expected:** A keyboard-shortcut help view lists the available shortcuts and is reachable from the app.
- **Code:** done. Evidence moved: apps/extension/src/options.ts:1724 (quoted code not found in the file now); apps/extension/src/options.ts:1778 (quoted code not found in the file now); apps/extension/src/side_panel.ts:7130 (quoted code not found in the file now)
- **Where to find it:** More (⋮) > Extension settings > Options page: Options > Keyboard shortcuts (labels found in the code)
- **Steps:**
  1. Click the More button (⋮).
  2. Click Extension settings. The Options page opens in a new tab.
  3. Click Options in the left list.
  4. Scroll to Keyboard shortcuts. Look for Open side panel and Send page screenshot to Desktop, each with a shortcut and a Configure button.

## S5.29 User/profile menu.

- **Expected:** A user/profile menu shows who is signed in and offers account actions (settings, plan, sign out).
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:8015 (quoted code not found in the file now); apps/extension/src/side_panel.ts:8112 (quoted code not found in the file now)
- **Where to find it:** More (⋮) > account block at the top of the menu (labels found in the code)
- **Needs:** a signed-in account; Usage is not shown on the Free plan
- **Steps:**
  1. Sign in to an AGI account.
  2. Click the More button (⋮) at the top right.
  3. Look at the top of the menu: your name or email and plan name.
  4. Look for Settings, Usage, Tasks, Memory, Upgrade plan and Log out.

## S5.30 Help menu.

- **Expected:** A help menu gathers help centre, support contact, feedback and shortcuts in one place.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:12000 (quoted code not found in the file now); apps/extension/src/side_panel.ts:12060 (quoted code not found in the file now); apps/extension/src/side_panel.ts:12006 (quoted code not found in the file now)
- **Where to find it:** More (⋮) > Help (labels found in the code)
- **Steps:**
  1. Click the More button (⋮).
  2. Click Help. The Options page opens on its Help section.
  3. Look for Help center, Documentation and Contact support.

## S5.31 Upgrade entry.

- **Expected:** A visible Upgrade entry in the shell takes an eligible user into the plan upgrade flow.
- **Code:** partial. Evidence moved: apps/extension/src/side_panel.ts:8104 (quoted code not found in the file now); apps/extension/src/side_panel.ts:9626 (quoted code not found in the file now)
- **Known to be unfinished:** Quota upgrade button opens web pricing/billing, where checkout sits behind the beta_redemptions waitlist gate.
- **Where to find it:** More (⋮) > Upgrade plan (labels found in the code)
- **Needs:** a signed-in account on a plan that has a higher tier
- **Steps:**
  1. Sign in to an account on a plan with a higher tier.
  2. Click the More button (⋮).
  3. Look for Upgrade plan and click it.
  4. Look that a web plans page opens in a new tab.

## S5.32 Connection-status indicator.

- **Expected:** A status indicator shows whether the app is connected to its backend/runtime and offers reconnect when not.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:5068 (quoted code not found in the file now); apps/extension/src/side_panel.ts:15646
- **Where to find it:** Above the chat box: notice Desktop tools are optional and currently disconnected. > Reconnect (labels found in the code)
- **Needs:** the AGI desktop app not running
- **Steps:**
  1. Make sure the AGI desktop app is not running.
  2. Open the side panel.
  3. Look above the chat box for the notice text and the Reconnect button.
  4. Click Reconnect and look for a change in the notice.

## S5.35 Mobile navigation drawer.

- **Expected:** On narrow screens navigation lives in a slide-in drawer opened from a header button, with focus management and dismissal.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6566 (quoted code not found in the file now); apps/extension/src/side_panel.ts:6590 (quoted code not found in the file now)
- **Where to find it:** Header > Recent chats (clock icon); the list opens as a full overlay over the panel (labels found in the code)
- **Needs:** a narrow side panel; Chrome side panels cannot reach phone width
- **Steps:**
  1. Drag the Chrome side panel to its narrowest width.
  2. Click the clock icon (Recent chats).
  3. Look for the list filling the panel with a Close button.
  4. Click Close and look that focus returns to the clock icon.
