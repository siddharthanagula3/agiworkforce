---
id: "PLAN-mobile-005"
type: "test-plan"
title: "Mobile · 5. Application shell and navigation components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "5"
---
# Mobile · 5. Application shell and navigation components

29 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S5.01 Application header.

- **Expected:** A persistent top header shows where the user is (brand/conversation title) and the primary actions for the current view.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/chat.tsx:1246; apps/mobile/app/(app)/(tabs)/chat.tsx:787 (quoted code not found in the file now)
- **Where to find it:** Chat tab top bar on the first screen after sign-in: 'Open navigation drawer' button at the left, 'Chat or Work' switch in the middle, temporary chat toggle at the right (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and open the Chat tab (first screen).
  2. Look at the top bar: menu button at the left, Chat/Work switch in the middle, temporary chat toggle at the right.
  3. Tap the menu button to open the drawer and check the shell is still shown.
  4. Compare with Expected: a persistent header with the primary actions for this view.

## S5.02 Product or mode switcher.

- **Expected:** A control lets the user switch between product areas or modes (chat, projects, code, work, etc.) from the shell.
- **Code:** done. Evidence moved: apps/mobile/src/features/drawer/components/DrawerContent.tsx:109; apps/mobile/src/features/drawer/components/DrawerContent.tsx:424 (quoted code not found in the file now); apps/mobile/src/features/drawer/components/DrawerContent.tsx:635
- **Where to find it:** Open navigation drawer > 'Local' / 'Cloud' switch at the top of the drawer; product areas are in the drawer list below (labels found in the code)
- **Needs:** a signed-in account; Cloud needs an account with cloud unlocked
- **Steps:**
  1. Tap the button labelled 'Open navigation drawer'.
  2. Look at the switch under the search icon: it shows 'Local' and 'Cloud'.
  3. Tap 'Cloud' (or 'Local') and watch the drawer list and the Chat screen change.
  4. Compare with Expected: the user can switch between product areas or modes from the shell.

## S5.04 Workspace switcher.

- **Expected:** From the shell, the user can see the active workspace and switch between personal and team workspaces.
- **Code:** done. Evidence gone: apps/mobile/src/features/drawer/components/DrawerContent.tsx:737 (quoted code not found in the file now); apps/mobile/src/features/team/useWorkspaceSwitcher.ts:12 (file no longer exists); apps/mobile/src/features/team/switchWorkspace.ts:5
- **Where to find it:** Settings > 'Workspace' > 'Personal' row and any team rows (not in the drawer) (labels found in the code)
- **Needs:** a Cloud account; a team workspace in the same account to see a second row
- **Steps:**
  1. Open the drawer with 'Open navigation drawer' and tap 'Settings'.
  2. Tap the 'Workspace' row.
  3. Look at the list: 'Personal' plus any team workspaces, and which one is active.
  4. Tap another workspace row and check for the 'Workspace changed' alert, then compare with Expected.

## S5.05 Sidebar expand/collapse control.

- **Expected:** A control collapses the navigation sidebar to a rail (or hides it) and expands it again.
- **Code:** done. Evidence present: apps/mobile/src/shared/components/DrawerButton.tsx:88; apps/mobile/app/(app)/(tabs)/chat.tsx:1246
- **Where to find it:** 'Open navigation drawer' button at the top left of the Chat tab (opens and closes the drawer) (labels found in the code)
- **Needs:** phone width (on a wide window the sidebar is permanent)
- **Steps:**
  1. Tap the button labelled 'Open navigation drawer' to open the sidebar.
  2. Tap outside the drawer or swipe it closed to hide it.
  3. Tap the button again to expand it.
  4. Compare with Expected: the navigation hides and expands again.

## S5.07 Sidebar search input.

- **Expected:** The navigation sidebar has a search entry that filters or searches conversations.
- **Code:** done. Evidence moved: apps/mobile/src/features/drawer/components/DrawerContent.tsx:402 (quoted code not found in the file now); apps/mobile/src/features/drawer/components/DrawerContent.tsx:304 (quoted code not found in the file now)
- **Where to find it:** Open navigation drawer > 'Search' icon at the top right of the drawer (opens the Search screen, not an inline filter) (labels found in the code)
- **Needs:** a signed-in account with some chats
- **Steps:**
  1. Tap the button labelled 'Open navigation drawer'.
  2. Tap the search icon at the top right of the drawer.
  3. Type part of a chat title in the search field.
  4. Compare with Expected: results filter to matching conversations.

## S5.08 New-chat action.

- **Expected:** A persistent New chat action starts a fresh conversation from anywhere in the shell.
- **Code:** done. Evidence moved: apps/mobile/src/features/drawer/components/DrawerContent.tsx:405 (quoted code not found in the file now); apps/mobile/src/features/drawer/components/DrawerContent.tsx:422
- **Where to find it:** Open navigation drawer > 'New chat' (first row in the drawer list) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap the button labelled 'Open navigation drawer'.
  2. Tap 'New chat'.
  3. Look at the Chat screen: a new empty chat should open.

## S5.09 Pinned-item section.

- **Expected:** Pinned items appear in their own section at the top of navigation.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/ChatsListScreen.tsx:148; apps/mobile/src/features/drawer/components/DrawerContent.tsx:321 (quoted code not found in the file now)
- **Where to find it:** Open navigation drawer > 'Pinned' heading (appears after the Projects section, above 'Recents') (labels found in the code)
- **Needs:** a chat to pin
- **Steps:**
  1. Long press a chat row in the drawer and choose 'Pin'.
  2. Tap the button labelled 'Open navigation drawer'.
  3. Look for the 'Pinned' heading and the pinned chat under it.
  4. Compare with Expected: pinned items sit in their own section.

## S5.10 Recent-item section.

- **Expected:** Navigation shows a list of recent conversations that open on selection.
- **Code:** done. Evidence present: apps/mobile/src/features/drawer/components/DrawerContent.tsx:509; apps/mobile/src/features/drawer/components/DrawerContent.tsx:412
- **Where to find it:** Open navigation drawer > 'Recents' heading and its chat rows (labels found in the code)
- **Needs:** a signed-in account with chats
- **Steps:**
  1. Tap the button labelled 'Open navigation drawer'.
  2. Find the 'Recents' heading.
  3. Tap a conversation row under it.
  4. Compare with Expected: the conversation opens.

## S5.11 Project-grouped recents.

- **Expected:** Recent conversations can be shown grouped under their projects in navigation.
- **Code:** done. Evidence present: apps/mobile/src/features/drawer/components/DrawerContent.tsx:764; apps/mobile/src/features/drawer/components/DrawerContent.tsx:484
- **Where to find it:** Open navigation drawer > 'Projects' heading > project name > chevron 'Show chats in' the project (labels found in the code)
- **Needs:** a project with chats in it
- **Steps:**
  1. Tap the button labelled 'Open navigation drawer'.
  2. Under 'Projects', tap the chevron beside a project that has chats.
  3. Look for the chats listed under that project and the 'See all' link.
  4. Compare with Expected: recent chats are shown grouped under their projects.

## S5.12 Date-grouped recents.

- **Expected:** Recent conversations are grouped by date buckets (Today, Yesterday, This week, Older).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/ChatsListScreen.tsx:158; apps/mobile/src/features/chat/ChatsListScreen.tsx:7
- **Where to find it:** Open navigation drawer > 'See all chats' > the chats list with headings 'Pinned', 'Today', 'Yesterday', 'This Week', 'Older' (labels found in the code)
- **Needs:** chats from several days
- **Steps:**
  1. Tap the button labelled 'Open navigation drawer'.
  2. Tap 'See all chats' at the bottom of Recents.
  3. Look at the date headings on the chats list.
  4. Compare with Expected: Today, Yesterday, This week, Older.

## S5.13 Conversation row.

- **Expected:** Each conversation row shows its title, indicates the active one, and opens the conversation.
- **Code:** done. Evidence present: apps/mobile/src/features/drawer/components/DrawerContent.tsx:517; apps/mobile/src/features/drawer/components/DrawerContent.tsx:509
- **Where to find it:** Open navigation drawer > a chat title under 'Recents' or 'Pinned' (labels found in the code)
- **Needs:** a signed-in account with at least two chats
- **Steps:**
  1. Tap the button labelled 'Open navigation drawer'.
  2. Look at a conversation row: its title, a dot if unread, a pin icon if pinned.
  3. Tap the active-looking row and note its highlight.
  4. Tap another row and check that the chat opens and the highlight moves.

## S5.14 Project row.

- **Expected:** Navigation shows project rows that open the project (and expose its actions).
- **Code:** done. Evidence present: apps/mobile/src/features/drawer/components/DrawerContent.tsx:734; apps/mobile/src/features/drawer/components/DrawerContent.tsx:457
- **Where to find it:** Open navigation drawer > 'Projects' heading > a project name (labels found in the code)
- **Needs:** a project
- **Steps:**
  1. Tap the button labelled 'Open navigation drawer'.
  2. Tap a project name under 'Projects'.
  3. Look at the project page that opens.
  4. Compare with Expected: the project opens.

## S5.15 Task row.

- **Expected:** Background work/tasks appear as rows marked as tasks (distinct from chats) with their state, and open on selection.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/CloudRunCard.tsx:63; apps/mobile/src/features/drawer/components/DrawerContent.tsx:142; apps/mobile/src/features/tasks/components/CloudRunCard.tsx:51
- **Where to find it:** Open navigation drawer > 'More' > 'AGI Work' (labels found in the code)
- **Needs:** a Cloud account with AGI Work enabled
- **Steps:**
  1. Tap the button labelled 'Open navigation drawer'.
  2. Tap 'More' if needed, then tap 'AGI Work'.
  3. Look at the task cards: each shows its state and origin.
  4. Tap a card and check that the task opens.

## S5.16 Resource-type icon.

- **Expected:** Rows in mixed lists carry an icon (or equivalent marker) that tells the resource type apart (chat, project, task, file) visually and for assistive tech.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/ChatsListScreen.tsx:90; apps/mobile/src/features/chat/ChatsListScreen.tsx:596
- **Where to find it:** Open navigation drawer > 'Search' icon > type a word; result rows show a kind icon (chat, project, file, library, artifact, destination) (labels found in the code)
- **Needs:** a signed-in account with chats or projects
- **Steps:**
  1. Tap the button labelled 'Open navigation drawer'.
  2. Tap the search icon, then type a word.
  3. Look at the icon at the left of each result row.
  4. Compare with Expected: each row shows its resource type.

## S5.17 Running-task indicator.

- **Expected:** Navigation marks items whose task or response is still running, visually and for screen readers.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/runPresentation.ts:26; apps/mobile/src/features/tasks/components/CloudRunCard.tsx:63
- **Where to find it:** Open navigation drawer > 'More' > 'AGI Work' > 'Running' filter (labels found in the code)
- **Needs:** a Cloud account with a running task
- **Steps:**
  1. Start a cloud task that is running.
  2. Open the drawer, tap 'More' if needed, then 'AGI Work'.
  3. Tap the 'Running' filter.
  4. Compare with Expected: the running task is marked as running, and its card label includes the state.

## S5.18 Needs-input indicator.

- **Expected:** Navigation marks items that are blocked waiting for the user (approval or input).
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/runPresentation.ts:23; apps/mobile/src/features/tasks/runPresentation.ts:82
- **Where to find it:** Open navigation drawer > 'More' > 'AGI Work' > 'Needs you' filter (labels found in the code)
- **Needs:** a Cloud task waiting for approval or input
- **Steps:**
  1. Open the drawer, tap 'More' if needed, then 'AGI Work'.
  2. Tap the 'Needs you' filter.
  3. Look for a card with a warning border and the line 'Waiting for your approval' or 'Waiting for connector input'.
  4. Compare with Expected: blocked items are marked.

## S5.19 Unread-result indicator.

- **Expected:** Items with new results the user has not seen are marked unread (visually and for assistive tech) and clear when opened.
- **Code:** done. Evidence present: apps/mobile/src/features/conversation-actions/useConversationActions.ts:284; apps/mobile/stores/chat/chatMessageStore.ts:400; apps/mobile/stores/chat/chatCloudMessageStore.ts:147
- **Where to find it:** Open navigation drawer > a chat row with a dot; or 'See all chats' > 'Unread' filter (labels found in the code)
- **Needs:** a chat with a new reply you have not opened
- **Steps:**
  1. Open the drawer and find a row with a small dot (unread).
  2. Long press the row and tap 'Mark as read'.
  3. Look again: the dot should be gone.
  4. Compare with Expected: unread marker clears when read.

## S5.20 Item overflow menu.

- **Expected:** Each row has an overflow (⋯) menu with its actions (share, rename, pin, archive, move, delete).
- **Code:** done. Evidence present: apps/mobile/src/features/conversation-actions/useConversationActions.ts:263; apps/mobile/src/features/conversation-actions/useConversationActions.ts:279; apps/mobile/stores/chat/chatMessageStore.ts:994
- **Where to find it:** Open navigation drawer > long press a chat row (actions sheet); or 'See all chats' > the row's 'More actions for' button (labels found in the code)
- **Needs:** a signed-in account with chats; Archive and Share show only for Cloud chats
- **Steps:**
  1. Long press a chat row in the drawer.
  2. Read the actions: Rename, Pin, Move to project, Duplicate, Mark as read, Archive (Cloud), Delete.
  3. Or open 'See all chats' and tap the row's 'More actions for' button.
  4. Compare with Expected: share, rename, pin, archive, move and delete are present.

## S5.21 Inline rename field.

- **Expected:** A row can be renamed in place (inline field, Enter to save, Escape to cancel) and the new title persists.
- **Code:** done. Evidence present: apps/mobile/src/features/conversation-actions/RenameConversationModal.tsx:316
- **Where to find it:** Open navigation drawer > long press a chat row > 'Rename'; the title becomes an editable 'Chat title' field (labels found in the code)
- **Needs:** a signed-in account with a chat
- **Steps:**
  1. Long press a chat row in the drawer.
  2. Tap 'Rename'.
  3. Type a new title and press the Done key on the keyboard.
  4. Compare with Expected: the new title shows in the row and persists after reopening.

## S5.25 Back and forward navigation.

- **Expected:** Back and forward navigation move through the user's in-app history.
- **Code:** done. Evidence present: apps/mobile/src/shared/hooks/useGoBack.ts:6; apps/mobile/app/_layout.tsx:944
- **Where to find it:** 'Go back' button on screens that have one (for example the Notifications screen); Android hardware back button (labels found in the code)
- **Steps:**
  1. Open Settings, then open a sub-page such as Workspace.
  2. Tap the back control at the top left (labelled 'Go back' on screens that set it) or swipe from the left edge on iPhone.
  3. Look at the screen: it should return to the previous screen.
  4. Look for a forward control: none was found in the code read.

## S5.28 Notification center.

- **Expected:** A notification center lists account notifications, shows an unread count, and lets the user open and mark them read.
- **Code:** done. Evidence moved: apps/mobile/src/features/drawer/components/DrawerContent.tsx:560 (quoted code not found in the file now); apps/mobile/app/(app)/notifications/index.tsx:167 (quoted code not found in the file now)
- **Where to find it:** Open navigation drawer > search icon > type 'Notifications' > the 'Notifications' result (phone); on tablet the 'Open notifications' pip button (labels found in the code)
- **Needs:** an account with notifications
- **Steps:**
  1. Open the drawer and tap the search icon.
  2. Type 'Notifications' and tap the result.
  3. Look at the list: unread rows are marked 'Unread,' in their label.
  4. Tap 'Mark as read' on a row, or 'Mark all as read', and check the unread state clears.

## S5.29 User/profile menu.

- **Expected:** A user/profile menu shows who is signed in and offers account actions (settings, plan, sign out).
- **Code:** done. Evidence moved: apps/mobile/src/features/drawer/components/DrawerContent.tsx:406 (quoted code not found in the file now); apps/mobile/app/(app)/profile/index.tsx:1
- **Where to find it:** Open navigation drawer > 'Settings' > the profile header at the top > 'Profile' screen (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Tap the button labelled 'Open navigation drawer', then tap 'Settings'.
  2. Tap your profile header at the top of Settings.
  3. Look at the 'Profile' screen: 'Chats' and 'Messages' counts and the AGI Cloud section with 'Subscription' and 'Log Out'.
  4. Tap 'Log Out' and check the confirmation text, then dismiss it without confirming. Compare with Expected.

## S5.30 Help menu.

- **Expected:** A help menu gathers help centre, support contact, feedback and shortcuts in one place.
- **Code:** done. Evidence present: apps/mobile/app/(app)/about.tsx:275
- **Where to find it:** Settings > 'About' > 'Support' section ('Help Center', 'Service Status', 'Report App Issue') (labels found in the code)
- **Steps:**
  1. Open the drawer, tap 'Settings', then 'About'.
  2. Look at the 'Support' section.
  3. Tap 'Report App Issue' to check that the feedback form opens, then go back.
  4. Compare with Expected: help centre, support contact, feedback and shortcuts are in one place.

## S5.31 Upgrade entry.

- **Expected:** A visible Upgrade entry in the shell takes an eligible user into the plan upgrade flow.
- **Code:** partial. Evidence present: apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:188; apps/mobile/lib/v1FeatureFlags.ts:6
- **Known to be unfinished:** Owner hold: billing waitlist stays on (rulings, w-auth sweep); Upgrade leads to the subscription screen until FEATURES.billing is on.
- **Where to find it:** Open navigation drawer > 'Upgrade' chip at the bottom of the drawer, next to 'Settings' (labels found in the code)
- **Needs:** a Free account signed in on a build with native purchases, in Cloud mode
- **Steps:**
  1. Sign in to a Free Cloud account and switch the drawer to Cloud.
  2. Open the drawer and look at the bottom: 'Upgrade' appears beside 'Settings'.
  3. Tap 'Upgrade'.
  4. Compare with Expected: the plan upgrade flow opens (currently the Subscription screen).

## S5.33 Offline indicator.

- **Expected:** When the device loses network, a visible offline indicator appears and clears when back online.
- **Code:** done. Evidence present: apps/mobile/app/_layout.tsx:113; apps/mobile/app/_layout.tsx:1006
- **Where to find it:** Any screen after sign-in: turn off the device's Wi-Fi or network (labels found in the code)
- **Needs:** a device or simulator whose network you can switch off
- **Steps:**
  1. Turn off Wi-Fi or mobile data on the device.
  2. Look at the top of the screen for the banner.
  3. Turn the network back on.
  4. Compare with Expected: the banner clears when back online.

## S5.35 Mobile navigation drawer.

- **Expected:** On narrow screens navigation lives in a slide-in drawer opened from a header button, with focus management and dismissal.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/_layout.tsx:20 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:1246
- **Where to find it:** Any main screen on a phone-width window (for example Chat) > tap the menu button at the top left of the header, labelled "Open navigation drawer" for screen readers (labels found in the code)
- **Needs:** a Free or paid account signed in; phone width (below the tablet split-view threshold)
- **Steps:**
  1. Sign in and open the Chat screen on a phone-width window (or an iPhone).
  2. Tap the menu button at the top left of the header. It has no visible words; its accessibility label is "Open navigation drawer".
  3. Check that navigation slides in from the left as a drawer over the content.
  4. Press Escape on a keyboard, or tap the dimmed area beside the drawer, or use the Back gesture or key.
  5. Check that the drawer closes and focus returns to the content behind it, as Expected says.

## S5.37 Tablet split-navigation layout.

- **Expected:** On tablet widths navigation and content sit side by side (persistent or rail sidebar) instead of a phone drawer.
- **Code:** done. Evidence present: apps/mobile/app/(app)/_layout.tsx:44; apps/mobile/app/(app)/_layout.tsx:58
- **Where to find it:** no screen of its own. This is a layout rule with no control of its own: src/shared/hooks/useResponsiveLayout.ts sets usesPersistentDrawer when the viewport is wide enough for the drawer width plus a minimum content width, and app/(app)/_layout.tsx uses drawerType 'permanent' when it is true. I did not read the exact width constants in this pass, and I did not confirm whether the menu button is hidden on the permanent sidebar.
- **Needs:** a tablet, or a window wide enough for the permanent sidebar
- **Steps:**
  1. Open the app on an iPad, or resize the window to a wide size.
  2. Sign in and look at the left edge of the Chat screen.
  3. Check that the navigation list stays visible next to the content.
  4. Make the window narrow again and check that navigation returns to a slide-in drawer.

## S5.38 Resource deep links.

- **Expected:** Each resource (conversation, project, task) has a stable link that opens it directly in the app.
- **Code:** done. Evidence present: apps/mobile/app.config.js:160; apps/mobile/src/features/drawer/components/DrawerContent.tsx:509; apps/mobile/app.config.js:346
- **Where to find it:** Open a temporary cloud chat > its menu > "Share link"; then open the copied link on the phone (the https://agiworkforce.com/open/... address opens the app) (labels found in the code)
- **Needs:** a paid or Cloud account; a temporary cloud chat; a second app to open the link from (for example Notes)
- **Steps:**
  1. Sign in with Cloud mode on, and open a temporary cloud chat.
  2. Open the chat's action menu from the screen header.
  3. Tap "Share link" and copy the link that appears.
  4. Open that link on the phone, or in another app that opens links.
  5. Check that the same chat opens directly in the app, as Expected says.

## S5.39 Route-level loading and unavailable-resource screens.

- **Expected:** Routes show a loading state while resolving and a clear not-found/unavailable screen for missing or forbidden resources.
- **Code:** done. Evidence present: apps/mobile/app/+not-found.tsx:7; apps/mobile/app/(app)/_layout.tsx:17
- **Where to find it:** Open a chat or project that is gone or not in this account (for example from an old link) > "This chat is not available" or "Project unavailable" message; an address the app does not have > "Page Not Found" with "Go Home" (labels found in the code)
- **Needs:** a second account, or a conversation or project that was deleted; for the missing page, a way to open an unknown address
- **Steps:**
  1. Sign in with an account that cannot see a chat or project (or use one that was deleted).
  2. Open that chat or project from its link.
  3. Look for the loading state first ("Loading Cloud project" or the message skeleton), then for the unavailable screen.
  4. Check that the message on screen matches Expected: a clear unavailable message, not a blank screen.
  5. For a missing page, open an address the app does not have and check that "Page Not Found" appears with a "Go Home" button.
