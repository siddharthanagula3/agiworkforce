---
id: "F009-11"
type: "feature"
title: "Activity feed, notification inbox, command palette and integration cards"
aliases: ["Activity feed", "Recent activity", "Notification inbox", "Notification bell", "Notifications", "Command palette", "Keyboard-command palette", "Cmd+K", "Integration connection card", "Connector card", "Connection card", "S9.20 S9.33 S9.37 S9.38"]
area: "9 Compound interface components"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S9.20", "S9.37", "S9.38", "S9.33"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "api:GET /api/notifications", "api:PATCH /api/notifications", "api:GET /api/settings/activity", "api:GET /api/search", "api:GET /api/connectors", "table:notifications", "table:security_audit_logs", "SYS-sync-and-continuity", "SYS-connectors-plugins-and-skills", "SYS-authentication-and-identity", "SYS-observability-and-operations", "file:apps/web/features/notifications/components/NotificationBell.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F009-11 Activity feed, notification inbox, command palette and integration cards

Four navigation and status parts. Settings, Account lists recent account events. A bell on Web opens an inbox with unread count and mark-all. Ctrl or Cmd plus K opens a palette of actions and chat, project and file search. Connector cards show Connect, Connected or Reconnect with Disconnect.

Area: [9. Compound interface components](README.md). Requirement items: [S9.20](../../10-requirements/capabilities/009-compound-interface-components.md#s920), [S9.37](../../10-requirements/capabilities/009-compound-interface-components.md#s937), [S9.38](../../10-requirements/capabilities/009-compound-interface-components.md#s938), [S9.33](../../10-requirements/capabilities/009-compound-interface-components.md#s933).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows recent account events grouped by repeat (apps/web/features/settings/components/RecentActivityPanel.tsx:63-160), shows account notifications with unread state (apps/web/features/notifications/components/NotificationBell.tsx:96-194), opens a searchable command list from the keyboard (apps/web/shared/components/CommandPalette/CommandPaletteProvider.tsx:16-33), and shows each integration's connection state with the matching action (packages/ui/ui/src/directory/ConnectorDetailView.tsx:261-320).

**Why it exists.** People need to see what happened on their account, be told when a run finishes or something needs them, move quickly without a mouse, and know whether an app connection still works (doc: knowledge-base/data/area-briefs/009-compound-interface-components.md S9.20, S9.33, S9.37, S9.38).

**Who uses it.** Signed-in people on every app; the inbox and activity feed on Web, desktop window and Mobile.

**Problems it solves**

- Spotting an unfamiliar sign-in (RecentActivityPanel.tsx:10-11).
- Missing that a task needs approval (NotificationBell.tsx:151-156).
- Hunting through menus (CommandPalette.tsx:144-280).
- A connector that quietly expired (useConnectorsSettingsAdapter.tsx:686-700).

**Use cases**

- Click the bell, read 'Notifications, 3 unread', open one that takes you to its page.
- Press Cmd+K, type 'bill', press Enter on 'Go to Billing'.
- Open Settings, Account and read 'Recent activity'.
- Open a connector marked 'Needs to be reconnected.' and press Reconnect.

## 2. User experience

**Where to find it**

- Web bell: top of the sidebar beside the wordmark (apps/web/shared/components/layout/SidebarBrandRow.tsx:4-10).
- Web palette: Ctrl+K or Cmd+K on any page (CommandPaletteProvider.tsx:16), mounted in apps/web/app/AppRuntimeMounts.tsx:19.
- Activity: Settings, Account, panel 'Recent activity' under sessions (apps/web/features/settings/sections/AccountSection.tsx:883).
- Connectors: Settings, Connectors, or the connector directory detail view (packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967 per brief; ConnectorDetailView.tsx).
- Mobile: Notifications screen (apps/mobile/app/(app)/notifications/index.tsx); Account security activity list (apps/mobile/src/features/settings/account-security/index.tsx:790-830); Cloud connectors screen (apps/mobile/src/features/settings/cloud-connectors/index.tsx).
- CLI: palette opened by the OpenPalette key (apps/cli/src/tui/tui_app.rs:2449); connectors list command (apps/cli/src/lib.rs:7387).
- Chrome: side panel palette with sections Go and Chats (apps/extension/src/features/side-panel/commandPalette.ts:9-17).

**Before you start**

- Signed in for the bell, activity, chat search inside the palette and connectors (NotificationBell.tsx:100-104; CommandPalette.tsx:338).
- Web or the desktop window (hosted web app) for the bell and palette.

**Screens and controls**

- Bell button labelled 'Notifications' or 'Notifications, N unread' with badge capped at '9+' (NotificationBell.tsx:30-33, 108, 128-145).
- Popover with 'Mark all as read', rows, error with 'Try again', empty text (NotificationBell.tsx:150-190).
- Palette: input labelled 'Command palette search', placeholder 'Search chats and actions', filter chips All, Chats, Projects, Files, listbox 'Commands' (CommandPalette.tsx:495-555).
- Palette groups Quick actions, Recents, Actions, Preferences (CommandPalette.tsx:~158-280).
- Connector card primary button 'Connect', 'Connected' or 'Reconnect', and 'Disconnect' (packages/ui/ui/src/directory/constants.ts:123-125, 288).

**Journey**

1. Bell: the feed loads when you are signed in and refreshes when you open the popover.
2. Click a row: it is marked read and, if it has a link, the popover closes and the page opens.
3. Palette: press the shortcut, type; actions filter at once, and with 2 or more characters chat, project and file results are searched after a short pause.
4. Move with arrows, press Enter to run.
5. Connector: open its card; if not connected press Connect; if it needs reauthorisation press Reconnect; press Disconnect to remove.

**What the person sees and gets**

- Unread dot and bold title with a spoken ', unread' (NotificationBell.tsx:49-75).
- Relative time such as '5 minutes ago' (NotificationBell.tsx:14-28).
- 'Those notifications could not be marked as read. Try again.' alert (NotificationBell.tsx:168-172).
- 'Conversation search is temporarily unavailable.' status in the palette (CommandPalette.tsx:563-566, 624-626).
- Activity lines with '×N' for repeats and device name (RecentActivityPanel.tsx:150-185).
- 'Needs to be reconnected.' on a connected connector that must be reauthorised (apps/web/features/directory/constants.ts:261).

**Settings**

- none found in the code for the bell, palette or activity list; web push opt-in controls exist beside the feed (apps/web/features/notifications/components/WebPushToggle.tsx) and were not read.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Bell with badge cap 9, spoken unread label, popover with loading spinner, error with 'Try again', empty text and list (NotificationBell.tsx:12, 96-190).
- Feed hook polls every 60,000 ms while the person is active, aborts older requests, marks one read optimistically, marks all read optimistically with rollback and a refresh if state moved (apps/web/features/notifications/hooks/use-notification-feed.ts:6-124).
- Endpoint GET and PATCH /api/notifications with rate limit, keyset cursor, CSRF on the update (apps/web/app/api/notifications/route.ts:24-95).
- Palette: capture-phase shortcut so one binding wins on every page (CommandPaletteProvider.tsx:16-29); filtering, recents of 5, search of at least 2 characters after 200 ms for 10 results, type filter chips, model submenu (CommandPalette.tsx:111-112, 338-410).
- Activity feed from security audit logs, 50 by default and up to 200, grouped consecutive repeats, with loading, error with retry and empty states (apps/web/app/api/settings/activity/route.ts:19-58; RecentActivityPanel.tsx:63-160).
- Connector card states and actions in the shared directory view (ConnectorDetailView.tsx:261-320) and warnings for 'Needs to be reconnected.' and not responding in the web adapter (useConnectorsSettingsAdapter.tsx:686-700).
- Mobile connector card shows 'Connected <date>' or 'Not connected' and a Reconnect notice for expired OAuth connectors (cloud-connectors/index.tsx:153-170, 298-304).
- CLI connectors list prints 'connected since <date>', a health word or 'needs reconnecting: open <url>' and supports disconnect (apps/cli/src/cloud/connectors.rs:176-206, 56).
- Chrome palette with Enter to run (commandPalette.ts:270).

**Incomplete**

- Mobile has no global command palette by decision; it has a destination search on the chats list and a chat command list (apps/mobile/src/features/chat/ChatsListScreen.tsx:391; apps/mobile/src/features/chat/components/CommandPalette.tsx:10).
- The palette's search merges chats, messages, projects, files, artifacts, research reports, code sessions and scheduled items, not only chats (CommandPalette.tsx:77-91).
- Mobile inbox mixes account feed items and device-held items; the device store keeps at most 50 (apps/mobile/services/notifications.ts:661-703; apps/mobile/src/features/notifications/accountFeed.ts).
- Activity feed content is the security audit record; whether runs or changes are included depends on activity-presentation.ts, which was not read.
- Bell wiring in the Tauri desktop shell was not found in apps/desktop/src; the public desktop window shows the hosted web app (doc: AGENTS.md section 5).

**Present but disconnected or switched off**

- A desktop palette test is skipped (apps/desktop/src/features/chat/__tests__/CommandPalette.test.tsx.skip).

**Not available**

- Activity feed on CLI, VS Code, Chrome (brief S9.20).
- Notification inbox on CLI, VS Code, Chrome (brief S9.37).
- Global command palette on mobile (doc: docs/decisions/2026-09-27-founder-decisions.md:412-421 D-2026-09-28-27).

## 4. Required behaviour

**Established requirements**

- The user sees a feed of recent account events, newest first. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.20)
- The inbox lists notifications newest first, marks unread visibly and for screen readers, and lets the user open or mark them read. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.37)
- A shortcut opens a searchable list of commands and destinations; typing filters; Enter runs. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.38)
- Each integration shows connection state (connected, expired, not connected) and the action to connect or disconnect. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S9.33)
- A global command palette is not built on mobile. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:412-421)
- The bell shows a capped count and a spoken unread label. (source: NotificationBell.tsx:12, 30-33)
- An action that cannot be undone asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Signed in with 12 unread: the badge reads 9+ and the button's accessible name says '12 unread'.
2. Open the popover with the server blocked: an error and 'Try again' appear; Try again reloads.
3. Click a notification with a link: it is marked read, the popover closes and the page opens.
4. Press Mark all as read with the update blocked: the list returns to its previous state and the alert shows.
5. Press Cmd+K on a chat page: the palette opens once; type two letters of a chat title and see it listed after a short pause; Enter opens it.
6. Open Settings, Account: recent events newest first, repeated lines show ×N.
7. A connector needing reauthorisation shows Reconnect; a connected one shows Connected and Disconnect.
8. In the CLI, list connectors: each line shows connected since a date or needs reconnecting.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's 'expired' state is shown as needs reauthorisation or not responding [inferred from useConnectorsSettingsAdapter.tsx:686-700].
- The activity feed should state in its title that it is the account's security activity [inferred from RecentActivityPanel.tsx:10-11].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let mobile and the CLI show the same server inbox, since the endpoint exists.
- [proposed] Name the feed 'Account activity' on the page and brief so it matches its content.
- [proposed] Un-skip or replace the desktop palette test.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | NotificationBell | `apps/web/features/notifications/components/NotificationBell.tsx` | Bell, badge and popover inbox. |
| hook | useNotificationFeed | `apps/web/features/notifications/hooks/use-notification-feed.ts` | Polling, mark read, mark all read. |
| service | notification-feed-client | `apps/web/features/notifications/lib/notification-feed-client.ts` | Fetch and mark-read calls. |
| endpoint | GET and PATCH /api/notifications | `apps/web/app/api/notifications/route.ts` | List and mark read. |
| service | notification-service | `apps/web/lib/services/notification-service.ts` | Reads and updates public.notifications. |
| component | SidebarBrandRow | `apps/web/shared/components/layout/SidebarBrandRow.tsx` | Places the bell. |
| component | CommandPalette | `apps/web/shared/components/CommandPalette/CommandPalette.tsx` | Commands, recents, search, filters. |
| component | CommandPaletteProvider | `apps/web/shared/components/CommandPalette/CommandPaletteProvider.tsx` | Shortcut and lazy load. |
| service | global-search-service | `apps/web/features/chat/services/global-search-service.ts` | Calls /api/search. |
| component | RecentActivityPanel | `apps/web/features/settings/components/RecentActivityPanel.tsx` | Activity list with grouping. |
| hook | useUserActivity | `apps/web/features/settings/hooks/use-settings-queries.ts` | Query for /api/settings/activity (line 1411). |
| endpoint | GET /api/settings/activity | `apps/web/app/api/settings/activity/route.ts` | Reads security audit logs. |
| table | security_audit_logs | `apps/web/app/api/settings/activity/route.ts` | Source rows (line 52). |
| component | ConnectorDetailView | `packages/ui/ui/src/directory/ConnectorDetailView.tsx` | Connect, Connected, Reconnect, Disconnect. |
| hook | useConnectorsSettingsAdapter | `apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx` | Maps server connections to card state. |
| screen | Mobile notifications | `apps/mobile/app/(app)/notifications/index.tsx` | Inbox screen with priority tones. |
| service | Mobile notification centre | `apps/mobile/services/notifications.ts` | Device store of up to 50 items and unread count. |
| service | Mobile account feed | `apps/mobile/src/features/notifications/accountFeed.ts` | Calls /api/notifications. |
| screen | Mobile cloud connectors | `apps/mobile/src/features/settings/cloud-connectors/index.tsx` | Connector cards and reconnect. |
| service | CLI connectors | `apps/cli/src/cloud/connectors.rs` | List, render and disconnect. |
| component | CLI command popup | `apps/cli/src/tui/widgets/command_popup.rs` | Filtered command list. |
| component | Chrome command palette | `apps/extension/src/features/side-panel/commandPalette.ts` | Go and chats palette. |
| service | Mobile destination search | `apps/mobile/src/features/search/mobileDestinations.ts` | Destination search used on the chats list. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The bell mounts for a signed-in session and polls the feed every minute while the person is active. | device | NotificationBell.tsx:96-104; use-notification-feed.ts:6, 56-76 |
| The server lists the user's notifications by keyset cursor with an optional unread filter. | our servers | apps/web/app/api/notifications/route.ts:34-65 |
| Opening a row updates local state at once and sends PATCH with the id; failure is ignored for single rows. | device and our servers | use-notification-feed.ts:78-92 |
| Mark all sends PATCH with all true; on failure the list rolls back and an alert shows. | device and our servers | use-notification-feed.ts:94-115; NotificationBell.tsx:105-108, 168-172 |
| The palette shortcut is caught before page handlers, loads the palette code on first use and toggles it. | device | CommandPaletteProvider.tsx:11-33 |
| Typed text filters local commands; after 200 ms and 2 or more characters the palette calls /api/search for 10 results. | device and our servers | CommandPalette.tsx:338-380; global-search-service.ts:189 |
| Activity: the settings query calls /api/settings/activity with the auth token; the server selects from security_audit_logs for the user. | our servers | use-settings-queries.ts:1411-1436; activity/route.ts:47-57 |
| Connector cards combine the connector catalogue with the account's connections; Connect starts OAuth, Disconnect removes the connection. | device and our servers | useConnectorsSettingsAdapter.tsx:686-720; apps/cli/src/cloud/connectors.rs:10-70 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Notifications | database table notifications | Served to Web and mobile account feed | The service has insert and delete statements (notification-service.ts:74, 99); retention rule not read |
| Mobile device notification items | Mobile key-value storage key notification-center-items, limit 50 | No, device only | Cleared by the clear function (notifications.ts:661-703, 771) |
| Security activity rows | database table security_audit_logs | Read on demand | not established |
| Connector connections | server connection records via /api/connectors | Read on demand by Web, mobile and CLI | Removed on Disconnect |

**Models and providers.** No model is involved in the bell, activity feed or connector cards. The palette's model submenu lists models from the catalogue and switches the active model (CommandPalette.tsx:322-336).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in required for the bell, activity, chat search and connectors (NotificationBell.tsx:100-104; CommandPalette.tsx:338; activity/route.ts uses getUserScopedDb). |
| Permissions | Mark read needs a CSRF token (notifications/route.ts:76-77). Connectors can be disabled by account rules, giving 'Connectors are unavailable right now' (useConnectorsSettingsAdapter.tsx:398, 672-676). |
| Subscription | Connector availability may depend on the plan through the connectorsAllowed rule (useConnectorsSettingsAdapter.tsx:672-676); the exact rule was not read. No plan rule found for the bell, palette or activity feed. |
| Limits and metering | Rate limit bucket 'notifications' (notifications/route.ts:26); activity limit 1 to 200 (activity/route.ts:20); palette search limit 10. |
| Feature flags | Mobile notifications are gated by a feature flag import FEATURES (apps/mobile/app/(app)/notifications/index.tsx:33); value not read. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | The palette's local commands work without a network; search results need the cloud. Desktop Local mode keeps the palette from the web shell [inferred]. CLI palette is local. Connector cards need an account; the CLI connectors command connects with the account privacy mode (apps/cli/src/lib.rs:7387 context). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Inbox loading | Spinner labelled 'Loading notifications'. | NotificationBell.tsx:174-176 |
| Inbox error | Message and 'Try again'; if data was already shown the error is not shown. | use-notification-feed.ts:51-54; NotificationBell.tsx:177-190 |
| Inbox empty | 'When a run finishes, a report is ready or something needs you, it shows up here.' | NotificationBell.tsx:~185-190 |
| Signed out | The bell is not rendered. | NotificationBell.tsx:100-104 |
| Account switch | The bell is keyed by user id so state resets. | NotificationBell.tsx:103 |
| Mark all fails | Rollback or refresh, alert shown. | use-notification-feed.ts:101-114 |
| Palette no result | Status text; search error text if the service fails. | CommandPalette.tsx:558-566 |
| Palette IME or shortcut clash | Capture phase with stopPropagation prevents the chat page's own Cmd+K from also firing. | CommandPaletteProvider.tsx:18-24 |
| Activity states | Loading status, error alert with Try again, empty 'Nothing recorded on this account yet.' | RecentActivityPanel.tsx:92-135 |
| Connector coming soon or credential form | Coming soon notice; API key form for key-based connectors. | ConnectorDetailView.tsx:322-335, 178-181 |
| Offline | not handled in the code beyond the error states above. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/notifications/components/__tests__/NotificationBell.test.tsx`: Bell.
- `apps/web/features/notifications/hooks/__tests__/useNotificationFeed.test.tsx`: Feed hook.
- `apps/web/app/api/notifications/__tests__/route.test.ts`: Notifications endpoint.
- `apps/web/shared/components/CommandPalette/CommandPalette.test.tsx`: Palette; siblings cover legibility, shortcut hints and the provider.
- `apps/web/features/settings/components/__tests__/RecentActivityPanel.test.tsx`: Activity panel.
- `apps/web/app/api/settings/activity/route.test.ts`: Activity endpoint.
- `packages/ui/ui/src/directory/__tests__/ConnectorDetailView.test.tsx`: Connector card states.
- `apps/mobile/__tests__/AccountNotificationFeed.test.tsx`: Mobile account feed and mark read.
- `apps/mobile/__tests__/CommandPaletteBoundary.test.tsx`: Mobile chat command palette.
- `apps/mobile/__tests__/CloudConnectorsPage.test.tsx`: Mobile connectors page.
- `apps/extension/__tests__/command-palette.test.ts`: Chrome palette.
- `apps/cli/src/tui/widgets/command_popup.rs`: Unit tests in the file (about 17 test attributes).

**Test scenarios**

- **Badge and label**
  1. Create 12 unread notifications.
  2. Look at the bell and inspect its accessible name.
  - Expected: Badge shows 9+; name reads 'Notifications, 12 unread'.
- **Mark all failure**
  1. Open the popover.
  2. Block PATCH /api/notifications.
  3. Press Mark all as read.
  - Expected: List returns to unread state and the alert text shows.
- **Palette search**
  1. Press Cmd+K.
  2. Type two letters of a chat title.
  3. Press Enter on it.
  - Expected: After about 200 ms the chat is listed; Enter opens it and closes the palette.
- **Shortcut on chat page**
  1. Open a chat.
  2. Press Cmd+K.
  - Expected: Only the palette opens, not a second search dialog.
- **Activity repeats**
  1. Sign in from the same device several times.
  2. Open Settings, Account.
  - Expected: One line with ×N and the device name.
- **Connector reconnect**
  1. Use a connector whose authorisation expired.
  2. Open its card.
  - Expected: Reconnect is shown with 'Needs to be reconnected.'; Disconnect is available.

**Where to look when it fails**

- Table notifications and server rate limit bucket 'notifications'.
- Error text 'Notifications could not be loaded.' and 'Recent activity could not be loaded.' in the UI.
- Table security_audit_logs for activity rows.
- CLI message 'the disconnect was not confirmed, so the connector may still be connected' (connectors.rs:35).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/009-compound-interface-components.md](../../70-qa/test-plans/web/009-compound-interface-components.md)
- Desktop: [70-qa/test-plans/desktop/009-compound-interface-components.md](../../70-qa/test-plans/desktop/009-compound-interface-components.md)
- Mobile: [70-qa/test-plans/mobile/009-compound-interface-components.md](../../70-qa/test-plans/mobile/009-compound-interface-components.md)
- CLI: [70-qa/test-plans/cli/009-compound-interface-components.md](../../70-qa/test-plans/cli/009-compound-interface-components.md)
- Chrome: [70-qa/test-plans/chrome/009-compound-interface-components.md](../../70-qa/test-plans/chrome/009-compound-interface-components.md)

## 10. Gaps and dependencies

- **Mobile has no global command palette (accepted by decision).** Affects: Mobile.. Evidence: docs/decisions/2026-09-27-founder-decisions.md:412-421.. Work needed: None unless the decision changes.
- **Inbox and activity feed missing on CLI, VS Code and Chrome.** Affects: Those apps.. Evidence: Brief S9.20, S9.37.. Work needed: Decide scope; the server endpoints already exist.
- **Mobile inbox mixes device items with server items; the web inbox shows server items only.** Affects: Mobile, Web consistency.. Evidence: notifications.ts:661-703; accountFeed.ts.. Work needed: Document or unify.
- **Brief calls the activity feed sign-ins, changes and runs; the panel shows the security audit record.** Affects: Web, mobile.. Evidence: RecentActivityPanel.tsx:10-11; activity/route.ts:52.. Work needed: Confirm event types or adjust the brief.
- **Desktop palette test is skipped.** Affects: Desktop Tauri tests.. Evidence: CommandPalette.test.tsx.skip in apps/desktop/src/features/chat/__tests__.. Work needed: Replace or remove.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- api:GET /api/notifications
- api:PATCH /api/notifications
- api:GET /api/settings/activity
- api:GET /api/search
- api:GET /api/connectors
- table:notifications
- table:security_audit_logs
- SYS-sync-and-continuity
- SYS-connectors-plugins-and-skills
- SYS-authentication-and-identity
- SYS-observability-and-operations
- file:apps/web/features/notifications/components/NotificationBell.tsx

## Unknown

- Which event types the activity feed includes (activity-presentation.ts not read).
- Notification retention and which events create notifications.
- Whether the Tauri desktop shell mounts a bell; none found.
- The connectorsAllowed rule and whether a plan controls it.
- How VS Code surfaces the palette beyond contributed commands (package.json:1052 and commandSetup.ts not read in detail).
- Value of the mobile notifications feature flag.
- How the CLI OpenPalette key is bound by default (keybindings.rs:56 not interpreted).
- Which docs/product pages describe notifications and the palette; none were read.
