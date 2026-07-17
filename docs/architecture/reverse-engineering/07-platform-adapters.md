# 7. Platform Adapters

Status: Current
Owner: Platform lead
Last updated: 2026-07-15

The capability-first rule means shared logic lives in packages/crates and each surface contributes only a thin **platform adapter**: the code that can only exist on that platform (native APIs, OS hooks, extension host, terminal). This file draws the line between "legitimately surface-local" and "must be shared," per surface. The keep-local boundaries are ratified in the shared-packages decision log (R11).

## 7.1 The line

Legitimately surface-local (per decision log R11): voice/VAD/haptics, Tauri OS hooks + computer-use, VS Code LSP glue, Chrome content scripts, CLI TUI. Everything else — provider streaming, MCP, exec policy, the turn loop, chat/model state, wire contracts, sync-apply, UI primitives, tokens — is shared.

## 7.2 Desktop — Tauri v2

`apps/desktop` is a React/Vite front end talking to a Rust `src-tauri` back end over Tauri IPC.

- **Bridge:** `packages/client/desktop-command-client` (`@agiworkforce/desktop-command-client`) provides typed TS wrappers for all Tauri commands (1,062+), one module per Rust command domain (settings, auth, chat, mcp, memory, database, …). The front end never calls `invoke` ad hoc; it calls the typed wrapper. `packages/client/client-runtime` detects the Tauri env and dispatches capability-aware commands.
- **Rust back end (`src-tauri/src/core`):** the local compute host — provider streaming (`core/llm`, migrating to the shared `agiworkforce-llm` crate), MCP (`core/mcp`, migrating to `agiworkforce-mcp`), sandbox runtime + exec policy (adopted `agiworkforce-execpolicy`), local file generation with manifest-producing command paths for PDF/DOCX/XLSX/PPTX, cloud-sync apply (`src-tauri/src/data/cloud_sync.rs`, pinned to shared sync-apply fixtures — area 5).
- **Legitimately local:** computer-use, browser-use, native messaging (to the Chrome extension), OS startup/menu-bar/keep-awake controls, local filesystem access, the BYOK vault (locally encrypted).
- **Migration state:** the desktop Rust engine adopting the shared crates (provider c2–c4, MCP d2, turn loop e2) is **live-gated** — needs live-provider + device verification CI cannot run. The crates are the frozen contract; desktop adoption is staged (`docs/plans/rust-engine-extraction-2026-07-09.md`; `DESKTOP-CLI-HARNESS-FRAGMENTATION-01`).

## 7.3 CLI — Rust + Ratatui

`apps/cli` is a Rust binary. It is the **first consumer** of the shared crates and has fully adopted them:

- `agiworkforce-agent-core` (turn loop), `agiworkforce-llm` (provider HTTP/SSE), `agiworkforce-mcp` (MCP client), `agiworkforce-execpolicy`, `agiworkforce-sandbox-policy`, `agiworkforce-protocol`, `agiworkforce-app-server`, `agiworkforce-command-registry`, `agiworkforce-utils-image` (9 path-deps).
- **Legitimately local:** the Ratatui TUI (streaming render, diff overlay, theme), slash-command REPL, privacy-mode commands, voice, hooks, subagents. The CLI/desktop "split-brain" is dissolved on the CLI side — provider/MCP/exec/turn-loop are shared crates.
- **Developer-session owner:** `CliDeveloperSessionHost` owns persisted sessions,
  live turns, cancellation, approvals, tool execution, MCP attachment, and
  streamed events for both CLI and VS Code. MCP discovery emits loading, ready,
  or unavailable status asynchronously and cannot block session startup.

## 7.4 Mobile — Expo / React Native

`apps/mobile` (+ tracked root `ios/`).

- **Shared logic:** consumes `unified-chat` (logic/renderers), `packages/contracts/cloud-contracts` (managed-cloud wire truth), `packages/platform/artifacts` (artifact derivation/state/cloud apply), `packages/client/sync` (delta apply), `packages/platform/local-llm` (on-device inference), and `types`.
- **Legitimately local:** on-device inference tiers (Apple/Gemini Nano → executorch → llama.rn), voice/VAD/haptics, native RN screens, the 4-layer trust guard (`guardedFetch` fail-closed egress on 100% of API calls, `remoteChatGate` fail-closed), push tokens.
- **Native config discipline:** `apps/mobile/android/` is gitignored + generated — native changes must be Expo config plugins, not direct edits. Root `ios/` is the canonical tracked project (19 files); `apps/mobile/ios/` is gitignored prebuild output. Name divergence (`agiworkforce` vs `AGIWorkforce`) is tracked as `MOBILE-IOS-PREBUILD-DRIFT-01`. HealthKit was removed 2026-07 and is a tracked re-implementation gap (decision log §1).

## 7.5 VS Code extension

`apps/extension-vscode` uses the VS Code extension API.

- **Shared:** `packages/contracts/types`, `packages/ui/ui` (themed via `agiVsCodeCssVars`
  tokens), and the typed app-server protocol exposed by the CLI process.
- **Legitimately local:** LSP glue, editor context (open
  files/selection/`@file`, diagnostics/problems, terminal capture), diff
  review/apply, and chat-participant/sidebar presentation. `LocalRuntimePool`
  owns one CLI process per trusted workspace. The deleted extension-owned
  conversation store, checkpoint manager, and agent loop must not return.
  App-server checkpoint/worktree capabilities are currently false. Sessions
  stay workspace/task-scoped; cloud/local continuation requires preview and
  consent. Sensitive endpoints must not be trusted from workspace config alone.

## 7.6 Chrome extension

`apps/extension` is Chrome MV3, with a `native-host/` and a `THREAT_MODEL.md`.

- **Shared:** `packages/contracts/types`, `packages/ui/ui` (themed via `agiExtensionCssVars`).
- **Legitimately local:** content scripts, page-context capture (untrusted page
  data), browser actions with per-site approval/allowlist/blocklist and
  prompt-injection defenses, workflow recording, the browser conversation store
  in `chrome.storage.local`, and the **native-messaging bridge** to Desktop.
  Browser conversations are not consumer app-chat sync. Page data is treated as
  untrusted input, never as instructions.

## 7.7 Sandbox renderer

`infrastructure/sandbox` is a separately deployed static renderer for
`sandbox.agiworkforce.com`. It is the **cross-origin artifact renderer**: it
renders generated artifacts/HTML inside a sandboxed iframe/`srcDoc`, receiving
content **only via `postMessage`**, isolating untrusted artifact HTML from the
main app origin. It imports nothing (`allowedImports: none`). Provisioning of
`NEXT_PUBLIC_SANDBOX_ORIGIN` is a tracked gap
(`WEB-SANDBOX-ORIGIN-ENV-01`).

## 7.8 Services as adapters to the cloud

The api-gateway (area 2/3) is the platform adapter between mobile/desktop cloud clients and the provider ecosystem + Neon; the signaling-server adapts WebRTC pairing/remote-control. Neither imports UI packages (enforced).

## 7.9 What's fully documented vs flagged

- The shared-vs-local line, per-surface adapters, native-config discipline: **fully documented**.
- Desktop Rust crate adoption: **live-gated in progress**. Mobile HealthKit + iOS prebuild name drift: **tracked gaps**. Sandbox origin env: **tracked gap**.
