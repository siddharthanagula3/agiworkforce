# AGI Runtime — Volume 24 — Event Bus

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md`; the nearest surface guides (`apps/desktop/AGENTS.md`, `services/AGENTS.md`); and the real repo paths this volume grounds in — `packages/runtime/src/events.ts`, `crates/agiworkforce-protocol/src/protocol.rs`, `crates/agiworkforce-app-server/src/lib.rs`, `crates/agiworkforce-plugin-runtime/src/lib.rs`, `apps/desktop/src-tauri/src/integrations/realtime/{events.rs,websocket_server.rs}`, `apps/desktop/src-tauri/src/ui/events/tool_stream.rs`, `apps/desktop/src/stores/connectionStore.ts`, `services/signaling-server/src/index.ts`, `services/api-gateway/src/routes/{mobile,pair}.ts`, `apps/mobile/lib/v1FeatureFlags.ts`.

## Overview & stance

The Event Bus is AGI Runtime's internal pub/sub nervous system: how the task loop, tool dispatch, session host, hook/plugin manager, and the remote-control fabric publish lifecycle events and how surfaces observe them. It is **not** a user surface and there is no monolithic runtime daemon carrying it — the bus is assembled from several real transports: an in-process TS bus (`packages/runtime/src/events.ts`), the typed protocol event union delivered over the app-server (`crates/agiworkforce-protocol/src/protocol.rs`, `crates/agiworkforce-app-server/src/lib.rs`), the Desktop `127.0.0.1` realtime host (`apps/desktop/src-tauri/src/integrations/realtime`), and the `services/signaling-server` control relay.

Trust modes shape every rule here. Events are **trust-scoped**: a Local session's tool/session events stay on the host and never silently cross into BYOK or Managed Cloud. Only an explicit, redacted, allowlisted control-verb set travels the outbound-only signaling relay to a paired remote window; Cloud chat state rides the separate Neon delta-sync path, not this bus. Remote Control is a window over a session that keeps running locally — the bus emits events on the host; the phone observes them, it does not relocate compute. Most cross-surface bus features are 🔭.

## Internal Events — runtime communication

✅ Built — `packages/runtime/src/events.ts` provides the cross-runtime primitive: `listen`/`once`/`emit` that delegate to the Tauri event system inside Desktop and fall back to an in-memory `EventTarget` in Web/test. ✅ Built — `crates/agiworkforce-protocol/src/protocol.rs` defines the canonical typed union `EventMsg` wrapped in `Event { id, msg }`, correlated to a submission `id`; the app-server (`crates/agiworkforce-app-server/src/lib.rs`) ships this over JSON-RPC-over-stdio or an auth-token-gated WebSocket, consumed only by the CLI. ✅ Built — the Desktop realtime host defines `RealtimeEvent` (`apps/desktop/src-tauri/src/integrations/realtime/events.rs`) for presence/auth/approval fan-out to the paired Chrome ext, VS Code ext, and Tauri webview.

Requirements: every internal event is a tagged, serializable variant with an origin surface and a trust label; consumers filter by trust before rendering. A single unified bus that spans all six surfaces with shared presence is 🔭 (see Notifications).

## Tool Events — tool lifecycle

✅ Built — `apps/desktop/src-tauri/src/ui/events/tool_stream.rs` defines `ToolStreamEvent` (`Started`, `Completed`, `Error`, `Cancelled`) with `emit_tool_started`/`emit_tool_completed`/`emit_tool_error`. ✅ Built — the protocol union carries the full tool lifecycle: `McpToolCallBegin`/`McpToolCallEnd`, `ExecCommandBegin`/`ExecCommandOutputDelta`/`ExecCommandEnd`, `PatchApplyBegin`/`PatchApplyUpdated`/`PatchApplyEnd`, `DynamicToolCallRequest`/`DynamicToolCallResponse`, `WebSearchBegin`/`WebSearchEnd`, `ImageGenerationBegin`/`ImageGenerationEnd`, and approval gates `ExecApprovalRequest`, `ApplyPatchApprovalRequest`, `RequestPermissions` (all in `crates/agiworkforce-protocol/src/protocol.rs`).

Requirements: each tool invocation emits a paired begin/end correlated by `call_id`; no side-effecting tool (exec, patch) may proceed until its approval event is answered; approval prompts on a remote window are targeted and signed, never broadcast.

## Session Events — session lifecycle

✅ Built — session lifecycle events exist in the protocol union: `SessionConfigured`, `TurnStarted` (wire `task_started`), `TurnComplete` (wire `task_complete`), `TokenCount`, `ContextCompacted`, `ThreadRolledBack`, `ThreadNameUpdated`, `TurnAborted`, `ShutdownComplete` (`crates/agiworkforce-protocol/src/protocol.rs`). These are emitted by the host running the session and observed locally.

Remote windowing: ✅ the signaling relay's control allowlist (`services/signaling-server/src/index.ts`, `ALLOWED_CONTROL_ACTIONS`) mirrors session events across a paired link — `approval_request`/`approval_response`, `sync_request`/`sync_response` (state replay after reconnect), `dispatch_request`/`dispatch_response`, `heartbeat`/`heartbeat_ack`, `cancel` — with per-role HMAC `pairTokens` and offline approval queueing. 🟡 Partial — the Desktop↔Mobile last mile is unwired: `apps/desktop/src/stores/connectionStore.ts` verifies and re-emits inbound control as a window `CustomEvent('mobile-companion:control')` with **no listener**, and `apps/mobile/lib/v1FeatureFlags.ts` ships `companion: false` and `dispatch: false`. 🔭 Planned — CLI and VS Code remote attach event streams do not exist.

## Plugin Events — plugin lifecycle

🟡 Partial — `crates/agiworkforce-plugin-runtime/src/lib.rs` covers manifest discovery/load (`load_manifest_for`, `PluginManifest` with `hooks` and MCP-server maps) but emits **no** runtime plugin lifecycle events; there is no `on_load`/`on_activate`/`on_error`/`on_reload` event stream on the bus. ✅ Built — hook lifecycle events do exist in the protocol union as `HookStarted`/`HookCompleted`, alongside `SkillsUpdateAvailable`, `McpListToolsResponse`, and `ListSkillsResponse` (`crates/agiworkforce-protocol/src/protocol.rs`), plus `McpStartupUpdate`/`McpStartupComplete` for MCP server bring-up.

Requirements: a plugin activate/deactivate/crash/reload event stream, correlated to the loaded manifest and namespaced by plugin id, so surfaces can hot-reload without a session restart — 🔭 Planned. Plugin events must carry no Local session payload when a plugin runs under a Cloud trust context.

## Notifications — broadcast runtime events

✅ Built — the protocol union carries one-to-many advisory broadcasts: `BackgroundEvent`, `DeprecationNotice`, `Warning`/`GuardianWarning`, `StreamError`, `ModelReroute`, `ModelVerification`, and `SkillsUpdateAvailable` (`crates/agiworkforce-protocol/src/protocol.rs`). These are informational and must never carry Local data into a Cloud sink.

🔭 Planned — cross-surface presence broadcast ("a session is active on your Desktop", surfaced on Mobile) is not built: `apps/web/app/api/control-plane/status` exists but the `surface_heartbeats` table does not, so there is no durable presence fan-out. Remote approval push notifications are 🔭. Requirements: broadcasts are advisory-only and idempotent; approval requests are targeted and HMAC-signed, not broadcast; a broadcast never implies a data-sync side effect (that path is Neon delta-sync, Cloud-only).

## Repository map

- `packages/runtime/src/events.ts` — cross-runtime `listen`/`once`/`emit` bus.
- `crates/agiworkforce-protocol/src/protocol.rs` — canonical `Event`/`EventMsg` typed union.
- `crates/agiworkforce-app-server/src/lib.rs` — JSON-RPC stdio + WS transport (CLI-only).
- `crates/agiworkforce-plugin-runtime/src/lib.rs` — plugin manifest load/discovery.
- `apps/desktop/src-tauri/src/integrations/realtime/{events.rs,websocket_server.rs,presence.rs}` — Desktop realtime host + IP-lockout/IPC-token guard.
- `apps/desktop/src-tauri/src/ui/events/tool_stream.rs` — tool lifecycle stream.
- `apps/desktop/src/stores/connectionStore.ts` — companion control re-emit (🟡 last mile).
- `services/signaling-server/src/index.ts` — control-verb relay + pairing/HMAC.
- `services/api-gateway/src/routes/{mobile,pair}.ts` — pairing-code issuance.
- `apps/mobile/lib/v1FeatureFlags.ts` — `companion`/`dispatch` flags (off).

## Competitor notes

Claude Code Remote Control and OpenAI Codex remote connections both stream a host session's tool/session events to a QR-paired phone while compute stays local ("nothing moves to the cloud"). Cloud-run agents (Claude-Code-on-the-web style) stream from a hosted session instead. AGI's deliberate divergence: the bus is **trust-scoped and multi-provider** — Local, BYOK (Desktop/CLI/VS Code only), and Managed Cloud are distinct boundaries, and no event silently carries Local/BYOK data across them. Model reroute/verification events read model IDs from `packages/types/src/models.json`, never hardcoded. Remote windowing is outbound-only, HMAC-paired, and approval-gated, matching the parity target without adopting a fourth trust mode.

## Acceptance / Definition of Done

Production-ready when every emitter tags events with an origin surface and trust label, consumers filter by trust before render, tool/session events correlate begin↔end by id, and the remote relay carries only allowlisted, redacted verbs. No event path may move Local/BYOK payloads into Managed Cloud.

- [ ] Build: `packages/runtime` + protocol crate compile; `ToolStreamEvent` and `EventMsg` variants round-trip serialize; app-server WS requires a non-empty auth token.
- [ ] Trust: Local session/tool events never reach a Cloud sink; remote-window events limited to `ALLOWED_CONTROL_ACTIONS`; BYOK forks emit a visible provider label before any BYOK event flows.
- [ ] Security: signaling control payloads size-bounded and HMAC-verified; Desktop host enforces IP lockout + IPC token; the `mobile-companion:control` last mile is wired to a real listener or kept flagged off.

## Anti-patterns

- Do not route Local session, tool, or plugin events into BYOK or Managed Cloud without an explicit fork (context selection, secret scan, payload preview, provider label, consent).
- Do not invent a monolithic runtime event daemon, a `surface_heartbeats` table, or remote CLI/VS Code attach streams as shipped — they are 🔭.
- Do not claim the Desktop↔Mobile companion bus works; the last mile has no listener (🟡) and flags are off.
- Do not add control verbs outside `ALLOWED_CONTROL_ACTIONS` without mirroring both dispatch handlers.
- Do not hardcode or invent model IDs in reroute/verification events; read `packages/types/src/models.json`.
- Do not reference Supabase, `middleware.ts` (use `proxy.ts`), or removed tiers ("Plus", `pro_plus`, "Hobby"); pricing is Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise, no top-ups.
