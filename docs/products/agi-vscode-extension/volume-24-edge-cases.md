# AGI VS Code Extension — Volume 24 — Edge Cases

Status: Current implementation notes
Owner: Founder + platform lead
Last updated: 2026-07-25

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`. Grounded in the repo paths cited under **Repository map** below — chiefly `apps/extension-vscode/package.json`, `src/providers/chatEditorPanel.ts`, `src/features/chat-participant/chatParticipant.ts`, `src/integrations/{localRuntimeClient,providerStreamClient}.ts`, `src/features/account-auth/deviceAuth.ts`, and `src/features/desktop-bridge/desktopBridge.ts`.

## Overview & stance

This volume specifies how the AGI VS Code Extension behaves when things go wrong: repositories too large to index, files that are not text, workspaces VS Code refuses to trust, and the four ways inference can fail (auth, managed/BYOK provider, local model, desktop bridge). The surface exposes all three trust modes — **Local**, **BYOK** (Desktop/CLI/VS Code only), and **Managed Cloud** — with explicit selection and visible labels. Edge-case handling must never launder trust: a Local session that loses its model must not silently fall through to a keyed or cloud provider. Every failure degrades to a clear, actionable message; none crashes the host, leaks a secret, or fabricates availability. Workspace scope holds throughout — no automatic app-chat sync; any handoff is explicit and redacted.

## Huge repository

Context assembly is bounded, not exhaustive. ✅ Built: `chatEditorPanel.ts` caps `@file` references per turn (`MAX_FILE_REFS = 5`), caps aggregate injected text (`MAX_TOTAL_FILE_CHARS`, per-file `slice(0, 5000)`), and resolves references with `vscode.workspace.findFiles('**/${ref}', '**/node_modules/**', 1)` so vendored trees are excluded and only the first match is read. Editor context is bounded by `agiWorkforce.contextLines` (default 50, max 500). Requirements: (1) scan work is cancellable via the request `CancellationToken`; (2) over-limit references emit a visible placeholder (`[skipped: max 5 @file refs per turn]`), never a silent drop; (3) the host must not block on a full-repo walk. 🔭 Planned: a workspace-wide semantic index with `.gitignore`-aware exclusion and a monorepo file-count ceiling.

## Binary files

Non-text content is detected and skipped, never fed to a model as garbage. ✅ Built: in `chatEditorPanel.ts`, resolved `@file` content is scanned for a NUL byte (`rawContent.includes('\x00')`) and, when found, replaced with `[binary file skipped]`; sensitive paths are refused via a denylist (`[refused: matches sensitive-file denylist]`) before any read. Requirements: (1) images, archives, and compiled artifacts must never be streamed as prompt text; (2) the skip is surfaced, not swallowed; (3) binary/size guards run before content leaves the device in any trust mode. 🔭 Planned: multimodal image attachment for vision-capable models (gated on capability metadata from `packages/contracts/types/src/models.json`, never a hardcoded model ID).

## Workspace trust — restricted mode

The extension declares **limited** untrusted-workspace support and degrades safely. ✅ Built: `restrictedConfigurations` contains `apiEndpoint`, `gatewayUrl`, `cliPath`, `autoApplyFixes`, `telemetryEndpoint`, and `tier`; a regression test rejects references to settings the extension does not contribute. At runtime tier resolution reads global scope only, terminal execution is refused when the workspace is untrusted, and agent edits/patches require trust. Requirements: read-only inspection remains available in restricted mode; every new write/execute/endpoint-redirect capability adds an `isTrusted` gate or restricted configuration before merge; the UI states why an action is disabled.

## Authentication failure

Auth failures are explicit and recoverable — never a silent trust-mode swap. Managed-Cloud utilities use the device-authorization flow in `src/features/account-auth/deviceAuth.ts`; the provider-stream helper requires the resulting account token and fails with a sign-in action when it is absent. Local `@agi`, sidebar, and editor developer sessions do not depend on this token: they use the workspace app-server. The removed `fallbackToVscodeLm` setting is not a hidden cross-provider escape hatch. Requirements: a 401/expired token prompts re-authentication rather than downgrading the trust mode; auth is Clerk-issued; no token is logged. Token refresh/expiry handling and a first-class `vscode.AuthenticationProvider` remain planned.

## Provider failure

Provider errors are typed and stay within the selected boundary. `providerStreamClient.ts` yields structured error events and a terminal error stop for cloud-backed utilities. Developer-session provider errors come from the app-server and are surfaced to the active chat; the extension does not silently retry them through a different provider. Requirements: 429/5xx may be retried with bounded backoff, other 4xx surface immediately, and BYOK/Managed/Local failures never silently reroute. Automatic multi-provider failover remains planned and must be app-server-owned.

## Local model failure

Local inference failures stay Local. If the app-server cannot start, `@agi` reports “The AGI local runtime is unavailable,” while the sidebar shows “Local runtime needs setup” with guidance to install/update the CLI or configure `agiWorkforce.cliPath`. Installed Ollama/LM Studio rows come from app-server `model/list`; no cloud selector is substituted when discovery fails. Requirements: Local failure never switches to a keyed or cloud model, and any future forwarding path must implement the full Local→BYOK/Cloud preview and consent flow.

## Desktop bridge unavailable

The bridge is optional; its absence must degrade gracefully and never block local editor work. ✅ Built: `src/features/desktop-bridge/desktopBridge.ts` returns `{ ok: false, error }` from `sendToDesktop` when not connected (no throw), shows a status-bar state, auto-reconnects with capped exponential backoff (1s→8s), and on a missing/`0600`-unsafe token at `~/.agiworkforce/bridge-token` shows an actionable warning plus a `Reconnect` action. A disconnect after a live session raises "Desktop bridge disconnected. Local operations remain available." Requirements: (1) local chat, explain, and edits keep working with the bridge down; (2) queued commands must not execute stale on reconnect without validation; (3) the `auth` → `auth_ok` handshake and allowlists hold on every reconnect. 🔭 Planned: migration from `ws://127.0.0.1:8787/ws` to a Unix domain socket / named pipe behind `agiWorkforce.desktopBridge.transport`, and phone/web remote control of an editor session (parity: Claude Code `/remote-control`).

## Repository map

All under `apps/extension-vscode/`:

- `package.json` — manifest, trust capabilities, context/bridge/provider settings.
- `src/providers/chatEditorPanel.ts` — `@file` resolution, size/binary/sensitive guards.
- `src/features/chat-participant/chatParticipant.ts` — local runtime error handling.
- `src/integrations/providerStreamClient.ts` — stream error/stop events.
- `src/features/account-auth/deviceAuth.ts` — device auth flow.
- `src/features/desktop-bridge/desktopBridge.ts` — bridge lifecycle + degradation.
- `src/features/model-picker/modelConstants.ts` — provider catalog.
- `src/platform/config.ts`, `src/providers/terminalProvider.ts`, `src/providers/agentMode/agentUI.ts` — trust gating.

## Competitor notes

Claude Code and the Codex IDE extension handle large repos with server-side indexing, skip binaries, honor VS Code Workspace Trust, and show typed provider/auth errors with retry. AGI's divergence: **per-surface trust boundaries** are load-bearing in every edge case — failures degrade _within_ a trust mode and Local never silently escalates to BYOK or Cloud; **multi-provider by design** targets a configurable provider list, not one vendor; and **local-first** means the bridge or local runtime being down must never gate basic editor assistance. AGI must always label which provider served a fallback turn.

## Acceptance / Definition of Done

Production-ready when every failure degrades to a clear, non-crashing, secret-safe state with a visible next action, and no failure path crosses a trust boundary without an explicit fork.

- [ ] Build/behavior: huge-repo scans are cancellable and bounded; binary/size/sensitive guards run before content leaves the device; `pnpm --filter agi-workforce test` + `typecheck` pass.
- [ ] Trust: local-model, provider, auth, and bridge failures never auto-switch trust mode; Local→BYOK/Cloud requires the full explicit fork; restricted mode disables write/execute with a stated reason.
- [ ] Security: no token/key logged on any failure path; bridge handshake + allowlists re-verified on reconnect; workspace-path containment holds for resolved `@file` reads.

## Anti-patterns

- Silently routing a failed Local session to BYOK or Managed Cloud (or the reverse) — a trust-boundary violation.
- Adding an implicit VS Code-LM/provider fallback, or hiding which provider served a turn.
- Feeding binary bytes or oversized files to a model instead of skipping with a visible placeholder.
- Enabling write/execute in an untrusted workspace, or letting a workspace override a `restrictedConfigurations` key.
- Claiming shipped state without a real repo path, or inventing a model ID instead of reading `packages/contracts/types/src/models.json`.
- Referencing removed tiers (Plus / `pro_plus` / Hobby) or credit top-ups; the manifest exposes only current extension access modes.
- Any reference to Supabase (fully migrated away) or Next.js `middleware.ts` (use `proxy.ts`).
