---
id: "PLAN-web-005"
type: "test-plan"
title: "Web · 5. Application shell and navigation components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "5"
---
# Web · 5. Application shell and navigation components

32 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S5.01 Application header.

- **Expected:** A persistent top header shows where the user is (brand/conversation title) and the primary actions for the current view.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7279; apps/web/features/chat/pages/WebChatPage.tsx:7313
- **Where to find it:** Open any chat. The top bar of the chat page shows the conversation title; the row actions sit in the bar's chevron menu and its trailing buttons. (labels found in the code)
- **Steps:**
  1. Sign in and open or start a chat so the chat page loads.
  2. Look at the top bar: the conversation title is on the left and the actions are on the right.
  3. Click the chevron next to the title to open its actions menu.
  4. Compare with Expected: the bar shows the place (title) and the actions for this view.

## S5.02 Product or mode switcher.

- **Expected:** A control lets the user switch between product areas or modes (chat, projects, code, work, etc.) from the shell.
- **Code:** done. Evidence present: apps/web/shared/components/layout/app-nav-items.ts:106; packages/ui/ui/src/sidebar/Sidebar.tsx:516; apps/web/shared/components/layout/WebAppShell.tsx:470
- **Where to find it:** Sidebar top: Home | Code switch (only when the Code entry is passed in). Left rail: Chat, Projects, Library, Sites, Health. (labels found in the code)
- **Steps:**
  1. Sign in and look at the top of the left sidebar for the Home and Code segmented buttons.
  2. Click Code, then click Home to switch between the two.
  3. Look at the left rail icons: Chat, Projects, Library, Sites, Health (Health only when the workspace has it).
  4. Click Library, then Projects, and confirm each opens its own area, as Expected describes.

## S5.04 Workspace switcher.

- **Expected:** From the shell, the user can see the active workspace and switch between personal and team workspaces.
- **Code:** done. Evidence moved: apps/web/shared/components/layout/AccountMenuItems.tsx:82; apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:85 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E006 [UI_ONLY; visible UI]: Account menu opens with workspace, settings, support, shortcuts, upgrades, and policy destinations. No account/security mutation performed.
- **Where to find it:** Account row at the bottom of the sidebar > Workspace > Personal / enterprise workspace list > Manage workspaces. (labels found in the code)
- **Needs:** a second workspace (a team or organization account) to see a switch to a team workspace; Personal is always listed
- **Steps:**
  1. Sign in and click your name or account row at the bottom of the left sidebar.
  2. Hover or click Workspace to open its submenu.
  3. Look for Personal (detail: Only you) and any organization workspaces, with a check mark on the active one.
  4. Click Manage workspaces to see the team settings, and compare with Expected.

## S5.05 Sidebar expand/collapse control.

- **Expected:** A control collapses the navigation sidebar to a rail (or hides it) and expands it again.
- **Code:** done. Evidence moved: packages/ui/ui/src/sidebar/Sidebar.tsx:578; packages/ui/ui/src/sidebar/Sidebar.tsx:465 (quoted code not found in the file now); apps/web/shared/components/layout/WebAppShell.tsx:632
- **Earlier check in the running app:** PASS: E002 [PASS; interaction]: Expand control reveals dated history groups, conversation links and Free plan.
- **Where to find it:** Sidebar header > Toggle sidebar button (panel icon). Keyboard: Command+B on Mac, Ctrl+B elsewhere. (labels found in the code)
- **Needs:** a desktop-width window (the rail mode is used on desktop and tablet)
- **Steps:**
  1. Sign in on a desktop-width window and look at the top of the left sidebar.
  2. Click the Toggle sidebar button (panel icon); the sidebar shrinks to a rail of icons.
  3. Click the same button again, or press Command+B (Ctrl+B), to expand it.
  4. Compare with Expected: the navigation collapses to a rail and expands again.

## S5.07 Sidebar search input.

- **Expected:** The navigation sidebar has a search entry that filters or searches conversations.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:518; apps/web/shared/components/layout/WebAppShell.tsx:618
- **Where to find it:** Left rail > Search (magnifier icon), which opens the search dialog. Keyboard: Command+F on Mac, Ctrl+F elsewhere. (labels found in the code)
- **Needs:** at least one conversation with a known title
- **Steps:**
  1. Sign in and find the Search icon in the left rail (or the search entry in the sidebar).
  2. Click Search; a search dialog opens.
  3. Type part of a conversation title and look at the matching results.
  4. Compare with Expected: the sidebar search entry finds and filters conversations.

## S5.08 New-chat action.

- **Expected:** A persistent New chat action starts a fresh conversation from anywhere in the shell.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:601; apps/web/features/chat/pages/WebChatPage.tsx:7155
- **Where to find it:** Sidebar > New Chat button (also the New chat icon in the collapsed rail). (labels found in the code)
- **Steps:**
  1. Sign in and open any existing chat.
  2. Click New Chat at the top of the sidebar.
  3. Look for an empty conversation view with an empty composer and no previous messages.
  4. Compare with Expected: a fresh conversation starts from anywhere in the shell.

## S5.09 Pinned-item section.

- **Expected:** Pinned items appear in their own section at the top of navigation.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:935; packages/ui/ui/src/sidebar/Sidebar.tsx:263
- **Where to find it:** Sidebar > Pinned section. Pin a chat from its row: ⋯ (More options) > Pin. (labels found in the code)
- **Needs:** at least one conversation
- **Steps:**
  1. Sign in and find a chat in the Recents list.
  2. Hover the chat row, click the ⋯ More options button, then click Pin.
  3. Look above the Recents heading for a Pinned section containing that chat.
  4. Click Unpin from the same menu and confirm the chat leaves the Pinned section.

## S5.10 Recent-item section.

- **Expected:** Navigation shows a list of recent conversations that open on selection.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:941; apps/web/features/chat/pages/WebChatPage.tsx:1658; apps/web/shared/components/layout/WebAppShell.tsx:328
- **Earlier check in the running app:** PASS: E002 [PASS; interaction]: Expand control reveals dated history groups, conversation links and Free plan.
- **Where to find it:** Sidebar > Recents heading, the list of conversations below it. (labels found in the code)
- **Needs:** at least one conversation
- **Steps:**
  1. Sign in and look for the Recents heading in the sidebar.
  2. Expand a date group under it (for example Today) if it is collapsed.
  3. Click a conversation title in the list.
  4. Compare with Expected: the conversation opens in the main view.

## S5.11 Project-grouped recents.

- **Expected:** Recent conversations can be shown grouped under their projects in navigation.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:906; packages/ui/ui/src/sidebar/Sidebar.tsx:1504; packages/ui/ui/src/sidebar/Sidebar.tsx:257
- **Where to find it:** Sidebar > Recents row > Organize chats (icon button) > By project. Back to In one list. (labels found in the code)
- **Needs:** at least one project (the organize control only appears when projects exist)
- **Steps:**
  1. Sign in with at least one project and some chats inside it.
  2. Click the Organize chats control next to the Recents heading.
  3. Click By project and look for chats grouped under their project names.
  4. Click In one list to return to the flat list.

## S5.12 Date-grouped recents.

- **Expected:** Recent conversations are grouped by date buckets (Today, Yesterday, This week, Older).
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:270; packages/ui/ui/src/sidebar/Sidebar.tsx:958
- **Earlier check in the running app:** PASS: E002 [PASS; interaction]: Expand control reveals dated history groups, conversation links and Free plan.
- **Where to find it:** Sidebar > Recents: date group headers (Today, Yesterday, This Week, Last 7 Days, Last 30 Days, Older). Each header expands or collapses its group. (labels found in the code)
- **Needs:** conversations from several different dates
- **Steps:**
  1. Sign in with conversations from different days.
  2. Look at the Recents list for the date group headers.
  3. Click a group header to collapse it, then click again to expand it.
  4. Compare with Expected: conversations sit under date buckets such as Today and Older.

## S5.13 Conversation row.

- **Expected:** Each conversation row shows its title, indicates the active one, and opens the conversation.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:253; packages/ui/ui/src/sidebar/SessionItem.tsx:139
- **Earlier check in the running app:** PASS: E002 [PASS; interaction]: Expand control reveals dated history groups, conversation links and Free plan.
- **Where to find it:** Sidebar > Recents: a conversation row. Click the title to open it; the open one is highlighted. (labels found in the code)
- **Needs:** at least two conversations
- **Steps:**
  1. Sign in and look at the Recents list.
  2. Click a conversation title; the chat opens in the main view.
  3. Look at that row: it is highlighted as the current one.
  4. Click another row and confirm the highlight moves.

## S5.14 Project row.

- **Expected:** Navigation shows project rows that open the project (and expose its actions).
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/Sidebar.tsx:1354; packages/ui/ui/src/sidebar/Sidebar.tsx:1463; apps/web/shared/components/layout/WebAppShell.tsx:384
- **Where to find it:** Sidebar > Projects heading > a project row (click its name to open the project). Project actions: More options for the project > Project settings. (labels found in the code)
- **Needs:** at least one project
- **Steps:**
  1. Sign in with at least one project.
  2. Look under the Projects heading in the sidebar and click a project name.
  3. Confirm the project page opens.
  4. Click the More options control on the project row and look for Share project, Rename project, Project settings, Pin project, Delete project.

## S5.15 Task row.

- **Expected:** Background work/tasks appear as rows marked as tasks (distinct from chats) with their state, and open on selection.
- **Code:** done. Evidence moved: packages/ui/ui/src/sidebar/SessionItem.tsx:170 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:6971; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:891
- **Where to find it:** Sidebar > a chat row carrying the Work marker (a small dot, read as Work by screen readers). The full list is View all. (some labels not found in the code; trust the screen)
- **Needs:** a work-mode task already created in the account
- **Steps:**
  1. Sign in and find a chat row that is marked as work (small dot, not a plain chat).
  2. Click the row and confirm it opens.
  3. Click View all at the top of the Recents section and look for tasks in the list.
  4. Compare with Expected: task rows are marked apart from chats and open on selection.

## S5.16 Resource-type icon.

- **Expected:** Rows in mixed lists carry an icon (or equivalent marker) that tells the resource type apart (chat, project, task, file) visually and for assistive tech.
- **Code:** done. Evidence present: apps/web/shared/components/CommandPalette/CommandPalette.tsx:85; apps/web/shared/components/CommandPalette/CommandPalette.tsx:393; apps/web/shared/components/CommandPalette/CommandPalette.tsx:600
- **Where to find it:** Press Command+K (Ctrl+K). Type filter tabs: All, Chats, Projects, Files. (labels found in the code)
- **Needs:** at least one chat, project and file in the account
- **Steps:**
  1. Sign in and press Command+K (Ctrl+K on Windows).
  2. Look at the filter tabs under the search box: All, Chats, Projects, Files.
  3. Click Projects, then Files, and look at each result's type.
  4. Compare with Expected: each result shows its resource type so chat, project and file rows can be told apart.

## S5.17 Running-task indicator.

- **Expected:** Navigation marks items whose task or response is still running, visually and for screen readers.
- **Code:** done. Evidence present: apps/web/shared/components/layout/WebAppShell.tsx:265; apps/web/shared/components/layout/WebAppShell.tsx:280
- **Where to find it:** Sidebar > a chat row with a pulsing dot while its reply or task is running. (labels found in the code)
- **Needs:** a reply that takes time to run
- **Steps:**
  1. Sign in, start a message in one chat that takes a while to answer.
  2. Switch to another chat while the reply is still running.
  3. Look at the first chat's row in the sidebar for a pulsing dot.
  4. Wait for the reply to finish and confirm the dot goes away.

## S5.18 Needs-input indicator.

- **Expected:** Navigation marks items that are blocked waiting for the user (approval or input).
- **Code:** done. Evidence present: apps/web/lib/server/neon-chat.ts:69; apps/web/shared/components/layout/WebAppShell.tsx:281; apps/web/features/chat/pages/WebChatPage.tsx:6972; packages/ui/ui/src/sidebar/SessionItem.tsx:157; packages/ui/ui/src/sidebar/SessionItem.tsx:192
- **Where to find it:** Sidebar > a chat row with a yellow dot, meaning it needs you (approval or input). (labels found in the code)
- **Needs:** a chat or task that is waiting for approval or input
- **Steps:**
  1. Sign in and open a chat or task that asks you for approval or input.
  2. Look in the sidebar for a yellow dot on that row.
  3. Hover or focus the row and confirm the row is also announced as Needs you by a screen reader.
  4. Answer the request and confirm the dot goes away.

## S5.19 Unread-result indicator.

- **Expected:** Items with new results the user has not seen are marked unread (visually and for assistive tech) and clear when opened.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:194; packages/ui/ui/src/sidebar/SessionItem.tsx:254
- **Where to find it:** Sidebar > chat row > ⋯ More options > Mark as unread. The dot clears when you open the row. (labels found in the code)
- **Needs:** at least one conversation
- **Steps:**
  1. Sign in and hover a chat row in the sidebar.
  2. Click the ⋯ More options button, then Mark as unread.
  3. Look for a small blue dot on the row and check its name in a screen reader (Unread).
  4. Click the row to open it and confirm the dot clears.

## S5.20 Item overflow menu.

- **Expected:** Each row has an overflow (⋯) menu with its actions (share, rename, pin, archive, move, delete).
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:308; packages/ui/ui/src/sidebar/SessionItem.tsx:353
- **Where to find it:** Sidebar > chat row > ⋯ More options. Items: Share, Rename, Pin, Mark as unread, Archive, Delete, Move to project. (labels found in the code)
- **Needs:** at least one conversation; Move to project needs a project
- **Steps:**
  1. Sign in and hover a chat row so the ⋯ More options button appears.
  2. Click ⋯ More options.
  3. Look for Share, Rename, Pin, Mark as unread, Archive, Delete and Move to project.
  4. Press Escape to close the menu without choosing anything.

## S5.21 Inline rename field.

- **Expected:** A row can be renamed in place (inline field, Enter to save, Escape to cancel) and the new title persists.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:218; packages/ui/ui/src/sidebar/SessionItem.tsx:113; apps/web/shared/components/layout/WebAppShell.tsx:345
- **Where to find it:** Sidebar > double-click a chat row title, or chat row > ⋯ More options > Rename. (labels found in the code)
- **Needs:** at least one conversation
- **Steps:**
  1. Sign in and double-click a chat title in the sidebar (or open ⋯ More options > Rename).
  2. Type a new title in the text box that appears.
  3. Press Enter; confirm the new title shows in the row.
  4. Reload the page and confirm the new title is still there. Repeat with Escape to check it cancels.

## S5.25 Back and forward navigation.

- **Expected:** Back and forward navigation move through the user's in-app history.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:250; apps/web/shared/components/layout/WebAppShell.tsx:328
- **Where to find it:** Browser toolbar Back and Forward buttons (the app has no button of its own for this). (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Sign in and open one chat, then open a second chat from the sidebar.
  2. Click the browser Back button and confirm the first chat opens again.
  3. Click the browser Forward button and confirm the second chat opens.
  4. Compare with Expected: moves through the in-app history.

## S5.26 Global command palette.

- **Expected:** A global command palette (keyboard-invoked) searches and runs app commands and destinations.
- **Code:** done. Evidence present: apps/web/shared/components/CommandPalette/CommandPaletteProvider.tsx:16; apps/web/shared/components/CommandPalette/CommandPalette.tsx:234; apps/web/app/AppRuntimeMounts.tsx:21
- **Where to find it:** Press Command+K (Ctrl+K on Windows). The palette opens with a search box and a Commands list. (labels found in the code)
- **Steps:**
  1. Sign in and press Command+K (Ctrl+K on Windows).
  2. Look for the search box with the placeholder Search chats and actions.
  3. Type New chat and press Enter to run it.
  4. Press Command+K again and confirm it closes.

## S5.27 Keyboard-shortcut help.

- **Expected:** A keyboard-shortcut help view lists the available shortcuts and is reachable from the app.
- **Code:** done. Evidence present: apps/web/shared/components/layout/AccountMenuItems.tsx:111; apps/web/shared/components/layout/WebAppShell.tsx:623
- **Earlier check in the running app:** PARTIAL: E007 [PARTIAL; interaction]: Shortcut dialog renders grouped shortcuts with macOS modifier labels and enabled states; preferences were not changed. Opening the dialog logs React invalid nesting: div inside p (hydration warning).
- **Where to find it:** Account menu (bottom of sidebar) > Get help > Keyboard shortcuts. Or press / on the keyboard. (labels found in the code)
- **Steps:**
  1. Sign in and click your account row at the bottom of the sidebar.
  2. Hover or click Get help, then click Keyboard shortcuts.
  3. Look for a dialog titled Keyboard Shortcuts listing grouped shortcuts.
  4. Press Escape to close it and compare with Expected.

## S5.28 Notification center.

- **Expected:** A notification center lists account notifications, shows an unread count, and lets the user open and mark them read.
- **Code:** done. Evidence moved: apps/web/shared/components/layout/SidebarBrandRow.tsx:10; apps/web/features/notifications/components/NotificationBell.tsx:85 (quoted code not found in the file now)
- **Where to find it:** Sidebar top, next to the AGI wordmark: the bell button. Panel title: Notifications. (labels found in the code)
- **Needs:** an account with at least one notification
- **Steps:**
  1. Sign in and look at the top of the sidebar for the bell button.
  2. Click the bell; a Notifications panel opens.
  3. Look for the unread count in the bell's label and the list of notifications.
  4. Click Mark all as read and confirm the unread count clears.

## S5.29 User/profile menu.

- **Expected:** A user/profile menu shows who is signed in and offers account actions (settings, plan, sign out).
- **Code:** done. Evidence present: apps/web/shared/components/layout/WebAppShell.tsx:531; apps/web/shared/components/layout/AccountMenuItems.tsx:82; apps/web/shared/components/layout/AccountMenuItems.tsx:159
- **Earlier check in the running app:** PASS: E006 [PASS; interaction]: Account menu opens with workspace, settings, support, shortcuts, upgrades, and policy destinations. No account/security mutation performed.
- **Where to find it:** Bottom of the sidebar: the account row (name and plan) opens the account menu: Workspace, Settings, Get help, Upgrade, Log out. (labels found in the code)
- **Steps:**
  1. Sign in and look at the bottom of the left sidebar for your name and plan.
  2. Click the account row.
  3. Look for Workspace, Settings, Get help, Upgrade and Log out in the menu.
  4. Click Settings to check it opens, then come back; do not click Log out unless the test is meant to sign out.

## S5.30 Help menu.

- **Expected:** A help menu gathers help centre, support contact, feedback and shortcuts in one place.
- **Code:** done. Evidence present: apps/web/shared/components/layout/AccountMenuItems.tsx:95; apps/web/shared/components/layout/WebAppShell.tsx:514
- **Earlier check in the running app:** PASS: E006 [PASS; interaction]: Account menu opens with workspace, settings, support, shortcuts, upgrades, and policy destinations. No account/security mutation performed.
- **Where to find it:** Account menu (bottom of sidebar) > Get help > Get help, Email support, Send feedback, Keyboard shortcuts. (labels found in the code)
- **Steps:**
  1. Click the account row at the bottom of the sidebar.
  2. Hover or click Get help to open its submenu.
  3. Look for Get help, Email support, Send feedback and Keyboard shortcuts.
  4. Click Get help and confirm a help page or panel opens, then compare with Expected.

## S5.31 Upgrade entry.

- **Expected:** A visible Upgrade entry in the shell takes an eligible user into the plan upgrade flow.
- **Code:** partial. Evidence moved: apps/web/lib/server/billing-waitlist-access.ts:22 (quoted code not found in the file now)
- **Known to be unfinished:** owner-held (lead ruling 2026-09-28): the billing waitlist stays on by owner decision; paid checkout, portal and store purchases need a redeemed access code. aaae88832e added AGI_BILLING_WAITLIST_OPEN, which stays unset at deploy until the owner opens paid upgrades
- **Earlier check in the running app:** UI_ONLY: E006 [UI_ONLY; visible UI]: Account menu opens with workspace, settings, support, shortcuts, upgrades, and policy destinations. No account/security mutation performed.
- **Where to find it:** Sidebar footer > "Free plan" row > "Upgrade" (Free account). Paid accounts below the top plan: account button at the sidebar bottom ("Account menu for <name>") > "Upgrade". (labels found in the code)
- **Needs:** a Free account (for the sidebar row); a paid account below the top plan (for the account-menu item)
- **Steps:**
  1. Sign in with a Free account and stay on the first screen (/chat).
  2. Look at the bottom of the left sidebar for the "Free plan" row.
  3. Click "Upgrade" on that row.
  4. Compare with Expected: the plan upgrade flow opens. If paid upgrades are closed for this account, a waitlist or access-code message appears instead of checkout.

## S5.32 Connection-status indicator.

- **Expected:** A status indicator shows whether the app is connected to its backend/runtime and offers reconnect when not.
- **Code:** done. Evidence moved: apps/web/app/AppRuntimeMounts.tsx:22 (quoted code not found in the file now); apps/web/shared/components/OfflineIndicator.tsx:42
- **Where to find it:** Mac Wi-Fi off > a status box under the top header reads "Offline". Reconnect control: "Retry" appears in that box only after a failed sync. (labels found in the code)
- **Needs:** a Mac where Wi-Fi can be switched off and on
- **Steps:**
  1. Sign in and stay on /chat.
  2. Turn Wi-Fi off on the Mac (menu bar Wi-Fi icon).
  3. Look for the status box under the top header that reads "Offline".
  4. Turn Wi-Fi back on and compare with Expected: the box clears. There is no reconnect button while offline; "Retry" appears only when a sync has failed.

## S5.33 Offline indicator.

- **Expected:** When the device loses network, a visible offline indicator appears and clears when back online.
- **Code:** done. Evidence moved: apps/web/app/AppRuntimeMounts.tsx:22 (quoted code not found in the file now); apps/web/shared/components/OfflineIndicator.tsx:13
- **Where to find it:** Mac Wi-Fi off > a status box under the top header reads "Offline"; when Wi-Fi is back on the box clears. (labels found in the code)
- **Needs:** a Mac where Wi-Fi can be switched off and on
- **Steps:**
  1. Sign in and stay on /chat.
  2. Turn Wi-Fi off on the Mac.
  3. Look for the status box under the top header with the text "Offline".
  4. Turn Wi-Fi back on and compare with Expected: the box disappears once back online with nothing waiting. If items were queued, the box shows "Syncing…" first.

## S5.35 Mobile navigation drawer.

- **Expected:** On narrow screens navigation lives in a slide-in drawer opened from a header button, with focus management and dismissal.
- **Code:** done. Evidence present: apps/web/shared/components/layout/WebAppShell.tsx:692; apps/web/shared/components/layout/WebAppShell.tsx:653
- **Where to find it:** Browser window narrower than 768 px wide > top-left menu icon button (accessible name "Open navigation") > the navigation slides in from the left. (labels found in the code)
- **Needs:** a browser window that can be resized narrower than 768 px (phone width also works)
- **Steps:**
  1. Sign in and narrow the browser window to about 400 px wide.
  2. Find the menu icon at the left of the top header and click it.
  3. Compare with Expected: the navigation slides in from the left as a drawer over the content.
  4. Close it with the Escape key or by clicking outside the drawer, and check that focus returns to the menu icon.

## S5.37 Tablet split-navigation layout.

- **Expected:** On tablet widths navigation and content sit side by side (persistent or rail sidebar) instead of a phone drawer.
- **Code:** done. Evidence present: apps/web/shared/components/layout/app-shell-layout.ts:38; apps/web/shared/components/layout/WebAppShell.tsx:631
- **Where to find it:** no screen of its own. This is a layout rule in apps/web/shared/components/layout/app-shell-layout.ts (resolveShellLayout) and WebAppShell.tsx, with no control of its own; the window must be at least 768 px wide to be classed as tablet.
- **Needs:** a browser window that can be resized to tablet widths
- **Steps:**
  1. Sign in and resize the browser window to about 900 px wide by 600 px tall.
  2. Check that the navigation sits beside the chat content with no top-left menu button.
  3. Resize to about 800 px wide by 1000 px tall and check that the navigation shrinks to an icon rail.
  4. Compare with Expected: on tablet widths navigation and content sit side by side, and not as a phone drawer.

## S5.38 Resource deep links.

- **Expected:** Each resource (conversation, project, task) has a stable link that opens it directly in the app.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:250; apps/web/app/open/[target]/[id]/page.tsx:28
- **Earlier check in the running app:** PASS: E002 [PASS; interaction]: Expand control reveals dated history groups, conversation links and Free plan.
- **Where to find it:** Sidebar > a conversation title (opens it); the conversation's own page address is its stable link. Open a product link at /open/<target>/<id> by typing it in the address bar. (path not confirmed in the code; trust the screen)
- **Needs:** a conversation in the account (the sidebar must show at least one)
- **Steps:**
  1. Sign in and click a conversation title in the sidebar.
  2. Read the address in the browser address bar and copy it.
  3. Open a new browser window, paste the address and press Return.
  4. Compare with Expected: the same conversation opens directly. A product link at /open/chat/<id> either redirects to the conversation or shows an unavailable screen.

## S5.39 Route-level loading and unavailable-resource screens.

- **Expected:** Routes show a loading state while resolving and a clear not-found/unavailable screen for missing or forbidden resources.
- **Code:** done. Evidence present: apps/web/app/chat/loading.tsx:4; apps/web/app/chat/not-found.tsx:1; apps/web/features/notifications/components/ProductLinkUnavailable.tsx:18
- **Where to find it:** Address bar: go to /open/chat/<id> with an id that does not exist > "This chat isn’t available" with a "Back to chats" button. The loading state shows "Loading chat" while /chat resolves. (labels found in the code)
- **Needs:** a signed-in account (any Free account works)
- **Steps:**
  1. Sign in, then type the address of a non-existent chat link in the address bar: /open/chat/does-not-exist-1.
  2. Compare with Expected: an unavailable screen appears with the title "This chat isn’t available" and a "Back to chats" button.
  3. Reload /chat and watch for a brief "Loading chat" line while the route resolves.
  4. Click "Back to chats" and check that it returns to the chat list.
