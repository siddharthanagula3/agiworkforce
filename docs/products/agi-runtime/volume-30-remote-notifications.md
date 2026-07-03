# AGI Runtime — Volume 30 — Remote Notifications

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (root) and `apps/mobile/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon). Grounded in real repo code: `services/signaling-server/src/index.ts` (offline approval queueing, control verbs), `services/api-gateway/src/routes/mobile.ts` (`/mobile/push-token`, `/mobile/agent-status`), `apps/mobile/services/notifications.ts`, `apps/mobile/services/companionNotifications.ts`, `apps/mobile/services/backgroundFetch.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/desktop/src/stores/connectionStore.ts`, `apps/web/app/api/control-plane/status/route.ts`.

## Overview & stance

Remote Notifications is how the AGI Runtime tells a user, on a device that is **not** the host, that a locally running session needs them — an approval, a finished task, a failure, or progress on a long job. It mirrors Claude Code mobile push (push-when-it-decides / push-when-action-is-required) but keeps AGI's trust model: the notified session **keeps running locally** on the host (Desktop, CLI, or VS Code). A notification is a _window signal_, not a compute move. Remote Control is not a fourth trust mode, so a push about a Local or BYOK session never carries local content into Managed Cloud — only routing metadata (session id, action id, short summary) to bring the user back to the host window to approve or dismiss.

Three trust modes shape delivery. **Local** and **BYOK** sessions may raise notifications, but payloads are minimized and provider labels preserved; no chat text, file contents, or secrets ride the wire. **Managed Cloud** sessions notify through the same fabric and sync notification-relevant state Web↔Mobile↔Desktop via Neon delta-sync (cloud chats only). Mobile has **no BYOK**; it receives notifications for its own Local/Cloud sessions and, when paired, for a Desktop host it is a window onto. The transport spine exists — the signaling-server relays approval control verbs and **queues approvals while the phone is offline** — but end-to-end push fan-out is not yet wired.

## Approval Requests — notify user for approvals

When a host session hits an approval-gated action (high-risk tool, computer-use escalation, spend), it must emit an `approval_request` control message so a paired remote window can approve or reject. This verb is a first-class part of the relay contract and is **queued for offline delivery**: if the mobile window is disconnected, the request is buffered and replayed on reconnect.

**🟡 Partial** — `services/signaling-server/src/index.ts` implements `approval_request`/`approval_response` verbs plus `queuePendingApproval`, `deliverPendingApprovals`, an `approval_queued` acknowledgement, `MAX_PENDING_APPROVALS_PER_SESSION`, and `PENDING_APPROVAL_TTL_MS` bounded eviction. The mobile side builds and sends `approval_response` (`apps/mobile/services/companion.ts`, `buildApprovalResponsePayload`). The gap: the Desktop last mile is unwired — `apps/desktop/src/stores/connectionStore.ts` re-emits inbound control as `CustomEvent('mobile-companion:control')` with **no listener**, and `apps/mobile/lib/v1FeatureFlags.ts` ships `companion: false` and `dispatch: false`, so the approval loop is dormant end-to-end. `GET /mobile/agent-status` (`services/api-gateway/src/routes/mobile.ts`) is a ✅ built poll fallback returning pending-approval summaries.

## Task Completion — notify completed tasks

On successful completion of a dispatched task, the host emits a completion event that surfaces as a **normal-priority** notification (silent banner, tap routes back to the session). Payload is a summary only — task name and status — never result content for Local/BYOK sessions.

**🟡 Partial** — the mobile notification layer models this: `apps/mobile/services/notifications.ts` defines the `task_completed` event type and `normal` priority, and `apps/mobile/services/companionNotifications.ts` maps a `task_completed` control action to a local banner via `scheduleLocalNotification`. Because `companion` is flag-off and there is no server-side push sender, completion today can only fire as a **local** notification when the app is foregrounded and the bridge is manually enabled. 🔭 remote completion push from a headless host to a backgrounded phone is not built.

## Failures — notify execution failures

Execution failures and emergency stops are **critical-priority**: persistent notification plus vibrate, tap routes to the failing session. Error text must be sanitized before it leaves the host — first line only, truncated, no stack traces — so a notification can never leak file paths, secrets, or internals of a Local/BYOK session.

**🟡 Partial** — `apps/mobile/services/companionNotifications.ts` maps `agent_failed` and `emergency_stop` control actions to `critical` notifications and already truncates `errorMessage` to the first line, max 100 chars. `apps/mobile/services/notifications.ts` enumerates `agent_failed` and `emergency_stop_triggered` event types with `critical` priority semantics (persistent + vibrate). Same gap: dormant behind `companion: false` with no remote push transport, so failures reach the user only as local notifications while the app runs. 🔭 guaranteed delivery to an offline device.

## Background Sessions — notify long-running jobs

Long-running host jobs (scheduled browser tasks, multi-step agents) must be able to notify progress and terminal state without the user watching. On mobile this requires a background execution budget to poll or receive, plus a durable notion of "which surfaces are live" so the host knows where to route.

**🟡 Partial / 🔭** — `apps/mobile/services/backgroundFetch.ts` provides a background-fetch scaffold, and `apps/mobile/services/notifications.ts` includes `schedule_triggered`, `status_update`, and `heartbeat_info` event types with `low`/`normal` priority. `GET /mobile/agent-status` (✅) is the intended background-poll source for pending work. Cross-surface presence — the "who is online" map that would let a host address a specific remote window — is **🔭 Planned**: `apps/web/app/api/control-plane/status/route.ts` queries a `surface_heartbeats` table that **does not exist** yet, so live long-running-job status cannot be resolved cross-device. CLI and VS Code remote attach for background jobs are 🔭.

## Mobile Push — deliver push notifications

The target is OS-level push (APNs/FCM via Expo) so a host session can wake a backgrounded or closed phone: push-when-a-decision-is-needed and push-when-an-action-is-required. Push tokens must be registered per device, associated with the signed-in Clerk user, and a server-side sender must fan messages out with minimized payloads.

**🟡 Partial (token path) / 🔭 (delivery)** — `apps/mobile/services/notifications.ts` `registerForPushNotifications()` acquires an Expo push token (`getExpoPushTokenAsync`) and POSTs it to `/api/mobile/push-token`; `services/api-gateway/src/routes/mobile.ts` persists it in the `push_token` column (rate-limited, JWT-scoped, `.strict()` validated). `expo-notifications` (`~55.0.22`) is a real dependency in `apps/mobile/package.json`, and `scheduleLocalNotification` delivers **local** notifications today. **🔭 Planned:** there is **no server-side push sender** (no Expo push call / server SDK anywhere in `services/`), so stored tokens never originate a remote push. End-to-end mobile push is not shipped; only local notifications and the offline approval queue are live.

## Repository map

- `services/signaling-server/src/index.ts` — WebRTC relay; `approval_request`/`approval_response` verbs; offline approval queue (`queuePendingApproval`, `deliverPendingApprovals`, TTL + per-session cap).
- `services/api-gateway/src/routes/mobile.ts` — `POST /mobile/push-token` (token storage), `GET /mobile/agent-status` (pending-approval poll).
- `services/api-gateway/src/routes/pair.ts` — QR pairing initiate/confirm.
- `apps/mobile/services/notifications.ts` — event types, priority tiers, `registerForPushNotifications`, `scheduleLocalNotification`.
- `apps/mobile/services/companionNotifications.ts` — control-action → local-notification bridge (dormant behind flag).
- `apps/mobile/services/companion.ts` — approval-response builder, heartbeat; `apps/mobile/services/backgroundFetch.ts` — background scaffold.
- `apps/mobile/lib/v1FeatureFlags.ts` — `companion`/`dispatch` gates (both `false`).
- `apps/desktop/src/stores/connectionStore.ts` — desktop control re-emit (`mobile-companion:control`, no listener).
- `apps/web/app/api/control-plane/status/route.ts` — cross-surface status (reads not-yet-created `surface_heartbeats`).

## Competitor notes

Claude Code Remote Control pushes to Claude iOS/Android when the local session decides or needs an action — "nothing moves to the cloud." OpenAI Codex relays notifications from a QR-paired Mac/Windows host to a phone window. ChatGPT push is cloud-run and tied to hosted tasks. AGI diverges: notifications originate from **whatever host runs the session** across Local, BYOK, and Managed Cloud; payloads are trust-mode-minimized (Local/BYOK never leak content); pairing is QR + per-role HMAC over an outbound-only relay; and the offline approval **queue** is a first-class server behavior, not best-effort. Push is multi-surface, never single-vendor.

## Acceptance / Definition of Done

- [ ] **Build:** a host `approval_request`/`task_completed`/`agent_failed`/progress event travels host → relay → paired remote window and renders at the correct priority; offline requests replay on reconnect (extend the ✅ signaling-server queue to all four classes).
- [ ] **Build:** a server-side push sender consumes stored `push_token`s and wakes a backgrounded phone; `companion`/`dispatch` flip on with the Desktop `mobile-companion:control` listener wired.
- [ ] **Trust:** notification payloads for Local/BYOK sessions contain only id + sanitized summary; no chat text, file contents, secrets, or full errors leave the host; provider label preserved.
- [ ] **Security:** tokens are Clerk-user-scoped and JWT-authenticated; approval delivery is bounded (TTL + per-session cap, already enforced); replay-safe pair tokens; rate limits on all notification endpoints.

## Anti-patterns

- Do **not** route Local/BYOK notification payloads through Managed Cloud, or embed chat/file/secret content in a push — id + sanitized summary only.
- Do **not** treat Remote Control as a fourth trust mode; a notification is a window signal.
- Do **not** claim remote push ships — no server-side sender exists; label it 🔭 until `push_token` is actually consumed.
- Do **not** silently drop offline approvals; honor the queue + TTL and surface expiry.
- Do **not** ship raw stack traces or unbounded error strings in failure notifications.
- Do **not** hardcode model IDs (read `packages/types/src/models.json`), reference Supabase, revive `middleware.ts` (use `proxy.ts`), or mention removed tiers (Plus / pro_plus / Hobby) or credit top-ups; the ladder is Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise.
