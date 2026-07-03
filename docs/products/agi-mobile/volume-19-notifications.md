# AGI Mobile — Volume 19 — Notifications

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `apps/mobile/AGENTS.md`, `docs/products/README.md`, and the real surface: `apps/mobile/services/notifications.ts`, `apps/mobile/services/companionNotifications.ts`, `apps/mobile/stores/notificationPrefsStore.ts`, `apps/mobile/src/features/notifications/time.ts`, `apps/mobile/app/(app)/notifications/index.tsx`, `apps/mobile/services/backgroundFetch.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/services/remoteChatGate.ts`, and `apps/mobile/app.config.js`.

## Overview & stance

This volume specifies how AGI Mobile surfaces _out-of-band signals_ — push, in-app runtime banners, approval prompts, task-completion notices, failure alerts, and the deep-link routing that fires when a user taps one.

Mobile's two trust modes shape everything here. **Local** chats run a small on-device LLM with no server round-trip, so they produce **no remote push** — Local activity stays on the device, and only same-process in-app/runtime notifications apply. **Managed Cloud** (public alpha, open by default; the signed-in user _is_ the gate) is the only path that can deliver server-originated remote push, because only Cloud has a backend that holds an Expo push token. There is **no BYOK on mobile**, so there is never a "provider notification," API-key warning, or key-rotation alert here — those affordances do not exist on this surface. Notifications must never leak Local content into a Cloud-delivered payload, and `remoteChatGate` failing closed when Cloud is disabled means push registration and Cloud-routed taps degrade to off, not to a fake-enabled state.

## Push Notifications

Remote push is delivered via `expo-notifications` with the Expo push service. **✅ Built** — `apps/mobile/services/notifications.ts` registers permissions, creates four Android channels (`critical`/`high`/`normal`/`low`), fetches the Expo push token using the EAS `projectId`, and POSTs `{ deviceId, pushToken }` to `/api/mobile/push-token` (`sendTokenToBackend`). A foreground `setNotificationHandler` maps each priority tier to alert/sound/badge behavior, and a `addPushTokenListener` re-syncs on token rotation.

Requirements:

- Registration is **non-fatal**: it legitimately fails on the iOS Simulator (no `aps-environment` entitlement), on dev builds without push capability, and when APNs/the backend is unreachable. It must degrade to "no push token" and never throw a red-screen error (already handled in `registerForPushNotifications`).
- Push is a **Cloud-only capability**: a device with no Cloud entitlement has no backend to address it. Local-only builds must not claim push works.
- Tokens are device-scoped (`getDeviceId`) and re-sent on next launch if a sync fails.

🔭 Planned: a server-side fan-out policy (per-user token table, dedupe, quiet-hours respected server-side) and APNs/FCM production credentials are not proven in this repo and stay Planned until a cited backend path exists.

## Runtime Notifications

"Runtime notifications" are events the app raises while running — locally scheduled banners and the in-app Notification Center. **✅ Built** — `scheduleLocalNotification` fires immediate local notifications routed to the correct Android channel and tagged `interruptionLevel: 'timeSensitive'` for critical iOS alerts. An in-memory `notificationCenterStore` (cap 50, newest-first, read/unread) feeds the `useNotificationCenter` hook and the `apps/mobile/app/(app)/notifications/index.tsx` screen; relative timestamps come from `apps/mobile/src/features/notifications/time.ts`.

Background polling exists (`apps/mobile/services/backgroundFetch.ts`, task `agent-status-check`) to pull pending approvals / running-agent counts. **🟡 Partial** — the infrastructure is built, but the companion/agents features it feeds are flag-gated **off** in v1 (`FEATURES.agents`/`companion` are `false` in `apps/mobile/lib/v1FeatureFlags.ts`), so runtime agent-status notifications do not fire in shipping builds.

Requirements: the in-memory center is intentionally non-persisted — if persistence is wanted, use MMKV; do not silently persist sensitive payloads. Quiet hours and per-category toggles (`apps/mobile/stores/notificationPrefsStore.ts`) govern whether a runtime notification fires at all.

## Approval Requests

High-priority approval prompts originate from a paired Desktop companion (a Remote Control window, **not** a fourth trust mode) and are mapped to notifications in `apps/mobile/services/companionNotifications.ts` (`approval_request` → `agent_approval_needed`, priority `high`). **🟡 Partial** — the bridge is built but `setupCompanionNotifications()` early-returns when `FEATURES.companion` is `false`, so approvals do not deliver in v1.

Requirements:

- Approval notifications are tier `high` (sound + banner) and `agent_approval_needed` / `approval_pending_escalation` are exempt from quiet-hours suppression (`notificationPrefsStore.shouldNotify`).
- An approval prompt is a **request**, never an auto-action: tapping routes to the approval surface; it must not approve, send, or execute anything. Compute stays on the host (Remote Control invariant).
- The `approvals` category defaults **on**.

## Task Completion

Task-completion signals (`task_completed`, normal priority — silent banner, badge) are mapped in `companionNotifications.ts` and routed by `handleNotificationResponse`. **🟡 Partial** — same companion/agents gate applies; the mapping is built but inert in v1.

Requirements: completion notices respect the `task_updates` category toggle (default on) and quiet hours (suppressed when non-critical during quiet windows). A task originating in **Local** mode produces only an in-app/runtime notice — it must never be reported through a Cloud push payload. 🔭 Planned: completion events for Cloud-run jobs delivered as remote push await the server fan-out path above.

## Failures

Failures are the highest-urgency class. **✅ Built (mapping)** — `agent_failed` and `emergency_stop_triggered` are tier `critical`: persistent alert, sound, badge, vibration, time-sensitive on iOS, `bypassDnd` channel on Android, and **never** quiet-hours-suppressed. Error bodies are sanitized in `companionNotifications.ts` (first line only, 100-char cap) so stack traces never appear in a notification. **🟡 Partial** for end-to-end delivery — the companion source is flag-gated off in v1.

Requirements: critical failures must vibrate/alert even in quiet hours; failure bodies must stay sanitized (no secrets, paths, or stack traces); a failure tap must land on a real destination, never a dead screen.

## Deep Links — notification routing

Tapping a notification routes via `handleNotificationResponse`, with a cold-start path (`handleInitialNotification` → `getLastNotificationResponseAsync`). **✅ Built** — `apps/mobile/services/notifications.ts`. Hardening already present:

- **Auth gate**: routing requires a real Clerk sign-in boolean (`setSignedIn`); when not signed in, every tap routes to `/(auth)/login` and no notification data is passed through as a redirect target.
- **Route allowlist + feature gating**: `isAllowedRoute` only permits known prefixes, each carrying a `FeatureKey` gate so a stray push for a disabled feature (companion/schedules/agents) cannot land on a gated screen.
- **Input validation**: `agentId` must match a UUID pattern before it is interpolated into a path.
- **Navigator-ready guard**: `safeNavigate` retries with backoff so cold-start taps don't crash before the navigator mounts.

OS-level deep links (universal links / app links) are configured in `apps/mobile/app.config.js`: `scheme: 'agiworkforce'`, `associatedDomains` (`applinks:agiworkforce.com`), and Android `intentFilters` for the same hosts. Requirement: notification-driven navigation and URL deep links share one allowlist; never `router.push` a raw, unvalidated route from a payload.

## Repository map

- `apps/mobile/services/notifications.ts` — push registration, channels, handler, local dispatch, response routing, in-app center.
- `apps/mobile/services/companionNotifications.ts` — companion control-message → notification bridge (flag-gated).
- `apps/mobile/stores/notificationPrefsStore.ts` — categories, quiet hours, vibration; `shouldNotify`.
- `apps/mobile/src/features/notifications/{index,time,README}.ts(.md)` — timestamp formatting + feature docs.
- `apps/mobile/app/(app)/notifications/index.tsx` — Notification Center screen.
- `apps/mobile/services/backgroundFetch.ts` — background agent-status polling task.
- `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/services/remoteChatGate.ts` — gates that govern what can notify.
- `apps/mobile/app.config.js` — `expo-notifications` plugin, scheme, associated domains, intent filters.

## Competitor notes

ChatGPT and Claude mobile push are single-provider, cloud-only: every notification implies a server round-trip to one vendor. AGI diverges deliberately. **Local mode produces no remote push** — on-device work stays on-device, which neither competitor offers. AGI's per-surface trust model means notifications are typed by _trust origin_ (Local in-app vs Cloud push vs companion Remote-Control event), and the **approval-request** class mirrors Claude Code Remote Control / Codex remote connections — a phone approving a host-run action — which consumer assistants do not have. And because **mobile carries no BYOK**, AGI never shows the key/credential notifications a power-user desktop tool might; provider configuration on mobile means on-device model management, not API keys.

## Acceptance / Definition of Done

Production-ready gate: push registration degrades cleanly with no entitlement; every notification tap reaches a valid, auth-and-flag-gated destination; Local activity never emits Cloud push; failure bodies are sanitized; quiet hours never suppress critical alerts.

- [ ] Build: `pnpm --filter @agiworkforce/mobile typecheck` and `test` green; cold-start and foreground tap paths covered.
- [ ] Trust: no Local-origin content in any Cloud push payload; `remoteChatGate` fails closed (no push when Cloud disabled); no BYOK/key notification anywhere.
- [ ] Security: route allowlist + UUID validation enforced; sanitized failure bodies (no secrets/stack traces); push tokens device-scoped, re-synced on rotation.

## Anti-patterns

- Adding any BYOK / API-key / provider-credential notification to mobile.
- Emitting remote push for Local-mode activity, or routing Local content through a Cloud payload.
- Navigating to a raw payload route without the allowlist + feature-gate + UUID checks.
- Suppressing `critical` failure/emergency alerts under quiet hours, or leaking stack traces into a notification body.
- Claiming companion/agent/schedule notifications "ship" while their flags are `false` — they are 🟡/🔭 today.
- Hardcoding a model ID into a notification, inventing an INR price or env var, or referencing Supabase (the stack is Clerk + Neon + Stripe).
