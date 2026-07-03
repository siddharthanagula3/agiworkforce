# AGI Runtime — Volume 02 — Runtime Boot Process

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and the real runtime code cited inline and in the Repository map below.

## Overview & stance

This volume specifies how AGI Runtime — the **internal** shared execution layer, not a seventh app — comes up on each host. There is **no monolithic runtime daemon** today; "boot" means the ordered activation of real, per-surface parts: the CLI's `app-server` JSON-RPC/WS tool host, the Desktop `127.0.0.1` realtime host, the Chrome native-messaging bridge, the shared `@agiworkforce/runtime` state/queue layer, and (for cross-device work) the `signaling-server` relay. Boot is where the **three trust modes** are wired: Local components initialize with no network egress, BYOK provider clients (Desktop/CLI/VS Code only) stay dormant until a key is present, and Managed Cloud is reached only for signed-in cloud sessions. Boot must never silently promote a Local session onto BYOK or Cloud. Unbuilt capabilities are labeled 🔭 and never described as shipped.

## Installation — install runtime components (per-surface)

Runtime components ship **bundled inside each surface's own installer**, never as a separate download. The Rust crates (`agiworkforce-app-server`, `-task-runtime`, `-plugin-runtime`, `-command-registry`, `-protocol`) compile into the CLI binary and the Desktop Tauri host; `@agiworkforce/runtime` (`packages/runtime/package.json`) is a workspace dependency compiled into Mobile/Web/Desktop bundles. Desktop installs the Chrome native-messaging host by writing the `com.agiworkforce.browser` manifest (`install_manifests`). ✅ Built (per-surface bundling). A standalone/headless runtime installer is 🔭 Planned. Requirement: installation MUST NOT place any inference engine, provider key, or cloud credential on disk as a side effect; those are configured post-install per trust mode.

## Dependency Discovery — detect required software and local model runtimes

The runtime detects its host environment and local capabilities before doing work. Environment detection is `packages/runtime/src/detect.ts` (`getRuntimeEnv` → Tauri / cloud-web / test; `isTauri`, `isServer`). ✅ Built. Local-model-runtime detection exists on Desktop: `apps/desktop/src-tauri/src/core/llm/capability_detection.rs` probes an Ollama host via its `/api/show` endpoint (`detect_ollama_capabilities`) and caches per-model tool-calling capability; the Ollama provider lives at `apps/desktop/src-tauri/src/core/llm/providers/ollama.rs` and is catalogued as `ollama` / "Ollama (Local)" in `packages/types/src/models.json`. ✅ Built (Desktop, Ollama). A unified cross-surface "dependency doctor" (git, node, local runtimes, GPU) surfaced in one report is 🔭 Planned. Requirement: local-runtime probes MUST be loopback-only and MUST NOT be treated as BYOK or Cloud reachability.

## Startup Sequence — initialize services in dependency order

Each host brings services up in a fixed order. **CLI:** `app-server` (`crates/agiworkforce-app-server/src/lib.rs`) starts on stdio by default (`AppServerTransport::Stdio`), answers the `initialize` handshake (returning capabilities + server info) before accepting `tools/list` / `tools/call`, with `AppServerConfig` defaults `max_sessions: 10`, `session_timeout_secs: 3600`. ✅ Built. **Desktop:** the realtime host (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`, `RealtimeServer`) binds `127.0.0.1`, enforces `MAX_CONNECTIONS = 32`, IP lockout after `MAX_AUTH_FAILURES = 5` within a 60s window, and requires the IPC token before serving the Chrome/VS Code/webview peers. ✅ Built. The native-messaging host connects out to `ws://127.0.0.1:8787` (`apps/desktop/src-tauri/src/bin/native_messaging_host.rs`). ✅ Built. A single orchestrator booting these in declared dependency order with health-gated readiness is 🔭 Planned — today ordering is per-surface. Requirement: no service accepts traffic before its auth/token gate is armed.

## Configuration Loading — global and project configuration

Shared in-memory app state loads through `packages/runtime/src/state` (`createStore`, `initialAppState`, `initialSettingsState`) as the fan-out choke-point. ✅ Built. Project-scoped config is carried by plugin/command manifests (below) and command sources in `crates/agiworkforce-command-registry/src/lib.rs` (`CommandSource::{User, Project, Plugin, Managed, Builtin}`). 🟡 Partial: a documented global-vs-project precedence layout for the whole runtime is not yet unified. Settings **sync** is allowlist-gated and lands last (canon); config load MUST keep Local/BYOK settings device-local and never seed them from Cloud. The managed-cloud kill-switch env `AGI_MANAGED_COMPUTE_PRIVATE_BETA` is read as incident-response only, not a boot gate.

## Plugin Discovery — discover installed runtime extensions

The CLI discovers plugin manifests via `crates/agiworkforce-plugin-runtime/src/lib.rs`: `MANIFEST_PATHS` probes five locations in priority order — `.agiworkforce-plugin/plugin.json` (own, preferred), `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` (interop), then legacy `.app.json` / `.mcp.json` (deprecation notice). `load_manifest_for` returns the first that parses. ✅ Built (CLI). Discovery of the same manifests by Desktop/VS Code and a managed marketplace path are 🔭 Planned. Requirement: interop manifests are loaded as **data**, never executed at discovery time; enabling a discovered plugin remains an explicit, permission-gated action.

## Service Registration — register internal services

Registration is contract-first. `app-server` exposes tools through the injected `ToolDispatch` trait (`list_tools` / `call_tool`), so the host never hard-links CLI tool code. ✅ Built. Slash commands register through `RegistryCommand` records (`command-registry`) tagged by `CommandKind` and `CommandSource`, giving built-ins, skills, plugins, and MCP prompts one path. ✅ Built. Capability-based command routing is `packages/runtime/src/registry.ts` (`resolveCommandCapability`, prefix map → cloud / desktop-only / desktop-preferred). ✅ Built. Cross-surface **presence/heartbeat** registration is 🔭 Planned: `apps/web/app/api/control-plane/status` exists but the `surface_heartbeats` table does not. Requirement: a registered service declares its trust tier; a Local-only tool MUST NOT be resolvable to a cloud route.

## Recovery — recover after unexpected shutdown

On restart, unsent work is replayed, not lost. `packages/runtime/src/offline-queue` (`createOfflineQueue`) and `packages/runtime/src/offline-sync` (`createOfflineSyncManager`, `SyncState`) persist and idempotently re-drive queued messages/tool executions; `packages/runtime/src/queue/messageQueueManager.ts` preserves per-lane priority. ✅ Built. The relay queues approvals while a peer is offline and drains on graceful shutdown (`services/signaling-server/src/index.ts`, `GRACEFUL_SHUTDOWN_TIMEOUT_MS`, `MAX_PENDING_APPROVALS_PER_SESSION`). ✅ Built. `TaskStatus::{Stopped, Failed}` in `task-runtime` models interrupted work. 🟡 Partial. A crash-safe supervisor that reattaches in-flight local sessions and reconciles half-written state at boot is 🔭 Planned. Requirement: replayed actions MUST re-check permission and trust tier — a recovered Local action never resumes on Cloud.

## Updates — runtime update workflow

The Desktop shell updates via `tauri-plugin-updater` (`apps/desktop/src-tauri/Cargo.toml`, `2.10.0`; config block in `apps/desktop/src-tauri/tauri.conf.json`), which also ships the bundled crates. ✅ Built (Desktop app updates). Plugin manifests carry a `version` field for compatibility checks. 🟡 Partial. Independent versioning/rollback of runtime components, CLI self-update via the `agi` binary, and staged rollout of the shared runtime across surfaces are 🔭 Planned. Requirement: an update MUST NOT change a surface's trust exposure (e.g., silently enabling BYOK on Mobile/Web) and MUST preserve queued/offline state across the restart.

## Repository map

- `crates/agiworkforce-app-server/` — JSON-RPC (stdio) + WS tool host; `initialize`/`tools/*`/`shutdown`; CLI-only.
- `crates/agiworkforce-{task-runtime,plugin-runtime,command-registry,protocol}/` — task lifecycle, plugin manifest discovery, command contracts, wire types.
- `packages/runtime/src/{detect,registry}.ts` + `.../{state,queue,offline-queue,offline-sync}/` — env detection, capability routing, shared state, recovery queues.
- `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs` — `127.0.0.1` host (IP lockout, IPC token, `MAX_CONNECTIONS`).
- `apps/desktop/src-tauri/src/bin/native_messaging_host.rs` — `com.agiworkforce.browser`, `ws://127.0.0.1:8787` bridge.
- `apps/desktop/src-tauri/src/core/llm/{capability_detection.rs,providers/ollama.rs}` — local model-runtime discovery.
- `services/signaling-server/src/index.ts` — pairing/relay, offline approval queueing, graceful shutdown.
- `apps/desktop/src-tauri/{tauri.conf.json,Cargo.toml}` — desktop updater config.

## Competitor notes

Claude Code, ChatGPT desktop, and Codex boot a single-vendor runtime bound to one lab's models and cloud. Codex remote connections and Claude Code Remote Control keep the session on the host and treat the phone as a window — parity AGI targets, not a fourth trust mode. AGI's divergence: boot is **multi-provider and trust-partitioned** — Local runtimes (Ollama today) are detected and used with zero egress; BYOK clients arm only where allowed (Desktop/CLI/VS Code) and only on an explicit fork; Managed Cloud is one of three boundaries, open by default for signed-in users but never seeded from Local/BYOK state.

## Acceptance / Definition of Done

Production-ready when boot activates each surface's runtime parts in a defined order, detects local runtimes without egress, discovers plugins as data, registers services with declared trust tiers, and recovers queued work idempotently across restarts — with every 🔭 item tracked as an explicit gap.

- [ ] **Build:** CLI `app-server` answers `initialize` before `tools/*`; Desktop realtime host binds `127.0.0.1` with token + `MAX_CONNECTIONS`/lockout armed before accept; `getRuntimeEnv` resolves correctly per surface.
- [ ] **Trust:** boot performs zero egress in Local mode; BYOK clients stay dormant without a key; no boot path routes a Local/BYOK session to Cloud; `AGI_MANAGED_COMPUTE_PRIVATE_BETA` treated as kill-switch only.
- [ ] **Security & recovery:** IPC/pair tokens required at every accept; plugin manifests loaded as data (no execution at discovery); offline/queued work replays with re-checked permissions after an unexpected shutdown.

## Anti-patterns

- Inventing a monolithic runtime daemon, boot service, route, env var, or `agi` subcommand the repo does not contain.
- Claiming ✅ without a real path, or presenting 🔭 targets (unified orchestrator, cross-surface heartbeat, CLI self-update) as shipped.
- Any boot step that silently promotes Local → BYOK or Local → Cloud, or arms BYOK on Mobile/Web.
- Binding a runtime service to a non-loopback interface, or accepting connections before the auth/IPC token gate is armed.
- Executing plugin manifest content at discovery time instead of treating it as data.
- Hardcoding or inventing model IDs (use `packages/types/src/models.json`), reintroducing removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups, inventing Pro/Max INR prices, or referencing Supabase.
