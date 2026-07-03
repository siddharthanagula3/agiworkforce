# AGI Runtime — Volume 28 — Performance

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md`; the nearest surface guides (`apps/desktop/AGENTS.md`, `services/AGENTS.md`); and the real repo paths this volume grounds in — `crates/agiworkforce-task-runtime/src/lib.rs`, `crates/agiworkforce-async-utils/src/lib.rs`, `crates/agiworkforce-app-server/src/lib.rs`, `crates/agiworkforce-protocol/src/protocol.rs`, `crates/agiworkforce-plugin-runtime/src/lib.rs`, `packages/runtime/src/{offline-sync/index.ts,queue/messageQueueManager.ts,events.ts}`, `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`, `services/signaling-server/src/index.ts`, `apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/desktop/src/stores/connectionStore.ts`.

## Overview & stance

This volume defines performance requirements for AGI Runtime — the internal shared execution layer, not a user surface. There is no monolithic runtime daemon, so performance is budgeted **per real part**: the Rust task registry, the async cancellation utilities, the CLI-facing app-server, the Desktop `127.0.0.1` realtime host, the TypeScript runtime (queues, offline-sync, event bus), and the outbound-only signaling relay for remote windows.

Trust modes constrain every optimization here. Local sessions keep their compute on the host; a performance shortcut must never relocate Local/BYOK work into Managed Cloud to "go faster." Remote Control is a window over a locally running session — streaming and concurrency budgets apply to the host, and the phone/web client only observes redacted, allowlisted frames. BYOK is Desktop/CLI/VS Code only. Cross-surface presence and unified scheduling are largely 🔭; most parity performance features are design intent, not shipped.

## Startup Performance

✅ Built — the task registry boots lazily: `TaskRegistry::new` resolves `~/.agiworkforce/tasks` and only `create_dir_all`s it, holding tasks in an in-memory `Arc<RwLock<HashMap<TaskId, Task>>>` with no database load on start (`crates/agiworkforce-task-runtime/src/lib.rs`). ✅ Built — the app-server answers a lightweight handshake advertising `{"tools": true, "streaming": true}` before any work (`crates/agiworkforce-app-server/src/lib.rs`); the Desktop realtime host allocates its connection semaphore at construction rather than per-request (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`). 🟡 Partial — plugin manifests load on demand via `load_manifest_for` (`crates/agiworkforce-plugin-runtime/src/lib.rs`), which keeps cold start cheap, but there is no warm-cache metric or startup budget assertion. 🔭 Planned — a unified cold/warm-start budget across all six surfaces, and startup presence broadcast, do not exist.

Requirements: no blocking network call on the boot path; lazy directory/plugin/model init; a first-usable-frame budget per surface with a regression gate. Startup must never eagerly instantiate a Cloud connection for a Local-only launch.

## Memory Management

✅ Built — output reads are tail-bounded: `read_output(id, max_bytes)` seeks to `file_len - max_bytes` so a large task log never loads whole into memory (`crates/agiworkforce-task-runtime/src/lib.rs`). ✅ Built — frame caps prevent unbounded buffering: the Desktop host enforces `MAX_WS_MESSAGE_SIZE = 4 MiB` so a peer cannot force it to buffer a huge frame before validation (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`), and the signaling relay bounds `MAX_MESSAGE_SIZE_BYTES`, `MAX_CONTROL_PAYLOAD_SIZE`, and `MAX_PENDING_REHYDRATIONS` (`services/signaling-server/src/index.ts`). ✅ Built — context-pressure signals exist in the protocol union (`TokenCount`, `ContextCompacted` in `crates/agiworkforce-protocol/src/protocol.rs`) so the session can shed context before OOM. 🟡 Partial — the in-memory task `HashMap` has no eviction or TTL for terminal tasks, so long-lived hosts accumulate `Completed`/`Failed` entries (`crates/agiworkforce-task-runtime/src/lib.rs`). 🔭 Planned — per-surface heap budgets, on-device model memory ceilings for Mobile Local inference, and arena/streaming handling for large artifacts.

Requirements: every unbounded collection needs a cap or eviction policy; buffers stream rather than fully materialize; Local model memory is bounded so on-device inference degrades gracefully rather than crashing the host.

## CPU Scheduling

✅ Built — the runtime is tokio-async; the `StallWatchdog` clamps its poll interval to `100 ms ..= timeout/4` so a watchdog never busy-wakes the executor (`crates/agiworkforce-task-runtime/src/lib.rs`). ✅ Built — cancellation is cooperative and cheap: `or_cancel` uses `tokio::select!` on a `CancellationToken` to abandon in-flight futures promptly without polling (`crates/agiworkforce-async-utils/src/lib.rs`). 🟡 Partial — the task registry calls blocking `std::fs` (create/append/read/`metadata`) directly inside `async fn`s without `spawn_blocking`, so slow disk I/O can stall the executor thread (`crates/agiworkforce-task-runtime/src/lib.rs`). 🔭 Planned — QoS classes (interactive vs. background), fair-share scheduling across concurrent sessions, and main-thread offload budgets on Mobile/Web.

Requirements: no blocking syscall on an async worker without `spawn_blocking`; interactive turns preempt background tasks; cancellation propagates within a bounded deadline. Scheduling stays trust-isolated — a Local session's CPU work is never scheduled onto a Cloud worker.

## Parallel Execution — maximize concurrency

✅ Built — concurrency primitives are real: `tokio::spawn` runs watchdogs off the request path, `Arc<RwLock<HashMap>>` admits concurrent readers of the task registry (`crates/agiworkforce-task-runtime/src/lib.rs`), the Desktop host caps simultaneous peers with `connection_semaphore = Semaphore::new(MAX_CONNECTIONS)` (32) (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`), and the app-server shares one `Arc<dyn ToolDispatch>` across connections (`crates/agiworkforce-app-server/src/lib.rs`). 🔭 Planned — there is **no** bounded fan-out executor for parallel tools or sub-agents: task-runtime has no `Semaphore`, `FuturesUnordered`, `buffer_unordered`, or `join_all`, and although `TaskKind` names `InProcessTeammate`/`RemoteAgent`, no scheduler runs them concurrently under a shared limit.

Requirements: parallel tool/sub-agent execution runs through a bounded semaphore (avoid thundering-herd on provider or disk), returns results deterministically, and stays per-trust-isolated so a Local fan-out never spills a branch into BYOK or Cloud. Concurrency limits are configurable and observable.

## Streaming Performance

✅ Built — incremental streaming is first-class in the protocol union: `AgentMessageDelta`, `AgentReasoningDelta`, `ExecCommandOutputDelta`, `PlanDelta`, and `RealtimeTranscriptDelta` (`crates/agiworkforce-protocol/src/protocol.rs`); the app-server advertises `"streaming": true` and pumps frames through `StreamExt::next` (`crates/agiworkforce-app-server/src/lib.rs`); `read_output`/`append_output` stream task logs incrementally (`crates/agiworkforce-task-runtime/src/lib.rs`). ✅ Built — remote-window stream health is managed: the Mobile companion pings every `HEARTBEAT_INTERVAL_MS` (30 s), marks stale after `MISSED_HEARTBEAT_STALE_THRESHOLD` misses, and debounces reconnects (`RECONNECT_DEBOUNCE_MS` 3 s) (`apps/mobile/services/companion.ts`); the TS runtime coalesces work with an offline-sync debounce (`DEFAULT_SYNC_DEBOUNCE_MS` 2000) and a queue `flush` path (`packages/runtime/src/{offline-sync/index.ts,queue/messageQueueManager.ts}`). 🟡 Partial — the Desktop↔Mobile last mile is unwired: `connectionStore.ts` re-emits control as a `CustomEvent('mobile-companion:control')` with no listener and `apps/mobile/lib/v1FeatureFlags.ts` ships `companion: false`/`dispatch: false`, so remote streams are not yet delivered end-to-end. 🔭 Planned — first-token-latency and tokens-per-second telemetry, adaptive chunk coalescing, and explicit backpressure signaling.

Requirements: first-token latency and steady-state throughput carry budgets; deltas coalesce under backpressure without stalling the producer; remote-window streams stay outbound-only and redacted; a dropped link resumes via `sync_request`/`sync_response` replay, not a full re-run.

## Repository map

- `crates/agiworkforce-task-runtime/src/lib.rs` — task registry, tail-bounded reads, `StallWatchdog`.
- `crates/agiworkforce-async-utils/src/lib.rs` — `or_cancel` cooperative cancellation.
- `crates/agiworkforce-app-server/src/lib.rs` — stdio/WS transport, streaming capability, shared dispatch.
- `crates/agiworkforce-protocol/src/protocol.rs` — streaming delta + `TokenCount`/`ContextCompacted` events.
- `crates/agiworkforce-plugin-runtime/src/lib.rs` — on-demand manifest load.
- `packages/runtime/src/{offline-sync/index.ts,queue/messageQueueManager.ts,events.ts}` — debounce/flush, event bus.
- `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs` — connection semaphore, frame-size cap, IP lockout.
- `services/signaling-server/src/index.ts` — message/payload size caps, rate limits, rehydration bounds.
- `apps/mobile/services/companion.ts` — heartbeat/stale/reconnect timing.
- `apps/mobile/lib/v1FeatureFlags.ts`, `apps/desktop/src/stores/connectionStore.ts` — companion flags + unwired last mile (🟡).

## Competitor notes

Claude Code Remote Control and OpenAI Codex remote connections stream a locally running session's deltas to a QR-paired phone while compute stays on the host ("nothing moves to the cloud"); ChatGPT streams SSE tokens from a hosted session. AGI's deliberate divergence: streaming and concurrency are **trust-scoped and multi-provider** — Local, BYOK (Desktop/CLI/VS Code only), and Managed Cloud are distinct boundaries, and no performance shortcut moves Local/BYOK data across them. The remote window is outbound-only, HMAC-paired, and approval-gated, so we match the parity target without adding a fourth trust mode or relocating compute. Model IDs referenced by any streaming path come from `packages/types/src/models.json`, never hardcoded.

## Acceptance / Definition of Done

Production-ready when each real part carries a measured budget (cold start, steady-state heap, first-token latency, throughput), bounded collections have caps/eviction, blocking I/O is off the async workers, parallel fan-out runs under a configurable semaphore, and no optimization crosses a trust boundary.

- [ ] Build: task-runtime and protocol crates compile; `read_output` tail-bound and `MAX_WS_MESSAGE_SIZE` enforced; streaming deltas round-trip; blocking `std::fs` moved to `spawn_blocking` or documented as bounded.
- [ ] Trust: Local/BYOK compute and streams never routed to Cloud for performance; remote-window frames stay outbound-only, redacted, and allowlisted; BYOK fork shows a visible provider label before any BYOK stream flows.
- [ ] Security: signaling/host frames size-bounded and rate-limited; connection semaphore and IP lockout active; the `mobile-companion:control` last mile is wired to a real listener or kept flagged off.

## Anti-patterns

- Do not relocate Local/BYOK compute or streams into Managed Cloud to improve latency or throughput; that requires an explicit fork (context selection, secret scan, payload preview, provider label, consent).
- Do not invent a monolithic runtime performance daemon, a global scheduler, or a `surface_heartbeats` presence table as shipped — they are 🔭.
- Do not leave unbounded buffers or collections (task `HashMap` eviction, frame caps) or run blocking `std::fs` on async workers without `spawn_blocking`.
- Do not claim the Desktop↔Mobile companion stream works; the last mile has no listener (🟡) and its flags are off.
- Do not hardcode or invent model IDs in any streaming/routing path; read `packages/types/src/models.json`.
- Do not reference Supabase or `middleware.ts` (use `proxy.ts`); do not reintroduce removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups. Pricing is Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise.
