---
id: "AREA-005"
type: "area"
title: "Application shell and navigation components"
features: ["F005-01", "F005-02", "F005-03", "F005-04", "F005-05", "F005-06", "F005-07", "F005-08", "F005-09", "F005-10", "F005-11", "F005-99"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 5. Application shell and navigation components

The shell is the frame around every screen: the header, the left navigation with recent chats, projects and tasks, the search and new-chat controls, and the menus for account, help and upgrade. It lets a person find an old conversation, start a new one, or jump to any part of the product in a few taps or keystrokes. It also tells the person when something is running, when a reply is waiting for them, and when the connection is lost.

**Who uses it.** Every signed-in person on every app, as the code shows. The web shell builds navigation for signed-in users only (apps/web/shared/components/layout/app-nav-items.ts:85-88 says every signed-in surface shows the rail except entries marked adminOnly). The notification bell returns nothing when the person is not signed in (apps/web/features/notifications/components/NotificationBell.tsx:85-89). The Upgrade entry is shown only when the menu says showUpgrade (apps/web/shared/components/layout/AccountMenuItems.tsx:118). Workspace admins see admin-only entries; the exact rule is in apps/web/shared/components/layout/app-nav-items.ts and was not fully traced. Paid-plan-only parts were not established in this area.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F005-01](F005-01-header-and-layout-by-screen-size.md) | Header and layout by screen size | partly | partly | partly | built | built | built |
| [F005-02](F005-02-switch-between-modes-and-workspaces.md) | Switch between modes and workspaces | partly | partly | partly | no | no | no |
| [F005-03](F005-03-search-and-new-chat-in-the-sidebar.md) | Search and new chat in the sidebar | built | built | built | built | built | built |
| [F005-04](F005-04-sidebar-lists-pinned-recents-projects-and-date-gro.md) | Sidebar lists: pinned, recents, projects and date groups | built | built | built | partly | partly | partly |
| [F005-05](F005-05-conversation-and-task-rows.md) | Conversation and task rows | built | built | built | partly | partly | partly |
| [F005-06](F005-06-row-actions-menu-rename-reorder-and-move.md) | Row actions: menu, rename, reorder and move | partly | partly | partly | built | partly | partly |
| [F005-07](F005-07-breadcrumbs-back-and-forward-and-links.md) | Breadcrumbs, back and forward, and links | partly | partly | built | n/a | built | n/a |
| [F005-08](F005-08-command-palette-and-keyboard-shortcut-help.md) | Command palette and keyboard shortcut help | built | built | n/a | built | built | built |
| [F005-09](F005-09-notification-center.md) | Notification center | built | built | built | no | no | no |
| [F005-10](F005-10-profile-help-and-upgrade-menus.md) | Profile, help and upgrade menus | partly | partly | partly | built | partly | partly |
| [F005-11](F005-11-connection-offline-and-release-status.md) | Connection, offline and release status | partly | built | partly | partly | partly | partly |
| [F005-99](F005-99-other-items.md) | Other items in Application shell and navigation components | no | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/005-application-shell-and-navigation-components.md](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md).

## How this area works in the code

1. **Pick the layout for the screen size.** The web shell reads the window width and height and chooses compact, tablet or regular, and the sidebar mode drawer, rail or persistent. The first paint assumes a desktop window so a wide page does not flash a mobile header. Resize and orientation events update the choice. (`apps/web/shared/components/layout/app-shell-layout.ts:5-6 (breakpoint constants)`, `apps/web/shared/components/layout/app-shell-layout.ts (resolveShellLayout, useShellLayout)`)
2. **Load recents and projects.** The shell loads conversations and projects through hooks. Each conversation is turned into a sidebar row. The row gets extra marks: running (the chat store says it is loading or streaming), needs-you, and task (work mode). (`apps/web/shared/components/layout/WebAppShell.tsx:262-300 region (useConversations, useManagedCloudProjects, useChatStore reads; sidebarSessions useMemo)`, `apps/web/shared/components/layout/WebAppShell.tsx:277-278 region (runningConversationIds and decorate)`)
3. **Build the navigation destinations.** One shared list defines the rail items in order. Chat cannot be hidden. Each item has a label, an icon, an href and an isActive test. A destination can carry a feature key or a health-space requirement. (`apps/web/shared/components/layout/app-nav-items.ts:77-82 (hideable, feature, requiresHealthSpace)`, `apps/web/shared/components/layout/app-nav-items.ts:88 (APP_NAV_DESTINATIONS)`)
4. **Render the sidebar in the right place.** On regular screens the sidebar is always on the left. On a tablet in portrait it is a rail. On a phone the sidebar is put inside a sheet that slides from the left and is made inert behind it. The shell passes the same set of handler props to each copy. (`apps/web/shared/components/layout/WebAppShell.tsx:631 (rail or collapsed prop)`, `apps/web/shared/components/layout/WebAppShell.tsx:638-639 (aria-hidden and inert while drawer open)`, `apps/web/shared/components/layout/WebAppShell.tsx:650 (Open navigation button)`, `apps/web/shared/components/layout/WebAppShell.tsx:710 (drawer Sidebar with collapsed false)`)
5. **Draw the shared sidebar.** The shared sidebar component draws the header (collapse, new chat, search), the rail buttons, the projects section, the Recents heading with its organize menu, and the list of rows. Rows are grouped by date using the temporal helper. (`packages/ui/ui/src/sidebar/Sidebar.tsx:47 (MOBILE_NAV_DRAWER_WIDTH)`, `packages/ui/ui/src/sidebar/Sidebar.tsx:146 (Sidebar component)`, `packages/ui/ui/src/sidebar/Sidebar.tsx:511-518 (rail New chat, Code, Search)`, `packages/ui/ui/src/sidebar/Sidebar.tsx:853 (Recents heading)`, `packages/ui/ui/src/sidebar/temporal.ts:12-37 (getTemporalGroup)`)
6. **Draw each row and its menu.** Each row shows status dots, the title and the unread dot. The overflow menu holds the row actions. Rename is done in place. A click opens the chat unless a modifier key is held. (`packages/ui/ui/src/sidebar/SessionItem.tsx:122 (untitled label)`, `packages/ui/ui/src/sidebar/SessionItem.tsx:147 (running dot)`, `packages/ui/ui/src/sidebar/SessionItem.tsx:179 (unread dot)`, `packages/ui/ui/src/sidebar/SessionItem.tsx:21-33 (SessionItemHandlers)`)
7. **Remember the collapsed state.** The collapsed flag is kept in a shared store. Only that one flag is written to browser storage. The store is named agi-ui-store. (`apps/web/shared/stores/layout-store.ts:102-110 (persist name, version, partialize sidebarCollapsed)`, `apps/web/shared/components/layout/WebAppShell.tsx:153-154 (store reads)`, `apps/web/shared/components/layout/WebAppShell.tsx:444 (toggle)`)
8. **Show notifications and offline status.** The notification bell reads the feed for the signed-in person. The offline indicator subscribes to the sync manager and shows when offline, syncing, queued, or in error. It is mounted once for the whole app. (`apps/web/features/notifications/components/NotificationBell.tsx:85-89 (signed-in gate)`, `apps/web/shared/components/OfflineIndicator.tsx:132-134 (role status bar)`, `apps/web/app/AppRuntimeMounts.tsx:22 (OfflineIndicator mounted)`)
9. **Open a shared link.** A link to a chat, project or task goes to the open route. It checks the target and id, then needs a signed-in user. It asks the resolver where to send the person. If the item is ready, it redirects there. If not, it shows the unavailable screen inside the shell. (`apps/web/app/open/[target]/[id]/page.tsx:23 (notFound on bad target or id)`, `apps/web/app/open/[target]/[id]/page.tsx:27-29 (redirect to login when no session)`, `apps/web/app/open/[target]/[id]/page.tsx:33-39 (resolver and unavailable screen)`)
10. **Gate the Upgrade entry.** The menu shows Upgrade only for eligible users. Paid checkout stays behind the waitlist until the environment value or the run-time flag opens it, or the person redeems an access code. (`apps/web/shared/components/layout/AccountMenuItems.tsx:118-121 (Upgrade item)`, `apps/web/lib/server/billing-waitlist-access.ts:28-30 (forced-open env value)`, `apps/web/lib/server/billing-waitlist-access.ts:39 (open check)`, `apps/web/lib/server/billing-waitlist-access.ts:41-53 (access code check)`)

## Files to know

| File | Role |
|---|---|
| `packages/ui/ui/src/sidebar/Sidebar.tsx` | The shared navigation sidebar used by web and desktop: header, rail, projects, Recents, date groups, organize menu and the list of rows. |
| `packages/ui/ui/src/sidebar/SessionItem.tsx` | One conversation or task row: status dots, unread dot, active state, inline rename, overflow menu and open-on-click. |
| `packages/ui/ui/src/sidebar/temporal.ts` | Date-group rules for recents (six buckets, not the four in the brief). |
| `packages/ui/ui/src/sidebar/searchShortcut.ts` | Keyboard shortcuts for search (Ctrl/Cmd+Shift+F) and sidebar toggle (Ctrl/Cmd+B). |
| `apps/web/shared/components/layout/WebAppShell.tsx` | Web app frame: loads recents and projects, builds handler props, chooses rail, persistent sidebar or drawer, and renders the header. |
| `apps/web/shared/components/layout/app-shell-layout.ts` | Screen-size breakpoints and sidebar mode for the web shell. |
| `apps/web/shared/components/layout/app-nav-items.ts` | The one ordered list of primary navigation destinations for the web app. |
| `apps/web/shared/stores/layout-store.ts` | Shared UI store; keeps the sidebar collapsed flag in browser storage. |
| `apps/web/shared/components/OfflineIndicator.tsx` | Status bar for offline, syncing, queued and error states, with Retry on error. |
| `apps/web/features/notifications/components/NotificationBell.tsx` | Notification bell, unread badge and popover list. |
| `apps/web/app/open/[target]/[id]/page.tsx` | Shared-link route for chats, projects and tasks; redirects, shows not-found or unavailable. |
| `apps/mobile/app/(app)/_layout.tsx` | Mobile drawer and route list; hides screens from the drawer and sets gesture rules. |
| `apps/mobile/app/(app)/(tabs)/_layout.tsx` | Mobile tab group with the bottom tab bar turned off (tabBar returns null). |
| `apps/web/shared/components/layout/AccountMenuItems.tsx` | Account menu items: Upgrade entry, keyboard help and profile actions. |

## What is stored

- Sidebar collapsed flag (only field persisted from the UI store): Browser local storage under the key agi-ui-store (apps/web/shared/stores/layout-store.ts:102-110)
- Conversation list, projects and their titles, pinned state, archived flag, unread state: Loaded from the server through the conversation and project hooks (apps/web/shared/components/layout/WebAppShell.tsx 262-300). The storage behind those hooks was not traced.
- Running, needs-you and task marks on rows: In-memory chat store (loadingConversationIds, streamingConversationIds, workModeByConversation) read in WebAppShell.tsx. Not persisted by this code.
- Unread state for conversations: useUnreadConversations (WebAppShell.tsx). Storage not traced.
- Notifications feed and unread count: Server through useNotificationFeed (NotificationBell.tsx). Storage not traced.
- Sync queue and sync state for offline status: apps/web/lib/offline/offlineSync.ts (imported by OfflineIndicator.tsx). Storage not traced.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_BILLING_WAITLIST_OPEN**: When set to 1, paid upgrades open to everyone and the waitlist is bypassed; otherwise the run-time flag or an access code decides. (apps/web/lib/server/billing-waitlist-access.ts:28-30)
- **Run-time billing upgrade switch (readBillingUpgradesOpen)**: Opens or closes paid upgrades without a deploy. Owner-held. (apps/web/lib/server/billing-waitlist-access.ts:39 (imports from apps/web/lib/feature-flags/billing-upgrade-gate, not opened))
- **FEATURES.billing (mobile)**: Set to false in the mobile flag file. Which code reads it was not traced. (apps/mobile/lib/v1FeatureFlags.ts)
- **Shell breakpoints**: 768px tablet and 1024px regular breakpoints set the layout tier and sidebar mode. (apps/web/shared/components/layout/app-shell-layout.ts:5-6)
- **Phone drawer width**: Sets the width of the web phone drawer to 280px. (packages/ui/ui/src/sidebar/Sidebar.tsx:47)
- **Sidebar toggle and search shortcuts**: Ctrl/Cmd+B toggles the sidebar; Ctrl/Cmd+Shift+F opens search. (packages/ui/ui/src/sidebar/searchShortcut.ts)
- **Nav destination hideable, feature and requiresHealthSpace**: Lets a destination be hidden from the rail (not Chat), tied to a workspace feature, or to a health space. (apps/web/shared/components/layout/app-nav-items.ts:77-82)
- **Drawer hidden screens (mobile)**: Screens listed with HIDDEN are not shown in the drawer; settings and camera screens change gesture or layout. (apps/mobile/app/(app)/_layout.tsx (HIDDEN, SETTINGS_STACK, FULL_SCREEN, VOICE_SCREEN))
- **showUpgrade and onUpgrade props**: Show or hide the Upgrade item in the account menu. (apps/web/shared/components/layout/AccountMenuItems.tsx:38-39, 118)
- **onOpenCode, onOpenAllChats and onProject* handler props**: Each control appears only when its handler is passed (for example the Code button needs onOpenCode). (packages/ui/ui/src/sidebar/Sidebar.tsx (props interface, lines 60-145 region))

## Shared between apps

Shared across web and desktop: the sidebar (packages/ui/ui/src/sidebar/Sidebar.tsx, SessionItem.tsx, temporal.ts). Sidebar.tsx comments say it renders on desktop too and uses chat tokens so it works without the foundation stylesheet. Shared across web and desktop: the web shell (apps/web/shared/components/layout/WebAppShell.tsx and app-nav-items.ts). Shared with the CLI, VS Code and Chrome: none found in this area. The CLI uses its own Rust terminal UI (apps/cli/src/tui/tui_app.rs, not opened in depth). VS Code uses its own webview (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts, not opened). Chrome uses its own side panel (apps/extension/src/side_panel.ts, not opened). Mobile has its own drawer and tab code (apps/mobile/src/features/drawer/components/DrawerContent.tsx and apps/mobile/app/(app)/_layout.tsx), separate from the web shell.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says the date groups are Today, Yesterday, This week, Older. The code adds Last 7 Days and Last 30 Days buckets. (packages/ui/ui/src/sidebar/temporal.ts:4-10 (labels) and :12-37 (getTemporalGroup))
- Offline bar shows no reconnect action while the device is offline; Retry appears only in the error state. The brief's Should says it offers reconnect when not connected. (apps/web/shared/components/OfflineIndicator.tsx:132 (bar) and the Retry block after it, shown only when state is ERROR)
- Mobile tab group hides the bottom tab bar with tabBar returning null, so the screens exist but there is no bottom navigation. This matches the brief (missing) but the tab screens are kept and may be a leftover. (apps/mobile/app/(app)/(tabs)/_layout.tsx:9)
- Empty-state label mismatch: the row fallback in SessionItem uses 'sidebar.untitled' while the Sidebar list uses 'sidebar.untitledChat' for the same untitled case, so translations can differ. (packages/ui/ui/src/sidebar/SessionItem.tsx:122 and packages/ui/ui/src/sidebar/Sidebar.tsx:1530)
- Sidebar width is a fixed prop (default 260px) with no resize code, while the brief's Should asks for a drag handle that persists. (packages/ui/ui/src/sidebar/Sidebar.tsx (width prop in the Sidebar destructure, line 146 region))

## Not established

- Paths are relative to the project root ~/Desktop/agiworkforce.
- Plan gates for this area: no plan check was found in the shell files read. Whether Upgrade, workspace switching or any nav destination depends on a paid plan was not established.
- Workspace admin gating: the adminOnly flag is mentioned in app-nav-items.ts comments, but the code that hides entries for non-admins was not traced.
- Line numbers for some items are taken from the brief's code references and were not all re-counted by reading the file (e.g. apps/web/features/notifications/components/NotificationBell.tsx:85, apps/mobile/app/(app)/_layout.tsx:20, apps/web/shared/components/layout/app-shell-layout.ts:17-35). Lines I confirmed are cited with a precise number.
- Not opened at all: the CLI files (apps/cli/src/tui/tui_app.rs, apps/cli/src/tui/widgets/session_picker.rs, apps/cli/src/sessions.rs, apps/cli/src/lib.rs, apps/cli/src/keybindings.rs, apps/cli/src/cloud/client.rs), VS Code files (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts and related), Chrome files (apps/extension/src/side_panel.ts), and the mobile DrawerContent body (apps/mobile/src/features/drawer/components/DrawerContent.tsx) except where noted. Status for those apps is taken from the brief, not from the code.
- Not opened: the search dialog (GlobalSearchDialog), the command palette body (apps/web/shared/components/CommandPalette/CommandPalette.tsx), the workspace menu items, the mobile rename modal, the mobile notifications screen, and the sync engine (apps/web/lib/offline/offlineSync.ts). Behaviour of these was not verified.
- Empty-state copy, loading skeletons, and error text for the sidebar list were not read beyond the props (isLoading, error, onRetryLoad).
- Unread clearing: the rule that opening a row clears its unread dot is implied by the brief; the clearing code was not traced.
- Running-task and needs-you marks: the source of session.runState and session.needsYou (WebAppShell.tsx decorate, and apps/web/lib/server/neon-chat.ts per brief) was not fully traced.
- Drag-to-reorder and drag-to-move (S5.22, S5.23) and the resize handle (S5.06) are reported missing because searches for drag, draggable, drop and resize found no matching sidebar code.
- Account switching (S5.03) is reported missing because no account switcher was found in the web account menu or the sidebar. Other apps were not searched exhaustively.
- Release indicator on web and mobile (S5.34) is reported missing from the brief; no code was searched for it on those apps.
- Tests were not run (the task was read-only). Nothing here was verified in a running app or on localhost.
