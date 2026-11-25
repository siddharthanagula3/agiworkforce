---
id: "F103-08"
type: "feature"
title: "Notifications and feedback"
aliases: ["Notifications and feedback", "Notifications", "Web push subscriptions", "Browser notifications", "Feedback", "Support tickets and cases", "notifications", "feedback", "web_push_subscriptions", "support_tickets"]
area: "103 Data and persistence categories"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S103.30", "S103.35"]
depends_on: ["SYS-observability-and-operations", "SYS-security-and-privacy", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "SYS-authentication-and-identity", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F103-08 Notifications and feedback

Server tables for in-app notifications, browser push registrations, feedback and response ratings, and support tickets with replies. Push subscriptions and feedback are classified for account erasure. Feedback screenshots live in private object storage with a cleanup ledger. Web push is web-only; feedback is sent from several apps.

Area: [103. Data and persistence categories](README.md). Requirement items: [S103.30](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10330), [S103.35](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10335).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores a notification feed per user, browser Web Push registrations (endpoint and two keys), feedback reports and thumbs ratings with metadata, optional redacted logs and an optional screenshot, and support tickets with replies and escalations (apps/web/db/neon/0016_misc.sql:1-24; apps/web/db/neon/0151_web_push_subscriptions.sql; apps/web/db/neon/0024_support_tickets.sql:9-38).

**Why it exists.** A run that finishes while the person is on web ended silently; push closes that loop (apps/web/db/neon/0151_web_push_subscriptions.sql header). Feedback and ratings tell the team what failed; tickets give a reply channel.

**Who uses it.** Signed-in people (feedback also accepts anonymous reports, apps/web/app/api/feedback/route.ts:132); support staff for tickets (apps/web/lib/support/tickets/store.ts:340-400).

**Problems it solves**

- Move a push endpoint to the new account when someone signs in on the same browser, so the first account stops getting lock-screen notices (apps/web/db/neon/0151_web_push_subscriptions.sql header; apps/web/app/api/web-push/route.ts:86-96).
- Keep dead push endpoints from being retried forever by pruning on 404 or 410 (apps/web/lib/services/web-push-service.ts:49,240-262).
- Keep secrets out of feedback by redacting logs before storing (apps/web/app/api/feedback/route.ts:353).

**Use cases**

- Allow browser notifications so a finished run alerts the person.
- Send feedback with an optional screenshot from the composer dialog.
- Rate an answer up or down and later remove the rating.
- Open a support ticket and read staff replies.

## 2. User experience

**Where to find it**

- Web push: toggle 'Browser notifications' in Settings > Notifications (apps/web/features/notifications/components/WebPushToggle.tsx:121-128; apps/web/features/settings/sections/NotificationsSection.tsx); chat prompt 'Know when a run finishes' (apps/web/features/notifications/components/WebPushOptIn.tsx:105).
- Notification feed: NotificationBell component (apps/web/features/notifications/components/NotificationBell.tsx).
- Feedback on web: composer feedback dialog with 'Feedback type', 'Screenshot', 'Details' (apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:288-373); docs ArticleFeedback; message rating in MessageBubble.
- Feedback on VS Code (apps/extension-vscode/src/features/feedback/submitFeedback.ts:73), CLI (apps/cli/src/cloud/feedback.rs:5), mobile screen apps/mobile/app/(app)/feedback.tsx (endpoint not traced).
- Support tickets: API under /api/support/tickets; visible labels not read.

**Before you start**

- Push: a browser that supports Web Push, notification permission, and server VAPID configuration (WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, WEB_PUSH_VAPID_SUBJECT); without them delivery is off (apps/web/lib/services/web-push-service.ts:104-125).
- Feedback: sign-in optional; ratings removal needs sign-in (apps/web/app/api/feedback/route.ts:392).
- Tickets: signed in.

**Screens and controls**

- Toggle and opt-in card for browser notifications.
- Feedback dialog with type selector, screenshot add and 'Remove screenshot', details text.
- Bell with unread count and mark-read actions (PATCH /api/notifications).

**Journey**

1. Push: person turns on 'Browser notifications'; browser asks permission; the page gets the public key from GET /api/web-push, subscribes, and POSTs the subscription; the server stores it.
2. A run finishes; the server sends an encrypted push to every stored endpoint of that user; the service worker shows it (apps/web/public/sw.js:63-70).
3. Feedback: open dialog, choose a type, add details and optional screenshot, submit; server stores the row and screenshot and answers success with screenshot_stored when a screenshot was sent.
4. Ticket: POST /api/support/tickets, then replies through the ticket routes.

**What the person sees and gets**

- Push subscribe returns success true; refused with 403 if the endpoint belongs to another account (apps/web/app/api/web-push/route.ts:95).
- Feedback returns success and, if a screenshot was attached, screenshot_stored true or false (apps/web/app/api/feedback/route.ts:370-376).
- Notification feed returns items, unreadCount and a page cursor (apps/web/lib/services/notification-service.ts:199-205).

**Settings**

- Browser notifications toggle.
- Email preferences table exists for email notices (apps/web/db/neon/0016_misc.sql:59-70); the screen was not opened.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web push route: GET public key, POST subscribe (CSRF, rate limit, schema limits, public-host check, cross-account takeover refused), DELETE unsubscribe (apps/web/app/api/web-push/route.ts:21-149).
- Sender encrypts the payload, limits concurrency, prunes gone endpoints and records the delivery count (apps/web/lib/services/web-push-service.ts:346-418).
- Notification feed with dedupe key, length clamps (title 200, message 1000), keyset paging, mark read by id or all (apps/web/lib/services/notification-service.ts:25-30,208-230).
- Feedback route stores reports, ratings and screenshots with a cleanup ledger; screenshot max 4 MiB; logs redacted and cut to 20000 characters (apps/web/app/api/feedback/route.ts:30-100,353).
- Support tickets: create, list, reply, status, staff queue, escalation (apps/web/lib/support/tickets/store.ts).
- Erasure: notifications, feedback, feedback_screenshot_cleanups, support_tickets and replies are user-scoped deletes; web_push_subscriptions cascade from profiles (apps/web/lib/server/account-erasure.ts:119-121,145-146,381).

**Incomplete**

- Migration 0151 header states 'NOT YET APPLIED : draft only'; whether production has it is not recorded in the repository (apps/web/db/neon/0151_web_push_subscriptions.sql:3).
- Mobile push uses a different table (mobile_devices) read by push-notification-service; not part of this table (apps/web/lib/services/push-notification-service.ts:113-139).

**Present but disconnected or switched off**

- Web push delivery returns zero sent when VAPID configuration is absent (apps/web/lib/services/web-push-service.ts:346-350).

**Not available**

- Web push on desktop, mobile, CLI, VS Code and Chrome through this table: not found.
- A feedback screen on Chrome and desktop: not found in this pass.

## 4. Required behaviour

**Established requirements**

- Notifications and delivery subscriptions are durably stored and classified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S103.30)
- Feedback and support cases are durably stored and classified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S103.35)
- Push subscriptions and feedback are classified so account erasure reaches them. (source: apps/web/lib/services/deletion-manifest.ts:54,251)
- A push endpoint belongs to one account; re-subscribing under a second account must not add a second owner. (source: apps/web/db/neon/0151_web_push_subscriptions.sql header)
- Push payloads never carry task output because they render on a locked screen. (source: apps/web/lib/services/web-push-service.ts:340-345)

**Acceptance criteria**

1. Subscribing twice with the same endpoint leaves one row and updates last_seen_at.
2. A second account posting an endpoint owned by the first gets 403 and the row is unchanged.
3. A push endpoint returning 410 is deleted after a send.
4. A feedback with a 5 MiB screenshot is refused with a message naming 4 MiB.
5. Logs containing secrets are redacted before storage.
6. After account erasure no notifications, feedback, tickets, replies or push rows remain for that user.
7. Mark all read sets every unread row of the user and nothing else.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Limits not stated in the brief: feed page max from NOTIFICATION_FEED_MAX_LIMIT, title 200, message 1000, details 10000 [inferred from code constants].
- Empty-state wording for the bell was not read; the requirement stays unknown.

**Proposed improvements** (suggestions, not requirements)

- [proposed] State a maximum age for feedback and notifications, since the manifest shows none for feedback.
- [proposed] Cap push subscriptions per account.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | Web push | `apps/web/app/api/web-push/route.ts` | Public key, subscribe, unsubscribe. |
| service | web-push-service | `apps/web/lib/services/web-push-service.ts` | VAPID signing, payload encryption, send, prune. |
| service | push-notification-service | `apps/web/lib/services/push-notification-service.ts` | Fan-out to mobile tokens and web push. |
| table | web_push_subscriptions | `apps/web/db/neon/0151_web_push_subscriptions.sql` | Endpoint, keys, user agent; unique endpoint; RLS by user. |
| table | notifications and feedback | `apps/web/db/neon/0016_misc.sql` | Base tables for the feed and feedback. |
| service | notification-service | `apps/web/lib/services/notification-service.ts` | Insert, dedupe, list, mark read. |
| endpoint | Notifications | `apps/web/app/api/notifications/route.ts` | GET feed, PATCH mark read. |
| endpoint | Feedback | `apps/web/app/api/feedback/route.ts` | POST report or rating, DELETE rating. |
| service | feedback screenshot cleanup | `apps/web/lib/server/feedback-screenshot-cleanup.ts` | Ledger so orphaned screenshots can be swept. |
| service | support ticket store | `apps/web/lib/support/tickets/store.ts` | Tickets, replies, escalations, staff queue. |
| endpoint | Support tickets | `apps/web/app/api/support/tickets/route.ts` | GET list, POST create. |
| table | support_tickets and support_ticket_replies | `apps/web/db/neon/0024_support_tickets.sql` | Ticket and reply storage. |
| component | WebPushToggle | `apps/web/features/notifications/components/WebPushToggle.tsx` | Settings toggle. |
| component | WebPushOptIn | `apps/web/features/notifications/components/WebPushOptIn.tsx` | Chat opt-in card. |
| other | service worker | `apps/web/public/sw.js` | Shows push, handles subscription change. |
| component | NotificationBell | `apps/web/features/notifications/components/NotificationBell.tsx` | Feed UI. |
| component | ComposerFeedbackDialog | `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx` | Web feedback form. |
| service | deletion-manifest | `apps/web/lib/services/deletion-manifest.ts` | Classifies notifications, feedback, support and push stores. |
| service | account-erasure | `apps/web/lib/server/account-erasure.ts` | Deletes the user rows and feedback screenshots. |
| command | CLI feedback | `apps/cli/src/cloud/feedback.rs` | CLI posts to /api/feedback. |
| hook | VS Code feedback | `apps/extension-vscode/src/features/feedback/submitFeedback.ts` | Extension posts and deletes ratings. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser creates a push subscription with the server public key. | device | apps/web/features/notifications/lib/web-push-client.ts; apps/web/public/sw.js:105-120 |
| Server validates, checks the endpoint resolves to a public host, stores the row under the user. | our servers | apps/web/app/api/web-push/route.ts:49-125 |
| On a finished run the server encrypts and posts to the browser vendor push service. | our servers | apps/web/lib/services/web-push-service.ts:346-418 |
| Vendor push service relays to the browser. | outside service | apps/web/lib/services/web-push-service.ts deliverOne |
| Feedback is posted; server redacts logs, stores screenshot in private storage first (with a cleanup record), then inserts the row. | our servers | apps/web/app/api/feedback/route.ts:48-100,340-370 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Push endpoint and keys | web_push_subscriptions | Server only | Deleted on unsubscribe, on gone endpoint, or with the account (cascade) |
| Notification rows | notifications | Server; apps read via API | Erased with the account; workspace domain retention can sweep (apps/web/lib/services/domain-retention-service.ts:486) |
| Feedback rows and screenshot objects | feedback table and private object storage | Server only | Erased with the account; screenshots by a sweep over feedback_screenshot_cleanups (apps/web/lib/server/account-erasure.ts:880-890); no maximum age found |
| Support tickets and replies | support_tickets, support_ticket_replies | Server only | Erased with the account (apps/web/lib/server/account-erasure.ts:145-146) |

**Models and providers.** No model or inference provider is used to store or send these. Browser vendor push services carry the encrypted push. The support route app/api/support/ask exists but was not read.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Push and notifications need sign-in; feedback does not (optional user), ticket routes need sign-in. |
| Permissions | Row-level security by user on push rows; staff routes for ticket queue (apps/web/lib/support/tickets/store.ts:340-400). |
| Subscription | none found in the code for these routes. |
| Limits and metering | Push: endpoint 2048 chars, p256dh 200, auth 100, user agent 256; rate bucket web-push. Feedback: details 10000, screenshot 4 MiB, logs 20000 chars; rate buckets feedback and mobile-feedback. Feed page size capped by a shared constant. |
| Feature flags | Web push on/off depends on VAPID configuration (apps/web/lib/services/web-push-service.ts:153). |
| Model compatibility | none found in the code. |
| Provider restrictions | Push endpoints must resolve to public hosts (apps/web/app/api/web-push/route.ts:55). |
| Local mode | Local mode on device does not use these server stores; whether device-local notifications exist in desktop or mobile Local mode was not examined. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| VAPID not configured | Sender returns sent 0; config route returns a null public key. | apps/web/lib/services/web-push-service.ts:157,346-350 |
| Endpoint gone (404/410) | Row pruned. | apps/web/lib/services/web-push-service.ts:49,240-262 |
| Payload too large | Not sent; error payload_too_large. | apps/web/lib/services/web-push-service.ts:380-385 |
| Screenshot storage not configured | Screenshot dropped with a log; report still saved; screenshot_stored false. | apps/web/app/api/feedback/route.ts:55-58 |
| Insert fails after screenshot upload | Screenshot is discarded; cleanup record kept for the sweep if discard fails. | apps/web/app/api/feedback/route.ts:73-100,362-366 |
| Duplicate notification | Dedupe key yields 'duplicate', not inserted. | apps/web/lib/services/notification-service.ts:56,90 |
| Service worker endpoint rotation | Re-subscribes and posts the new endpoint. | apps/web/public/sw.js:105-120 |
| Offline or retry in the feedback dialog | not handled in the code beyond an error response; dialog retry not traced | apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:166 (fetch to /api/feedback; no offline queue seen) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/web-push/__tests__/route.test.ts`: Web push route.
- `apps/web/lib/services/__tests__/web-push-service.test.ts`: Send, encryption, pruning.
- `apps/web/db/neon/web-push-subscriptions-migration.test.ts`: Migration shape for the push table.
- `apps/web/lib/services/__tests__/notification-service.test.ts`: Feed service.
- `apps/web/app/api/notifications/__tests__/route.test.ts`: Notifications route.
- `apps/web/app/api/feedback/route.test.ts`: Feedback route.
- `apps/web/lib/support/tickets/__tests__/service.test.ts`: Ticket service.
- `apps/web/app/api/support/tickets/__tests__/routes.test.ts`: Ticket routes.
- `apps/web/lib/services/__tests__/deletion-manifest.test.ts`: Classification of stores.

**Test scenarios**

- **Subscribe and replace**
  1. Sign in as user A, enable browser notifications.
  2. Sign in as user B in the same browser profile, enable again.
  - Expected: B posting A's endpoint gets 403 from the route; table keeps one row per endpoint.
- **Gone endpoint**
  1. Store a subscription with a stub push server returning 410.
  2. Trigger a send.
  - Expected: Row deleted, invalidated count 1.
- **Feedback with screenshot**
  1. Submit feedback with a 1 MiB image.
  2. Check feedback row and object storage.
  - Expected: Row and object exist; response screenshot_stored true.
- **Oversized screenshot**
  1. Submit a 5 MiB image.
  - Expected: Refused: 'Screenshot must be under 4 MiB'.
- **Erasure**
  1. Create push, notification, feedback with screenshot and a ticket.
  2. Run account erasure.
  - Expected: All rows and the screenshot object are gone.

**Where to look when it fails**

- Logs '[web-push] failed to prune dead endpoints', 'Failed to store web push subscription', 'feedback screenshot dropped: private object storage is not configured', 'Failed to store feedback'.
- Tables web_push_subscriptions, feedback_screenshot_cleanups, notifications.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No maximum age is found for feedback, notifications or tickets outside account erasure and workspace domain retention.** Affects: All users; data stays until erasure.. Evidence: apps/web/lib/services/deletion-manifest.ts retention matrix has maximumAgeDays null unless a financial rule exists (lines 421-433).. Work needed: Decide retention windows and add rules.
- **Push is web-only; mobile uses another table; other apps have no browser-style push.** Affects: Desktop, CLI, VS Code, Chrome users.. Evidence: apps/web/lib/services/push-notification-service.ts:113-139. Work needed: State per-app notification behaviour.
- **Migration 0151 header says not applied; production state unknown.** Affects: Web users.. Evidence: apps/web/db/neon/0151_web_push_subscriptions.sql:3. Work needed: Record applied status from the migration runner.
- **Brief says limits and empty states are not established; limits found here, empty-state wording not read.** Affects: Testers.. Evidence: see states. Work needed: Read bell and ticket UI empty states.

**Depends on**

- SYS-observability-and-operations
- SYS-security-and-privacy
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- SYS-authentication-and-identity
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud

## Unknown

- Whether migration 0151 is applied in production.
- Desktop and Chrome feedback entry points.
- Mobile feedback endpoint used by apps/mobile/app/(app)/feedback.tsx.
- Empty-state wording for the notification bell and tickets.
- Retention window for feedback and tickets.
