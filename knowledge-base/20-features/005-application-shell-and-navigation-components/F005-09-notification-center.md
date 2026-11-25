---
id: "F005-09"
type: "feature"
title: "Notification center"
aliases: ["Notification center", "Notification bell", "Notifications popover", "Notifications screen (mobile)", "Account notifications feed", "S5.28"]
area: "5 Application shell and navigation components"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S5.28"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "SYS-authentication-and-identity", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "SYS-sync-and-continuity", "api:GET /api/notifications", "api:PATCH /api/notifications", "table:notifications"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F005-09 Notification center

A bell in the Web and Desktop sidebar opens a list of account notifications with an unread count, per-item open and mark-read, and Mark all as read. Mobile has a Notifications screen that merges account and on-device items. CLI, VS Code and Chrome have none.

Area: [5. Application shell and navigation components](README.md). Requirement items: [S5.28](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s528).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lists the person's account notifications, shows how many are unread (capped at 9+), opens the linked screen and marks items read.

**Why it exists.** Long runs, reports and approvals finish when the person is away; the center tells them what needs attention (S5.28).

**Who uses it.** Signed-in people on Web, Desktop and Mobile.

**Problems it solves**

- Missing that a run finished or needs input.
- Having to search for the item a notice refers to.

**Use cases**

- See '3' on the bell, open it, click a finished report to go to it.
- Click Mark all as read to clear the count.
- On a phone, open Notifications to see account items and device alerts together.

## 2. User experience

**Where to find it**

- Web and Desktop: bell button in the sidebar brand row, label 'Notifications' or 'Notifications, N unread' (apps/web/features/notifications/components/NotificationBell.tsx:36-39; apps/web/shared/components/layout/SidebarBrandRow.tsx).
- Mobile: screen at apps/mobile/app/(app)/notifications/index.tsx, opened from the drawer (DrawerContent.tsx:560 per brief; not opened).
- CLI, VS Code, Chrome: none (brief).

**Before you start**

- Signed in; signed-out people see no bell (NotificationBell.tsx:101-105).
- Mobile account items need the cloud unlock flag from the waitlist store (notifications/index.tsx:219-220).

**Screens and controls**

- Popover titled 'Notifications'.
- Button 'Mark all as read' shown only when there are unread items (NotificationBell.tsx:171-181).
- Rows with title, up to two lines of message, relative time and an unread dot; error items show an alert icon.
- Error view 'Notifications could not be loaded.' with 'Try again'.
- Empty view 'When a run finishes, a report is ready or something needs you, it shows up here.'
- Mobile: back button 'Go back', 'Mark all as read', 'Clear notifications on this device', per-row 'Mark as read'.

**Journey**

1. 1. Click the bell; the feed refreshes.
2. 2. Read the list (newest first from the server).
3. 3. Click an item: it is marked read and, if it has a link, the popover closes and the app goes there.
4. 4. Or click 'Mark all as read'.
5. 5. Close the popover.

**What the person sees and gets**

- Badge number, or '9+' above 9 (NotificationBell.tsx:13, 117-118).
- Red text 'Those notifications could not be marked as read. Try again.' when mark-all fails (NotificationBell.tsx:184-188).

**Settings**

- Browser push opt-in is a separate component (WebPushOptIn, mounted in AppRuntimeMounts.tsx:24); its settings were not read.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Feed polling every 60 seconds while the browser user is active (use-notification-feed.ts:13, 71-88).
- Opening the popover refreshes the feed (NotificationBell.tsx:113-116).
- Optimistic mark read and mark all read with rollback on failure (use-notification-feed.ts:90-125).
- GET and PATCH /api/notifications with rate limit, CSRF on PATCH, and user-scoped database (apps/web/app/api/notifications/route.ts:34-100).
- Mobile screen merges account and device items, mark-all calls both (notifications/index.tsx:260-263).

**Incomplete**

- Individual mark-read failures are swallowed with no message (use-notification-feed.ts:90-98 catch returns undefined).

**Present but disconnected or switched off**

- Mobile account items are off until cloudUnlocked is true (notifications/index.tsx:219-221).

**Not available**

- CLI, VS Code and Chrome (brief S5.28 status missing).

## 4. Required behaviour

**Established requirements**

- A notification center lists account notifications, shows an unread count, and lets the user open and mark them read. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.28)

**Acceptance criteria**

1. Signed-out Web shows no bell.
2. Unread count shows 1-9 as a number and 10 or more as '9+'.
3. Opening the popover triggers a fresh fetch.
4. Clicking an item with a link marks it read and navigates.
5. Mark all as read sets the count to 0; a failed call restores the list and shows the error line.
6. A failed load shows 'Notifications could not be loaded.' and Try again works.
7. Empty feed shows the empty text.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Individual mark-read failure should tell the person [inferred from mark-all behaviour].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a notification entry to CLI, VS Code and Chrome if the owner wants parity.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | NotificationBell | `apps/web/features/notifications/components/NotificationBell.tsx` | Bell, badge, popover, rows |
| hook | useNotificationFeed | `apps/web/features/notifications/hooks/use-notification-feed.ts` | Fetch, poll, mark read |
| service | notification-feed-client | `apps/web/features/notifications/lib/notification-feed-client.ts` | GET and PATCH calls with CSRF |
| service | notificationTargetHref | `apps/web/features/notifications/lib/notification-target.ts` | Turns a target into an in-app path |
| component | SidebarBrandRow | `apps/web/shared/components/layout/SidebarBrandRow.tsx` | Hosts the bell |
| endpoint | api:GET /api/notifications | `apps/web/app/api/notifications/route.ts` | List feed |
| endpoint | api:PATCH /api/notifications | `apps/web/app/api/notifications/route.ts` | Mark read |
| service | notification-service | `apps/web/lib/services/notification-service.ts` | Reads and updates the notifications table |
| table | notifications | `apps/web/lib/services/notification-service.ts` | Stores account notifications |
| schema | notifications contract | `packages/contracts/cloud-contracts/src/notifications.ts` | NOTIFICATIONS_PATH and wire schemas |
| screen | Notifications screen | `apps/mobile/app/(app)/notifications/index.tsx` | Mobile center |
| hook | useAccountNotifications | `apps/mobile/src/features/notifications/accountFeed.ts` | Mobile account feed |
| service | productLinks | `apps/mobile/src/features/notifications/productLinks.ts` | Mobile routes for notification targets |
| component | WebPushOptIn | `apps/web/features/notifications/components/WebPushOptIn.tsx` | Browser push opt in (related) |
| test | NotificationBell test | `apps/web/features/notifications/components/__tests__/NotificationBell.test.tsx` | Bell behaviour |
| test | feed hook test | `apps/web/features/notifications/hooks/__tests__/useNotificationFeed.test.tsx` | Hook behaviour |
| test | route test | `apps/web/app/api/notifications/__tests__/route.test.ts` | API route |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Bell mounts for a signed-in person and polls the feed | device | NotificationBell.tsx:101-105; use-notification-feed.ts:71-88 |
| GET /api/notifications?limit=20 with rate limit | our servers | notification-feed-client.ts:11-16; route.ts:34-60 |
| Server reads the person's rows from notifications through a user-scoped database | our servers | route.ts:56-63; notification-service.ts:181 |
| Click marks read in memory then PATCH with CSRF token | device and our servers | use-notification-feed.ts:90-98; notification-feed-client.ts:26-37 |
| Click navigates with router.push to the item's link | device | NotificationBell.tsx:92-96 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Notification rows (title, message, severity, target, read) | table notifications | yes, server is the source | a delete statement exists in notification-service.ts:99; the retention rule was not read |
| Feed copy in the page | component memory | refreshed every 60 s | lost on reload |

**Models and providers.** No model or provider takes part in showing or marking notifications. Notifications can be created by runs that use models, but that creation was not traced.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in required (NotificationBell.tsx:101-105; route uses getUserScopedDb). |
| Permissions | A person sees only their own rows (user scoped database); workspace not resolved (route.ts:30 resolveOrganization false). |
| Subscription | none found in the code |
| Limits and metering | Rate limit bucket 'notifications' (route.ts:28); page size 20 on Web (notification-feed-client.ts:9), 30 on mobile (accountFeed.ts:19); max limit from contract. |
| Feature flags | Mobile: cloudUnlocked from the waitlist store gates account items. |
| Model compatibility | not applicable |
| Provider restrictions | not applicable |
| Local mode | The Web and Desktop bell needs our servers, so a Local-only person who is signed in still reads the account feed from the server; nothing is sent from the device to a model. Mobile shows on-device alerts without the account feed when cloud is not unlocked (notifications/index.tsx:219-263). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading | Spinner 'Loading notifications' | NotificationBell.tsx:197-200 |
| error | Message and Try again | NotificationBell.tsx:201-214 |
| empty | Empty text | NotificationBell.tsx:215-219 |
| mark-all failure | Rollback and error line with role=alert | use-notification-feed.ts:112-123; NotificationBell.tsx:184-188 |
| error after data loaded | Keeps old list (status stays ready) | use-notification-feed.ts:43-45 |
| inactive browser | Polling skips | use-notification-feed.ts:68 |
| offline | not handled in the code beyond the failed fetch | use-notification-feed.ts:41-45 treats any fetch failure as an error |
| accessibility | Aria label with unread count, screen-reader text ', unread', 44px touch size on coarse pointers | NotificationBell.tsx:36-39, 67-69, 129 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/notifications/components/__tests__/NotificationBell.test.tsx`: Bell UI
- `apps/web/features/notifications/hooks/__tests__/useNotificationFeed.test.tsx`: Feed hook
- `apps/web/app/api/notifications/__tests__/route.test.ts`: API route
- `apps/web/shared/components/layout/__tests__/SidebarBrandRow.test.tsx`: Brand row with bell

**Test scenarios**

- **Badge cap**
  1. Create 12 unread notifications
  2. Load Web
  - Expected: Badge shows 9+
- **Open item**
  1. Click an item with a link
  - Expected: Marked read, popover closes, app navigates
- **Mark all fail**
  1. Block the PATCH call
  2. Click Mark all as read
  - Expected: List restored and error line shown
- **Signed out**
  1. Sign out
  - Expected: No bell
- **Mobile merge**
  1. Open Notifications on a phone with cloud unlocked
  - Expected: Account and device items together

**Where to look when it fails**

- Network tab for /api/notifications status codes (429 means rate limit).
- Table notifications rows for the user.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/web/005-application-shell-and-navigation-components.md)
- Desktop: [70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md)
- Mobile: [70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md)

## 10. Gaps and dependencies

- **Single mark-read failure is silent** Affects: Web, Desktop. Evidence: use-notification-feed.ts:90-98. Work needed: Show an error or revert
- **No notification center on CLI, VS Code, Chrome** Affects: Those apps. Evidence: Brief S5.28. Work needed: Decide scope, then build
- **Polling every 60 s only, no push to the open page** Affects: Web, Desktop. Evidence: use-notification-feed.ts:13. Work needed: Optional [proposed]
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- SYS-authentication-and-identity
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- SYS-sync-and-continuity
- api:GET /api/notifications
- api:PATCH /api/notifications
- table:notifications

## Unknown

- How and where notifications are created (producers).
- Retention and deletion rule for notifications rows.
- Whether Desktop shows native alerts for them (desktop notify handler exists at main.ts:566-580; link not traced).
- Mobile drawer entry details (DrawerContent.tsx:560 not opened).
- Plan limits on notifications: none found.
