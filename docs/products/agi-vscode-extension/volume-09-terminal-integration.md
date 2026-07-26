# AGI VS Code Extension — Volume 09 — Terminal Integration

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`, `docs/surfaces/vscode-extension.md`, and grounded in `apps/extension-vscode/package.json`, `apps/extension-vscode/src/providers/terminalProvider.ts`, `apps/extension-vscode/src/core/commandSetup.ts`, `apps/extension-vscode/src/core/providerSetup.ts`, `apps/extension-vscode/src/core/runInlineCommand.ts`, and `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`.

## Overview & stance

Terminal integration is where AGI reaches the shell: running commands, reading their output, and reasoning over it. VS Code exposes all three trust modes (Local, BYOK, Managed Cloud) with explicit selection and a visible provider label, and the surface is **workspace-scoped** — command execution is local to the workspace and there is **no automatic app-chat sync**; any handoff to app chat is explicit and redacted.

Two boundaries govern everything below. First, **execution stays local**: sending a command to the integrated terminal does not route data anywhere — it runs on the host under the user's shell. Second, **the boundary crossing is the text we send to a model**. Captured terminal output can contain secrets, tokens, and paths; when that output (or a command suggestion prompt) is sent to an LLM it must obey the resolved trust mode and show the active provider label, and a Local session must never be silently escalated to BYOK or Managed Cloud — Local→BYOK is an explicit fork (context selection, secret scan, payload preview, consent). Terminal features are access-mode agnostic — they work under Local, BYOK, and Managed Cloud alike and are never a top-up (no credit top-ups exist). Parity references are Claude Code's bash/terminal tool and Codex IDE command execution; AGI's divergence is multi-provider explanation, positive-allowlist command safety, workspace-local execution, and per-surface trust.

## Shared Terminal Sessions

- 🟡 Partial — The extension maintains **one reusable named terminal**, `AGI Workforce`, via `TerminalProvider.getOrCreateTerminal()` (`src/providers/terminalProvider.ts`): it reuses a live instance, adopts an existing same-named terminal, or creates one rooted at the active workspace folder, and clears its handle on `onDidCloseTerminal`. This is a session shared _across the extension's own commands_ (run, suggest, explain). What is **not** built: a terminal session **shared with the CLI** (`agi`) or the desktop host. Cross-surface shared developer sessions are a target direction only — mark 🔭. Requirement: any future shared session must keep VS Code sessions workspace/task-scoped per `apps/extension-vscode/AGENTS.md`, never streaming IDE terminal context into Web/Mobile/Desktop app chat, and must carry the shared session schema in `packages/contracts/types`, not extension-only files.

## Execute Commands

- ✅ Built — `agi-workforce.runCommand` (keybinding `cmd/ctrl+shift+alt+t`) prompts for a command and runs it via `TerminalProvider.runCommand()`, which **refuses in untrusted workspaces** (`vscode.workspace.isTrusted`) because the integrated terminal inherits workspace shell config. Structured commands avoid the shell entirely: `agi.git.status` / `agi.git.diff` / `agi.git.commit` use `execFile('git', [...])` through `runGitToOutputChannel` (`src/core/commandSetup.ts`), passing dynamic args (commit messages) as single argv entries so no shell interprets metacharacters; `agi.test.run` detects the package manager by lockfile (`pnpm`/`yarn`/`npm`/`cargo`/`pytest`) and is trust-gated.
- ✅ Built — **AI-suggested** commands (`agi-workforce.suggestCommand`) are safety-validated by `validateSuggestedCommand`: a positive **allowlist** of first tokens (`git`, `npm`, `pnpm`, `cargo`, `pytest`, …), rejection of shell metacharacters (``$ ` ; | & < >``), stripping of ANSI and zero-width/invisible Unicode before matching, destructive-pattern refusal (`--force`, `reset --hard`, `find -delete`, force-push), and a **modal confirmation showing the exact command text** before running.
- Requirement: no LLM-suggested command runs without passing the allowlist _and_ an explicit human confirm; execution stays disabled until the workspace is trusted; the resolved provider/model label is visible when generating suggestions.

## Explain Output

- ✅ Built — `agi-workforce.explainTerminal` calls `TerminalProvider.captureAndExplain()`, which reads recent output through the VS Code **Shell Integration API** (`terminal.shellIntegration.executions[…].read()`), truncates at `MAX_CAPTURE_CHARS` (8 000) to bound request size, and falls back to a manual paste input box when shell integration is unavailable. The explanation is streamed to the active model via `chatCompletion(secrets, …)` and rendered in a new Markdown document. A related `agi-workforce.explainError` command covers diagnostics-driven explanation.
- Requirement: captured output is a trust-boundary crossing — it must be sent only to the currently selected trust mode's provider with a visible label; under Local, sending output to a BYOK/Cloud model requires the explicit fork (secret scan + payload preview + consent), never a silent route. Truncation and any redaction must be applied before the payload leaves the host.

## Long-running Processes

- 🟡 Partial — Long-running processes (`npm run dev`, `cargo watch`, `pytest -f`) can be **started**: `runCommand` and `agi.test.run` send them to the integrated terminal and show it. What is **not** built is lifecycle awareness — the extension does not subscribe to shell-execution start/end events (`onDidStartTerminalShellExecution` / `onDidEndTerminalShellExecution` are unused in `src/`), does not capture exit codes, and does not detect completion. `captureAndExplain` reads the _most recent_ execution and its stream may error while an execution is still in progress. Requirement (🔭 for the missing parts): a first-class long-running mode must expose start/exit/exit-code events, stream incremental output within the `MAX_CAPTURE_CHARS` budget, and offer cancel — all without auto-syncing session state off-surface.

## Background Tasks

- 🔭 Planned — There is **no** VS Code Tasks API integration (no `vscode.tasks` provider, no `tasks.json` authoring), no background-task registry, and no watch-mode monitoring in `src/`. The desktop bridge offers a forward path: `agi-workforce.triggerAgentAction` / `DesktopBridge.triggerAgentAction()` (`src/features/desktop-bridge/desktopBridge.ts`) can hand an action to the desktop agent over the authenticated `ws://127.0.0.1:8787/ws` bridge (bearer token at `~/.agiworkforce/bridge-token`, `0600`; migration target: Unix domain socket / named pipe), but this is not wired to a background-task executor and is 🟡 at the transport layer only. Requirement: a background-task feature must be approval-gated, must surface running tasks with a visible status and a stop control, must keep execution local (workspace-scoped), and — if it ever mirrors a task to a phone/web client — do so as a secure remote _window_ (Remote Control: outbound-only, QR + HMAC pairing, approval-gated), not by moving local data into the cloud.

## Repository map

- `apps/extension-vscode/src/providers/terminalProvider.ts` — named terminal lifecycle, `runCommand`, `captureAndExplain`, `suggestCommand`, `validateSuggestedCommand`, shell-integration capture + manual fallback.
- `apps/extension-vscode/src/core/commandSetup.ts` — `agi.git.*` via `execFile`, `agi.test.run`, trust gates, output channel wiring.
- `apps/extension-vscode/src/core/providerSetup.ts` — `activateTerminal(context, secrets)` registration.
- `apps/extension-vscode/src/core/runInlineCommand.ts` — trust-gated apply path shared with terminal-adjacent flows.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — `triggerAgentAction`, bridge auth/allowlist/rate-limit (forward path for delegated tasks).
- `apps/extension-vscode/package.json` — `runCommand` / `explainTerminal` / `suggestCommand` / `explainError` commands, keybindings, and `capabilities.untrustedWorkspaces` restrictions.

## Competitor notes

Claude Code runs shell commands through a bash tool with approval prompts and reads back output; Codex IDE executes commands in an approval-gated sandbox and surfaces results inline; both increasingly read terminal state. AGI's deliberate divergence: (1) **multi-provider** — output explanation and command suggestion run against whichever Local, BYOK, or Managed-Cloud model is selected, always labeled; (2) **positive-allowlist safety** for AI-suggested commands plus a modal exact-command confirm, rather than a best-effort blocklist; (3) **workspace-local execution** with hard untrusted-workspace gates, so command running is never routed off-host; (4) **per-surface trust** — VS Code sessions stay workspace-scoped, with no automatic app-chat sync and an explicit, redacted handoff only when the user asks.

## Acceptance / Definition of Done

The domain is production-ready when execution is trust-gated, AI-suggested commands cannot bypass the allowlist, captured output respects the active trust mode, and long-running/background parity is either shipped with lifecycle events or clearly marked 🔭 with a tracked gap.

- [ ] Build: `runCommand`, `suggestCommand`, `explainTerminal`, `agi.git.*`, and `agi.test.run` register and run; typecheck/test/build pass (`pnpm --filter agi-workforce {typecheck,test,build}`).
- [ ] Trust: command execution and `autoApplyFixes` are disabled in untrusted workspaces; captured terminal output sent to a model shows the resolved provider label; Local→BYOK/Cloud requires the explicit fork; no IDE terminal context auto-syncs to app chat.
- [ ] Security: AI-suggested commands pass the allowlist + metacharacter/destructive-pattern checks + modal confirm; capture is truncated at `MAX_CAPTURE_CHARS`; bridge stays authenticated (`0600` token) and rate-limited.

## Anti-patterns

- Running an LLM-suggested command without the allowlist check or without the exact-command modal confirm.
- Executing commands in an untrusted workspace, or removing the `isTrusted` gate.
- Sending captured terminal output to a BYOK/Cloud provider from a Local session without the explicit fork (secret scan, payload preview, consent, visible label).
- Auto-syncing terminal sessions or output into Web/Mobile/Desktop app chat history.
- Reintroducing `terminal.sendText` for structured commands where `execFile` already removes shell interpretation.
- Hardcoding a model ID for explanation or suggestion — model IDs come only from `packages/contracts/types/src/models.json`.
- Referencing removed tiers (`Plus`, `pro_plus`, `Hobby`) or credit top-ups; the extension manifest exposes only current access modes.
- Referencing Supabase (fully migrated away) or renaming Next.js `proxy.ts` back to `middleware.ts`.
