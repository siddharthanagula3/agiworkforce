# Area 5. Application shell and navigation components

39 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S5.01 Application header.
- Should: A persistent top header shows where the user is (brand/conversation title) and the primary actions for the current view.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5696; apps/web/features/chat/pages/WebChatPage.tsx:5706; apps/mobile/app/(app)/(tabs)/chat.tsx:783; apps/mobile/app/(app)/(tabs)/chat.tsx:787; apps/cli/src/tui/tui_app.rs:1374; apps/cli/src/tui/tui_app.rs:1172; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2174; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4059

## S5.02 Product or mode switcher.
- Should: A control lets the user switch between product areas or modes (chat, projects, code, work, etc.) from the shell.
- Status: web done, desktop done, mobile done, chrome done
- Code: apps/web/shared/components/layout/app-nav-items.ts:88; packages/ui/ui/src/sidebar/Sidebar.tsx:555; apps/web/shared/components/layout/WebAppShell.tsx:436; apps/mobile/src/features/drawer/components/DrawerContent.tsx:80; apps/mobile/src/features/drawer/components/DrawerContent.tsx:424; apps/mobile/src/features/drawer/components/DrawerContent.tsx:635; apps/extension/src/side_panel.ts:8511; apps/extension/src/side_panel.ts:8599

## S5.03 Account switcher.
- Should: The user can switch between two or more signed-in accounts without signing out.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S5.04 Workspace switcher.
- Should: From the shell, the user can see the active workspace and switch between personal and team workspaces.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/shared/components/layout/AccountMenuItems.tsx:74; apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:85; apps/mobile/src/features/drawer/components/DrawerContent.tsx:737; apps/mobile/src/features/team/useWorkspaceSwitcher.ts:12; apps/mobile/src/features/team/switchWorkspace.ts:5

## S5.05 Sidebar expand/collapse control.
- Should: A control collapses the navigation sidebar to a rail (or hides it) and expands it again.
- Status: web done, desktop done, mobile done
- Code: packages/ui/ui/src/sidebar/Sidebar.tsx:530; packages/ui/ui/src/sidebar/Sidebar.tsx:465; apps/web/shared/components/layout/WebAppShell.tsx:637; apps/mobile/src/shared/components/DrawerButton.tsx:10; apps/mobile/app/(app)/(tabs)/chat.tsx:787

## S5.06 Sidebar resize handle.
- Should: A drag handle lets the user resize the navigation sidebar width, and the width persists.
- Status: web missing, desktop missing

## S5.07 Sidebar search input.
- Should: The navigation sidebar has a search entry that filters or searches conversations.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/ui/src/sidebar/Sidebar.tsx:576; apps/web/shared/components/layout/WebAppShell.tsx:625; apps/mobile/src/features/drawer/components/DrawerContent.tsx:402; apps/mobile/src/features/drawer/components/DrawerContent.tsx:304; apps/cli/src/tui/tui_app.rs:2883; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2253; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4152; apps/extension/src/side_panel.ts:6717

## S5.08 New-chat action.
- Should: A persistent New chat action starts a fresh conversation from anywhere in the shell.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/ui/src/sidebar/Sidebar.tsx:543; apps/web/features/chat/pages/WebChatPage.tsx:5289; apps/mobile/src/features/drawer/components/DrawerContent.tsx:405; apps/mobile/src/features/drawer/components/DrawerContent.tsx:296; apps/cli/src/tui/tui_app.rs:3446; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2193; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4059; apps/extension/src/side_panel.ts:6360

## S5.09 Pinned-item section.
- Should: Pinned items appear in their own section at the top of navigation.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/ui/src/sidebar/Sidebar.tsx:852; packages/ui/ui/src/sidebar/Sidebar.tsx:231; apps/mobile/src/features/chat/ChatsListScreen.tsx:72; apps/mobile/src/features/drawer/components/DrawerContent.tsx:321

## S5.10 Recent-item section.
- Should: Navigation shows a list of recent conversations that open on selection.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/ui/src/sidebar/Sidebar.tsx:860; apps/web/features/chat/pages/WebChatPage.tsx:5347; apps/web/shared/components/layout/WebAppShell.tsx:291; apps/mobile/src/features/drawer/components/DrawerContent.tsx:484; apps/mobile/src/features/drawer/components/DrawerContent.tsx:286; apps/cli/src/tui/tui_app.rs:3545; apps/cli/src/tui/widgets/session_picker.rs:1; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2196

## S5.11 Project-grouped recents.
- Should: Recent conversations can be shown grouped under their projects in navigation.
- Status: web done, desktop done, mobile done, cli missing, vscode missing
- Code: packages/ui/ui/src/sidebar/Sidebar.tsx:702; packages/ui/ui/src/sidebar/Sidebar.tsx:1355; packages/ui/ui/src/sidebar/Sidebar.tsx:222; apps/mobile/src/features/drawer/components/DrawerContent.tsx:635; apps/mobile/src/features/drawer/components/DrawerContent.tsx:419

## S5.12 Date-grouped recents.
- Should: Recent conversations are grouped by date buckets (Today, Yesterday, This week, Older).
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: packages/ui/ui/src/sidebar/Sidebar.tsx:240; packages/ui/ui/src/sidebar/Sidebar.tsx:875; apps/mobile/src/features/chat/ChatsListScreen.tsx:72; apps/mobile/src/features/chat/ChatsListScreen.tsx:2; apps/cli/src/sessions.rs:861; apps/cli/src/lib.rs:3864

## S5.13 Conversation row.
- Should: Each conversation row shows its title, indicates the active one, and opens the conversation.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: packages/ui/ui/src/sidebar/SessionItem.tsx:215; packages/ui/ui/src/sidebar/SessionItem.tsx:125; apps/mobile/src/features/drawer/components/DrawerContent.tsx:487; apps/mobile/src/features/drawer/components/DrawerContent.tsx:494; apps/cli/src/tui/widgets/session_picker.rs:55; apps/cli/src/tui/tui_app.rs:3550; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4176; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4208

## S5.14 Project row.
- Should: Navigation shows project rows that open the project (and expose its actions).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: packages/ui/ui/src/sidebar/Sidebar.tsx:1195; packages/ui/ui/src/sidebar/Sidebar.tsx:1315; apps/web/shared/components/layout/WebAppShell.tsx:344; apps/mobile/src/features/drawer/components/DrawerContent.tsx:453; apps/mobile/src/features/drawer/components/DrawerContent.tsx:328; apps/cli/src/lib.rs:4056; apps/cli/src/lib.rs:1831; apps/extension-vscode/src/core/commandSetup.ts:2240

## S5.15 Task row.
- Should: Background work/tasks appear as rows marked as tasks (distinct from chats) with their state, and open on selection.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: packages/ui/ui/src/sidebar/SessionItem.tsx:170; apps/web/features/chat/pages/WebChatPage.tsx:5110; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:726; apps/mobile/src/features/tasks/components/CloudRunCard.tsx:47; apps/mobile/src/features/drawer/components/DrawerContent.tsx:144; apps/mobile/src/features/tasks/components/CloudRunCard.tsx:37; apps/cli/src/tui/tui_app.rs:5143; apps/cli/src/repl/registry.rs:419

## S5.16 Resource-type icon.
- Should: Rows in mixed lists carry an icon (or equivalent marker) that tells the resource type apart (chat, project, task, file) visually and for assistive tech.
- Status: web done, desktop done, mobile done, cli missing, chrome missing
- Code: apps/web/shared/components/CommandPalette/CommandPalette.tsx:81; apps/web/shared/components/CommandPalette/CommandPalette.tsx:362; apps/web/shared/components/CommandPalette/CommandPalette.tsx:540; apps/mobile/src/features/chat/ChatsListScreen.tsx:78; apps/mobile/src/features/chat/ChatsListScreen.tsx:411

## S5.17 Running-task indicator.
- Should: Navigation marks items whose task or response is still running, visually and for screen readers.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/shared/components/layout/WebAppShell.tsx:262; apps/web/shared/components/layout/WebAppShell.tsx:277; apps/mobile/src/features/tasks/runPresentation.ts:16; apps/mobile/src/features/tasks/components/CloudRunCard.tsx:47; apps/cli/src/tui/tui_app.rs:1570; apps/cli/src/tui/tui_app.rs:1565; apps/extension-vscode/src/core/commandSetup.ts:2196; apps/extension-vscode/src/features/cloud-tasks/cloudRunPresentation.ts:25

## S5.18 Needs-input indicator.
- Should: Navigation marks items that are blocked waiting for the user (approval or input).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/lib/server/neon-chat.ts:68; apps/web/shared/components/layout/WebAppShell.tsx:278; apps/web/features/chat/pages/WebChatPage.tsx:5468; packages/ui/ui/src/sidebar/SessionItem.tsx:158; packages/ui/ui/src/sidebar/SessionItem.tsx:186; apps/mobile/src/features/tasks/runPresentation.ts:16; apps/mobile/src/features/tasks/runPresentation.ts:76; apps/cli/src/tui/tui_app.rs:1574

## S5.19 Unread-result indicator.
- Should: Items with new results the user has not seen are marked unread (visually and for assistive tech) and clear when opened.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/ui/src/sidebar/SessionItem.tsx:179; packages/ui/ui/src/sidebar/SessionItem.tsx:238; apps/mobile/src/features/conversation-actions/useConversationActions.ts:228; apps/mobile/stores/chat/chatMessageStore.ts:211; apps/mobile/stores/chat/chatCloudMessageStore.ts:102

## S5.20 Item overflow menu.
- Should: Each row has an overflow (⋯) menu with its actions (share, rename, pin, archive, move, delete).
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome done
- Code: packages/ui/ui/src/sidebar/SessionItem.tsx:285; packages/ui/ui/src/sidebar/SessionItem.tsx:305; apps/mobile/src/features/conversation-actions/useConversationActions.ts:211; apps/mobile/src/features/conversation-actions/useConversationActions.ts:226; apps/mobile/stores/chat/chatMessageStore.ts:724; apps/cli/src/tui/widgets/session_picker.rs:100; apps/extension/src/side_panel.ts:10064; apps/extension/src/side_panel.ts:9947

## S5.21 Inline rename field.
- Should: A row can be renamed in place (inline field, Enter to save, Escape to cancel) and the new title persists.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: packages/ui/ui/src/sidebar/SessionItem.tsx:183; packages/ui/ui/src/sidebar/SessionItem.tsx:109; apps/web/shared/components/layout/WebAppShell.tsx:309; apps/mobile/src/features/conversation-actions/RenameConversationModal.tsx:247; apps/cli/src/tui/tui_app.rs:3574

## S5.22 Drag-to-reorder interaction.
- Should: The user can drag rows (e.g. pinned items or projects) to reorder them, and the order persists.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S5.23 Drag-to-move-into-Project interaction.
- Should: The user can drag a conversation onto a project in navigation to move it there.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S5.24 Breadcrumb navigation.
- Should: Nested app views show a breadcrumb trail back to their parents (e.g. Projects / Project / Chat).
- Status: web missing, desktop missing

## S5.25 Back and forward navigation.
- Should: Back and forward navigation move through the user's in-app history.
- Status: web done, desktop done, mobile done
- Code: packages/ui/ui/src/sidebar/SessionItem.tsx:218; apps/web/shared/components/layout/WebAppShell.tsx:291; apps/desktop/electron/appMenu.ts:195; apps/desktop/electron/main.ts:1230; apps/mobile/src/shared/hooks/useGoBack.ts:1; apps/mobile/app/_layout.tsx:660

## S5.26 Global command palette.
- Should: A global command palette (keyboard-invoked) searches and runs app commands and destinations.
- Status: web done, desktop done, cli done, vscode done, chrome done
- Code: apps/web/shared/components/CommandPalette/CommandPaletteProvider.tsx:11; apps/web/shared/components/CommandPalette/CommandPalette.tsx:185; apps/web/app/AppRuntimeMounts.tsx:17; apps/cli/src/tui/tui_app.rs:2445; apps/cli/src/tui/widgets/command_popup.rs:1; apps/extension-vscode/package.json:627; apps/extension-vscode/src/core/commandSetup.ts:2309; apps/extension/src/features/side-panel/commandPalette.ts:115

## S5.27 Keyboard-shortcut help.
- Should: A keyboard-shortcut help view lists the available shortcuts and is reachable from the app.
- Status: web done, desktop done, cli done, vscode done, chrome done
- Code: apps/web/shared/components/layout/AccountMenuItems.tsx:96; apps/web/shared/components/layout/WebAppShell.tsx:628; apps/cli/src/tui/tui_app.rs:4078; apps/cli/src/keybindings.rs:142; apps/extension-vscode/package.json:1140; apps/extension-vscode/src/core/commandSetup.ts:1097; apps/extension/src/options.ts:1724; apps/extension/src/options.ts:1778

## S5.28 Notification center.
- Should: A notification center lists account notifications, shows an unread count, and lets the user open and mark them read.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/shared/components/layout/SidebarBrandRow.tsx:6; apps/web/features/notifications/components/NotificationBell.tsx:85; apps/mobile/src/features/drawer/components/DrawerContent.tsx:560; apps/mobile/app/(app)/notifications/index.tsx:167

## S5.29 User/profile menu.
- Should: A user/profile menu shows who is signed in and offers account actions (settings, plan, sign out).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/shared/components/layout/WebAppShell.tsx:548; apps/web/shared/components/layout/AccountMenuItems.tsx:52; apps/web/shared/components/layout/AccountMenuItems.tsx:134; apps/mobile/src/features/drawer/components/DrawerContent.tsx:406; apps/mobile/app/(app)/profile/index.tsx:1; apps/cli/src/tui/tui_app.rs:3789; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2224; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2228

## S5.30 Help menu.
- Should: A help menu gathers help centre, support contact, feedback and shortcuts in one place.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/shared/components/layout/AccountMenuItems.tsx:82; apps/web/shared/components/layout/WebAppShell.tsx:485; apps/mobile/app/(app)/about.tsx:262; apps/cli/src/tui/tui_app.rs:3531; apps/cli/src/tui/tui_app.rs:3535; apps/extension-vscode/src/features/help/helpMenu.ts:12; apps/extension-vscode/src/features/surfaces/surfaceMenu.ts:53; apps/extension/src/side_panel.ts:12000

## S5.31 Upgrade entry.
- Should: A visible Upgrade entry in the shell takes an eligible user into the plan upgrade flow.
- Status: web partial, desktop partial, mobile partial, cli done, vscode partial, chrome partial
- Code: apps/web/lib/server/billing-waitlist-access.ts:22; apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:113; apps/mobile/lib/v1FeatureFlags.ts:1; apps/cli/src/claude_parity.rs:685; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2355; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3140; apps/extension/src/side_panel.ts:8104; apps/extension/src/side_panel.ts:9626
- Unfinished: web: owner-held (lead ruling 2026-09-28): the billing waitlist stays on by owner decision; paid checkout, portal and store purchases need a redeemed access code. aaae88832e added AGI_BILLING_WAITLIST_OPEN, which stays unset at deploy until the owner opens paid upgrades | desktop: owner-held (lead ruling 2026-09-28): the billing waitlist stays on by owner decision; paid checkout, portal and store purchases need a redeemed access code. aaae88832e added AGI_BILLING_WAITLIST_OPEN, which stays unset at deploy until the owner opens paid upgrades | mobile: Owner hold: billing waitlist stays on (rulin

## S5.32 Connection-status indicator.
- Should: A status indicator shows whether the app is connected to its backend/runtime and offers reconnect when not.
- Status: web done, desktop done, cli done, vscode done, chrome done
- Code: apps/web/app/AppRuntimeMounts.tsx:22; apps/web/shared/components/OfflineIndicator.tsx:27; apps/cli/src/cloud/client.rs:563; apps/cli/src/repl/slash_commands.rs:283; apps/cli/src/tui/tui_app.rs:5865; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2327; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2591; apps/extension/src/side_panel.ts:5068

## S5.33 Offline indicator.
- Should: When the device loses network, a visible offline indicator appears and clears when back online.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/app/AppRuntimeMounts.tsx:22; apps/web/shared/components/OfflineIndicator.tsx:1; apps/mobile/app/_layout.tsx:83; apps/mobile/app/_layout.tsx:724

## S5.34 Release/update indicator.
- Should: The app tells the user when a new release is available (or just installed) and how to get it.
- Status: web missing, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/desktop/electron/appMenu.ts:241; apps/desktop/electron/main.ts:560; apps/desktop/electron/preload.ts:132; apps/cli/src/tui/tui_app.rs:4615

## S5.35 Mobile navigation drawer.
- Should: On narrow screens navigation lives in a slide-in drawer opened from a header button, with focus management and dismissal.
- Status: web done, desktop done, mobile done, chrome done
- Code: apps/web/shared/components/layout/WebAppShell.tsx:695; apps/web/shared/components/layout/WebAppShell.tsx:650; apps/mobile/app/(app)/_layout.tsx:20; apps/mobile/app/(app)/(tabs)/chat.tsx:787; apps/extension/src/side_panel.ts:6566; apps/extension/src/side_panel.ts:6590

## S5.36 Mobile bottom navigation.
- Should: On phones a persistent bottom navigation bar switches between the main areas.
- Status: web missing, mobile missing

## S5.37 Tablet split-navigation layout.
- Should: On tablet widths navigation and content sit side by side (persistent or rail sidebar) instead of a phone drawer.
- Status: web done, desktop done, mobile done
- Code: apps/web/shared/components/layout/app-shell-layout.ts:25; apps/web/shared/components/layout/WebAppShell.tsx:634; apps/mobile/app/(app)/_layout.tsx:14; apps/mobile/app/(app)/_layout.tsx:20

## S5.38 Resource deep links.
- Should: Each resource (conversation, project, task) has a stable link that opens it directly in the app.
- Status: web done, desktop done, mobile done, vscode done
- Code: packages/ui/ui/src/sidebar/SessionItem.tsx:218; apps/web/app/open/[target]/[id]/page.tsx:1; apps/desktop/electron/main.ts:1334; apps/desktop/electron/main.ts:1325; apps/mobile/app.config.js:60; apps/mobile/src/features/drawer/components/DrawerContent.tsx:494; apps/mobile/app.config.js:188; apps/extension-vscode/src/features/sidebar-webview/sessionReceipt.ts:74

## S5.39 Route-level loading and unavailable-resource screens.
- Should: Routes show a loading state while resolving and a clear not-found/unavailable screen for missing or forbidden resources.
- Status: web done, desktop done, mobile done
- Code: apps/web/app/chat/loading.tsx:1; apps/web/app/chat/not-found.tsx:1; apps/web/features/notifications/components/ProductLinkUnavailable.tsx:14; apps/mobile/app/+not-found.tsx:1; apps/mobile/app/(app)/_layout.tsx:9
