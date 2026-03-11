# Sub-Feature: Notifications

> Three-tier notification system spanning OS-level desktop notifications, an in-app notification center with persistence and pagination, and ephemeral Sonner/Radix toasts for transient feedback.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Rust — OS notifications | `apps/desktop/src-tauri/src/sys/commands/notifications.rs` |
| Rust — In-app notification center | `apps/desktop/src-tauri/src/sys/commands/notification_center.rs` |
| Rust — Command registry | `apps/desktop/src-tauri/src/sys/commands/mod.rs` (re-exports both modules) |
| Rust — State init | `apps/desktop/src-tauri/src/lib.rs` (lines ~524, ~804) |
| Rust — System tray | `apps/desktop/src-tauri/src/ui/tray.rs` |
| Rust — Tray badge command | `apps/desktop/src-tauri/src/sys/commands/tray.rs` |
| Rust — Background agent notifications | `apps/desktop/src-tauri/src/core/agent/background_agent.rs` |
| Rust — Scheduler notification action | `apps/desktop/src-tauri/src/sys/commands/scheduler.rs` |
| Rust — Hooks event type | `apps/desktop/src-tauri/src/core/hooks/event.rs` (`HookEvent::Notification`) |
| Rust — Hooks executor (env vars) | `apps/desktop/src-tauri/src/core/hooks/executor.rs` |
| Rust — Plugin dependency | `apps/desktop/src-tauri/Cargo.toml` (`tauri-plugin-notification`) |
| TS — useNotifications hook | `apps/desktop/src/hooks/useNotifications.ts` |
| TS — useNotificationEvents hook | `apps/desktop/src/hooks/useNotificationEvents.ts` |
| TS — useTrayQuickActions hook | `apps/desktop/src/hooks/useTrayQuickActions.ts` |
| TS — useToast hook (Radix) | `apps/desktop/src/hooks/useToast.ts` |
| TS — NotificationCenter component | `apps/desktop/src/components/Notifications/NotificationCenter.tsx` |
| TS — NotificationsSettings component | `apps/desktop/src/components/Settings/NotificationsSettings.tsx` |
| TS — ErrorToast component | `apps/desktop/src/components/Errors/ErrorToast.tsx` |
| TS — Toast primitives (Radix) | `apps/desktop/src/components/ui/Toast.tsx` |
| TS — Toaster (Radix) | `apps/desktop/src/components/ui/Toaster.tsx` |
| TS — Settings dialog integration | `apps/desktop/src/components/Settings/SettingsPanel.tsx` |
| TS — Settings dialog store | `apps/desktop/src/stores/settingsDialogStore.ts` (tab: `'notifications'`) |
| DB — Settings category | `apps/desktop/src-tauri/src/data/db/migrations.rs` (category `'notifications'`) |

## Architecture Overview

The notification system is structured into three independent tiers that can operate simultaneously:

```
                    +----------------------------+
                    |      Frontend (React)      |
                    +----------------------------+
                    |                            |
        +-----------+----------+    +-----------+-----------+
        | NotificationCenter   |    | Sonner toasts (inline)|
        | (Popover, Bell icon) |    | Radix Toast (Toaster) |
        | useNotifications()   |    | ErrorToastContainer   |
        +----------+-----------+    +-----------+-----------+
                   |                            |
          invoke() IPC                   Direct import
                   |                    (no IPC needed)
        +----------v-----------+
        | notification_center  |    +-------------------------+
        | commands (in-app)    |    | notifications commands  |
        | NotificationCenter-  |    | (OS-level desktop)      |
        | State (in-memory)    |    | NotificationState       |
        +----------------------+    | (scheduled notifs)      |
                                    +----------+--------------+
                                               |
                                    tauri-plugin-notification
                                               |
                                    +----------v-----------+
                                    | macOS / Windows / Linux |
                                    | native notification    |
                                    | subsystem              |
                                    +------------------------+
```

### Tier 1: OS-Level Desktop Notifications (`notifications.rs`)

Uses `tauri-plugin-notification` to send native operating system notifications. These appear in the OS notification center (macOS Notification Center, Windows Action Center, etc.). Supports:

- **Immediate notifications** via `notification_show` and `notification_show_with_actions`
- **Scheduled notifications** via `notification_schedule` and `notification_schedule_reminder`, backed by a background tokio task that polls every 10 seconds
- **Permission management** via `notification_check_permission` and `notification_request_permission`
- **Action buttons** on interactive notifications (platform-dependent)

State: `NotificationState` — an in-memory `HashMap<String, ScheduledNotification>` wrapped in `Arc<Mutex<...>>`, managed by Tauri. Scheduled notifications auto-clean after 24 hours once delivered.

### Tier 2: In-App Notification Center (`notification_center.rs`)

A persistent, paginated notification inbox inside the app. Separate from OS notifications entirely. Supports:

- **11 notification types**: System, TaskComplete, TaskFailed, AgentActivity, McpServer, Reminder, Achievement, Team, Info, Warning, Error
- **4 priority levels**: Low, Normal, High, Urgent
- **Pagination** with configurable page size (max 100 per page)
- **Filtering** by read status and notification type
- **Settings** including Do-Not-Disturb with time-window support (handles overnight ranges)
- **Expiration** — notifications can have an `expires_at` timestamp and are filtered out when expired

State: `NotificationCenterState` — in-memory `Vec<Notification>` capped at 1000 entries, plus `NotificationSettings`. The comment in the source notes this should eventually move to SQLite for true persistence.

### Tier 3: Ephemeral Toasts (Sonner + Radix)

Two parallel toast systems for transient, non-persistent feedback:

1. **Sonner** (`import { toast } from 'sonner'`) — Used extensively across 80+ files for inline success/error/info feedback. No IPC needed; purely frontend. Driven by `useNotificationEvents` for system events (automation permissions, calendar, cloud, Gmail, MCP).

2. **Radix Toast** (`useToast` hook + `Toaster` component) — Mounted in `main.tsx`. Uses `@radix-ui/react-toast` primitives with variants: default, destructive, success, warning, info. Includes auto-generated icons per variant. Limited to 1 toast at a time (`TOAST_LIMIT = 1`).

3. **ErrorToast** (`ErrorToastContainer`) — A custom error notification system mounted in `App.tsx` at position `top-right`. Reads from `useErrorStore` (Zustand). Supports severity levels (info, warning, error, critical), retry buttons, help links, and deduplication (count display).

## Notification Types

### OS-Level (`notifications.rs`)

```rust
pub struct ScheduledNotification {
    pub id: String,
    pub title: String,
    pub body: String,
    pub icon: Option<String>,
    pub scheduled_at: DateTime<Utc>,
    pub delivered: bool,
    pub actions: Option<Vec<NotificationAction>>,
    pub category: Option<String>,    // used for grouping
}
```

### In-App Center (`notification_center.rs`)

```rust
pub enum NotificationType {
    System,         // updates, errors
    TaskComplete,   // agent/goal completions
    TaskFailed,     // agent/goal failures
    AgentActivity,  // agent lifecycle events
    McpServer,      // MCP server health
    Reminder,       // user reminders
    Achievement,    // milestones
    Team,           // team-related
    Info,           // general info (default)
    Warning,        // warnings
    Error,          // errors
}

pub enum NotificationPriority {
    Low, Normal, High, Urgent
}
```

Each notification carries optional `action_url`, `action_label`, `icon`, `metadata` (arbitrary JSON), `dismissible` flag, and `expires_at`.

### Frontend Icon Mapping

`NotificationCenter.tsx` maps each type to a Lucide icon with color:

| Type | Icon | Color |
|------|------|-------|
| `system` | Settings | default |
| `task_complete` | CheckCircle | green-500 |
| `task_failed` | AlertCircle | red-500 |
| `agent_activity` | Zap | purple-500 |
| `mcp_server` | Settings | blue-500 |
| `reminder` | Clock | yellow-500 |
| `achievement` | Trophy | amber-500 |
| `team` | Users | indigo-500 |
| `info` | Info | blue-500 |
| `warning` | AlertTriangle | yellow-500 |
| `error` | AlertCircle | red-500 |

## Tray Integration

### System Tray Menu (`ui/tray.rs`)

The system tray provides window management and quick actions but does not directly surface notifications. Menu items:

- Show / Hide — toggle main window visibility
- New Conversation — emits `tray:new_conversation` event
- Settings — emits `tray:open_settings` event
- Pin/Unpin, Toggle Always On Top
- Quit

Left-click on tray icon toggles window visibility.

### Tray Badge (`sys/commands/tray.rs`)

```rust
#[tauri::command]
pub fn tray_set_unread_badge(_app: AppHandle, count: u32) -> Result<(), String>
```

Currently a **placeholder** (logs the count, does not actually set a badge). Called from `useTrayQuickActions` whenever `unreadCount` changes (clamped to 0-99).

### `useTrayQuickActions` Hook

Listens for tray events (`tray:new_conversation`, `tray:open_settings`) and forwards them to provided callbacks. Syncs unread notification count to the tray badge via `tray_set_unread_badge`.

## Rust Commands (IPC)

### OS-Level Notification Commands

All registered in `lib.rs` under `crate::sys::commands::*`:

| Command | Signature | Description |
|---------|-----------|-------------|
| `notification_show` | `(title, body, icon?) -> ()` | Show immediate OS notification. Checks permission first. |
| `notification_show_with_actions` | `(title, body, actions) -> String` | Show notification with action buttons. Returns notification ID. |
| `notification_check_permission` | `() -> bool` | Check if OS notification permission is granted. |
| `notification_request_permission` | `() -> String` | Request permission. Returns "granted", "denied", or "prompt". |
| `notification_schedule` | `(title, body, at, icon?, category?) -> String` | Schedule future notification (ISO 8601 timestamp). Returns ID. |
| `notification_schedule_reminder` | `(title, body, at, actions?) -> String` | Schedule reminder with optional actions. Auto-categorized as "reminder". |
| `notification_cancel` | `(notificationId) -> ()` | Cancel a scheduled notification by ID. |
| `notification_cancel_all` | `() -> u32` | Cancel all scheduled notifications. Returns count. |
| `notification_get_scheduled` | `() -> Vec<ScheduledNotification>` | List all pending (undelivered) scheduled notifications. |
| `notification_get` | `(notificationId) -> Option<ScheduledNotification>` | Get a specific scheduled notification. |
| `notification_update` | `(notificationId, title?, body?, at?) -> ScheduledNotification` | Update a pending notification. Cannot update delivered ones. |
| `notification_register_actions` | `(actions) -> ()` | Register action types (placeholder implementation). |

### In-App Notification Center Commands

All registered under `crate::sys::commands::notification_center::*`:

| Command | Signature | Description |
|---------|-----------|-------------|
| `notification_list` | `(page?, pageSize?, unreadOnly?, notificationType?) -> NotificationListResponse` | Paginated list with filtering. Excludes expired. |
| `notification_mark_read` | `(notificationId) -> bool` | Mark single notification as read. Emits `notification:unread_count`. |
| `notification_mark_all_read` | `() -> usize` | Mark all as read. Emits `notification:unread_count` with 0. |
| `notification_delete` | `(notificationId) -> bool` | Delete single notification. Emits `notification:deleted` and updated count. |
| `notification_delete_all_read` | `() -> usize` | Delete all read notifications. Emits `notification:cleared`. |
| `notification_get_settings` | `() -> NotificationSettings` | Get current notification settings. |
| `notification_set_settings` | `(settings) -> ()` | Update settings. Emits `notification:settings_changed`. |
| `notification_create` | `(input) -> Notification` | Create a new in-app notification. Checks DND, type filters. Emits `notification:new` and `notification:unread_count`. |
| `notification_unread_count` | `() -> usize` | Get current unread count. |

**Note on missing registrations**: `notification_show_with_actions`, `notification_check_permission`, `notification_request_permission`, `notification_schedule`, `notification_schedule_reminder`, `notification_get_scheduled`, `notification_register_actions`, `notification_update`, and `notification_unread_count` are defined in the Rust source but **not registered** in `lib.rs`. Only `notification_show`, `notification_cancel`, `notification_cancel_all`, and `notification_get` are registered from the OS-level module. See [Known Issues](#known-issues--tech-debt).

## Tauri Events (Rust -> Frontend)

### OS-Level Notification Events

| Event | Payload | Emitter |
|-------|---------|---------|
| `notification_delivered` | `String` (notification ID) | Scheduler delivers scheduled notification |
| `notification_shown` | `{ title, body, id?, actions? }` | After showing immediate notification |
| `notification_scheduled` | `{ id, title, body, scheduled_at }` | After scheduling a notification |
| `notification_cancelled` | `String` (notification ID) | After cancelling a scheduled notification |
| `notifications_cleared` | `u32` (count) | After cancelling all |
| `notification_actions_registered` | `Vec<NotificationAction>` | After registering action types |

### In-App Center Events

| Event | Payload | Emitter |
|-------|---------|---------|
| `notification:new` | `Notification` object | When a notification is created |
| `notification:unread_count` | `usize` | On read/delete/create operations |
| `notification:deleted` | `String` (notification ID) | On single delete |
| `notification:cleared` | `usize` (count) | On bulk delete of read notifications |
| `notification:settings_changed` | `NotificationSettings` | On settings update |

### Tray Events

| Event | Payload | Emitter |
|-------|---------|---------|
| `tray:new_conversation` | `()` | Tray menu "New Conversation" click |
| `tray:open_settings` | `()` | Tray menu "Settings" click |

### Integration Events (via `useNotificationEvents`)

| Event | Toast/Action | Domain |
|-------|-------------|--------|
| `task:progress` | Background task update | Agent tasks |
| `task:completed` | Background task complete | Agent tasks |
| `task:failed` | Background task failed | Agent tasks |
| `automation:permission_required` | Sonner toast with "Open Settings" action | Automation |
| `automation:recording_started/stopped` | Action log entry | Automation |
| `automation:action_recorded` | Action log entry | Automation |
| `automation:request_screenshot` | Action log entry | Automation |
| `calendar:auth_started` | Action log + trail entry | Calendar |
| `calendar:connected/disconnected` | Action log + trail entry | Calendar |
| `calendar:event_created/updated/deleted` | Action log + trail entry | Calendar |
| `cloud:auth_started` | Action log + trail entry | Cloud storage |
| `cloud:connected/disconnected` | Action log + trail entry | Cloud storage |
| `cloud:file_uploaded/downloaded/deleted` | Action log + trail entry | Cloud storage |
| `cloud:folder_created` | Action log + trail entry | Cloud storage |
| `gmail:auth_started` | Action log + trail entry | Gmail |
| `gmail:connected/disconnected` | Action log + trail entry | Gmail |
| `gmail:token_refreshed` | Action log + trail entry | Gmail |
| `mcp:server_unhealthy` | MCP store refresh | MCP |
| `mcp:tools_updated` | MCP store refresh | MCP |
| `mcp:system_initialized` | MCP store refresh (servers + tools + stats) | MCP |
| `scheduler:notification` | Emitted by scheduler dispatch | Scheduler |

## Hooks

### `useNotifications`

**File**: `apps/desktop/src/hooks/useNotifications.ts`

Primary hook for the in-app notification center. Manages paginated state, real-time event subscriptions, and CRUD operations.

**Options**:
- `autoFetch` (default: `true`) — fetch notifications and settings on mount
- `pageSize` (default: `20`) — items per page
- `unreadOnly` (default: `false`) — filter to unread
- `filterType` — filter by `NotificationType`

**Returned State**: `notifications`, `unreadCount`, `total`, `page`, `pageSize`, `hasMore`, `isLoading`, `error`, `settings`

**Returned Actions**: `list()`, `markRead(id)`, `markAllRead()`, `deleteNotification(id)`, `deleteAllRead()`, `getSettings()`, `setSettings(s)`, `create(input)`, `refresh()`, `loadMore()`, `clearError()`

**Event Listeners** (set up in `useEffect`):
- `notification:new` — prepends to list, increments unread
- `notification:unread_count` — syncs count
- `notification:deleted` — removes from list
- `notification:settings_changed` — syncs settings

### `useNotificationEvents`

**File**: `apps/desktop/src/hooks/useNotificationEvents.ts`

Extracted from `useAgenticEvents.ts`. Listens to cross-cutting system events and translates them into Sonner toasts, action log entries, and action trail entries. Does not interact with the notification center directly.

**Dependencies** (injected via `NotificationEventDeps`):
- `isMountedRef` — guard against unmounted updates
- `upsertActionLogEntry` — add entries to the action log
- `focusSidecar` — focus the sidecar panel for the relevant domain
- `handlersRef` — background task add/update handlers

Handles ~25 event types across 6 domains: background tasks, automation, calendar, cloud, Gmail, and MCP.

### `useTrayQuickActions`

**File**: `apps/desktop/src/hooks/useTrayQuickActions.ts`

**Options**:
- `onNewConversation` — callback for tray "New Conversation"
- `onOpenSettings` — callback for tray "Settings"
- `unreadCount` — synced to tray badge via `tray_set_unread_badge` IPC

Listens for `tray:new_conversation` and `tray:open_settings` events.

### `useToast` (Radix)

**File**: `apps/desktop/src/hooks/useToast.ts`

Standalone reducer-based toast system using `@radix-ui/react-toast`. Global state via module-level listeners pattern. Limit: 1 toast visible at a time. Auto-removes after 1000ms delay.

## Key Patterns

### Do Not Disturb (DND)

The in-app notification center supports DND with optional time windows:

- **No time range**: blocks all notifications when DND is enabled
- **Normal range** (e.g., 09:00-17:00): blocks during that window
- **Overnight range** (e.g., 22:00-06:00): correctly handles wrap-around

DND is enforced in `notification_create` — if DND is active and the current time is within the window, the command returns an error and the notification is not created.

### Notification Type Filtering

`NotificationSettings.enabled_types` acts as an allowlist. If empty (default), all types are allowed. If populated, only listed types are accepted by `notification_create`.

### Background Agent Desktop Notifications

`BackgroundAgentManager` in `core/agent/background_agent.rs` directly uses `tauri_plugin_notification::NotificationExt` (bypassing the notification commands) to send OS-level desktop notifications when:

- An agent completes successfully: title "Background Task Completed" / "Goal Partially Achieved"
- An agent fails: title "Background Task Failed"

These are fire-and-forget; failures are logged but do not block the agent lifecycle.

### Scheduler Notification Action

The scheduler (`sys/commands/scheduler.rs`) supports a `notification` action type. When a scheduled job of type "notification" triggers, it emits a `scheduler:notification` Tauri event with `{ title, message, jobName, source: "scheduler" }`. The frontend scheduler store listens for this event.

### Hooks System Notification Event

The hooks system (`core/hooks/event.rs`) defines a `HookEvent::Notification` variant. Hook context includes `notification_type`, `notification_title`, and `notification_body` fields. The hooks executor (`core/hooks/executor.rs`) exports these as environment variables (`HOOKS_NOTIFICATION_TYPE`, `HOOKS_NOTIFICATION_TITLE`, `HOOKS_NOTIFICATION_BODY`) to hook scripts.

### In-Memory Storage Cap

The `NotificationCenterState` caps at 1000 notifications. When exceeded, oldest notifications are truncated. The scheduled notification store auto-cleans delivered notifications older than 24 hours.

### Toast Deduplication

The `ErrorToastContainer` (via `useErrorStore`) deduplicates errors by type, incrementing a `count` field rather than showing duplicate toasts.

### Permission Handling (OS Notifications)

`notification_show` and `notification_show_with_actions` check `PermissionState::Granted` before attempting to show. If not granted, they return an error string instructing the user to enable notifications in system settings. `notification_request_permission` can be called to prompt the OS permission dialog.

## Settings

### `NotificationSettings` (In-App Center)

```typescript
interface NotificationSettings {
  enabled: boolean;              // master toggle
  sound_enabled: boolean;        // play sounds for new notifications
  badge_enabled: boolean;        // show badge count on app icon
  desktop_notifications: boolean; // show OS notifications for high priority
  enabled_types: NotificationType[]; // allowlist (empty = all)
  do_not_disturb: boolean;       // DND master toggle
  dnd_start_time: string | null; // HH:MM format
  dnd_end_time: string | null;   // HH:MM format
}
```

Defaults: all enabled, DND off, no type filtering.

### Settings Panel Integration

The Settings dialog (`SettingsPanel.tsx`) includes a "Notifications" tab (registered as `'notifications'` in `settingsDialogStore.ts`). It exposes two toggles:

1. **Desktop Notifications** — maps to `desktop_notifications`
2. **Sound Effects** — maps to `sound_enabled`

Settings are loaded on dialog open and saved alongside all other settings when the user clicks Save.

The SQLite settings table (`data/db/migrations.rs`) includes `'notifications'` as a valid category for the `settings_kv` table.

## Data Flow Examples

### Creating an In-App Notification

```
Frontend                          Rust Backend
   |                                  |
   |-- invoke('notification_create',  |
   |   { input: { title, message,     |
   |     type, priority } })          |
   |                               -->|
   |                                  |-- Check settings.enabled
   |                                  |-- Check enabled_types filter
   |                                  |-- Check DND window
   |                                  |-- Create Notification (UUID)
   |                                  |-- add_notification() (cap 1000)
   |                                  |-- emit('notification:new', notif)
   |                                  |-- emit('notification:unread_count', n)
   |<-- Notification object -----------|
   |                                  |
   |<-- event: notification:new -------|  (real-time listener)
   |   prepend to local list          |
   |   increment unreadCount          |
```

### Background Agent Completion Notification

```
BackgroundAgentManager                  OS
   |                                     |
   |-- agent completes goal              |
   |-- mark_completed()                  |
   |-- send_completion_notification()    |
   |   app.notification().builder()      |
   |     .title("Background Task...")    |
   |     .body(description)              |
   |     .show()                      -->|
   |                                     |-- OS notification banner
   |-- emit("background_agent:completed")|
```

## Known Issues / Tech Debt

1. **In-memory storage only**: `NotificationCenterState` uses `Vec<Notification>` in memory. The source code comment explicitly notes "in production, use SQLite." Notifications are lost on app restart. The SQLite `settings_kv` table has a `'notifications'` category but is only used for settings, not notification records.

2. **Missing command registrations**: Several OS-level notification commands are defined but not registered in `lib.rs`:
   - `notification_show_with_actions`
   - `notification_check_permission`
   - `notification_request_permission`
   - `notification_schedule`
   - `notification_schedule_reminder`
   - `notification_get_scheduled`
   - `notification_register_actions`
   - `notification_update`
   - `notification_unread_count`

   These commands exist in the Rust source and compile, but are unreachable from the frontend.

3. **Tray badge is a placeholder**: `tray_set_unread_badge` in `sys/commands/tray.rs` only logs the count and does nothing. The frontend calls it on every `unreadCount` change, but no badge is actually displayed.

4. **Dual toast systems**: Both Sonner and Radix Toast are mounted simultaneously. Sonner is used in 80+ files across the codebase; Radix Toast is used via `useToast`/`Toaster`. This creates potential UX inconsistency (different toast styles, positions, behavior). ErrorToastContainer adds a third competing system.

5. **Background agent bypasses notification center**: `BackgroundAgentManager` calls `tauri_plugin_notification` directly rather than going through `notification_show` or `notification_create`. This means:
   - No permission check before showing
   - No DND/settings respect
   - Completion notifications do not appear in the in-app NotificationCenter

6. **Scheduler notification is event-only**: The scheduler's `Notification` action type emits a `scheduler:notification` Tauri event but does not call `notification_show` or `notification_create`. The frontend must separately handle this event to show it.

7. **No notification sounds**: `sound_enabled` is stored in settings but no code actually plays sounds when notifications arrive. The setting toggle exists in the UI but has no effect.

8. **`notification_register_actions` is a no-op**: The command logs action registrations but does not actually register them with the OS notification system. Action buttons on notifications may not function as expected.

9. **NotificationCenter component not mounted in app shell**: The `NotificationCenter` component is defined and exported but does not appear to be rendered in `App.tsx` or any layout component. It must be explicitly mounted by a parent to appear.

10. **Scheduled notification polling interval**: The scheduler polls every 10 seconds, meaning notifications can be delivered up to 10 seconds late. For time-sensitive reminders, this granularity may be insufficient.

11. **No notification persistence across sessions**: Both `NotificationState` (scheduled) and `NotificationCenterState` (center) are in-memory only. Restarting the app clears all scheduled and in-app notifications.
