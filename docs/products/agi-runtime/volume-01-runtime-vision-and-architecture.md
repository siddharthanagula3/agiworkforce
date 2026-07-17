# AGI Runtime — Volume 01 — Runtime Vision & Architecture

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root), `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `apps/desktop/AGENTS.md`, and the real repo paths cited in the Repository map below (grounded in `crates/agiworkforce-*`, `packages/client/client-runtime`, the Desktop realtime host, `services/signaling-server`, `services/api-gateway`, the Neon sync APIs, and `packages/contracts/types/src/models.json`).

## Overview & stance

AGI Runtime is the **internal shared execution layer** behind the six user surfaces (Mobile, Web, Desktop, CLI, Chrome, VS Code). It is **not a seventh product** and ships no user UI of its own. This volume defines the Runtime's long-term vision and target architecture as a _coherent composition of parts that already exist_, not a claim that a single daemon runs today. There is **no monolithic runtime process** — do not read one into this spec. 🔭

The Runtime is bounded by the three trust modes. **Local** compute stays on the host; **BYOK** exists only on Desktop, CLI, and VS Code; **Managed Cloud** is the only path that leaves the device. Local sessions, files, and developer context are **never** silently routed to BYOK or Cloud; Local→BYOK is an explicit fork (context selection, secret scan, payload preview, visible provider label, consent). Remote Control is **not** a fourth mode — a phone/web client is a secure remote _window_ over a session that keeps running on the host. Every capability below carries a ✅/🟡/🔭 label; ✅ and 🟡 cite a real path.

## Vision

The Runtime's long-term purpose is to be the **single execution substrate** that all six surfaces compile against, so a task behaves identically whether launched from the Mobile app, the `agi` CLI, or the VS Code panel. It makes local-first, multi-provider execution — "run an agent where your data lives, on the model you choose" — the default path, not a fallback. Shared Rust crates and TS primitives are consumed by surfaces today (`crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`, `packages/client/client-runtime/src/index.ts`). 🟡 — the crates and TS package are real; a unified public Runtime API over them is 🔭.

## Mission

The Runtime solves four problems: (1) **trust-boundary safety** — keeping Local/BYOK/Cloud isolated so no chat, file, or key crosses a boundary without an explicit, auditable fork; (2) **task portability** — one task model (`TaskKind`, `TaskStatus`, transitions) for every surface (`crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs` ✅); (3) **tool/plugin uniformity** — one tool-dispatch and plugin-manifest contract (`crates/agiworkforce-app-server/src/lib.rs` `ToolDispatch`, `crates/agiworkforce-plugin-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs` ✅); and (4) **secure remote control + cross-device sync** without moving compute, via `services/signaling-server` and the Neon delta-sync APIs. 🟡 — parts exist; end-to-end wiring is incomplete (see Client Architecture).

## Product goals

- **G1 — Trust isolation, provable:** zero code path routes a `local_only` session to `byok`/`cloud_managed` without an explicit fork event. Enforced today by surface gates; a Runtime-level assertion is 🔭.
- **G2 — One task model:** every surface uses `Task`/`TaskStatus` transitions from `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs` ✅.
- **G3 — Outbound-only remote control:** host session keeps running locally; phone/web attach as windows over `services/signaling-server` (QR + per-role HMAC `pairTokens`, approval verbs). 🟡 (relay built; Desktop↔Mobile last mile unwired).
- **G4 — Delta-sync correctness:** Managed-Cloud chats sync Web↔Mobile↔Desktop with cursor + tombstones + idempotent upsert (`apps/web/app/api/{chat,memory,projects}/sync/route.ts`) ✅; Local/BYOK rows never sync.
- **G5 — Model IDs from SSOT:** all provider-catalog model IDs resolve only from `packages/contracts/types/src/models.json` ✅; the Runtime never hardcodes one.

## Design principles

- **Extensibility:** tools are injected, not compiled in — `ToolDispatch` keeps `agiworkforce-app-server` free of CLI tool code (`crates/agiworkforce-app-server/src/lib.rs`) ✅. Plugins load from five manifest locations with Claude/Codex interop via serde-flatten `extra` (`crates/agiworkforce-plugin-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`) ✅.
- **Performance:** local execution avoids network round-trips; async task supervision uses `tokio` `JoinHandle` tracking in the task runtime ✅. Offline resilience via `packages/client/client-runtime/src/offline-queue` and `offline-sync` ✅.
- **Security:** the Desktop host binds `127.0.0.1` only, with IP lockout and an IPC token gating Chrome/VS Code/webview clients (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`) ✅. Remote pairing is QR + HMAC, outbound-only, approval-gated (`services/signaling-server/src/index.ts`) ✅.

## Runtime architecture

Real components today: the **protocol** crate (`agiworkforce-protocol` — approvals, permissions, MCP, models, network policy types) ✅; the **task runtime** (supervision + status machine) ✅; the **plugin runtime** and **command registry** ✅; the **app-server** local JSON-RPC-over-stdio + WebSocket tool host, consumed **only** by the CLI ✅; `packages/client/client-runtime` shared TS primitives (command, events, http, registry, queue, state, offline) ✅; the Desktop `127.0.0.1` WS/IPC host ✅; the Chrome native-messaging host `com.agiworkforce.browser` + localhost port-8787 pairing bridge (`apps/desktop/src-tauri/src/bin/native_messaging_host.rs`) ✅; `services/signaling-server` WebRTC pairing/relay (roles `desktop`|`mobile`; verbs `approval_request`/`response`, `sync`, `dispatch`, `heartbeat`, `cancel`; offline approval queueing) ✅; `services/api-gateway` pairing routes (`POST /mobile/pairing-code`, `/pair`) ✅; and the Neon delta-sync APIs ✅. The **target composition** — one addressable Runtime facade unifying these — is 🔭.

## Client architecture

Surfaces are **thin clients over shared libraries**. Desktop hosts the local WS/IPC server and native-messaging bridge; CLI embeds `agiworkforce-app-server`; Web and Mobile are cloud/sync clients; Chrome and VS Code attach to the Desktop host. Cross-device **data** sync is delta-sync (Managed-Cloud chats only). The Desktop↔Mobile companion protocol is 🟡: QR/heartbeat helpers exist (`apps/mobile/services/companion.ts`) but flags gate it off (`apps/mobile/lib/v1FeatureFlags.ts` `companion:false`, `dispatch:false`) and the desktop last mile is unwired — control events are re-emitted as a window `CustomEvent('mobile-companion:control')` (`apps/desktop/src/stores/connectionStore.ts:171`) with no listener. CLI and VS Code remote attach are 🔭. Cross-surface presence is 🔭 — `apps/web/app/api/control-plane/status/route.ts` exists but the `surface_heartbeats` table does not.

## Execution model

Tasks execute **locally by default**. A task is created with a `TaskKind` (`LocalShell`, `LocalAgent`, `RemoteAgent`, `InProcessTeammate`, `LocalWorkflow`, `MonitorMcp`, `Dream`) and moves through `Pending → Running → Completed | Failed | Stopped` with validated transitions (`crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`) ✅. Tool calls dispatch through `ToolDispatch::call_tool` (MCP-shaped results) ✅. Approval-gated actions raise `approval_request` verbs; a remote window may approve/reject without relocating compute ✅ (relay) / 🔭 (full end-to-end approval loop). Model selection resolves provider IDs from `packages/contracts/types/src/models.json` ✅.

## Runtime lifecycle

Initialization → readiness → run → shutdown. The app-server performs an `initialize` handshake returning capabilities + server info, serves `tools/list`/`tools/call`, and exits cleanly on `shutdown` (`crates/agiworkforce-app-server/src/lib.rs`) ✅. The Desktop host boots the `127.0.0.1` listener, mints the IPC token, and enforces IP lockout before accepting bridge clients ✅. A **unified Runtime lifecycle manager** with health/readiness gates is 🔭.

## Repository map

- `crates/agiworkforce-protocol` — shared protocol/permission/approval/model types.
- `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)` — task model, status machine, supervision.
- `crates/agiworkforce-app-server` — local JSON-RPC/WS tool host (CLI-only).
- `crates/agiworkforce-plugin-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)` — plugin manifest schema + discovery.
- `crates/agiworkforce-command-registry` — shared command catalog.
- `packages/client/client-runtime/src` — surface-neutral TS runtime primitives.
- `apps/desktop/src-tauri/src/integrations/realtime/` — `127.0.0.1` WS/IPC host.
- `apps/desktop/src-tauri/src/bin/native_messaging_host.rs` — Chrome bridge (port 8787).
- `services/signaling-server/src/index.ts` — WebRTC pairing/relay.
- `services/api-gateway/src/routes/{mobile,pair}.ts` — pairing-code + pair routes.
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — Neon delta-sync.
- `apps/web/app/api/control-plane/status/route.ts` — presence stub (table 🔭).
- `apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts` — companion (flagged off).

## Competitor notes

Claude Code Remote Control (research preview) and OpenAI Codex remote connections keep the session on the host and treat the phone as a window with QR pairing — "nothing moves to the cloud." AGI matches that stance but **diverges deliberately**: multi-provider (not one vendor's model), **BYOK** where the surface allows it (Desktop/CLI/VS Code), **per-surface trust modes**, and **local-first** execution by default. Cloud-run sessions (Claude-Code-on-the-web style) remain a _separate_, explicitly Managed-Cloud path, never conflated with local remote control.

## Acceptance / Definition of Done

The Runtime domain is production-ready when the composition above is addressable as one contract, trust isolation is asserted in code (not only by surface gates), and remote control completes an end-to-end approval loop without moving compute.

- [ ] **Build:** all listed crates + `packages/client/client-runtime` compile and the CLI's app-server passes `initialize`/`tools/list`/`tools/call`/`shutdown`.
- [ ] **Trust:** automated check proves no `local_only` session reaches `byok`/`cloud_managed` without an explicit fork event; Local/BYOK rows are excluded from delta-sync.
- [ ] **Security:** Desktop host binds `127.0.0.1` only, requires the IPC token, and enforces IP lockout; remote pairing verifies QR + per-role HMAC before any verb.

## Anti-patterns

- Describing a **monolithic runtime daemon** as shipped — it does not exist (🔭).
- Silently routing Local chats/files/sessions to BYOK or Cloud, or skipping the Local→BYOK fork (secret scan, payload preview, consent, provider label).
- Treating Remote Control as a fourth trust mode, or moving host compute into the cloud to serve a phone window.
- Hardcoding or inventing model IDs instead of resolving from `packages/contracts/types/src/models.json`.
- Referencing removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups; the ladder is Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise.
- Any Supabase reference (fully migrated to Clerk + Neon + Stripe), or renaming Next.js `proxy.ts` back to `middleware.ts`.
- Claiming companion, CLI/VS Code attach, or cross-surface presence as built — they are 🟡/🔭.
