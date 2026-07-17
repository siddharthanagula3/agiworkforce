# AGI VS Code Extension — Volume 25 — QA Test Cases

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`, and repo paths cited inline — `apps/extension-vscode/package.json`, `src/features/desktop-bridge/desktopBridge.ts`, `src/core/{commandSetup,advancedFeatures}.ts`, `src/providers/terminalProvider.ts`, `src/integrations/*`, `src/__tests__/*`, `packages/contracts/types/src/models.json`.

## Overview & stance

This volume defines QA test cases for the AGI VS Code Extension — the IDE-native, workspace-scoped developer surface. It supports all three trust modes with explicit selection and visible labels: **Local**, **BYOK** (Desktop/CLI/VS Code only), and **Managed Cloud** (public alpha, open by default). Every case must assert the trust boundary as much as the feature: Local must never be silently routed to BYOK or Cloud, Local→BYOK is an explicit fork (context selection, secret scan, payload preview, visible provider label, consent), and there is **no automatic app-chat sync** — any handoff to Web/Mobile/Desktop chat history is explicit and redacted.

Test tiers map to the package scripts: `vitest` unit (`test`), webview unit (`test:webview`), and VS Code integration via `@vscode/test-electron` (`test:integration`). Suites live under `src/__tests__/`; cases exercising `desktopBridge` run against the real bridge.

## Functional

Command surface, chat participant, and views. ✅ Built — `apps/extension-vscode/package.json` (`contributes.commands`, `contributes.chatParticipants`, `contributes.views`), `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts`.

- Every registered command in `contributes.commands` activates without throwing and is reachable from the Command Palette (`src/__tests__/extension.test.ts` asserts registration parity vs. manifest).
- `@agi` chat participant (`agiworkforce.agi`) responds and its subcommands `/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, `/model` route to the correct handler.
- Activation events fire; sidebar webview, History tree, Context Files tree, and Memory tree render.
- Keybindings resolve per `contributes.keybindings`; the `agi-workforce.hasDiff` context correctly swaps `cmd+shift+a` between "open chat" and "accept current diff".
- New Conversation and model picker (`cmd+shift+m`) run without a signed-in account (the Local/BYOK path stays usable).

## Editor

Inline completions, code lens, hover, and patch/diff review. ✅ Built — `src/features/inline-completions/inlineCompletionProvider.ts`, `src/features/code-lens/codeLensProvider.ts`, `src/features/hover/hoverProvider.ts`, `src/providers/diffDecorationProvider.ts`, `src/providers/codeActionProvider.ts`, `src/providers/diagnosticsProvider.ts`, `src/integrations/patchEngine.ts`.

- Inline ghost-text completions honor `inlineCompletions.enabled`, `debounceMs`, and `maxLength`; disabling the setting suppresses all requests.
- Code lens ("Ask AI", "Tests", "Docs") appears above functions/classes only when `codeLensEnabled` is true.
- Explain/Fix/Refactor/Generate-Tests/Docs from `editor/context` act on the active selection with `contextLines` surrounding lines.
- Diff review: `acceptCurrentDiff` / `rejectCurrentDiff` / accept-all / reject-all / batch accept apply and revert cleanly; rejecting restores the buffer byte-for-byte; `showOriginalContext` shows expected-vs-actual.
- `autoApplyFixes` defaults false; when true it skips the diff prompt only in a trusted workspace. Diagnostics/"Fix Issue" produce a reviewable patch, never a silent write. Remote/phone-driven diff review is 🔭 Planned.

## Git

Repository actions. ✅ Built — `src/core/commandSetup.ts` (`agi.git.status`, `agi.git.diff`, `agi.git.commit`, `agi.test.run`).

- `agi.git.status` and `agi.git.diff` stream to the AGI output channel via `execFile` (no shell), scoped to the active folder.
- `agi.git.commit` prefers the built-in `vscode.git` API (`repo.commit`); on failure it falls back to `execFile(['add','-u'])` + `execFile(['commit','-m',msg])`, passing the message as a single argv entry (no shell interpretation of metacharacters).
- Commit fallback is **refused in untrusted workspaces** (assert warning, no process spawned). No git action rewrites history, force-pushes, or auto-commits without an explicit command invocation.

## Terminal

Terminal capture and command suggestion. ✅ Built — `src/providers/terminalProvider.ts` (`runCommand`, `captureAndExplain`, `suggestCommand`, `validateSuggestedCommand`).

- `runCommand` reuses/creates the single named "AGI Workforce" terminal and is **disabled in untrusted workspaces** (assert the disable message, no send).
- `captureAndExplain` reads recent output via shell integration, capped at the max length; no capture when integration is unavailable.
- `suggestCommand` returns a command that passes `validateSuggestedCommand`; dangerous/injection patterns are rejected before execution and never auto-run. Terminal output routed to chat stays workspace-scoped, never auto-synced to app chat.

## MCP

Model Context Protocol tools. 🟡 Partial — `apps/extension-vscode/package.json` (`agiWorkforce.mcp.enabled`, default `false`), `src/core/advancedFeatures.ts` (MCP requires the desktop bridge; warns when MCP is enabled but bridge disabled).

- With `mcp.enabled=false` (default), no MCP tools are advertised or invoked.
- With `mcp.enabled=true` but `desktopBridge.enabled=false`, the extension surfaces the guidance notice and reaches no network endpoint.
- MCP tool calls execute only over the authenticated bridge, approval-gated with validated inputs. Direct in-extension MCP client and per-tool consent UI are 🔭 Planned.

## Providers

Model/provider selection and streaming. 🟡 Partial — `src/features/model-picker/*`, `src/integrations/providerStreamClient.ts`, `src/integrations/providerSwitchGuard.ts`, `src/integrations/tierResolver.ts`; `useProviderStream` default `false` with "AGI account web auth … not wired in the VS Code extension yet" (`package.json`).

- Model picker lists only available models; IDs originate from `packages/contracts/types/src/models.json` — QA asserts no hardcoded/invented ID leaks. Default `auto-economy` is a routing alias, not a catalog ID.
- `providerStreamProvider=auto` infers the provider from the model-id prefix; explicit values route directly.
- BYOK: setting/clearing a key is explicit and the active provider label is visible; Local never routes to a cloud provider without an explicit fork. `providerSwitchGuard` enforces per-tier in-thread switching; the tier is resolved via `tierResolver`, not client state.
- **Gap 🟡:** `agiWorkforce.tier` enum (`local,byok,hobby,pro,pro_plus,max`) still encodes the retired `hobby` and `pro_plus` tiers (`max` itself is a current canon tier) and lacks `free`/`basic`/`enterprise`; it must reconcile to the canon ladder (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise) under a separate billing-catalog task.

## Performance

- Inline completions debounce ≥ `debounceMs` (default 300 ms) and truncate at `maxLength`; no request storm on rapid typing.
- `onStartupFinished` activation adds no blocking startup work beyond registration; context assembly respects the `contextLines` cap (0–500) and never ships the whole workspace. Streaming renders incrementally when `streamingEnabled`.
- Desktop-bridge reconnect uses bounded exponential backoff (1s→8s) and degrades gracefully when the bridge is down (`src/features/desktop-bridge/desktopBridge.ts`).

## Security

Trust boundaries, workspace trust, and bridge auth. ✅ Built — `package.json` `capabilities.untrustedWorkspaces` + `restrictedConfigurations`; `src/features/desktop-bridge/desktopBridge.ts` (`readBridgeToken`, 0600 check, TOCTOU-safe fd); `src/__tests__/security.test.ts`.

- Untrusted workspace: `apiEndpoint`, `gatewayUrl`, `cliPath`, `systemPrompt`, `agent.autoApply`, `autoApplyFixes`, `telemetryEndpoint`, and `tier` cannot be overridden by workspace settings; agent file writes stay disabled until trusted.
- Bridge token at `~/.agiworkforce/bridge-token` must be `0600`; group/world-readable modes are refused, and the read opens once and validates against the same fd (no TOCTOU). Same-user reachability of `ws://127.0.0.1:8787/ws` is a known limitation; migration to a Unix domain socket / named pipe is 🔭 Planned behind a transport flag.
- No Local/BYOK data crosses into Cloud without an explicit, consented, redacted fork; telemetry defaults off (`telemetryEnabled=false`) with no PII in events.
- Remote control of an editor session from phone/web is 🔭 Planned; it must be QR + HMAC paired, outbound-only, and approval-gated — never a fourth trust mode.

## Repository map

- `apps/extension-vscode/package.json` — manifest: commands, chat participant, views, keybindings, configuration, untrusted-workspace capability.
- `src/core/` — `commandSetup.ts` (git/test commands), `advancedFeatures.ts` (MCP/bridge gating), `commands.ts`, `telemetry.ts`, `subsystemHealth.ts`.
- `src/features/` — `desktop-bridge/`, `chat-participant/`, `inline-completions/`, `code-lens/`, `hover/`, `model-picker/`, `sidebar-webview/`, `trees/`, `cloud-bridge/`, `account-auth/`.
- `src/providers/` — `terminalProvider.ts`, `diffDecorationProvider.ts`, `codeActionProvider.ts`, `diagnosticsProvider.ts`, `agentModeProvider.ts`.
- `src/integrations/` — `patchEngine.ts`, `providerStreamClient.ts`, `providerSwitchGuard.ts`, `tierResolver.ts`.
- `src/__tests__/` — `extension.test.ts`, `security.test.ts`, `chatParticipant.test.ts`, `api.test.ts`, `configDefaults.test.ts`.
- `packages/contracts/types/src/models.json` — model-ID SSOT.

## Competitor notes

Claude Code's and Codex's VS Code extensions offer chat/edit/agent modes, `@`-file references, editor context, diagnostics, inline diff review, approvals, and cloud handoff preview — both effectively single-vendor. AGI's deliberate divergence: **multi-provider** selection from the `models.json` catalog, **BYOK where the surface allows it** (Desktop/CLI/VS Code only), **per-surface trust** with a hard Local/BYOK/Cloud boundary, and **local-first** operation (Ollama/LMStudio) that never silently escalates to Cloud. Where Claude/Codex sync sessions to a cloud account, AGI keeps VS Code workspace/task-scoped with explicit, redacted handoff only. Remote control (Claude Code `/remote-control`) is a parity reference, 🔭 Planned here as a secure remote window, not a data move.

## Acceptance / Definition of Done

Production-ready when unit, webview, and integration suites pass, every manifest command activates, all three trust modes behave per boundary, and no case regresses bridge auth.

- [ ] Build/tests: `pnpm --filter agi-workforce typecheck`, `test`, `test:webview`, and `test:integration` all green.
- [ ] Trust: Local never escalates to BYOK/Cloud without a consented fork; provider label visible; no auto app-chat sync; untrusted-workspace restrictions enforced for git/terminal/agent writes.
- [ ] Security: bridge-token 0600 + TOCTOU-safe read verified; `validateSuggestedCommand` rejects injection; telemetry off by default; no invented model IDs or removed tiers surfaced.

## Anti-patterns

- Silently routing Local chats/files to BYOK or Cloud, or performing an implicit app-chat sync from the IDE.
- Faking capability: do not label MCP, remote control, or shared CLI sessions as ✅ when they are 🟡/🔭.
- Hardcoding or inventing model IDs instead of reading `packages/contracts/types/src/models.json`; surfacing removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups (the `agiWorkforce.tier` enum drift is a tracked 🟡, not a license to keep them).
- Referencing Supabase, renaming `proxy.ts` back to `middleware.ts`, spawning shell-interpreted git/terminal commands, or running git/terminal writes in an untrusted workspace.
- Treating the localhost bridge as a trust upgrade: it stays authenticated, rate-limited, and same-user-scoped until the socket/pipe migration lands.
