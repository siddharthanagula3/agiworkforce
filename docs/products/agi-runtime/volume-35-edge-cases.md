# AGI Runtime — Volume 35 — Edge Cases

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `crates/agiworkforce-protocol/src/error.rs`; `crates/agiworkforce-app-server/src/lib.rs`; `packages/runtime/src/{offline-queue,offline-sync,queue,state}`; `services/signaling-server/src/index.ts`; `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`; `apps/mobile/services/companion.ts`; `apps/web/app/api/chat/sync/route.ts`; and the Repository map below.

## Overview & stance

AGI Runtime is the internal shared execution layer — not a user surface and not a seventh product. This volume specifies how that layer degrades and recovers when things go wrong: a provider 500s mid-turn, a session file is truncated, the network drops, the disk fills, or a task is killed halfway. There is no monolithic runtime daemon today; the Runtime is assembled from the local app-server (JSON-RPC-over-stdio + WebSocket, CLI-only), `packages/runtime`, the Desktop `127.0.0.1` WS/IPC host, the Chrome native-messaging bridge, `services/signaling-server`, and the Neon delta-sync APIs. Recovery must be coherent across all of them.

Trust boundaries shape every recovery path. Recovery must **never** silently promote a Local or BYOK session to Managed Cloud: a provider outage on a BYOK session retries against the same BYOK key or surfaces to the user, never through the cloud gateway. Only Managed-Cloud chats participate in Neon delta-sync recovery; Local/BYOK rows carry no `cloud_id` and are never pushed or pulled (`apps/web/app/api/chat/sync/route.ts`). Remote Control is a window, not a mode: if a phone loses its link mid-task, the task keeps running on the host and the window reattaches. BYOK exists only on Desktop, CLI, and VS Code.

## Provider Failure — recover provider failures

The local session loop already distinguishes transient from terminal provider errors. `AgiworkforceErr::is_retryable()` (`crates/agiworkforce-protocol/src/error.rs`) treats transport-level stream disconnects (the `Stream` variant), `Timeout`, and genuinely transient IO failures as retryable, while `UsageLimitReached`, refusals, and un-parseable responses are terminal. A model-side transient turn can carry a requested retry delay, which the loop honors before re-issuing the turn. `RetryLimitReachedError` caps automatic retries and surfaces the last HTTP status. **✅ Built** (`error.rs` `is_retryable`, `RetryLimit`).

- Retries use bounded exponential backoff; the ceiling is a hard retry-limit, after which the error is surfaced with provider name and status, never swallowed.
- On BYOK, a failing provider retries against the **same** user key or stops; it must not fall back to the managed gateway. Provider label stays visible throughout.
- Cross-provider failover (auto-switch to a second catalog model on sustained 5xx) is **🔭 Planned** — no failover orchestrator exists in `error.rs`. Model IDs for any such policy come only from `packages/types/src/models.json`.

## Session Corruption — recover sessions

The app-server holds sessions in memory with a `max_sessions` cap and a `session_timeout_secs` idle expiry (`crates/agiworkforce-app-server/src/lib.rs`), so a crashed host currently loses in-flight session state. Durable session persistence is only sketched: `AppStateStore.ts` documents a `registerPersistenceHandler` hook (Desktop → `~/.agiworkforce/state.json`, Mobile → MMKV) whose full implementation is deferred.

- A corrupt or unparseable persisted-state blob must fail closed to safe defaults, not crash the surface: the store falls back to documented defaults rather than propagating a parse error. **🟡 Partial** — `AppStateStore.ts` defines defaults, but the persistence/hydrate path and schema-version migration are the deferred follow-on (the gap).
- Durable rollout/resume files with checksum validation and quarantine-on-corruption are **🔭 Planned** — no rollout-file recovery path exists in `agiworkforce-app-server`.
- A recovered session must reopen in its original mode (Local/BYOK/Cloud) or be discarded; never silently reclassified.

## Network Failure — handle connectivity issues

Connectivity loss is the best-covered edge today. `packages/runtime/src/offline-queue/index.ts` enqueues messages and tool-execution requests with bounded exponential backoff (1s base, 30s cap, `maxRetries`) and try/catch around every persist. `offline-sync/index.ts` runs an explicit `ONLINE / OFFLINE / SYNCING / ERROR` state machine, debounces sync on connectivity restore, and schedules backoff retries on sync failure. **✅ Built**.

- Managed-Cloud delta-sync is resumable and idempotent: `computePullCursor` (`apps/web/app/api/chat/sync/route.ts`) deliberately re-requests the overlap window rather than skipping rows, and pushes UPSERT by `id`, so a dropped sync mid-page never loses or duplicates data. **✅ Built**.
- The signaling relay queues approvals sent while the mobile window is disconnected and delivers them on reconnect, with heartbeat-based stale-session cleanup (`services/signaling-server/src/index.ts` — `QueuedApproval`, heartbeat). **✅ Built** on the relay.
- Desktop↔Mobile companion reconnect (30s heartbeat, missed-heartbeat stale threshold, reconnect countdown in `apps/mobile/services/companion.ts`) is **🟡 Partial** — gated off (`apps/mobile/lib/v1FeatureFlags.ts` `companion:false`, `dispatch:false`) and the desktop last-mile listener is unwired.
- Offline queue/sync are per-surface, not cross-surface shared; a queued Local/BYOK item never syncs to cloud.

## Disk Full — handle storage exhaustion

Storage exhaustion is only partially defended. The offline queue wraps persistence in try/catch (`offline-queue/index.ts`), so a failed `setJSON` (quota exceeded, `ENOSPC`) is caught and logged rather than crashing the surface — but there is no quota-aware eviction or "storage full" surfacing yet. **🟡 Partial** (catch exists; graceful-degradation policy is the gap). On the Rust side, `error.rs` retries only genuinely transient IO failures and treats deterministic IO errors as terminal, correctly avoiding hammering a full disk.

- Pre-flight free-space checks before large writes (rollout files, artifact caches, model downloads) and bounded LRU/size-cap eviction for `agiworkforce-utils-cache` consumers are **🔭 Planned**.
- Required behavior when built: fail the current write cleanly, keep the session interactive, tell the user where space is consumed, and never corrupt persisted state with a partial write.

## Interrupted Tasks — recover interrupted execution

User interruption is a first-class, non-fatal signal: `AgiworkforceErr::Interrupted` (Ctrl-C) is modeled explicitly and included in `is_retryable` so the loop can unwind cleanly (`crates/agiworkforce-protocol/src/error.rs`). **✅ Built**. Cancellation propagates over the relay via the `cancel` verb (`services/signaling-server/src/index.ts`). The priority send pipeline (`packages/runtime/src/queue/messageQueueManager.ts`) preserves queued-but-unsent user turns across mutations, so an interrupt does not drop pending input.

- A cancelled tool call must leave no half-applied side effects the runtime silently ignores; partial output is labeled interrupted, not presented as complete.
- Resume-after-crash from a durable checkpoint is **🔭 Planned** — app-server sessions are in-memory with a 3600s idle timeout, so a killed host cannot resume a task, only restart.
- Sync-level interruption is already safe: an interrupted delta-sync resumes from the last cursor with idempotent UPSERT (`apps/web/app/api/chat/sync/route.ts`), losing or duplicating nothing.

## Repository map

- `crates/agiworkforce-protocol/src/error.rs` — retryable/terminal taxonomy, retry limits, interruption.
- `crates/agiworkforce-app-server/src/lib.rs` — CLI-only session host; session cap + idle timeout.
- `packages/runtime/src/{errors.ts,offline-queue,offline-sync}` — dispatch errors; offline enqueue/backoff/sync state machine.
- `packages/runtime/src/{queue/messageQueueManager.ts,state/AppStateStore.ts}` — priority send lanes; persisted app state (hook deferred).
- `services/signaling-server/src/index.ts` — offline approval queueing, heartbeat, reconnect, `cancel`.
- `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs` — WS host, IP lockout.
- `apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts` — companion reconnect (gated off).
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — resumable idempotent Managed-Cloud delta-sync.

## Competitor notes

Claude Code, ChatGPT, and Codex retry single-provider outages and resume sessions against one first-party backend. AGI diverges deliberately: recovery is **trust-mode-aware and multi-provider**. A provider failure on a BYOK Desktop/CLI/VS Code session recovers against the user's own key or stops — never silently rerouted to Managed Cloud, unlike a single-vendor product where "retry" always means the same cloud. Local sessions recover with no network dependency at all. Remote Control parity (Claude Code Remote Control, Codex remote connections) means a dropped phone link never moves compute to the cloud: the host keeps running and the window reattaches. Sync recovery is provider-neutral Neon delta-sync scoped to Managed-Cloud chats only.

## Acceptance / Definition of Done

The domain is production-ready when every edge path above degrades without data loss, without crashing the surface, and without crossing a trust boundary — and when every 🔭 item is either built with a cited path or tracked as a gap.

- [ ] **Build:** provider retries are bounded and surfaced on exhaustion; offline queue/sync recover on reconnect; interrupted syncs resume idempotently; corrupt persisted state falls back to defaults, not a crash.
- [ ] **Trust:** no recovery path promotes Local/BYOK to Cloud; BYOK retries use the same user key; recovered sessions keep their original mode and visible provider label; only Managed-Cloud rows sync.
- [ ] **Security:** WS-host IP lockout holds under repeated auth failure; queued approvals stay approval-gated on delivery; no partial write corrupts persisted state under disk-full.

## Anti-patterns

- Silently rerouting a failed Local/BYOK turn to Managed Cloud, or reclassifying a recovered session's trust mode.
- Claiming durable session resume, cross-provider failover, or disk-full pre-flight as shipped — all are 🔭 today.
- Hardcoding a fallback model ID instead of reading `packages/types/src/models.json`.
- Swallowing a provider error instead of surfacing it after the retry limit, or presenting interrupted/partial output as complete.
- Referencing removed tiers (Plus, `pro_plus`, Hobby) or credit top-ups in any degraded-mode messaging; reference Supabase (fully migrated to Clerk + Neon + Stripe).
- Inventing routes, env vars, or a monolithic runtime daemon the repo does not have.
