---
id: "SYS-sync-and-continuity"
type: "system"
title: "Sync, continuity and notifications"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Sync, continuity and notifications

Chat history syncs through one cursor-based endpoint, api:POST /api/chat/sync (and GET), used by mobile and CLI, and pulled by Chrome. Remote Control lets a phone steer a code session on a computer through a WebSocket relay with signed messages; it is paid-plan gated and hidden in mobile v1. Notifications go to an in-app feed, email (Resend) and push (Expo for phones, Web Push for browsers).

## What it is and why it exists

This page covers how the AGI apps stay in step. It has four parts:

1. **Chat sync**: one account's conversations, messages and artifacts are copied between devices through the hosted web app. The conversations are stored in `table:web_conversations`, `table:web_messages` and `table:web_artifacts`.
2. **Remote Control and its relay**: a phone (the companion) watches and steers a coding session that runs on a computer (the host). A small relay server passes signed messages between the two. The relay never holds the session. [requirement] (docs/architecture/remote-control.md:14-21)
3. **Notifications by channel**: an in-app feed, email, and push. Push goes to phones through Expo and to browsers through Web Push.
4. **What mobile v1 hides**: Remote Control and Send to Desktop are switched off in the first phone release.

Sync is for cloud-backed chat only. A Local-mode chat on the device is not copied (see SYS-chat-turn-pipeline for modes). The mobile sync loop runs only when the app is in cloud mode and signed in. [code] (apps/mobile/services/cloudSyncEngine.ts:97-107)

Why it exists: the product promise is one account across six apps. The research file records that the leaders sync cloud conversations across devices while local ones stay on the computer. [requirement] (docs/research/cross-surface-continuity-2026-09-21.md:25-33). That file is dated research, not authority.

The hand-off idea has no single feature. In code it appears as three things. (a) Cloud history shows in every client. (b) A local code session reports activity to the server, which pushes a notice to the phone (api:POST /api/code/local-sessions/activity). (c) Remote Control lets the phone steer the host.

## How it works today

### Chat sync (implementation status: code present and connected)

- One route, `file:apps/web/app/api/chat/sync/route.ts`, exports GET (pull) and POST (push) (route.ts:1020-1021).
- **Pull**: the client sends `since`, a version cursor. The server returns conversations, messages and artifacts whose `server_version` is greater than the cursor. Limits are 500 conversations, 1000 messages and 500 artifacts per page. `hasMore` is true when any list is full. Temporary chats are excluded. A `scope=conversations` query returns conversations only. [code] (route.ts:49-51, 104-195)
- **Push**: the client sends rows with a `baseVersion`. A row with `baseVersion` 0 is an insert. A row with a higher base is an update that applies only when the stored version still equals the base. Otherwise the row comes back in `conflicts` with the server copy. Deletes are tombstones (`deleted_at`), not hard deletes. [code] (route.ts:222-340 for the SQL, 543-600 for the handler)
- **Order of checks on push**: CSRF, rate limit bucket `chat-conversation`, workspace policy gate `chat_sync`, a no-op shortcut for old empty pushes, protocol version check, schema check, project ownership check, then the free daily allowance check. [code] (route.ts:543-583, 940-956)
- **Protocol version**: `SYNC_PROTOCOL_VERSION` is 2 and the minimum is 2. A client below the floor gets a client-update-required error. A client above it gets a validation error. [code] (packages/contracts/cloud-contracts/src/sync.ts:33-41; route.ts:940-947)
- **Threading**: new assistant and user rows are chained to the conversation's active leaf under a lock, so branches stay consistent. [code] (route.ts:470-535)
- **Side effects**: pushing assistant messages schedules artifact indexing, fire and forget. A push also clears the stored compaction summary for touched conversations. [code] (route.ts:715-740, 532)

### Clients of chat sync

- **Mobile** pushes then pulls, then syncs memory, projects and settings, in one `syncNow`. It runs every 30 seconds while the app is active and on return to the foreground. Each step records its own failure. [code] (apps/mobile/services/cloudSyncEngine.ts:1007-1077)
- **CLI** reads and writes the same `/api/chat/sync` records so a CLI turn shows in the other apps. [code] (apps/cli/src/cloud/chat.rs:1-14)
- **Chrome extension** pulls the conversations scope with an alarm-driven sweep and keeps a local cursor. It checks a local cloud-mirroring switch first. [code] (apps/extension/src/features/cloud-bridge/conversationSync.ts:62-65, 131). How it pushes is [unknown]: it was not traced.
- **Web and Electron desktop**: the public Desktop shows the hosted web app (AGENTS.md section 5). The web app's own chat uses the conversation routes. The only `chat/sync` caller found in `apps/web/features` is artifact sync. [inferred] (apps/web/features/chat/services/artifact-cloud-sync.ts)

### Remote Control (implementation status: code present; deployed relay not live)

1. **Pairing**. A host asks the web app for a pairing: api:POST /api/pair/initiate. The route checks CSRF, a rate limit (`device-link`), then `remoteControlStandingRefusal` (workspace policy, plan, kill switch). It calls the relay (`POST /pairings`) with an internal bearer secret. It returns a code, expiry, relay URLs and one role token. Default life is 300 seconds, allowed range 30 to 900. [code] (apps/web/app/api/pair/initiate/route.ts:20-25, 47-70, 100-175)
2. **Claim**. The phone calls api:POST /api/pair/claim with the code. The web app proves the account and tells the relay which account to mint for. The relay refuses a different account (403, `pairing_belongs_to_another_account`). [code] (apps/web/app/api/pair/claim/route.ts:30-47, 146)
3. **Connect**. Both peers open a WebSocket to the relay and register with their role token. Each registration consumes the token and returns a fresh one. [requirement] (services/signaling-server/README.md, section Pairing credentials)
4. **Signed messages**. Both sides derive a key from the pairing code, a session salt and a secret that the relay never sees. Each message is an envelope with version 3, a timestamp, a nonce and an HMAC. The message is signed, not encrypted. [code] (packages/platform/utils/src/remoteControl/dispatchEnvelope.ts:4, 38-60, 118)
5. **Allow-list**. The relay forwards only listed actions: approvals, agents, heartbeat, cancel, receipts, code-session verbs and four dispatch-task verbs. Normal control messages are capped at 4 KB. Code-session, dispatch and large snapshot messages are capped at 48 KB. [code] (services/signaling-server/src/control-payload.ts:9-77; constants.ts:25-27)
6. **Standing recheck**. While a pairing lives, the relay asks api:POST /api/pair/standing about every 60 seconds whether the account, workspace policy, plan, switch and paired devices still allow it. If the web app cannot answer, the relay keeps the last answer for at most 5 minutes, then closes the sockets. The relay's pairing lifetime cap defaults to 7 days. [code] (apps/web/app/api/pair/standing/route.ts:18-35; services/signaling-server/src/constants.ts:101-105; README.md section Pairing lifetime and standing)
7. **Hosts**. Three hosts exist: Electron desktop (`apps/desktop/electron/remote/remoteControlService.ts`), the VS Code extension (`apps/extension-vscode/src/features/remote-control/remoteControlService.ts`) and the CLI command `agi remote-control` (`apps/cli/src/remote_control/mod.rs`). The CLI needs a login token, shows a QR payload `agiw3:<code>:<secret>` and reconnects with back-off. [code] (apps/cli/src/lib.rs:6659-6678; apps/cli/src/remote_control/mod.rs:759-815)
8. **Activity push**. While a CLI host runs, it posts session activity to api:POST /api/code/local-sessions/activity. The server records a feed notice and sends a push to the user's phones only (Expo, not browser). [code] (apps/cli/src/remote_control/mod.rs:24-25, 621-654; apps/web/app/api/code/local-sessions/activity/route.ts:18-35; apps/web/lib/services/agent-notification-service.ts:374-405)

### Notifications

| Channel | Where it is produced | Provider or store | Consent |
|---|---|---|---|
| In-app feed | `recordNotification` writes `table:notifications`; the web bell polls api:GET /api/notifications every 60 seconds | Neon Postgres | None; always recorded. Duplicates are dropped by `(user_id, dedupe_key)`. |
| Email | Security alerts, schedule completion, spend alerts, data export, billing notices | Resend, needs `RESEND_API_KEY` and `AGI_NOTIFICATIONS_FROM_EMAIL` | Per-key settings, for example `emailSecurityAlerts`, `emailScheduleDone`. Marketing email has a signed one-click unsubscribe at api:POST /api/email/unsubscribe. |
| Mobile push | `sendPushToUser` fans out to Expo | Expo push service (`https://exp.host/--/api/v2/push/send`), tokens in `table:mobile_devices` | Device registers a token and per-event preferences with quiet hours. |
| Browser push | Same fan-out, Web Push with VAPID keys | `table:web_push_subscriptions`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT` | Browser opt-in from settings; subscription at api:POST /api/web-push. |

[code] (apps/web/lib/services/notification-service.ts:58-120; push-notification-service.ts:25, 281-383; notification-email-service.ts:13; apps/web/app/api/notifications/route.ts:94-95; apps/web/features/notifications/hooks/use-notification-feed.ts:8; web-push-service.ts:107-109)

Producers: agent run events, research reports, cloud code turns, local code sessions, chat reply ready (phone-started runs, phone push only), schedule completion, product updates, identity security events, new device. [code] (agent-notification-service.ts; chat-reply-notification-service.ts:30-50; identity-events/catalogue.ts:5-33)

## Implementation map

| Concern | Where |
|---|---|
| Sync endpoint | file:apps/web/app/api/chat/sync/route.ts |
| Sync wire contract and version | file:packages/contracts/cloud-contracts/src/sync.ts |
| Shared sync helpers (cursor, delta apply) | file:packages/*/sync/src (package `@agiworkforce/sync`; folder not opened in detail) |
| Sync workspace gate | file:apps/web/lib/managed-compute-gate.ts (`buildChatSyncGateResponse`, line 262) |
| Free daily allowance | file:apps/web/lib/services/tier-unit-quota-service.ts (`assertFreeDailyAllowance`, line 519) |
| Mobile sync engine | file:apps/mobile/services/cloudSyncEngine.ts |
| CLI sync | file:apps/cli/src/cloud/chat.rs |
| Chrome sync | file:apps/extension/src/features/cloud-bridge/conversationSync.ts |
| Pairing routes | file:apps/web/app/api/pair/initiate/route.ts, file:apps/web/app/api/pair/claim/route.ts, file:apps/web/app/api/pair/standing/route.ts |
| Remote Control gate | file:apps/web/lib/feature-flags/remote-control-gate.ts |
| Standing logic | file:apps/web/lib/device-steps/pairing-standing.ts |
| Relay | file:services/signaling-server/src/index.ts (2469 lines), control-payload.ts, constants.ts, db.ts, standing.ts, pair-token.ts |
| Relay deploy config | file:services/signaling-server/fly.toml (also `railway.toml`) |
| Host logic shared by desktop and VS Code | file:packages/platform/utils/src/remoteControl/remoteControlHost.ts, codeRemoteController.ts, dispatchEnvelope.ts, controlReceipts.ts |
| Desktop host | file:apps/desktop/electron/remote/remoteControlService.ts |
| VS Code host | file:apps/extension-vscode/src/features/remote-control/remoteControlService.ts |
| CLI host | file:apps/cli/src/remote_control/mod.rs, host.rs, envelope.rs |
| Web control panel | file:apps/web/features/desktop-host/components/RemoteControlSection.tsx |
| Mobile companion | file:apps/mobile/services/companion.ts, file:apps/mobile/stores/connectionStore.ts, file:apps/mobile/app/(app)/companion/index.tsx, file:apps/mobile/app/(app)/settings/remote-control.tsx |
| Mobile v1 switches | file:apps/mobile/lib/v1FeatureFlags.ts |
| Device registry heartbeat | file:apps/web/app/api/devices/heartbeat/route.ts |
| Push send | file:apps/web/lib/services/push-notification-service.ts, web-push-service.ts, quiet-hours-service.ts |
| Notification producers | file:apps/web/lib/services/agent-notification-service.ts, schedule-notification-service.ts, product-update-notification-service.ts, chat-reply-notification-service.ts, account-activity-notifications.ts |
| Identity events | file:apps/web/lib/services/identity-events/index.ts, catalogue.ts |
| Feed service and routes | file:apps/web/lib/services/notification-service.ts, file:apps/web/app/api/notifications/route.ts |
| Push registration routes | file:apps/web/app/api/mobile/push-token/route.ts, file:apps/web/app/api/web-push/route.ts |
| Push preference contract | file:packages/contracts/cloud-contracts/src/mobile-push.ts |
| Mobile push client | file:apps/mobile/services/notifications.ts, pushPreferenceSync.ts, notificationEventTypes.ts |
| Email unsubscribe | file:apps/web/app/api/email/unsubscribe/route.ts, billing-notice-service.ts |

See also SYS-chat-turn-pipeline, SYS-subscription-and-entitlements and SYS-platform-surfaces if those pages exist in this knowledge base.

## Data and state

| Store | What it holds | Source |
|---|---|---|
| `table:web_conversations`, `table:web_messages`, `table:web_artifacts` | Synced chat. Each row has `server_version` from the sequence `cloud_sync_version_seq`, plus `deleted_at` tombstones. Conversations have `is_temporary`; temporary ones are never synced. | [code] route.ts:125-170; apps/web/db/neon/0038_cloud_sync_versioning.sql:28-40; 0050_temporary_chat_retention.sql:7 |
| `table:notifications` | In-app feed: category, severity, title, message, target, `is_read`, `dedupe_key` (unique per user when set) | [code] notification-service.ts:58-90; db/neon/0016_misc.sql:1; 0199_notification_feed_targets.sql |
| `table:mobile_devices` | One row per phone: push token, platform, name, `push_preferences` JSON | [code] apps/web/db/neon/0013_devices.sql:38; 0341_push_preferences_and_share_conversation.sql:23 |
| `table:web_push_subscriptions` | Browser endpoint (globally unique), keys, user agent, last seen | [code] db/neon/0151_web_push_subscriptions.sql:21 |
| `table:device_registrations` | Computers and installs that heartbeat: surface, install id, `remote_enabled`, capabilities | [code] db/neon/0207_device_registrations.sql:23; devices/heartbeat/route.ts |
| `table:signaling_sessions` | The relay's pairings: code, created, expires, metadata (account, devices, credentials) | [code] db/neon/0354_signaling_sessions.sql:1; services/signaling-server/src/db.ts:158-246 |
| `table:user_settings` (JSON `notifications`) | Per-user preference keys such as `mobilePushAgentActivity`, `emailScheduleDone`, `emailSecurityAlerts`, `browserReplyReady` | [code] agent-notification-service.ts:25-96; features/settings/lib/notification-preferences.ts:1-7 |
| `table:account_compromise_responses` | Record of a compromise response (sessions revoked) | [code] identity-events/index.ts:133-200 |
| `store:mmkv` notification center | Last 50 received notices on the phone | [code] apps/mobile/services/notifications.ts:662 |
| Mobile sync state stores | Cursors, dirty markers, sync status | [code] cloudSyncEngine.ts:1007-1111 |
| Chrome local storage | `agi_cloud_conversation_cursor_v1`, tombstones | [code] conversationSync.ts:62-65 |

The relay runs on Fly (`fly.toml`, one machine minimum) and needs these configuration names: `NEON_DATABASE_URL`, `SIGNALING_INTERNAL_SECRET`, `ALLOWED_ORIGINS`, `SIGNALING_STANDING_URL`. [code] (services/signaling-server/fly.toml:30-60). Web side: `SIGNALING_HTTP_URL`, `SIGNALING_INTERNAL_SECRET` (pair/initiate/route.ts:70-85). Peer matching needs one serving relay process. [requirement] (services/signaling-server/README.md)

Pairing lifecycle: created (5 minutes by default), claimed by both peers (expiry extends to 24 hours but never past the 7 day cap), ended by revocation, standing loss or expiry. Expired rows are pruned about every 5 minutes. [code] (constants.ts:101, 125; README.md)

## Rules: access, plans, modes

### Chat sync

- Plan: `cloud_sync` is available to `plan:free`, `plan:basic`, `plan:pro`, `plan:max`, `plan:max_15x`, `plan:team`, `plan:team_premium` and `plan:enterprise` (the cloud-chat tier list). [code] (packages/contracts/types/src/billing-catalog.ts:322-352). Whether the route itself checks this capability is [unknown]: the route checks the workspace policy and the free daily allowance, not `cloud_sync` by name.
- Free accounts: new conversations and new messages count against a daily allowance. Over the limit, push is refused. [code] (route.ts:575-583)
- Workspace: an organization policy can refuse sync per surface. Mobile shows the refusal as a sync-off reason. [code] (managed-compute-gate.ts:262-281; cloudSyncEngine.ts:996-1000)
- Mode: sync is for `mode:cloud` only. Mobile checks that the app is in cloud mode with a signed-in account. `mode:local` has no server copy. `mode:own-key` sync behaviour is [unknown]; AGENTS.md section 6 says a Local-to-BYOK move must be an explicit fork with consent. [code] (cloudSyncEngine.ts:97-107) [requirement] (AGENTS.md section 6)
- Local inference is not tied to this system, so it needs no subscription. Cloud sync needs an account.

### Remote Control

- Plan: `remote_control` needs a paid tier: `plan:basic` and above. `plan:free` is refused with a 403 `plan_upgrade_required`. If the plan cannot be read, the answer is 503 and pairing is refused. [code] (billing-catalog.ts:352; remote-control-gate.ts:50-77; apps/cli/src/plans.rs:98)
- Another gate: the feature registry lists Remote Control as `experimental`, kill switch `screen_share`, entitlement `developer_surfaces`, host `desktop`. The route uses the plan capability `remote_control`, not `developer_surfaces`. [code] (packages/contracts/types/src/feature-registry.json:175-199)
- The workspace policy `remote_control`, the plan and the kill switch are asked together at create, at claim and at every relay recheck, so a pairing cannot outlive them. [code] (remote-control-gate.ts:97-130)
- Authority stays on the host. The phone sends control messages only. Permissions, path limits and approvals run on the computer. [requirement] (docs/architecture/remote-control.md section Where authority actually lives)
- Privacy: the CLI host refuses to start if the account privacy mode forbids cloud (`CloudClient::admit`). [code] (apps/cli/src/remote_control/mod.rs:767)
- This is a `mode:cloud` account feature (the relay and plan check are our servers), even though the session runs on the user's device.

### Notifications

- Email: security alert email goes out unless the user turned `emailSecurityAlerts` off. A user enrolled in advanced account security cannot opt out. [code] (account-activity-notifications.ts:57-91)
- Phone push: an agent-activity switch (`mobilePushAgentActivity`) is opt-out. `product_update` push is opt-in. Quiet hours hold push unless the type is exempt. If quiet hours cannot be read, the notice is queued as job `notifications.deferred-push` and the feed copy is kept. [code] (agent-notification-service.ts:25-96; mobile-push.ts:38-52; push-notification-service.ts:281-330)
- Browser push is consented separately from phone push. The caller names which transports it checked. [code] (push-notification-service.ts:255-280)
- Account binding: each Expo push carries a hash of the account id. The phone drops a push whose hash is not for the current account, or that has no hash. [code] (push-notification-service.ts:157-165; apps/mobile/services/notifications.ts:68-100)

## Differences between apps

| App | Chat sync | Remote Control | Push | Notes |
|---|---|---|---|---|
| surface:web | Uses hosted conversation routes; artifact sync uses chat/sync | Control panel (`RemoteControlSection`) shows pairing for a desktop host; also in-browser pairing link | Browser Web Push plus feed bell (polls 60 s) | Control panel needs the desktop host bridge |
| surface:desktop | Shows hosted web app (Electron). Tauri code is internal | Host (`electron/remote/remoteControlService.ts`) | Not a push target in code read | Pairing window in `electron/remote/pairingWindow.ts` |
| surface:mobile | Full push and pull engine, 30 s loop | Companion code exists but is hidden in v1 | Expo push, per-event prefs, local center of 50 | Local mode screens vs cloud screens are classed in `destinationScope.ts` |
| surface:cli | Pushes and pulls through `/api/chat/sync` | Host via `agi remote-control` | None | Needs `agi login`; plan gate in `plans.rs` |
| surface:vscode | Not found in this read | Host (`features/remote-control`) | None found | Sync path [unknown] |
| surface:chrome | Pulls conversations scope; honours a local mirroring switch | None | None found | Push path [unknown] |

[code] for each row: apps/web/features/desktop-host/components/RemoteControlSection.tsx; apps/mobile/services/cloudSyncEngine.ts:1007; apps/cli/src/lib.rs:6659; apps/extension/src/features/cloud-bridge/conversationSync.ts:62.

### What mobile v1 hides

In `apps/mobile/lib/v1FeatureFlags.ts` these are `false`: `billing`, `dispatch`, `companion`, `videoGen`, `bankLinking`, `pluginMarketplaceAdmin`, `appLanguage`, `linkBrowser`. [code] (v1FeatureFlags.ts:1-43). Effects:

- `companion` false hides the Remote control section of Settings (settings/index.tsx:750), and the routes `/(app)/companion` and `/(app)/settings/remote-control` show "Remote isn't available in this build" (remote-control.tsx:131; companion/index.tsx:183). The pair link in the Android manifest needs both `companion` and `dispatch` (app.config.js:32). The companion code path returns early when the flag is off (companion.ts:231).
- The reason: the relay host the app points at, `signaling.agiworkforce.com`, is not deployed. [requirement] (docs/runbooks/mobile-store-first-release.md:50-56; audit/decisions/founder-actions.md:277-288). The healthy relay is at the Fly address. The app default is in `apps/mobile/lib/constants.ts:15`.
- Push notices stay on in v1. Their preference screens drop the phrase about a paired companion when `companion` is false (notifications/NotificationCategoryDetailScreen.tsx:27).
- Mobile v1 also sells nothing: `billing` is false and native purchases are off. [requirement] (docs/runbooks/mobile-store-first-release.md:29-48)
- Chat sync, cloud tasks, schedules and push are not hidden (`cloudChat`, `cloudTasks`, `schedules` are true).

## Failure handling

| Failure | Behaviour | Source |
|---|---|---|
| Sync pull database error | Logged; returns an internal error | [code] route.ts:196-199 |
| Push conflict (stale `baseVersion`) | Row returned in `conflicts` with the server copy; client applies it and clears the dirty mark | [code] route.ts:300-340; cloudSyncEngine.ts:549-583 |
| Duplicate id in a batch | Request rejected by schema | [code] sync.ts (`rejectDuplicateIds`) |
| Old client | Told to update (client update required) | [code] route.ts:940-947 |
| Pull page too large | `hasMore` true; client loops, bounded at 50 pages | [code] route.ts:177-195; cloudSyncEngine.ts:93 |
| One mobile sync step fails | Other steps still run; status becomes `error` with the failed steps listed | [code] cloudSyncEngine.ts:1007-1060 |
| Account switch during sync | Operation dropped as stale | [code] cloudSyncEngine.ts:1011-1030 |
| Relay not configured | Pairing routes return 503 "Pairing is not configured" | [code] pair/initiate/route.ts:70-85 |
| Relay unreachable | 503; the host reports error; local work continues | [code] pair/initiate/route.ts:118-123; [requirement] docs/architecture/remote-control.md section Failure and revocation |
| Relay refuses pairing | 502 (initiate), or 404 `pairing_not_found`, 409 `pairing_role_in_use`, 403 (claim) | [code] pair/claim/route.ts:120-150 |
| Web app cannot answer the standing check | Relay keeps last answer up to 5 minutes, then closes sockets so clients retry | [code] constants.ts:105; README.md |
| Standing says no | Pairing ended and deleted | [requirement] README.md |
| Bad envelope | Refused with a named reason: malformed, unsigned, update_required, timestamp_expired, nonce_replay, hmac_mismatch | [code] dispatchEnvelope.ts:20-32 |
| Message not on the allow-list | Dropped at the relay | [code] control-payload.ts:60-77 |
| Sender too fast | Relay slows reading; a sender far past budget is closed with 1013; a socket with over 1.5 MB unread output is dropped | [requirement] README.md section Message limits |
| CLI socket drops | Reconnect with back-off (1 s up to 30 s); a revoked or expired pairing ends it | [code] remote_control/mod.rs:26-32, 817-850 |
| Expo rejects a batch or times out (10 s) | Counted as transport failure; other transport still sends | [code] push-notification-service.ts:149-250 |
| Expo says `DeviceNotRegistered` | Token cleared in `mobile_devices` | [code] push-notification-service.ts:208, 134-146 |
| Web Push or Expo down | Folded into counts, never thrown | [code] push-notification-service.ts:255-280, 362-383 |
| Email not configured | Send returns a not-configured result; no throw | [code] notification-email-service.ts:13-40 |
| Notification insert fails | Logged; marked failed; caller continues | [code] notification-service.ts:107-120 |
| Identity notice fails | Logged; the audit write still happens | [code] identity-events/index.ts:53-80 |
| Compromise response partial | Reported as incomplete in the notice and audit | [code] identity-events/index.ts:133-235 |
| Mobile push permission denied | No token is requested; registration returns null | [code] apps/mobile/services/notifications.ts:237-256 |
| Push for another account on the phone | Dropped without display | [code] notifications.ts:68-100 |

## How it should work

These are requirements from documents, not claims about running behaviour.

- **Execution boundaries are explicit.** Local, BYOK and Managed Cloud are separate trust boundaries. Nothing may silently move a Local chat to the cloud. [requirement] (AGENTS.md section 6). Chat sync must therefore stay cloud-mode only.
- **One AGI Subscription system.** Plan limits must come from the shared entitlement code, not from per-app copies. [requirement] (AGENTS.md sections 3-4). Remote Control already reads the shared capability table.
- **Remote Control exit criteria.** A pairing can be revoked from either side and takes effect on the next request, and a controlled device shows that it is being controlled for as long as it is. [requirement] (packages/contracts/types/src/feature-registry.json:187)
- **Relay is a dependency, not a trust anchor.** It can read payloads but cannot forge them, and local work must continue when it is down. [requirement] (docs/architecture/remote-control.md)
- **Adding a control verb** is a three-place change: relay list, host controller, companion. [requirement] (docs/architecture/remote-control.md)
- **Irreversible actions ask first.** Disconnecting a phone names its consequence (it can no longer follow or steer sessions). The web panel does this. [code] (RemoteControlSection.tsx, `DISCONNECT_CONSEQUENCE`)
- **Free usage screens show Upgrade only, never meters** (owner decision recorded in project memory; not a repository document). [unknown] as to a repo path.
- **Mobile v1 should hide Remote Control until the relay host is live.** [requirement] (docs/runbooks/mobile-store-first-release.md:50-56). To ship it later, both flags must flip and the relay host must answer a health check with a phone pairing a desktop. [requirement] (audit/decisions/founder-actions.md:285)
- **[proposed]** Keep a single table of push event types shared by server and phone. The phone's code comment still says only the schedule service sends push, while several producers now do (see Gaps).

## Gaps

Implementation status and verification status are kept apart. No document found records a real run of any flow below, so nothing here is [executed].

| Gap | Status | Source |
|---|---|---|
| Relay host `signaling.agiworkforce.com` points nowhere; Remote Control cannot be used from the shipped phone | Blocked on a founder action; hidden in v1 | [requirement] audit/decisions/founder-actions.md:277-288 |
| `signaling_sessions` is read by the relay; the table is created by web migration 0354 | Code present | [code] db/neon/0354_signaling_sessions.sql:1 |
| Relay peer matching works only with one serving process | Limit on scaling | [requirement] services/signaling-server/README.md |
| Surface matrix says no CLI remote-control host exists | Doc wrong, code has one | see outdated documents |
| Relay README says initiator defaults to desktop; the web route defaults to mobile | Two defaults; the web route always passes a value in the request path used here, so only direct relay calls see the README default | [code] pair/initiate/route.ts:62-70 |
| Feature registry gates Remote Control on entitlement `developer_surfaces` (Pro and above) but the pairing code uses `remote_control` (Basic and above) | Contradictory sources; code governs | [code] feature-registry.json:195; remote-control-gate.ts:68 |
| Phone code comment says the schedule service is the only server push producer | Stale comment; at least agent, research, code, chat reply and product update producers exist | [code] apps/mobile/services/notificationEventTypes.ts:8-14 vs agent-notification-service.ts |
| In-app feed is polled every 60 s, not pushed | Latency | [code] use-notification-feed.ts:8 |
| Mobile's notification list is a local store of 50; whether it also reads api:GET /api/notifications is not established | [unknown] | [code] notifications.ts:662; grep found the feed client only under apps/web |
| Chrome and VS Code push or email paths | [unknown] | not traced |
| Chrome push (write) path to the account | [unknown] | not traced |
| Production values of `SIGNALING_*`, `RESEND_API_KEY`, VAPID keys, Expo setup | Not visible to the repository | [unknown] |
| Verification | Tests exist (see next section) but no recorded run was read | [unknown] |

## How to verify

Nothing was run for this page. These are the checks a person can run, and the tests that already exist. Heavy jobs run through `scripts/dev/heavy-job.sh` and scoped tests through `scripts/dev/light-job.sh` (CLAUDE.md).

**Existing tests (not run here)**

- Sync: test:apps/web/app/api/chat/sync/__tests__/route.contract.test.ts, route.metadata-object.test.ts, route.turn-ending.live.test.ts, plus `route.artifact-index.test.ts`, `route.compaction-cache.test.ts`, `route.google-user-data.test.ts` beside the route. Run web tests inside `apps/web` with its own Vitest (AGENTS.md section 12).
- Pairing: test:apps/web/app/api/pair/__tests__/remote-control-switch.test.ts, standing-recheck-policy.test.ts, workspace-client-policy.test.ts.
- Relay: test:services/signaling-server/__tests__/control-payload.test.ts, pair-token.test.ts, standing.test.ts, device-revocation.test.ts, expired-pairings.test.ts, connection-manager.test.ts, plus folders `relay/`, `websocket/`, `http/`.
- Notifications: test:apps/web/app/api/notifications/__tests__/route.test.ts, test:apps/web/app/api/web-push/__tests__/route.test.ts, test:apps/web/app/api/mobile/push-token/__tests__/route.test.ts, test:apps/web/lib/services/__tests__/push-notification-service.test.ts, test:apps/web/app/api/email/unsubscribe/route.test.ts, identity events under apps/web/lib/services/identity-events/__tests__.
- Mobile: test:apps/mobile/__tests__/push-preference-sync.test.ts, notification-auth-gate.test.ts, NoPurchasesFeatureGates.test.tsx (the "Remote Control hidden in version 1" case), RemoteCompanion.test.tsx, connection-relay-retry.test.ts, manual-pairing.test.ts.
- Desktop host: test:apps/desktop/electron/__tests__/remoteControlHost.test.ts.

**What a person should check by hand**

1. Sync: sign in on two apps in cloud mode, write a message on one, and confirm it appears on the other within about 30 seconds on mobile. Watch for a conflict on edits to the same message.
2. Hidden features: build the phone app and confirm the Remote control row is missing and `/(app)/companion` shows the unavailable screen.
3. Relay: `curl` the relay health address and confirm healthy JSON, then pair a desktop with a phone (the founder-actions check). This needs `FEATURES.companion` and `FEATURES.dispatch` true and the relay deployed. Do not deploy without the owner's word.
4. Push: register a phone, trigger an agent run finishing, and confirm one banner. Turn on quiet hours and confirm the notice is held but the feed row remains.
5. Email: with Resend configured, change a sign-in setting and confirm a security email; turn `emailSecurityAlerts` off and confirm it stops unless advanced account security is on.
6. Instrument check (AGENTS.md section 1): when testing push, make sure your own test sends are not counted as product traffic, and that a phone signed in as another account drops the push.

## Key facts

| Fact | Basis | Source |
|---|---|---|
| Chat sync is one route with GET (pull by version cursor) and POST (push with baseVersion and conflicts), exported from apps/web/app/api/chat/sync/route.ts. | read in the code | `apps/web/app/api/chat/sync/route.ts:1020-1021`; `apps/web/app/api/chat/sync/route.ts:104-195` |
| Pull pages are capped at 500 conversations, 1000 messages and 500 artifacts; hasMore is true when any list is full; temporary chats are never synced. | read in the code | `apps/web/app/api/chat/sync/route.ts:49-51`; `apps/web/app/api/chat/sync/route.ts:125-170` |
| Sync protocol version is 2 with minimum 2; older clients get a client-update-required error, newer ones a validation error. | read in the code | `packages/contracts/cloud-contracts/src/sync.ts:33-41`; `apps/web/app/api/chat/sync/route.ts:940-947` |
| Push checks, in order: CSRF, rate limit, workspace chat_sync policy, protocol version, schema, project ownership, free daily allowance. | read in the code | `apps/web/app/api/chat/sync/route.ts:543-583`; `apps/web/lib/managed-compute-gate.ts:262-281` |
| Mobile syncs chats, memory, projects and settings every 30 seconds while active and on foreground, only in cloud mode with a signed-in account. | read in the code | `apps/mobile/services/cloudSyncEngine.ts:97-107`; `apps/mobile/services/cloudSyncEngine.ts:1007-1077` |
| CLI and Chrome use the same hosted sync records; CLI pushes and pulls through /api/chat/sync, Chrome pulls the conversations scope. | read in the code | `apps/cli/src/cloud/chat.rs:1-14`; `apps/extension/src/features/cloud-bridge/conversationSync.ts:62-65` |
| Remote Control pairing is created by api:POST /api/pair/initiate (default 300 s, 30 to 900 s) and claimed by api:POST /api/pair/claim; the relay refuses a claim from another account. | read in the code | `apps/web/app/api/pair/initiate/route.ts:20-25`; `apps/web/app/api/pair/claim/route.ts:30-47`; `apps/web/app/api/pair/claim/route.ts:146` |
| Remote Control needs a paid plan (basic and above); free gets 403 plan_upgrade_required, and an unreadable plan gets 503. | read in the code | `packages/contracts/types/src/billing-catalog.ts:352`; `apps/web/lib/feature-flags/remote-control-gate.ts:50-77` |
| The relay rechecks live pairings through api:POST /api/pair/standing about every 60 s, tolerates a web outage for 5 minutes, and caps pairing life at 7 days by default. | read in the code | `services/signaling-server/src/constants.ts:101-105`; `apps/web/app/api/pair/standing/route.ts:18-35` |
| Relay messages are signed envelopes (version 3, HMAC, nonce, timestamp), not encrypted; the relay cannot forge them. | read in the code | `packages/platform/utils/src/remoteControl/dispatchEnvelope.ts:4`; `packages/platform/utils/src/remoteControl/dispatchEnvelope.ts:118` |
| The relay forwards only allow-listed actions; normal control payloads max 4 KB, code-session and dispatch payloads max 48 KB. | read in the code | `services/signaling-server/src/control-payload.ts:9-77`; `services/signaling-server/src/constants.ts:25-27` |
| Three hosts exist for Remote Control: Electron desktop, VS Code extension and the CLI command agi remote-control. | read in the code | `apps/desktop/electron/remote/remoteControlService.ts`; `apps/extension-vscode/src/features/remote-control/remoteControlService.ts`; `apps/cli/src/lib.rs:6659-6678` |
| In mobile v1 the switches companion, dispatch, billing, videoGen, bankLinking, pluginMarketplaceAdmin, appLanguage and linkBrowser are false, so Remote Control is hidden and its routes show an unavailable screen. | read in the code | `apps/mobile/lib/v1FeatureFlags.ts:1-43`; `apps/mobile/app/(app)/settings/remote-control.tsx:131`; `apps/mobile/src/features/settings/index.tsx:750` |
| The stated reason for hiding Remote Control is that signaling.agiworkforce.com is not deployed; the live relay is at a Fly address. | stated requirement | `docs/runbooks/mobile-store-first-release.md:50-56`; `audit/decisions/founder-actions.md:277-288` |
| Notice channels are in-app feed (table notifications), email via Resend, Expo push for phones and Web Push for browsers; the two push transports are consented separately. | read in the code | `apps/web/lib/services/notification-service.ts:58-120`; `apps/web/lib/services/push-notification-service.ts:25`; `apps/web/lib/services/push-notification-service.ts:255-280` |
| The in-app feed is served by api:GET /api/notifications and marked read by api:PATCH /api/notifications; the web bell polls every 60 s. | read in the code | `apps/web/app/api/notifications/route.ts:94-95`; `apps/web/features/notifications/hooks/use-notification-feed.ts:8` |
| Feed rows are de-duplicated by (user_id, dedupe_key) with ON CONFLICT DO NOTHING; terminal agent events use a run-based key. | read in the code | `apps/web/lib/services/notification-service.ts:77`; `apps/web/lib/services/agent-notification-service.ts:140-175` |
| Phone push tokens are stored by api:POST /api/mobile/push-token in table mobile_devices; a device id owned by another account gets 403. | read in the code | `apps/web/app/api/mobile/push-token/route.ts:36-50`; `apps/web/db/neon/0013_devices.sql:38` |
| Browser subscriptions are stored by api:POST /api/web-push in web_push_subscriptions; the endpoint must resolve to a public host. | read in the code | `apps/web/app/api/web-push/route.ts:40-100`; `apps/web/db/neon/0151_web_push_subscriptions.sql:21` |
| Expo push goes to a fixed Expo endpoint in batches of 100 with a 10 s timeout; DeviceNotRegistered clears the token. | read in the code | `apps/web/lib/services/push-notification-service.ts:25-27`; `apps/web/lib/services/push-notification-service.ts:208` |
| Quiet hours hold push; if quiet hours cannot be read the notice is queued as job notifications.deferred-push and the feed row stays. | read in the code | `apps/web/lib/services/push-notification-service.ts:281-330`; `apps/web/lib/services/quiet-hours-service.ts:15-110` |
| Each Expo push carries a hash of the account id; the phone drops a push bound to another account or with no binding. | read in the code | `apps/web/lib/services/push-notification-service.ts:157-165`; `apps/mobile/services/notifications.ts:68-100` |
| Security email for identity events is sent unless emailSecurityAlerts is off, and users in advanced account security cannot opt out. | read in the code | `apps/web/lib/services/account-activity-notifications.ts:25-91` |
| Identity events (27 keys, e.g. new_sign_in, password_changed) write a feed notice, an email, an audit event and a risk observation; a compromise assessment triggers session and device-credential revocation. | read in the code | `apps/web/lib/services/identity-events/catalogue.ts:5-33`; `apps/web/lib/services/identity-events/index.ts:53-80`; `apps/web/lib/services/identity-events/index.ts:133-260` |
| A CLI host reports local code-session activity to api:POST /api/code/local-sessions/activity; the server records a feed row and pushes to phones only (Expo, not browser). | read in the code | `apps/cli/src/remote_control/mod.rs:621-654`; `apps/web/lib/services/agent-notification-service.ts:374-405` |
| A first heartbeat from a new device (api:POST /api/devices/heartbeat) triggers a new-device notice. | read in the code | `apps/web/app/api/devices/heartbeat/route.ts:89` |
| Marketing email has a signed one-click unsubscribe at api:GET and api:POST /api/email/unsubscribe, linked to Settings > Privacy on expiry. | read in the code | `apps/web/app/api/email/unsubscribe/route.ts:87-88` |
| No document in the project was found that records a real run of sync, Remote Control or push; all verification status is unknown. | unknown | `searched docs/architecture/remote-control.md, docs/runbooks/mobile-store-first-release.md, audit/decisions/founder-actions.md` (not found) |

## Open questions

- Does api:POST /api/chat/sync check the cloud_sync plan capability by name? The route checks the workspace policy and the free daily allowance only.
- How does the Chrome extension write conversations to the account? Only its pull of the conversations scope was traced.
- Does the VS Code extension sync chat history, and does it get any push or email? Not traced.
- Does mobile read the server notification feed (api:GET /api/notifications) or only its local store of 50 items? Only the web client of the feed was found.
- How does the Electron desktop chat sync? It shows the hosted web app, and the conversation routes it uses were not traced.
- Is sync allowed in mode:own-key? Code does not say; AGENTS.md section 6 requires an explicit consent fork between Local and BYOK.
- Which plan should gate Remote Control: developer_surfaces (Pro and above, per the feature registry) or remote_control (Basic and above, per the code)?
- Production values of SIGNALING_HTTP_URL, SIGNALING_STANDING_URL, ALLOWED_ORIGINS, Resend and VAPID configuration are not visible in the repository.
- When will the relay host be deployed and the mobile companion and dispatch switches flipped? This is an owner decision.
- Should browsers also get push for local code-session activity? The code sends phones only.
- The relay README says initiator defaults to desktop while the web pairing route defaults to mobile; which default is intended?

## Project documents found out of date

- `docs/architecture/remote-control.md`: Lists only the Electron desktop and VS Code extension as hosts, and says the pairing route applies an MFA policy gate and an IP allow-list gate. It also lists the relay allow-list without the dispatch-task verbs. The code says: The CLI is a third host (agi remote-control). The pairing route calls remoteControlStandingRefusal, which checks the workspace remote_control policy, the plan capability and the screen_share kill switch. The relay also allows dispatch.task.create, cancel, reply and status. (apps/cli/src/lib.rs:6659-6678; apps/web/app/api/pair/initiate/route.ts:66; apps/web/lib/feature-flags/remote-control-gate.ts:97-130; services/signaling-server/src/control-payload.ts:46-51)
- `docs/product/surface-feature-matrix.md`: States that Remote control is absent on the CLI (nothing under apps/cli/src is a host) and present on mobile. The code says: apps/cli/src/remote_control holds a full host. Mobile has the files, but they are switched off in v1 by FEATURES.companion and FEATURES.dispatch being false. (docs/product/surface-feature-matrix.md:562-569; apps/cli/src/remote_control/mod.rs:759; apps/mobile/lib/v1FeatureFlags.ts:1-43)
- `apps/mobile/services/notificationEventTypes.ts (code comment, read as a source note)`: Comment says the only server-side push producer is schedule-notification-service. The code says: Agent run, research, cloud code, local code, chat-reply and product-update producers also send push. (apps/mobile/services/notificationEventTypes.ts:8-14; apps/web/lib/services/agent-notification-service.ts:140-416; apps/web/lib/services/chat-reply-notification-service.ts:30-50)
- `services/signaling-server/README.md`: Says the initiator defaults to desktop. The code says: The web pairing route defaults initiator to mobile when the request names none; the relay's own default was not re-read. (apps/web/app/api/pair/initiate/route.ts:62-65)
