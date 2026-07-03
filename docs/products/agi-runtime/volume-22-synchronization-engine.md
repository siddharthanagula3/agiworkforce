# AGI Runtime — Volume 22 — Synchronization Engine

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root); `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/mobile/AGENTS.md` (active surface). Grounded in `apps/web/app/api/chat/sync/route.ts`, `apps/web/app/api/memory/sync/route.ts`, `apps/web/app/api/projects/sync/route.ts`, `apps/web/app/api/control-plane/status/route.ts`, `services/signaling-server/src/index.ts`, `services/signaling-server/src/constants.ts`, `services/api-gateway/src/routes/{mobile,pair}.ts`, `apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/desktop/src-tauri/src/integrations/realtime/{websocket_server.rs,presence.rs}`, and `packages/types/src/models.json`.

## Overview & stance

The Synchronization Engine keeps state consistent across AGI's six surfaces. It is not a surface, not a daemon, and not a fourth trust mode. There are two distinct fabrics: durable **data sync** (Neon delta-sync — the shipped path) and live **runtime/control sync** (the Desktop↔Mobile companion relay — partial and flag-gated).

Trust boundaries govern what may sync. Only **Managed-Cloud** chats, projects, memory, and artifacts get cloud rows and cross-device sync (Web ↔ Mobile ↔ Desktop). **Local** and **BYOK** (Desktop/CLI/VS Code only) rows have no `cloud_id` and are never pushed or pulled — enforced client-side per the matrix and by RLS server-side (✅ `apps/web/app/api/chat/sync/route.ts`). CLI, VS Code, and Chrome stay workspace/task-scoped; any handoff to app chat is explicit and redacted, never automatic. Remote control never changes this: a phone window steers a locally-running session, and its live events ride the outbound-only companion relay, not the Neon store. Model labels resolve only from `packages/types/src/models.json`.

## Runtime Events — synchronize runtime state

Runtime-state sync (approvals, dispatch, cancel, liveness) rides the companion control protocol over `services/signaling-server` (WebRTC pairing/relay). The verb allowlist is fixed and mirrored on both peers: `approval_request`/`approval_response`, `sync_request`/`sync_response`, `dispatch_request`/`dispatch_response`, `heartbeat`/`heartbeat_ack`, and `cancel` (🟡 `services/signaling-server/src/index.ts`). When mobile is offline, desktop-originated approvals are held in a per-session `pendingApprovals` map bounded by `MAX_PENDING_APPROVALS_PER_SESSION` and delivered on reconnect (🟡 `services/signaling-server/src/{index,constants}.ts`). Mobile builds and sends these control frames — `sendApprovalResponse`, `requestAgentRefresh` (a `sync_request`), `sendAgentCommand`, `sendEmergencyStop` (a `cancel` with `scope: 'all'`) (🟡 `apps/mobile/services/companion.ts`).

Requirement: control verbs are an explicit allowlist, approval-gated, and never carry Local/BYOK payload into the cloud (the relay moves control signals; compute stays on the host). Gap: the path is flag-gated off (`companion: false`, `dispatch: false` in `apps/mobile/lib/v1FeatureFlags.ts`) and the desktop last mile is unwired — control events are re-emitted as a window `CustomEvent('mobile-companion:control')` with no registered listener. A general runtime-event bus that mirrors full runtime state (task graph, tool state, resource usage) cross-device beyond these verbs is 🔭.

## Session State — synchronize session metadata

Managed-Cloud conversation metadata syncs as last-writer-wins by `updated_at`: `title`, `model`, `project_id`, `pinned`, plus `created_at`/`deleted_at` (✅ `apps/web/app/api/chat/sync/route.ts`, `ConversationDelta` + the conversations UPSERT). Project and memory metadata sync the same way through their own delta routes (✅ `apps/web/app/api/projects/sync/route.ts`, `apps/web/app/api/memory/sync/route.ts`). After a companion reconnect, `sync_request`/`sync_response` resnapshots the live session so the phone window catches up on agent status (🟡 `apps/mobile/services/companion.ts` `requestAgentRefresh`).

Requirement: session metadata is LWW-merged, tombstone-deleted (never hard-deleted), and strictly user-scoped; a null field from a client that does not track it must not clobber a value another device set (see the `model = coalesce(excluded.model, …)` guard, ✅ `apps/web/app/api/chat/sync/route.ts`). Runtime session state below the conversation row — `agiworkforce-task-runtime`/`app-server` session config, token accounting, in-flight turn cursors — has no cross-device sync store today and is 🔭.

## Streaming Events — synchronize response streams

Within a single surface, a response streams as incremental delta events (Managed-Cloud token streams ride the gateway SSE path; local surfaces render protocol deltas). Synchronizing a _live_ stream to a _second_ device is a different problem. The only live cross-device stream path today is the companion relay re-emitting agent progress/status to the paired phone (🟡 — same `services/signaling-server/src/index.ts` relay, gated off by `apps/mobile/lib/v1FeatureFlags.ts`). Durable propagation is not streaming: a finalized turn becomes an append-only message and reaches other devices only on the next delta-sync pull (✅ `apps/web/app/api/chat/sync/route.ts`).

Requirement: a mirrored stream is a read-only view of a locally-running session, emits an explicit disconnect/error event rather than a silently truncated "complete," and never re-routes Local/BYOK output into the cloud to mirror it. True live cross-device stream mirroring beyond the companion protocol (token-level fan-out to Web/Mobile watchers) is 🔭.

## Presence — synchronize connected clients

Two partial pieces exist, neither cross-device-complete. On the Desktop host, `PresenceManager` tracks connected clients over the `127.0.0.1` WS/IPC host and persists to a local `user_presence` SQLite table, with `broadcast_to_user` fan-out (🟡 `apps/desktop/src-tauri/src/integrations/realtime/{presence.rs,websocket_server.rs}`) — but it is single-host and `get_team_presence` returns an empty vector. On the signaling relay, a session-level heartbeat drives stale-session cleanup (>5 min, 🟡 `services/signaling-server/src/{index,constants}.ts`). The Web control-plane presence panel (`apps/web/app/api/control-plane/status/route.ts`) is designed to report per-surface online/offline from last-heartbeat rows — but it queries `surface_heartbeats` and `surface_activity_log`, tables that do not exist, so every surface defaults to `status: 'unknown'`.

Requirement: cross-surface presence must report which surfaces are online for a user, degrade to `unknown` (never fabricate `online`), and stay user-scoped. Given the missing tables and single-host scope, cross-device presence is 🔭.

## Conflict Resolution — resolve concurrent updates

This is the strongest shipped surface. Concurrent updates to Managed-Cloud rows resolve deterministically (✅ `apps/web/app/api/chat/sync/route.ts`):

- **Idempotent upsert** keyed on `id` (= `cloud_id`), so replays and overlapping pushes converge.
- **Last-writer-wins** on conversation/artifact metadata, guarded by `where excluded.updated_at >= …updated_at` so a stale push cannot overwrite a newer row; `COALESCE` prevents a null field clobbering a set one.
- **Append-only messages**: on conflict only a `deleted_at` tombstone may change; content, role, model, provider, and token counts are immutable.
- **Safe pull cursor**: `computePullCursor` never advances past the lowest saturated frontier when tables paginate independently, so a re-versioned row is never skipped (silent-loss prevention).
- **Server-authoritative identity**: `user_id` is set from the verified session, with RLS `WITH CHECK` as the DB backstop.

Requirement: conflict resolution is convergent, monotone, and lossless-by-tombstone; it never resurrects a deleted row or mutates a finalized message. CRDT/OT for real-time concurrent _editing_ (multiple devices typing into one artifact) is out of scope of LWW and is 🔭.

## Repository map

- `apps/web/app/api/chat/sync/route.ts` — Managed-Cloud chat delta sync (cursor + tombstones + LWW + append-only + safe cursor).
- `apps/web/app/api/memory/sync/route.ts`, `apps/web/app/api/projects/sync/route.ts` — memory/project delta sync.
- `apps/web/app/api/control-plane/status/route.ts` — cross-surface presence panel (queries missing `surface_heartbeats`/`surface_activity_log`).
- `services/signaling-server/src/{index.ts,constants.ts}` — WebRTC pairing/relay, control-verb allowlist, offline approval queue, session heartbeat.
- `services/api-gateway/src/routes/{mobile.ts,pair.ts}` — `POST /mobile/pairing-code`, `POST /pair/initiate`, per-role HMAC pair tokens, QR data `agiw:<code>:<pairToken>`.
- `apps/mobile/services/companion.ts` — control-frame builders, heartbeat/stale detection, reconnect.
- `apps/mobile/lib/v1FeatureFlags.ts` — `companion`/`dispatch` flags (both `false`).
- `apps/desktop/src-tauri/src/integrations/realtime/{websocket_server.rs,presence.rs}` — local WS host, `PresenceManager`, `broadcast_to_user`.

## Competitor notes

Claude, ChatGPT, and Codex sync history and settings across their apps by default, single-provider and cloud-anchored, with live remote-control windows (Claude Code Remote Control, Codex remote connections) that keep the session on the host. AGI matches the remote-window model but diverges on trust: sync is boundary-scoped — only Managed-Cloud rows sync Web ↔ Mobile ↔ Desktop, while Local and BYOK state never touches the cloud store, presence panel, or relay; models are provider-neutral (`packages/types/src/models.json`); CLI/VS Code/Chrome stay workspace-scoped. Unbuilt parity (live cross-device streaming, real presence) is 🔭, not faked.

## Acceptance / Definition of Done

- [ ] **Build:** chat/memory/projects delta sync round-trip green (cursor, tombstones, idempotent upsert, safe-frontier cursor); companion control verbs relay end-to-end once `companion`/`dispatch` are wired and the desktop `mobile-companion:control` listener exists; presence requires the `surface_heartbeats`/`surface_activity_log` tables to be created and populated.
- [ ] **Trust:** no Local/BYOK row is pushed, pulled, relayed, or shown in presence; only rows with a `cloud_id` sync; the companion relay carries control signals only, never local payload into the cloud.
- [ ] **Security:** all sync reads/writes are user-scoped by RLS with server-set `user_id`; messages stay append-only (only `deleted_at` mutates); CSRF + rate limits hold on mutating routes; pair tokens are per-role HMAC and approval-gated; a dropped live stream emits an explicit error, never a truncated "complete."

## Anti-patterns

- Syncing, relaying, or listing a Local/BYOK conversation, session, or presence entry; writing `user_id` from the request body instead of the verified session.
- Advancing the pull cursor to the global max across independently paginated tables (silent row loss) — use the safe frontier.
- Mutating a finalized message in place or hard-deleting rows so sync can't propagate the removal; resurrecting a tombstoned row via a stale LWW push.
- Reporting a surface as `online` when the heartbeat source is absent — degrade to `unknown`.
- Presenting the companion protocol, cross-device streaming, or cross-surface presence as shipped; they are 🟡/🔭 with cited gaps.
- Treating remote control as a fourth trust mode; inventing a monolithic sync daemon; hardcoding or inventing model IDs, routes, env vars, or command names.
- Referencing Supabase (use Clerk + Neon + Stripe) or removed tiers (Plus, `pro_plus`, Hobby, credit top-ups). Use only Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise.
