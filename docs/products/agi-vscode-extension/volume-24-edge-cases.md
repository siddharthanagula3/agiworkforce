# AGI VS Code Extension — Volume 24 — Edge Cases

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`. Grounded in the repo paths cited under **Repository map** below — chiefly `apps/extension-vscode/package.json` (manifest, `capabilities.untrustedWorkspaces`, `agiWorkforce.contextLines`/`fallbackToVscodeLm`/`desktopBridge.*`/`providerStreamProvider`/`tier`) plus `src/providers/chatEditorPanel.ts`, `src/features/chat-participant/chatParticipant.ts`, `src/integrations/providerStreamClient.ts`, `src/features/account-auth/deviceAuth.ts`, and `src/features/desktop-bridge/desktopBridge.ts`.

## Overview & stance

This volume specifies how the AGI VS Code Extension behaves when things go wrong: repositories too large to index, files that are not text, workspaces VS Code refuses to trust, and the four ways inference can fail (auth, managed/BYOK provider, local model, desktop bridge). The surface exposes all three trust modes — **Local**, **BYOK** (Desktop/CLI/VS Code only), and **Managed Cloud** — with explicit selection and visible labels. Edge-case handling must never launder trust: a Local session that loses its model must not silently fall through to a keyed or cloud provider. Every failure degrades to a clear, actionable message; none crashes the host, leaks a secret, or fabricates availability. Workspace scope holds throughout — no automatic app-chat sync; any handoff is explicit and redacted.

## Huge repository

Context assembly is bounded, not exhaustive. ✅ Built: `chatEditorPanel.ts` caps `@file` references per turn (`MAX_FILE_REFS = 5`), caps aggregate injected text (`MAX_TOTAL_FILE_CHARS`, per-file `slice(0, 5000)`), and resolves references with `vscode.workspace.findFiles('**/${ref}', '**/node_modules/**', 1)` so vendored trees are excluded and only the first match is read. Editor context is bounded by `agiWorkforce.contextLines` (default 50, max 500). Requirements: (1) scan work is cancellable via the request `CancellationToken`; (2) over-limit references emit a visible placeholder (`[skipped: max 5 @file refs per turn]`), never a silent drop; (3) the host must not block on a full-repo walk. 🔭 Planned: a workspace-wide semantic index with `.gitignore`-aware exclusion and a monorepo file-count ceiling.

## Binary files

Non-text content is detected and skipped, never fed to a model as garbage. ✅ Built: in `chatEditorPanel.ts`, resolved `@file` content is scanned for a NUL byte (`rawContent.includes('\x00')`) and, when found, replaced with `[binary file skipped]`; sensitive paths are refused via a denylist (`[refused: matches sensitive-file denylist]`) before any read. Requirements: (1) images, archives, and compiled artifacts must never be streamed as prompt text; (2) the skip is surfaced, not swallowed; (3) binary/size guards run before content leaves the device in any trust mode. 🔭 Planned: multimodal image attachment for vision-capable models (gated on capability metadata from `packages/types/src/models.json`, never a hardcoded model ID).

## Workspace trust — restricted mode

The extension declares **limited** untrusted-workspace support and degrades safely. ✅ Built: `capabilities.untrustedWorkspaces` in `package.json` is `"supported": "limited"` with `restrictedConfigurations` (`apiEndpoint`, `gatewayUrl`, `cliPath`, `systemPrompt`, `agent.autoApply`, `autoApplyFixes`, `telemetryEndpoint`, `tier`). At runtime `src/platform/config.ts` reads tier from global scope only (workspace cannot spoof it), `src/providers/terminalProvider.ts` refuses command execution when `!vscode.workspace.isTrusted`, and `src/providers/agentMode/agentUI.ts` blocks auto-apply of edits/patches until the workspace is trusted (modal "Trust Workspace and Proceed"). Requirements: read-only chat/explain stays available in restricted mode; every new write/execute/endpoint-redirect capability adds an `isTrusted` gate or `restrictedConfigurations` entry before merge; the UI states why an action is disabled.

## Authentication failure

Auth failures are explicit and recoverable — never a silent trust-mode swap. ✅ Built: Managed-Cloud sign-in uses the device-authorization flow in `src/features/account-auth/deviceAuth.ts` (browser approval + bounded `POST /api/device/poll`); when no key/token is present, `chatParticipant.ts` detects the `isNoKey` case and, if `agiWorkforce.fallbackToVscodeLm` is enabled, uses the VS Code built-in Language Model with a visible note plus a `Set API Key` link. 🟡 Partial: the provider-stream path is manifest-flagged not-yet-wired for web auth (`agiWorkforce.useProviderStream`); `chatParticipant.ts` handles that `isWebAuthNotWired` branch by surfacing the error, not retrying. Requirements: (1) a 401/expired token must prompt re-authentication, not downgrade a Cloud session to BYOK or Local without consent; (2) auth is Clerk-issued (never Supabase); (3) no token is logged. 🔭 Planned: token refresh/expiry handling and a first-class `vscode.AuthenticationProvider`.

## Provider failure

Provider errors are typed and, where permitted, fall back within the same trust boundary. ✅ Built: `src/integrations/providerStreamClient.ts` yields structured `{ type: 'error', code?, message, retryable? }` events (marking `retryable` on `>= 500`) and a terminal `stop` with `reason: 'error'`; `chatParticipant.ts` distinguishes no-key vs network/server errors and, when `fallbackToVscodeLm` is on for a genuine provider error, falls back to the built-in model with a visible "AGI Workforce API error … falling back" note. Requirements: (1) 429/5xx are retryable with backoff, other 4xx surface immediately; (2) fallback must show which provider/model served the turn; (3) a BYOK failure must never silently reroute to Managed Cloud, or vice versa. 🔭 Planned: automatic failover across the `agiWorkforce.providerStreamProvider` list with per-provider health tracking.

## Local model failure

Local inference failures stay Local — they do not escalate to a paid path without an explicit fork. 🟡 Partial: `src/features/model-picker/modelConstants.ts` enumerates local providers (Ollama, LM Studio) selectable via `agiWorkforce.providerStreamProvider`, but an unreachable Local runtime (daemon down, connection refused) is currently surfaced through the generic provider-error/fallback path in `chatParticipant.ts`. Requirements: (1) a local-model connection failure must produce a Local-specific message ("local runtime unreachable — start Ollama/LM Studio, or explicitly fork to BYOK/Cloud"), **not** an automatic switch to a keyed or cloud model; (2) any Local→BYOK/Cloud transition remains the full explicit fork (context selection, secret scan, payload preview, visible label, consent); (3) `fallbackToVscodeLm` is not a Local fallback — the built-in VS Code model is a separate, separately-labeled provider. 🔭 Planned: dedicated local-runtime health detection and a distinct "Local unavailable" state.

## Desktop bridge unavailable

The bridge is optional; its absence must degrade gracefully and never block local editor work. ✅ Built: `src/features/desktop-bridge/desktopBridge.ts` returns `{ ok: false, error }` from `sendToDesktop` when not connected (no throw), shows a status-bar state, auto-reconnects with capped exponential backoff (1s→8s), and on a missing/`0600`-unsafe token at `~/.agiworkforce/bridge-token` shows an actionable warning plus a `Reconnect` action. A disconnect after a live session raises "Desktop bridge disconnected. Local operations remain available." Requirements: (1) local chat, explain, and edits keep working with the bridge down; (2) queued commands must not execute stale on reconnect without validation; (3) the `auth` → `auth_ok` handshake and allowlists hold on every reconnect. 🔭 Planned: migration from `ws://127.0.0.1:8787/ws` to a Unix domain socket / named pipe behind `agiWorkforce.desktopBridge.transport`, and phone/web remote control of an editor session (parity: Claude Code `/remote-control`).

## Repository map

All under `apps/extension-vscode/`:

- `package.json` — manifest, trust capabilities, context/fallback/bridge/provider settings.
- `src/providers/chatEditorPanel.ts` — `@file` resolution, size/binary/sensitive guards.
- `src/features/chat-participant/chatParticipant.ts` — error classification, vscode.lm fallback.
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
- Treating `fallbackToVscodeLm` as a "Local" fallback, or hiding which provider served a fallback turn.
- Feeding binary bytes or oversized files to a model instead of skipping with a visible placeholder.
- Enabling write/execute in an untrusted workspace, or letting a workspace override a `restrictedConfigurations` key.
- Claiming shipped state without a real repo path, or inventing a model ID instead of reading `packages/types/src/models.json`.
- Referencing removed tiers (Plus / `pro_plus` / Hobby) or credit top-ups; the `agiWorkforce.tier` enum still encodes older values — flag as a 🟡 reconciliation gap, do not propagate.
- Any reference to Supabase (fully migrated away) or Next.js `middleware.ts` (use `proxy.ts`).
