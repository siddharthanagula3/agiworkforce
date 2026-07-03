# AGI VS Code Extension — Volume 17 — Settings

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md`; `apps/extension-vscode/AGENTS.md`; and real repo paths: `apps/extension-vscode/package.json` (`contributes.configuration`, `contributes.keybindings`, `capabilities.untrustedWorkspaces`), `apps/extension-vscode/src/utils/api.ts`, `apps/extension-vscode/src/core/telemetry.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `apps/extension-vscode/scripts/check-vscode-theme-tokens.mjs`, `packages/types/src/models.json`.

## Overview & stance

This volume specifies the Settings domain for the AGI VS Code Extension: how a developer configures General behavior, Theme, Keyboard Shortcuts, Providers, Permissions, Privacy, and Security. The extension is the IDE-native, workspace-scoped developer surface and supports all three trust modes — **Local**, **BYOK**, and **Managed Cloud** — with explicit selection and visible provider labels. Settings must never silently promote a Local session to BYOK or Cloud; Local→BYOK is an explicit fork (context selection, secret scan, payload preview, provider label, consent). Extension settings live in the `agiWorkforce.*` namespace via `contributes.configuration` and are read through VS Code's standard settings machinery, so they honor user/workspace/folder scope and Settings Sync where VS Code allows it. Handoff to app chat is explicit and redacted; no setting enables automatic sync of IDE context into Web/Mobile/Desktop chat history.

## General

The extension contributes 26 configuration keys under `agiWorkforce.*` (`apps/extension-vscode/package.json` → `contributes.configuration.properties`) ✅. Core behavior settings: `agiWorkforce.model` (default `auto-economy`; resolved from `packages/types/src/models.json`, never a hardcoded ID), `agiWorkforce.streamingEnabled`, `agiWorkforce.contextLines`, `agiWorkforce.fallbackToVscodeLm`, `agiWorkforce.codeLensEnabled`, `agiWorkforce.hoverEnabled`, `agiWorkforce.inlineCompletions.{enabled,debounceMs,maxLength}`, `agiWorkforce.agent.{mode,effort,thinking,maxIterations}`, and `agiWorkforce.mcp.enabled` ✅. Requirements: every setting has a `default`, numeric ranges use `minimum`/`maximum`, and enum settings enumerate `enumDescriptions`. The `agiWorkforce.tier` enum still lists removed tiers (`hobby`, `pro_plus`) 🟡 — it must be reconciled to the canonical ladder (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise) as part of the tracked `packages/types/src/billing-catalog.ts` reconciliation. The `agiWorkforce.openInviteCodeModal` command ("Unlock Cloud Features") is a legacy invite gate 🟡 — Managed Cloud is public alpha, open by default for signed-in users, so this must not gate access. Cross-surface **settings sync is allowlist-gated and lands last** 🔭; until then extension settings are device/workspace-scoped.

## Theme

The sidebar webview and inline UI inherit the active VS Code color theme rather than shipping a bespoke theme picker; command and view icons use built-in codicons (`$(...)`) declared in `contributes.commands` ✅. Theme-token correctness is guarded by `apps/extension-vscode/scripts/check-vscode-theme-tokens.mjs` via the `check:vscode-theme-tokens` script ✅, and shared visual tokens come from `@agiworkforce/design-tokens` (declared in `package.json` dependencies) ✅. Requirements: webview CSS must reference VS Code theme CSS variables (foreground/background/border/accent) so light, dark, and high-contrast themes render legibly with sufficient contrast; no hardcoded hex that breaks a theme. A dedicated in-extension theme/appearance picker is **not** built 🔭 — theme follows the editor.

## Keyboard Shortcuts

Keybindings are declared in `contributes.keybindings` (14 bindings) with mac/win/linux keys and `when` clauses ✅. Notable: `agi-workforce.chat` on `cmd/ctrl+shift+a` is intentionally dual-bound with `agi-workforce.acceptCurrentDiff` via mutually exclusive `when` guards (`!agi-workforce.hasDiff` vs `agi-workforce.hasDiff && editorTextFocus`) — this is by design, not a duplicate-binding bug. `agi-workforce.cycleAgentMode` binds `shift+tab` scoped to `agi-workforce.sidebarFocus || agi-workforce.chatFocus`. Requirements: every binding carries a `when` clause where it could collide with editor defaults; users rebind through VS Code's native Keyboard Shortcuts editor (the extension does not fork keybinding storage). Diff accept/reject bindings (`acceptCurrentDiff`, `rejectCurrentDiff`, `acceptAllDiffsGlobal`, `rejectAllDiffsGlobal`, `rejectDiff` on `escape`) are gated on `agi-workforce.hasDiff` so they never fire outside a review flow ✅.

## Providers

Provider/model selection is exposed through `agiWorkforce.model`, `agiWorkforce.providerStreamProvider` (enum: `auto`, `anthropic`, `openai`, `google`, `ollama`, `ollama-cloud`, `xai`, `deepseek`, `perplexity`, `qwen`, `moonshot`, `zhipu`, `lmstudio`, `custom`), `agiWorkforce.apiEndpoint`, and `agiWorkforce.gatewayUrl` ✅, plus the model picker under `apps/extension-vscode/src/features/model-picker`. Model IDs must resolve from `packages/types/src/models.json` — settings store provider/model **selectors**, never invented IDs. BYOK keys are entered via the `AGI Workforce: Set API Key` command and stored in VS Code `SecretStorage`, never in settings JSON: `getApiKey`/`setApiKey`/`clearApiKey` in `apps/extension-vscode/src/utils/api.ts` take a `vscode.SecretStorage` handle ✅. BYOK is permitted on this surface (Desktop/CLI/VS Code only). Requirements: the active trust mode and provider are labeled visibly in-session; switching a Local session to a BYOK/Cloud provider is an explicit consent-gated fork. The provider-stream path (`agiWorkforce.useProviderStream` → `/api/v1/providers/:id/stream`) depends on AGI web auth that is **not yet wired** in the extension 🟡 (per the setting's own description).

## Permissions

Agent-action permissions are governed by `agiWorkforce.agent.mode` (`ask` | `auto` | `plan` | `bypass`), `agiWorkforce.autoApplyFixes`, and `agiWorkforce.agent.autoApply` ✅. Workspace-trust permissions are declared in `capabilities.untrustedWorkspaces` with `supported: "limited"`: in untrusted workspaces, `apiEndpoint`, `gatewayUrl`, `cliPath`, `systemPrompt`, `agent.autoApply`, `autoApplyFixes`, `telemetryEndpoint`, and `tier` cannot be overridden by workspace settings, and **agent-mode file writes are disabled until the workspace is trusted** ✅. Requirements: `bypass` mode must surface a clear, revocable warning and never be silently defaulted; risky settings that steer network endpoints or file writes stay in the `restrictedConfigurations` list. Remote control of an editor session from phone/web (Claude Code `/remote-control` parity) is 🔭.

## Privacy

Telemetry is **off by default**: `agiWorkforce.telemetryEnabled` defaults to `false` and `agiWorkforce.telemetryEndpoint` is a restricted configuration ✅. Outbound telemetry is scrubbed by `redactSecrets`/`redactProperties` in `apps/extension-vscode/src/core/telemetry.ts` (Bearer-token and secret patterns) ✅, covered by `src/__tests__/telemetryRedaction.test.ts`. Requirements: no chat content, file bodies, or secrets in telemetry; IDE context never auto-syncs into app chat history (any handoff to app chat is explicit and redacted). Local/BYOK sessions and their data never enter Neon delta-sync — that path is Managed-Cloud chats only, Web↔Mobile↔Desktop.

## Security

BYOK keys live only in VS Code `SecretStorage` (`src/utils/api.ts`) ✅. The desktop bridge reuses the shared token at `~/.agiworkforce/bridge-token`, enforced `0600`, read via `readBridgeToken` in `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — the reader refuses group/world-readable files and opens-then-fstats a single fd to close a TOCTOU race ✅. Transport is `ws://127.0.0.1:8787/ws` (localhost, outbound), with a stated migration target of Unix domain socket / named pipe behind `agiWorkforce.desktopBridge.transport` 🔭. Requirements: endpoint/gateway/CLI-path/system-prompt overrides stay untrusted-workspace-restricted; secret material never lands in settings, logs, or telemetry.

## Repository map

- `apps/extension-vscode/package.json` — `contributes.configuration`, `contributes.keybindings`, `capabilities.untrustedWorkspaces`.
- `apps/extension-vscode/src/utils/api.ts` — SecretStorage key get/set/clear.
- `apps/extension-vscode/src/core/telemetry.ts` — telemetry + secret redaction.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — bridge token + transport.
- `apps/extension-vscode/src/features/model-picker/` — provider/model selection.
- `apps/extension-vscode/scripts/check-vscode-theme-tokens.mjs` — theme-token guard.
- `packages/types/src/models.json` — model ID source of truth.

## Competitor notes

Claude Code and Codex IDE extensions expose a mostly single-vendor settings surface (their own account, model family, approval mode) with editor-native keybindings and workspace trust. AGI deliberately diverges: **multi-provider** selection from a governed catalog, **BYOK** where the trust matrix allows it (Desktop/CLI/VS Code — never Web/Mobile), **per-surface trust** with an explicit Local→BYOK fork, and **local-first** privacy (telemetry off by default, keys in SecretStorage, bridge staying on localhost). Where competitors default to cloud, AGI keeps Local and BYOK as first-class free access modes with visible provider labels.

## Acceptance / Definition of Done

Settings are production-ready when every key has a default, is scoped/restricted correctly, and matches the canonical trust and pricing model.

- [ ] Build: `pnpm --filter agi-workforce typecheck` and `check:vscode-theme-tokens` pass; every `agiWorkforce.*` key documents its default/range/enum.
- [ ] Trust: no setting silently routes Local→BYOK/Cloud; active provider/trust mode is labeled; `agiWorkforce.tier` enum reconciled to Free/Basic/Pro/Max/Enterprise (no `hobby`/`pro_plus`).
- [ ] Security/Privacy: BYOK keys only in SecretStorage; telemetry off by default and redacted; endpoint/gateway/CLI/system-prompt/telemetry/tier remain untrusted-workspace-restricted; bridge token 0600 enforced.

## Anti-patterns

- Storing API keys in settings JSON or `globalState` instead of `SecretStorage`.
- Hardcoding a model ID instead of resolving from `packages/types/src/models.json`.
- Referencing removed tiers ("Plus", `pro_plus`, "Hobby") or inventing INR prices for Pro/Max; offering credit top-ups.
- Auto-syncing IDE context into app chat, or routing Local/BYOK data into Neon delta-sync.
- Enabling telemetry or `agent.mode: bypass` by default, or without a clear warning.
- Removing settings from `restrictedConfigurations`, exposing the bridge beyond localhost without the socket migration, or referencing Supabase (fully migrated away — use Clerk + Neon + Stripe).
