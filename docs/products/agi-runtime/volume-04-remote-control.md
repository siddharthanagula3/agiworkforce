# AGI Runtime — Volume 04 — Remote Control

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/mobile/AGENTS.md`, `services/AGENTS.md`. Grounded in real repo paths: `services/signaling-server/src/index.ts`, `services/api-gateway/src/routes/{mobile,pair}.ts`, `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`, `apps/desktop/src-tauri/src/bin/native_messaging_host.rs`, `apps/desktop/src/stores/connectionStore.ts`, `apps/mobile/services/companion.ts`, `apps/mobile/stores/connectionStore.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/web/app/api/control-plane/status/route.ts`, `crates/agiworkforce-app-server/src/lib.rs`.

## Overview & stance

Remote Control lets a phone or browser act as a secure **window** over a session that keeps running on its host (Desktop, CLI, or VS Code). This mirrors Claude Code Remote Control and Codex remote connections: **compute stays on the host**, the outbound connection is paired (QR + HMAC), and every consequential action is approval-gated. It is **not a fourth trust mode** — attaching a window to a Local or BYOK session does not move that session's data into the cloud, and never silently reclassifies it as Managed Cloud. A Local session viewed from a phone is still Local; a BYOK session is still BYOK (and BYOK exists only on Desktop/CLI/VS Code — never as a mobile trust mode). Cloud-**run** sessions (Anthropic-style "on the web") are a separate, explicitly Managed-Cloud path and out of scope here.

Today the fabric is assembled from real parts — a signaling relay, an api-gateway pairing surface, a desktop `127.0.0.1` host, and per-role HMAC tokens — but the last mile (host executing remote-issued control) is unwired and feature-flagged off. There is **no monolithic runtime daemon**. Every gap below is labeled.

## Mobile Attachment — connect mobile clients to runtime sessions

The mobile client builds and sends control verbs (`approval_response`, `sync_request`, `dispatch_request`, `cancel`, `heartbeat`) over the paired channel, and tracks connection health with heartbeat/stale detection. 🟡 Partial — `apps/mobile/services/companion.ts` + `apps/mobile/stores/connectionStore.ts` implement the client, but `apps/mobile/lib/v1FeatureFlags.ts` ships `companion: false` and `dispatch: false`, and `startHealthChecks()` early-returns when the flag is off. Requirement: attach shows the live host session read-only first; task steering requires the `dispatch` flag AND host-side execution (below).

## Web Attachment — attach browser sessions

A signed-in web window should attach to a running host session as a read-and-approve surface, reusing the same pairing + control protocol as mobile. 🔭 Planned — no browser remote-window client exists. Note the distinction: `apps/web/app/api/{chat,memory,projects}/sync` is Neon **data** delta-sync (Managed-Cloud chats only), not a remote window over host compute; the two must not be conflated. Local/BYOK host rows never sync.

## Desktop Attachment — attach desktop windows

Desktop is primarily the **host**: `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs` binds `127.0.0.1`, accepts the Chrome extension, VS Code extension, and Tauri webview, and enforces an IPC token, per-IP auth-failure lockout, and a 32-connection cap. As a host receiving _remote_ control, the desktop store re-emits verified control messages as a browser `CustomEvent('mobile-companion:control', …)` (`apps/desktop/src/stores/connectionStore.ts`) — but **no listener consumes it**, so approvals and dispatch do not reach task execution. 🟡 Partial (host receive path present, last mile unwired). Desktop acting as a remote _window_ onto another host = 🔭 Planned.

## CLI Attachment — share CLI sessions with remote clients

A remote client should attach to a running `agi` session so a paired phone can watch output and approve tool calls while the CLI keeps executing locally. The building block exists: `crates/agiworkforce-app-server` speaks JSON-RPC-over-stdio + WebSocket (`initialize`, `tools/list`, `tools/call`), but it is a **local** tool host consumed only by the CLI itself — there is no pairing bridge or remote attach. 🔭 Planned.

## VS Code Attachment — connect editor sessions

A paired remote window should observe and approve a VS Code editor session running Local/BYOK/Cloud locally. The editor connects to the desktop `127.0.0.1` host as a local client today, but no remote-attach path exposes an editor session to an off-device window. 🔭 Planned.

## Pairing — QR + HMAC trusted-device pairing

Pairing is the strongest part of the fabric. `services/api-gateway/src/routes/mobile.ts` (`POST /mobile/pairing-code`) and `services/api-gateway/src/routes/pair.ts` (`/pair/initiate`, `/pair/confirm`, `/pair/status`) mint pairing codes via the signaling server and return per-role `pairTokens` plus QR data of the form `agiw:<code>:<64-hex-token>`. `services/signaling-server/src/index.ts` issues an HMAC token per role (`${code}|${role}|${expiresAt}` keyed by `SIGNALING_INTERNAL_SECRET`), verified in constant time on `register`; `SIGNALING_REQUIRE_PAIR_TOKEN=1` (and any production build) enforces it, so knowing the code alone cannot register a peer. ✅ Built (server + gateway). End-to-end paired _session_ = 🟡 (mobile scan/validate exists in `companion.ts`, but the companion flag is off). Roles are `desktop | mobile` only; CLI/VS Code roles are 🔭.

## Presence — track connected clients

Cross-surface presence should show which surfaces are online and last-seen. `apps/web/app/api/control-plane/status/route.ts` queries `surface_heartbeats`, but that table **does not exist** in the Neon schema, so the endpoint cannot return real presence. 🔭 Planned — requires a `surface_heartbeats` migration plus per-surface heartbeat writes. The signaling server tracks per-session participant liveness in memory (`lastHeartbeatAt`, stale-session cleanup), which is transport-level, not user-facing presence.

## Notifications — deliver runtime approval requests

When the host raises an `approval_request`, the paired window must be notified even if backgrounded. Push-token registration is built (`POST /mobile/push-token`, `apps/mobile`… via `services/api-gateway/src/routes/mobile.ts`), and the signaling server queues approvals for offline clients (`pendingApprovals` map, per-session cap + TTL) and replays them on reconnect. ✅ Built (token storage + offline queue). Actual OS push delivery (APNs/FCM/Expo) of approval requests has **no sender** in `services/` or `apps/web/app/api` — 🔭 Planned. Approvals must remain explicit and time-limited; never auto-approve.

## Reconnection — recover disconnected clients

The mobile store implements a reconnect state machine (`reconnecting` status, countdown, debounced retries, and reconnect telemetry) in `apps/mobile/stores/connectionStore.ts`, and the signaling server replays queued approvals and updates session heartbeat on re-`register`. 🟡 Partial — the client logic and server queue exist, but the flow is gated behind `companion: false`, and stale sessions are GC'd after the heartbeat threshold with no participants. Requirement: reconnection must re-present only still-valid approvals (expired ones dropped) and must re-verify the pair token.

## Repository map

- `services/signaling-server/src/index.ts` — WebRTC pairing/relay, per-role HMAC `pairTokens`, control verbs, offline approval queue, stale-session GC.
- `services/api-gateway/src/routes/{mobile,pair}.ts` — pairing-code + pair initiate/confirm/status.
- `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs` — `127.0.0.1` WS/IPC host (Chrome/VS Code/webview), IP lockout, IPC token.
- `apps/desktop/src-tauri/src/bin/native_messaging_host.rs` — `com.agiworkforce.browser` host, `ws://127.0.0.1:8787` bridge.
- `apps/desktop/src/stores/connectionStore.ts` — desktop control receive path (CustomEvent, unwired).
- `apps/mobile/services/companion.ts`, `apps/mobile/stores/connectionStore.ts`, `apps/mobile/lib/v1FeatureFlags.ts` — mobile companion client + flags.
- `crates/agiworkforce-app-server` — local JSON-RPC/WS tool host (CLI-only).
- `apps/web/app/api/control-plane/status/route.ts` — presence endpoint (blocked on missing table).

## Competitor notes

Claude Code Remote Control (research preview) and Codex remote connections both keep the session on the host and use a phone/web window — "nothing moves to the cloud." AGI matches that stance and diverges deliberately: **per-surface trust** (BYOK windows only for Desktop/CLI/VS Code sessions, never a mobile trust mode), **multi-provider** hosts rather than a single vendor, and **local-first** compute where a Local session stays Local even when viewed remotely. AGI's remote window is a viewer/approver, not a cloud hand-off; the cloud-run path is separate and explicitly Managed Cloud.

## Acceptance / Definition of Done

A remote window is production-ready only when a paired phone can attach to a running host session, watch output, approve/deny tool calls, and reconnect after a drop — with compute never leaving the host and no Local/BYOK data crossing into Cloud.

- [ ] Build: mobile `companion`/`dispatch` flags on; desktop `mobile-companion:control` events consumed by task execution; CLI/VS Code attach paths implemented and tested.
- [ ] Trust: attach preserves the host session's trust mode (Local stays Local, BYOK stays BYOK); no silent Cloud reclassification; visible provider/trust label on the window.
- [ ] Security: pair-token HMAC verified on every register/reconnect (`SIGNALING_REQUIRE_PAIR_TOKEN=1` in prod); approvals explicit, time-limited, replayed only if still valid; `surface_heartbeats` migration landed before presence ships; push delivery authenticated to device owner.

## Anti-patterns

- Treating Remote Control as a fourth trust mode, or routing a Local/BYOK host session's data to Cloud because a phone attached.
- Claiming Mobile/Web/CLI/VS Code attach as shipped — Mobile is 🟡 (flags off, last mile unwired); Web/CLI/VS Code are 🔭.
- Conflating Neon delta-sync (Managed-Cloud data sync) with a remote window over host compute.
- Reading presence from `surface_heartbeats` before the table exists, or faking online status.
- Auto-approving remote tool calls, or delivering approvals to an unverified device.
- Adding BYOK as a mobile trust mode; exposing pairing without HMAC token enforcement.
- Hardcoding or inventing model IDs (use `packages/types/src/models.json`), referencing removed tiers (Plus/Hobby/`pro_plus`) or credit top-ups, inventing INR prices, referencing Supabase, or renaming `proxy.ts` to `middleware.ts`.
