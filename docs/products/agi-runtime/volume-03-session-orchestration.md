# AGI Runtime — Volume 03 — Session Orchestration

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `services/AGENTS.md` and `apps/mobile/AGENTS.md` (nearest path-scoped rules); grounded in `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`, `crates/agiworkforce-app-server/src/lib.rs`, `services/signaling-server/src/index.ts`, `apps/mobile/services/companion.ts`, `apps/web/app/api/chat/sync/route.ts`, `apps/web/app/api/control-plane/status/route.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `packages/client/client-runtime/src/`.

## Overview & stance

A "session" in AGI Runtime is a bounded unit of orchestrated work: a task or agent run on a host, a pairing/companion channel, or a Managed-Cloud chat thread. This volume specifies how sessions are created, cataloged, persisted, recovered, resumed, described, backgrounded, run concurrently, and cleaned up — across the internal execution layer, not a seventh user product.

The three trust modes shape every requirement. **Local** sessions run on-host and never leave the trust boundary silently. **BYOK** sessions exist only where the fork rules allow (Desktop/CLI/VS Code) and are never surfaced on Web or Mobile. **Managed Cloud** sessions are the only ones eligible for Neon delta-sync. Remote Control is not a fourth mode: a phone/web window steers a session that keeps running on the host. There is no monolithic runtime daemon today; the target below is assembled from real crates, the relay, and the Neon sync APIs, with every gap labeled.

## Session Creation

Creation mints a session with a stable identifier, a trust mode, and an owner. **✅ Built** — `TaskRegistry::create()` (`crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`) assigns a UUID, a `TaskKind`, `TaskStatus::Pending`, and a pre-created output file under `~/.agiworkforce/tasks/{id}.out`. **✅ Built** — the local app-server bounds admission via `AppServerConfig { max_sessions: 10, session_timeout_secs: 3600 }` (`crates/agiworkforce-app-server/src/lib.rs`), consumed only by the CLI. **✅ Built** — pairing sessions are created by `POST /pairings` in `services/signaling-server/src/index.ts` (collision-safe codes, per-role HMAC `pairTokens`, TTL). A unified session object carrying trust mode + surface + provider label at creation is **🔭 Planned**. Requirement: creation records the trust mode explicitly and refuses to inherit Cloud/BYOK context into a Local session.

## Session Registry — active session catalog

**✅ Built** — `TaskRegistry` holds the active catalog in an `Arc<RwLock<HashMap<TaskId, Task>>>` with `list()` and `get()`. **✅ Built** — the signaling relay keeps `activeSessions: Map<code, Session>` plus a per-socket `clients` map for routing (`services/signaling-server/src/index.ts`). **🔭 Planned** — a cross-surface presence catalog: `apps/web/app/api/control-plane/status/route.ts` already queries `surface_heartbeats`, but that table does not exist in `apps/web/db/neon`, so the catalog returns dormant data until the table and heartbeat writers ship. Requirement: the registry must partition entries by trust mode so a listing never mixes Local task IDs with Cloud threads or exposes BYOK sessions to Web/Mobile.

## Session Persistence — persist state across restarts

**🟡 Partial** — task _output_ survives restart as append-only files (`TaskRegistry::append_output`/`read_output`), but the task _metadata_ registry is an in-memory `HashMap` and is lost on process restart; durable task-index persistence is the gap. **✅ Built** — pairing sessions are persisted to Neon (`insertSession`) and rehydrated on demand. **✅ Built** — Managed-Cloud chat state is durable in Neon and synced via `apps/web/app/api/chat/sync/route.ts` (cursor + tombstones + idempotent upsert). A full runtime-session snapshot (in-flight agent state, tool cursor) that reloads after a crash is **🔭 Planned**. Requirement: Local/BYOK persisted state stays on-host; only Managed-Cloud rows persist server-side.

## Session Recovery — restore interrupted sessions

**✅ Built** — the relay rehydrates a dropped session from Neon inside `handleRegister` (single-flight `pendingRehydrations` guards the race) and re-emits `peer_ready`/`sync_request` on reconnect. **✅ Built** — approvals issued while a phone was offline are queued (`pendingApprovals`) and redelivered on mobile reconnect. **✅ Built** — `StallWatchdog` transitions a stalled task to `Failed("stall timeout")` so a hung run is recoverable rather than wedged. **🟡 Partial** — `apps/mobile/services/companion.ts` implements stale detection, a 15s reconnect countdown, and `manualReconnect()`, but `FEATURES.companion`/`dispatch` are `false` (`apps/mobile/lib/v1FeatureFlags.ts`) and the desktop last mile is unwired. Restoring a crashed agent's mid-run tool state is **🔭 Planned**.

## Session Resume — continue previous work

**✅ Built** — a reconnecting client resumes via `sync_request` (relay) and via delta pull `GET /api/chat/sync?since=<cursor>` (Managed Cloud), so a device continues from its last `server_version`. **🔭 Planned** — resuming a stopped local task: `valid_transition()` in `task-runtime` has no `Stopped → Running` edge, so stop is terminal; a checkpoint/resume model must be added. **🔭 Planned** — CLI and VS Code remote attach (continue a host session from a phone/web window) per Claude Code Remote Control / Codex parity. Requirement: resume reattaches to the original host and trust mode, never re-homing a Local session into Cloud.

## Session Metadata — ownership, timestamps, status

**✅ Built** — `Task` carries `status`, `started_at`, `ended_at`, `exit_code`, `error`; status is a guarded state machine (`Pending/Running/Completed/Failed/Stopped`). **✅ Built** — relay `Session` carries `createdAt`, `expiresAt`, `participants`, `lastHeartbeatAt`, and TTL extends to 24h once both peers connect. **✅ Built** — Cloud rows carry server-set `user_id` (ownership, never from the request body), `created_at`, `updated_at`, `deleted_at`, and a monotonic `server_version`, enforced by RLS via `getUserScopedDb` (`apps/web/app/api/chat/sync/route.ts`). A single metadata schema unifying these across trust modes is **🔭 Planned**. Requirement: ownership is always derived from the verified session, never client-asserted.

## Background Sessions — unattended workflows

**🟡 Partial** — `TaskKind` already models unattended work (`LocalWorkflow`, `MonitorMcp`, `RemoteAgent`, `Dream`) and `StallWatchdog` guards headless runs, but end-to-end execution wiring is incomplete. **✅ Built** — offline approval queuing lets an unattended host defer high-risk steps until a phone reconnects (`pendingApprovals`). **🔭 Planned** — scheduled/recurring runs (`FEATURES.schedules === false`) and unattended remote-control runs (companion off). Requirement: an unattended session still gates high-risk actions through the same approval flow (`approval_request`/`approval_response`), never auto-approving.

## Concurrent Sessions — multiple active sessions

**✅ Built** — `TaskRegistry` runs many tasks concurrently (keyed map + independent output files); the app-server caps concurrency at `max_sessions: 10`; the relay holds many independent pairings with per-IP connection and message rate limits. **🔭 Planned** — per-trust-mode and per-plan concurrency ceilings: Free / Basic ($8 · ₹399) / Pro ($20) / Max ($100 and $200) / Enterprise (custom). Local and BYOK are free access modes, not metered by plan; no credit top-ups gate concurrency. Requirement: a busy Cloud quota must never throttle Local sessions.

## Session Cleanup — archive and remove completed sessions

**✅ Built** — the relay's `cleanupInterval` removes expired sessions, evicts stale sessions (no heartbeat >5 min, no participants), and expires pending approvals; `DELETE /pairings/:code` tears down on demand. **✅ Built** — terminal task states set `ended_at`, and delta-sync uses `deleted_at` tombstones so removal propagates idempotently across devices. **🟡 Partial** — terminal `Task` entries and their output files are not garbage-collected by `task-runtime`; a retention/archival policy is the gap. A unified cross-trust-mode retention policy is **🔭 Planned**. Requirement: Local artifacts are deleted locally; Cloud deletion is a tombstone honoring retention/deletion controls.

## Repository map

- `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs` — task session registry, status machine, output persistence, stall watchdog.
- `crates/agiworkforce-app-server/src/lib.rs` — local JSON-RPC/WS host, `max_sessions`/`session_timeout_secs` (CLI-only).
- `services/signaling-server/src/index.ts` — pairing sessions, rehydration, offline approval queue, cleanup.
- `apps/mobile/services/companion.ts` — remote-window health, reconnect, resume signals (flag-gated off).
- `apps/web/app/api/chat/sync/route.ts` (+ `memory/sync`, `projects/sync`) — Managed-Cloud delta persistence/resume.
- `apps/web/app/api/control-plane/status/route.ts` — cross-surface presence (dormant; `surface_heartbeats` unshipped).
- `packages/client/client-runtime/src/` — shared TS session primitives (`registry.ts`, `events.ts`, queue/state/offline helpers).

## Competitor notes

Claude Code Remote Control and OpenAI Codex remote connections keep the session on the host and pair a phone as a window; ChatGPT/Claude web threads persist server-side. AGI matches the local-first remote-window model (QR + HMAC pairing, outbound-only, approval-gated) but diverges: sessions are trust-mode-partitioned, so only Managed-Cloud sessions sync, while Local and BYOK sessions never leave the host. Multi-provider and BYOK-where-allowed make a session's provider label explicit metadata, not an assumed single vendor.

## Acceptance / Definition of Done

- [ ] Build: task/relay/cloud session lifecycles pass their existing suites; a durable task-index restart test is added before persistence is marked ✅.
- [ ] Trust: a Local session cannot be cataloged, synced, or resumed into Cloud/BYOK; BYOK sessions are invisible to Web/Mobile registries; provider label is present on every session record.
- [ ] Security: ownership is server-derived (RLS `WITH CHECK`); pairing requires a valid per-role HMAC token; unattended sessions still route high-risk steps through approval; cleanup honors retention/deletion controls.

## Anti-patterns

- Do not claim a monolithic runtime daemon or a shipped cross-surface presence catalog — `surface_heartbeats` does not exist yet.
- Do not silently re-home a Local/BYOK session into Managed Cloud on reconnect or resume.
- Do not treat the in-memory `TaskRegistry` as durable persistence, or auto-approve high-risk steps in background sessions.
- Do not hardcode or invent model IDs (read `packages/contracts/types/src/models.json`), invent routes/env vars, reference Supabase, or reintroduce removed tiers (Plus/pro_plus/Hobby) or credit top-ups; concurrency plans use Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise only.
