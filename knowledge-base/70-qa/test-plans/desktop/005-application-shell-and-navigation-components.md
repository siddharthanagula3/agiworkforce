---
id: "PLAN-desktop-005"
type: "test-plan"
title: "Desktop · 5. Application shell and navigation components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "5"
---
# Desktop · 5. Application shell and navigation components

33 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S5.01 Application header.

- **Expected:** A persistent top header shows where the user is (brand/conversation title) and the primary actions for the current view.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7279; apps/web/features/chat/pages/WebChatPage.tsx:7313
- **Where to find it:** Open any chat that has messages, then look at the top bar (Share button and chevron menu at the top right) (labels found in the code)
- **Needs:** a chat that already has messages
- **Steps:**
  1. Sign in and click Chat in the left sidebar, then open a chat from Recents (or send a first message).
  2. Look at the top bar of the chat page.
  3. Click the Share button, then the chevron menu next to it, and check that the menu offers rename, move, share, print, export, branch and delete.
  4. Compare with Expected: the top bar should show where you are and the main actions for this view.

## S5.02 Product or mode switcher.

- **Expected:** A control lets the user switch between product areas or modes (chat, projects, code, work, etc.) from the shell.
- **Code:** done. Evidence present: apps/web/shared/components/layout/app-nav-items.ts:106; apps/web/shared/components/layout/WebAppShell.tsx:470
- **Where to find it:** Sidebar > Chat, Projects, Library, Sites, Health, Study (nav rows); and the Home | Code switch above the chat list (labels found in the code)
- **Needs:** none (Health appears only when a health space is available; Home | Code only when Code is enabled)
- **Steps:**
  1. Sign in; the left sidebar shows the nav rows.
  2. Click Projects, then Library, then Sites, and watch the main area change.
  3. Find the two-part switch with Home and Code (shown only when the Code option is enabled for the account) and click Code.
  4. Compare with Expected: each click should move to that product area or mode.

## S5.04 Workspace switcher.

- **Expected:** From the shell, the user can see the active workspace and switch between personal and team workspaces.
- **Code:** done. Evidence moved: apps/web/shared/components/layout/AccountMenuItems.tsx:82; apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:85 (quoted code not found in the file now)
- **Where to find it:** Sidebar bottom > account button (Account menu for your name) > Workspace > Personal / Enterprise (labels found in the code)
- **Needs:** a second workspace (a team/enterprise membership) for switching; a Free account shows only Personal
- **Steps:**
  1. Click the account button at the bottom of the sidebar.
  2. Hover or click Workspace.
  3. Look at the list: Personal (detail Only you) and any Enterprise workspaces; the active one is marked with a check icon.
  4. Click a different workspace, read the switch warning, and check that the app reloads in that workspace (Expected).

## S5.05 Sidebar expand/collapse control.

- **Expected:** A control collapses the navigation sidebar to a rail (or hides it) and expands it again.
- **Code:** done. Evidence moved: packages/ui/ui/src/sidebar/Sidebar.tsx:578; packages/ui/ui/src/sidebar/Sidebar.tsx:465 (quoted code not found in the file now); apps/web/shared/components/layout/WebAppShell.tsx:632
- **Where to find it:** Sidebar header > Toggle sidebar button (keyboard: Cmd+B on Mac, Ctrl+B on Windows) (labels found in the code)
- **Needs:** a wide window (desktop width); on a phone the sidebar is a drawer instead
- **Steps:**
  1. Sign in on a wide window so the sidebar is open.
  2. Click the Toggle sidebar button in the sidebar header (or press Cmd+B).
  3. Check that the sidebar collapses to a narrow icon rail.
  4. Click the same button again (or press Cmd+B) and check that the sidebar expands.

## S5.07 Sidebar search input.

- **Expected:** The navigation sidebar has a search entry that filters or searches conversations.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:518; apps/web/shared/components/layout/WebAppShell.tsx:618
- **Where to find it:** Sidebar > Search (row with a Search icon, shortcut shown as Cmd+Shift+F, or Ctrl+Shift+F on Windows) (labels found in the code)
- **Needs:** at least one saved chat with a known title
- **Steps:**
  1. Click Search in the sidebar, or press Cmd+Shift+F.
  2. A search panel opens over the app.
  3. Type part of a chat title that you know exists.
  4. Compare with Expected: matching conversations should appear as results and open when clicked.

## S5.08 New-chat action.

- **Expected:** A persistent New chat action starts a fresh conversation from anywhere in the shell.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:601; apps/web/features/chat/pages/WebChatPage.tsx:7155
- **Where to find it:** Sidebar > New Chat button at the top of the sidebar (shortcut Shift+Cmd+O, or Shift+Ctrl+O on Windows) (labels found in the code)
- **Steps:**
  1. From any page in the app, click New Chat at the top of the sidebar, or press Shift+Cmd+O.
  2. Check that a blank chat opens with an empty message box.
  3. Send a message, then click New Chat again and check that a second, fresh chat opens.

## S5.09 Pinned-item section.

- **Expected:** Pinned items appear in their own section at the top of navigation.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:770; packages/ui/ui/src/sidebar/Sidebar.tsx:263
- **Where to find it:** Sidebar > Pinned (section at the top of the chat list) (labels found in the code)
- **Needs:** at least one saved chat
- **Steps:**
  1. Hover a chat row in Recents and click its More options (three dots) button.
  2. Click Pin.
  3. Check that the chat moves into a section headed Pinned at the top of the list.
  4. Click Unpin in the same menu and check that it returns to its date group.

## S5.10 Recent-item section.

- **Expected:** Navigation shows a list of recent conversations that open on selection.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:941; apps/web/shared/components/layout/WebAppShell.tsx:328
- **Where to find it:** Sidebar > Recents (heading above the chat list) (labels found in the code)
- **Needs:** at least two saved chats
- **Steps:**
  1. Create two or more chats by sending a message in each.
  2. Look at the list under the Recents heading.
  3. Click an older chat and check that it opens with its messages.
  4. Compare with Expected: recent conversations are listed and open on selection.

## S5.11 Project-grouped recents.

- **Expected:** Recent conversations can be shown grouped under their projects in navigation.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:906; packages/ui/ui/src/sidebar/Sidebar.tsx:257
- **Where to find it:** Sidebar > Recents heading > Organize chats (sliders icon) > By project or In one list (labels found in the code)
- **Needs:** a project with at least one chat moved into it
- **Steps:**
  1. Move a chat into a project: hover the chat, click More options, then Move to project, and pick a project.
  2. Hover the Recents heading and click the sliders icon named Organize chats.
  3. With By project selected (the default), check that the moved chat appears under its project row and not in Recents.
  4. Choose In one list and check that all chats appear in Recents again.

## S5.12 Date-grouped recents.

- **Expected:** Recent conversations are grouped by date buckets (Today, Yesterday, This week, Older).
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:270; packages/ui/ui/src/sidebar/Sidebar.tsx:958
- **Where to find it:** Sidebar > Recents > date group headings (labels found in the code)
- **Needs:** chats from several different dates
- **Steps:**
  1. Have chats from different days (or use an account with older chats).
  2. Look at the group headings above the chat rows.
  3. Click a heading to collapse or expand its group.
  4. Compare with Expected: the headings should be Today, Yesterday, This week, Older.

## S5.13 Conversation row.

- **Expected:** Each conversation row shows its title, indicates the active one, and opens the conversation.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:253; packages/ui/ui/src/sidebar/SessionItem.tsx:139
- **Where to find it:** Sidebar > Recents > a chat row (click the title) (labels found in the code)
- **Needs:** at least two saved chats
- **Steps:**
  1. Click a chat row in Recents.
  2. Check that the chat opens in the main area with its title and messages.
  3. Check that the row you clicked now has a highlighted background (it is marked as the current page).
  4. Click a different row and check that the highlight moves.

## S5.14 Project row.

- **Expected:** Navigation shows project rows that open the project (and expose its actions).
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:1354; packages/ui/ui/src/sidebar/Sidebar.tsx:1463; apps/web/shared/components/layout/WebAppShell.tsx:384
- **Where to find it:** Sidebar > Projects > a project name (labels found in the code)
- **Needs:** a project (create one first)
- **Steps:**
  1. Click Projects in the sidebar nav, then New project and create one.
  2. Go back to the sidebar and find the project under the Projects section.
  3. Click the project name and check that the project page opens (address /chat/projects/ with the project id).
  4. Hover the project row and check the New chat in project and More options buttons.

## S5.15 Task row.

- **Expected:** Background work/tasks appear as rows marked as tasks (distinct from chats) with their state, and open on selection.
- **Code:** done. Evidence moved: packages/ui/ui/src/sidebar/SessionItem.tsx:170 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:6971
- **Where to find it:** Sidebar > Recents > a row marked Work (a small dot with the word Work for screen readers) (labels found in the code)
- **Needs:** a Work task that already exists (how to start one was not confirmed in the code I read)
- **Steps:**
  1. Find a row in Recents that carries the Work marker (a small dot, no chat-style row).
  2. Click the row and check that it opens the task.
  3. Compare with Expected: the row should be visibly different from a plain chat and show its state.
  4. For the full task list, open the command palette (Cmd+K) and choose Work history.

## S5.16 Resource-type icon.

- **Expected:** Rows in mixed lists carry an icon (or equivalent marker) that tells the resource type apart (chat, project, task, file) visually and for assistive tech.
- **Code:** done. Evidence present: apps/web/shared/components/CommandPalette/CommandPalette.tsx:85; apps/web/shared/components/CommandPalette/CommandPalette.tsx:393; apps/web/shared/components/CommandPalette/CommandPalette.tsx:600
- **Where to find it:** Press Cmd+K > type a word > results show an icon and a type label for each row (labels found in the code)
- **Needs:** a chat and a project whose names match a word you type
- **Steps:**
  1. Press Cmd+K (Ctrl+K on Windows).
  2. Type a word from a chat title and from a project name.
  3. Look at each result row: it has an icon and a hidden type label (Chat, Project, File, Artifact and so on).
  4. Compare with Expected: the type should be recognisable from the icon and announced for screen readers.

## S5.17 Running-task indicator.

- **Expected:** Navigation marks items whose task or response is still running, visually and for screen readers.
- **Code:** done. Evidence present: apps/web/shared/components/layout/WebAppShell.tsx:265; apps/web/shared/components/layout/WebAppShell.tsx:280
- **Where to find it:** Sidebar > Recents > the chat row whose reply is still running (labels found in the code)
- **Needs:** an account that can send a message and get a reply
- **Steps:**
  1. Send a question that takes a while to answer in a chat.
  2. While the reply is still coming in, look at the chat row in Recents.
  3. Check that a pulsing dot appears beside the title.
  4. When the reply finishes, check that the dot disappears.

## S5.18 Needs-input indicator.

- **Expected:** Navigation marks items that are blocked waiting for the user (approval or input).
- **Code:** done. Evidence present: apps/web/lib/server/neon-chat.ts:69; apps/web/shared/components/layout/WebAppShell.tsx:281; apps/web/features/chat/pages/WebChatPage.tsx:6972; packages/ui/ui/src/sidebar/SessionItem.tsx:157; packages/ui/ui/src/sidebar/SessionItem.tsx:192
- **Where to find it:** Sidebar > Recents > a chat row with an amber dot (labels found in the code)
- **Needs:** a run that is waiting for your approval or input
- **Steps:**
  1. Start a run that asks you for approval or input (for example, a task that waits for you).
  2. Leave the chat open or move to another chat.
  3. Look at the chat row in Recents for an amber dot, and hover or inspect it for the word Needs you for screen readers.
  4. Answer the question and check that the amber dot clears.

## S5.19 Unread-result indicator.

- **Expected:** Items with new results the user has not seen are marked unread (visually and for assistive tech) and clear when opened.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:194; packages/ui/ui/src/sidebar/SessionItem.tsx:254
- **Where to find it:** Sidebar > Recents > chat row with a blue dot and bold title (set Mark as unread from More options) (labels found in the code)
- **Needs:** at least one saved chat
- **Steps:**
  1. Hover a chat row in Recents, click More options, then Mark as unread.
  2. Check that the row shows a blue dot and a bold title, and that the screen-reader text says Unread.
  3. Click the row and check that the dot and bold title clear.
  4. Compare with Expected: unread items are marked and clear when opened.

## S5.20 Item overflow menu.

- **Expected:** Each row has an overflow (⋯) menu with its actions (share, rename, pin, archive, move, delete).
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:308; packages/ui/ui/src/sidebar/SessionItem.tsx:353
- **Where to find it:** Sidebar > hover a chat row > More options (three dots) (labels found in the code)
- **Needs:** at least one saved chat; a project for Move to project
- **Steps:**
  1. Hover a chat row in Recents and click More options.
  2. Check the menu order: Share, Rename, Pin, Mark as unread, Archive, Delete, Move to project.
  3. Use Move to project (when projects exist) and check that the chat moves.
  4. Use Delete and check that a confirmation dialog appears before anything is removed.

## S5.21 Inline rename field.

- **Expected:** A row can be renamed in place (inline field, Enter to save, Escape to cancel) and the new title persists.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:218; apps/web/shared/components/layout/WebAppShell.tsx:345
- **Where to find it:** Sidebar > chat row > More options > Rename (labels found in the code)
- **Needs:** at least one saved chat
- **Steps:**
  1. Hover a chat row, click More options, then Rename.
  2. The title turns into a text field: type a new name and press Enter.
  3. Check that the new title shows in the row, then reload the page and check it is still there.
  4. Start a rename again, press Escape, and check that the old title comes back.

## S5.25 Back and forward navigation.

- **Expected:** Back and forward navigation move through the user's in-app history.
- **Code:** done. Evidence present: apps/desktop/electron/appMenu.ts:421; apps/desktop/electron/main.ts:2378
- **Where to find it:** Menu bar > History > Back and Forward (desktop app only; in the browser use the browser's back and forward buttons) (labels found in the code)
- **Needs:** the Electron desktop app for the menu; a browser for the browser's own back button
- **Steps:**
  1. Open two different chats, one after the other.
  2. In the Electron desktop app, click History in the menu bar, then Back (shortcut Cmd+[).
  3. Check that the earlier chat opens again.
  4. Click History > Forward (Cmd+]) and check that the later chat returns.

## S5.26 Global command palette.

- **Expected:** A global command palette (keyboard-invoked) searches and runs app commands and destinations.
- **Code:** done. Evidence present: apps/web/shared/components/CommandPalette/CommandPaletteProvider.tsx:16; apps/web/shared/components/CommandPalette/CommandPalette.tsx:234
- **Where to find it:** Press Cmd+K anywhere (Ctrl+K on Windows) > command palette (labels found in the code)
- **Steps:**
  1. Press Cmd+K from any page.
  2. Check that a dialog opens with the placeholder Search chats and actions.
  3. Type settings and press Enter on Go to Settings.
  4. Compare with Expected: the palette runs the command and opens that destination.

## S5.27 Keyboard-shortcut help.

- **Expected:** A keyboard-shortcut help view lists the available shortcuts and is reachable from the app.
- **Code:** done. Evidence present: apps/web/shared/components/layout/AccountMenuItems.tsx:111; apps/web/shared/components/layout/WebAppShell.tsx:623
- **Where to find it:** Account menu (bottom of sidebar) > Get help > Keyboard shortcuts (or press Cmd+/) (labels found in the code)
- **Steps:**
  1. Click the account button at the bottom of the sidebar, then Get help, then Keyboard shortcuts.
  2. Or press Cmd+/ (Ctrl+/ on Windows) from a chat page.
  3. Check that a dialog titled Keyboard Shortcuts opens and lists the shortcuts with their keys.
  4. Press Escape and check that the dialog closes.

## S5.28 Notification center.

- **Expected:** A notification center lists account notifications, shows an unread count, and lets the user open and mark them read.
- **Code:** done. Evidence moved: apps/web/shared/components/layout/SidebarBrandRow.tsx:10; apps/web/features/notifications/components/NotificationBell.tsx:85 (quoted code not found in the file now)
- **Where to find it:** Sidebar top, next to the AGI wordmark > bell button (Notifications) (labels found in the code)
- **Needs:** a notification (for example a finished run); an empty account shows the empty message
- **Steps:**
  1. Click the bell at the top of the sidebar.
  2. Check the panel titled Notifications, with an unread count on the bell when there are unread items.
  3. Click a notification row and check that it opens its target.
  4. Click Mark all as read and check the unread dots clear and the count goes away.

## S5.29 User/profile menu.

- **Expected:** A user/profile menu shows who is signed in and offers account actions (settings, plan, sign out).
- **Code:** done. Evidence present: apps/web/shared/components/layout/WebAppShell.tsx:531; apps/web/shared/components/layout/AccountMenuItems.tsx:82; apps/web/shared/components/layout/AccountMenuItems.tsx:159
- **Where to find it:** Sidebar bottom > account button (Account menu for your name) (labels found in the code)
- **Steps:**
  1. Click the account button at the bottom of the sidebar.
  2. Check that your email shows at the top of the menu.
  3. Check the items: Workspace, Settings, Get help, Upgrade (only when offered), Log out.
  4. Click Settings and check that the Settings page opens; then sign out with Log out and check you return to sign-in.

## S5.30 Help menu.

- **Expected:** A help menu gathers help centre, support contact, feedback and shortcuts in one place.
- **Code:** done. Evidence present: apps/web/shared/components/layout/AccountMenuItems.tsx:95; apps/web/shared/components/layout/WebAppShell.tsx:514
- **Where to find it:** Account menu (bottom of sidebar) > Get help (labels found in the code)
- **Steps:**
  1. Click the account button at the bottom of the sidebar, then Get help.
  2. Check the options: Get help, Email support, Send feedback, Keyboard shortcuts.
  3. Click Send feedback and check that the feedback dialog opens.
  4. Click Keyboard shortcuts and check that the shortcuts dialog opens.

## S5.31 Upgrade entry.

- **Expected:** A visible Upgrade entry in the shell takes an eligible user into the plan upgrade flow.
- **Code:** partial. Evidence moved: apps/web/lib/server/billing-waitlist-access.ts:22 (quoted code not found in the file now)
- **Known to be unfinished:** owner-held (lead ruling 2026-09-28): the billing waitlist stays on by owner decision; paid checkout, portal and store purchases need a redeemed access code. aaae88832e added AGI_BILLING_WAITLIST_OPEN, which stays unset at deploy until the owner opens paid upgrades
- **Where to find it:** Sidebar account footer > "Free plan" row > Upgrade button; or the account menu ("Account menu for ..." in the sidebar) > Upgrade (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in with a Free account and look at the bottom of the sidebar for the "Free plan" row.
  2. Click the "Upgrade" button on that row.
  3. Open the account menu from the sidebar and look for the "Upgrade" item (it is hidden when the plan has no self-serve upgrade path).
  4. Click "Upgrade" and compare with Expected: an eligible user should reach the plan upgrade flow. Note that paid checkout is gated: while billing upgrades are closed, the flow shows the waitlist dialog instead of checkout.

## S5.32 Connection-status indicator.

- **Expected:** A status indicator shows whether the app is connected to its backend/runtime and offers reconnect when not.
- **Code:** done. Evidence moved: apps/web/app/AppRuntimeMounts.tsx:22 (quoted code not found in the file now); apps/web/shared/components/OfflineIndicator.tsx:42
- **Where to find it:** Any screen > the status strip that drops in below the header (labelled "Network status indicator"); it appears on connection loss or a sync error, with no menu (labels found in the code)
- **Needs:** a Mac with Wi-Fi that can be switched off, and a signed-in account
- **Steps:**
  1. Sign in and stay on any screen.
  2. Turn off Wi-Fi on the Mac (or disconnect the network) and wait a few seconds.
  3. Look for the status strip under the header: it should show a connection state such as "Offline".
  4. Check whether a reconnect control is offered; compare with Expected (it should offer reconnect when not connected).

## S5.33 Offline indicator.

- **Expected:** When the device loses network, a visible offline indicator appears and clears when back online.
- **Code:** done. Evidence moved: apps/web/app/AppRuntimeMounts.tsx:22 (quoted code not found in the file now); apps/web/shared/components/OfflineIndicator.tsx:13
- **Where to find it:** Any screen > turn off Wi-Fi; the status strip under the header appears; turn Wi-Fi back on (labels found in the code)
- **Needs:** a Mac with Wi-Fi that can be switched off, and a signed-in account; queued items show "pending" only if some work is waiting
- **Steps:**
  1. Sign in and stay on any screen.
  2. Turn off Wi-Fi on the Mac.
  3. Look for the strip under the header showing "Offline" (with "pending" if changes are queued).
  4. Turn Wi-Fi back on and wait; compare with Expected: the strip should clear once the app is back online.

## S5.34 Release/update indicator.

- **Expected:** The app tells the user when a new release is available (or just installed) and how to get it.
- **Code:** done. Evidence moved: apps/desktop/electron/appMenu.ts:241 (quoted code not found in the file now); apps/desktop/electron/main.ts:621; apps/desktop/electron/preload.ts:171
- **Where to find it:** Menu bar > the app's own menu (the menu named after the app, far left, next to the Apple menu) > Check for Updates… (labels found in the code)
- **Needs:** a Mac desktop build; to see the update-available or update-ready dialog a newer published version must exist (otherwise only the up-to-date dialog appears)
- **Steps:**
  1. Click the app's own menu in the Mac menu bar.
  2. Click "Check for Updates…".
  3. Read the dialog: if you have the latest version it says the app is up to date; if a newer one exists it offers "Download Installer" (or "Relaunch to update" once downloaded).
  4. Compare with Expected: the dialog should say whether a new release is available and how to get it.

## S5.35 Mobile navigation drawer.

- **Expected:** On narrow screens navigation lives in a slide-in drawer opened from a header button, with focus management and dismissal.
- **Code:** done. Evidence present: apps/web/shared/components/layout/WebAppShell.tsx:692; apps/web/shared/components/layout/WebAppShell.tsx:653
- **Where to find it:** Resize the app window narrower than 768 px > header button at top-left labelled "Open navigation" > navigation drawer slides in from the left (labels found in the code)
- **Needs:** a window narrower than 768 px
- **Steps:**
  1. Drag the window edge until the window is narrower than about 768 px wide.
  2. Click the menu icon at the top-left of the header (accessible name "Open navigation").
  3. Look for the navigation drawer sliding in from the left, with the sidebar items inside.
  4. Press Escape or click outside the drawer, then check it closes and keyboard focus returns to the menu button; compare with Expected.

## S5.37 Tablet split-navigation layout.

- **Expected:** On tablet widths navigation and content sit side by side (persistent or rail sidebar) instead of a phone drawer.
- **Code:** done. Evidence present: apps/web/shared/components/layout/app-shell-layout.ts:38; apps/web/shared/components/layout/WebAppShell.tsx:631
- **Where to find it:** no screen of its own. Code (app-shell-layout.ts) keeps the sidebar persistent in landscape but uses a rail that expands over the content in portrait, which is not the side-by-side layout Expected describes.
- **Needs:** a window that can be resized to tablet widths
- **Steps:**
  1. Resize the window to between 768 and 1023 px wide with the window wider than tall (landscape).
  2. Look: the navigation sidebar should stay beside the content (persistent).
  3. Resize to a taller-than-wide (portrait) window at the same width.
  4. Look: in portrait the sidebar shows only icons and expands over the content instead of sitting beside it; compare with Expected.

## S5.38 Resource deep links.

- **Expected:** Each resource (conversation, project, task) has a stable link that opens it directly in the app.
- **Code:** done. Evidence present: apps/desktop/electron/main.ts:2585; apps/desktop/electron/main.ts:2574
- **Where to find it:** Sidebar > the bell icon next to the wordmark (notifications) > click a notification about a chat, project or task (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account with a notification that links to a chat or task
- **Steps:**
  1. Make sure an account has a notification that points at a chat or a task.
  2. Open the notifications bell from the sidebar header.
  3. Click that notification.
  4. Look: the app should open that chat or task directly, and the address should point at the item; compare with Expected.

## S5.39 Route-level loading and unavailable-resource screens.

- **Expected:** Routes show a loading state while resolving and a clear not-found/unavailable screen for missing or forbidden resources.
- **Code:** done. Evidence present: apps/web/app/chat/loading.tsx:4; apps/web/features/notifications/components/ProductLinkUnavailable.tsx:18
- **Where to find it:** Open a chat link whose chat was deleted (for example from a notification about it): the screen shows "Conversation not found"; the "Loading chat" screen appears while the chat resolves (labels found in the code)
- **Needs:** a Free or paid account and a chat you can delete
- **Steps:**
  1. Delete a chat you own, or pick a link to a chat that no longer exists.
  2. Open that link from the app (for example from a notification).
  3. Look for the "Loading chat" screen while it resolves.
  4. Look for the unavailable screen: a title such as "This chat isn’t available" with a "Back to chats" button; compare with Expected.
