# AGI Runtime — Volume 26 — Runtime APIs

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md`; the nearest surface `AGENTS.md` files (`apps/desktop/AGENTS.md`, `services/AGENTS.md`); and the real repo paths this volume grounds in — `crates/agiworkforce-app-server/src/lib.rs`, `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`, `apps/desktop/src-tauri/src/integrations/realtime/events.rs`, `apps/desktop/src-tauri/src/bin/native_messaging_host.rs`, `apps/desktop/src-tauri/src/integrations/native_messaging/manifest.rs`, `apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs`, `services/signaling-server/src/index.ts`, `services/api-gateway/src/routes/mobile.ts`, `packages/client/client-runtime/src/http.ts`, `apps/web/app/api/control-plane/status/route.ts`.

## Overview & stance

AGI Runtime is the **internal shared execution layer**, not a user surface and not a seventh app. This volume specifies the programmatic API contracts by which the six surfaces (Mobile, Web, Desktop, CLI, Chrome, VS Code) talk to the local host and to each other: IPC, local HTTP, WebSocket, an event stream, and a public SDK surface. There is **no monolithic runtime daemon today**; the real APIs live in several purpose-built parts, and a single unified public runtime API is a target (🔭), not shipped state.

Trust modes govern every contract. **Local** sessions stay on the host; APIs here move control and tool traffic, never silently promote Local chats/files to **BYOK** or **Managed Cloud**. BYOK exists only on Desktop, CLI, and VS Code — no runtime API may expose BYOK to Web or Mobile. Remote control (phone/web steering a locally-running Desktop/CLI/VS Code session) is a secure _window_, not a fourth trust mode: outbound-only, QR + HMAC paired, approval-gated. Cross-device data sync is a separate Managed-Cloud path (Neon delta-sync at `apps/web/app/api/{chat,memory,projects}/sync`), never an implicit side effect of these transports.

## IPC APIs — local client communication

The primary local-client contract is the **typed developer-session protocol** (`crates/agiworkforce-protocol/src/developer_session.rs`, transported by `crates/agiworkforce-app-server/src/lib.rs`): JSONL over stdio or one JSON object per authenticated WebSocket text frame. It exposes `initialize`; thread start/list/read/resume/fork/archive; turn start/steer/interrupt; `approval/respond`; streamed notifications; and `shutdown`. The CLI supplies one `CliDeveloperSessionHost` to both transports, so tools, MCP attachments, trust policy, and approval behavior do not diverge. **✅ Built.** A separate generic `ToolDispatch` JSON-RPC API remains available to Rust embedders. Reverse MCP execution is **🟡 Partial**: `agi mcp-server` completes the stdio handshake but advertises no tools until execution and approvals are wired.

Desktop IPC to the local host is gated by a filesystem **IPC token** (`.ipc_token` in the app-data dir) read by clients such as the native-messaging host (`apps/desktop/src-tauri/src/bin/native_messaging_host.rs`) and compared in constant time on the host. **✅ Built**. Chrome↔Desktop IPC uses native messaging over stdio via host `com.agiworkforce.browser` (`apps/desktop/src-tauri/src/integrations/native_messaging/manifest.rs`), framed as `RealtimeEvent::NativeMessage` / `NativeResponse`. **✅ Built**. A single documented, versioned public IPC schema spanning all surfaces is **🔭 Planned**.

## HTTP APIs — local HTTP interface

The Desktop host and app-server expose narrow local HTTP surfaces. The app-server WebSocket mode serves `GET /health` alongside `/ws` (`crates/agiworkforce-app-server/src/lib.rs`). **✅ Built**. The Desktop realtime host on `127.0.0.1` accepts an HTTP `POST /pair` handshake carrying an `extensionId` for browser-extension pairing on port **8787** (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`; `apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs`; default port at `apps/desktop/src-tauri/src/lib.rs`). **✅ Built**.

Pairing and device HTTP live in services, not the local host: `services/signaling-server/src/index.ts` serves `POST /pairings`, `GET /pairings/:code`, `DELETE /pairings/:code`, and health/metrics/admin endpoints; `services/api-gateway/src/routes/mobile.ts` fronts `POST /mobile/pairing-code` (Clerk-authenticated), `/register`, `/push-token`, `/agent-status`, `/feedback`. **✅ Built**. Cross-surface presence is served by `GET /api/control-plane/status` (`apps/web/app/api/control-plane/status/route.ts`) but its `surface_heartbeats` / `surface_activity_log` tables do not exist yet — queries are try/catch-guarded and degrade to `unknown`. **🟡 Partial** (route built; heartbeat tables not migrated). A general-purpose local HTTP API for third-party tools is **🔭 Planned**.

## WebSocket APIs — real-time communication

Three real WebSocket servers exist. (1) **app-server `/ws`** — the full typed developer-session protocol over WS; requires a non-empty auth token presented as `Authorization: Bearer`, header `x-agi-app-server-token`, or (opt-in only) `?token=`, plus an origin allowlist. **✅ Built** (`crates/agiworkforce-app-server/src/lib.rs`). (2) **Desktop `127.0.0.1` realtime host** — accepts Chrome extension, VS Code extension, and the Tauri webview; hardened with `MAX_CONNECTIONS = 32`, five auth failures per 60 s → 300 s IP lockout, a 4 MiB max frame, and constant-time token checks. **✅ Built** (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`). (3) **Signaling relay** — `services/signaling-server/src/index.ts` relays WebRTC `register` / `signal` (`offer|answer|ice|control`) / `heartbeat` between roles `desktop|mobile`, enforcing a strict control-action allowlist (`approval_request/response`, `sync_request/response`, `dispatch_request/response`, `heartbeat/heartbeat_ack`, `cancel`), per-role HMAC pair tokens, and offline approval queueing. **✅ Built**. The Desktop↔Mobile companion channel that would consume this end-to-end is **🟡 Partial** — `apps/mobile/lib/v1FeatureFlags.ts` sets `companion:false` and `dispatch:false`, and the desktop last-mile is unwired. VS Code can drive the stdio developer session; remote attach is **🔭 Planned**.

## Event APIs — publish runtime events

Runtime events are modeled as the `RealtimeEvent` tagged enum (`apps/desktop/src-tauri/src/integrations/realtime/events.rs`): `Authenticate/Authenticated/AuthenticationFailed`, presence and collaboration events, `ApprovalRequested`, and `NativeMessage/NativeResponse`. These are emitted over the `127.0.0.1` host and the native-messaging bridge. **✅ Built**. The signaling `control` verbs (`sync`, `dispatch`, `cancel`, approvals, heartbeat) are the cross-device event vocabulary. **✅ Built**. `packages/client/client-runtime/src/events.ts` provides a TS event helper for surfaces that embed the runtime package. **🟡 Partial** (present; not a public subscribe API). A published, versioned event bus with typed `subscribe`/filter semantics for third parties is **🔭 Planned**.

## SDK APIs — public integration surface

The de-facto SDK today is `packages/client/client-runtime` (command registry, `http.ts` `routeToCloud` with `X-AGI-Runtime` / `X-AGI-Command` headers, `events.ts`, offline-queue/sync). It is an **internal** shared package, TS-only, unversioned as a public product. **🟡 Partial** (`packages/client/client-runtime/src/http.ts`). The Rust `ToolDispatch` trait is the internal tool-injection SDK for hosts embedding the app-server. **✅ Built** (`crates/agiworkforce-app-server/src/lib.rs`). A public, semver'd, multi-language SDK with authentication, capability discovery, and per-plan quota surfacing (Free / Basic $8 · ₹399 / Pro $20 / Max $100 and $200 / Enterprise) is **🔭 Planned**. Any future SDK must read model IDs only from `packages/contracts/types/src/models.json` and must refuse to expose BYOK on Web/Mobile.

## Repository map

- `crates/agiworkforce-protocol/src/developer_session.rs` — versioned typed thread/turn/approval contract.
- `crates/agiworkforce-app-server/src/lib.rs` — developer-session stdio/WS transport plus generic `ToolDispatch` embedding API.
- `crates/agiworkforce-{protocol,task-runtime,plugin-runtime,command-registry}` — shared runtime crates.
- `apps/desktop/src-tauri/src/integrations/realtime/` — `127.0.0.1` WS/IPC host, `events.rs`, presence.
- `apps/desktop/src-tauri/src/bin/native_messaging_host.rs`, `.../integrations/native_messaging/manifest.rs` — `com.agiworkforce.browser` host + manifests.
- `apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs` — `ws://127.0.0.1:8787` bridge.
- `services/signaling-server/src/index.ts` — WebRTC pairing/relay, pair tokens, control allowlist.
- `services/api-gateway/src/routes/{mobile,pair}.ts` — pairing-code + device endpoints.
- `packages/client/client-runtime/src/{http,events}.ts` — TS runtime/SDK primitives.
- `apps/web/app/api/control-plane/status/route.ts` — cross-surface presence (heartbeat tables 🔭).

## Competitor notes

Claude Code Remote Control (research preview) and OpenAI Codex remote connections both QR-pair a phone to a locally-running host and keep compute local — "nothing moves to the cloud." AGI matches that model (outbound-only, HMAC-paired, approval-gated windows) but diverges deliberately: **multi-provider** rather than single-vendor; **BYOK where allowed** (Desktop/CLI/VS Code only); **per-surface trust boundaries** enforced in the transport (Web/Mobile can never reach BYOK); and **local-first** defaults where the app-server, native-messaging host, and `127.0.0.1` realtime host require no cloud round-trip. Cloud-run sessions remain an explicit Managed-Cloud path, never an implicit promotion.

## Acceptance / Definition of Done

- [ ] **Build:** app-server thread/turn/approval methods pass over stdio and WebSocket; the `127.0.0.1` host builds and passes its surface checks; `/health` and `/pair` respond; native-messaging round-trip verified.
- [ ] **Trust:** no API path routes Local→BYOK/Cloud without explicit fork; BYOK never reachable from Web/Mobile; remote-control stays a window (compute on host); cross-device sync only via the Neon delta-sync path.
- [ ] **Security:** every WS/HTTP entry authenticates (Bearer/IPC token/pair token, constant-time); origin allowlist enforced; rate limits, connection caps, lockouts, and frame-size limits active; pair/IPC tokens never logged.
- [ ] Every capability in this volume carries a ✅/🟡/🔭 label with a real path; 🟡/🔭 items list the concrete gap.

## Anti-patterns

- Inventing a unified "runtime daemon" or public SDK as shipped — they are 🔭.
- Any transport that silently moves Local data to BYOK or Cloud, or exposes BYOK on Web/Mobile.
- Treating remote control as a fourth trust mode, or letting a paired phone move compute off the host.
- Hardcoding or inventing model IDs — read `packages/contracts/types/src/models.json`.
- Referencing removed tiers (Plus, `pro_plus`, Hobby) or inventing INR prices for Pro/Max; adding credit top-ups.
- Referencing Supabase; renaming Next.js `proxy.ts` back to `middleware.ts`.
- Disabling the pair-token requirement, origin allowlist, or IP lockout in production, or logging pair/IPC tokens.
