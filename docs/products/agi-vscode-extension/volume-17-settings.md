# AGI VS Code Extension — Volume 17 — Settings

Status: Current implementation notes
Owner: Founder + platform lead
Last updated: 2026-07-25

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md`; `apps/extension-vscode/AGENTS.md`; and real repo paths: `apps/extension-vscode/package.json` (`contributes.configuration`, `contributes.keybindings`, `capabilities.untrustedWorkspaces`), `apps/extension-vscode/src/utils/api.ts`, `apps/extension-vscode/src/core/telemetry.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `apps/extension-vscode/scripts/check-vscode-theme-tokens.mjs`, `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies the Settings domain for the AGI VS Code Extension: how a developer configures General behavior, Theme, Keyboard Shortcuts, Providers, Permissions, Privacy, and Security. The extension is the IDE-native, workspace-scoped developer surface and supports all three trust modes — **Local**, **BYOK**, and **Managed Cloud** — with explicit selection and visible provider labels. Settings must never silently promote a Local session to BYOK or Cloud; Local→BYOK is an explicit fork (context selection, secret scan, payload preview, provider label, consent). Extension settings live in the `agiWorkforce.*` namespace via `contributes.configuration` and are read through VS Code's standard settings machinery, so they honor user/workspace/folder scope and Settings Sync where VS Code allows it. Handoff to app chat is explicit and redacted; no setting enables automatic sync of IDE context into Web/Mobile/Desktop chat history.

## General

The extension contributes 24 configuration keys under `agiWorkforce.*` (`apps/extension-vscode/package.json` → `contributes.configuration.properties`) ✅. Core behavior settings include `agiWorkforce.model` (default `auto`; routed using the task and resolved plan), `agiWorkforce.streamingEnabled`, `agiWorkforce.contextLines`, `agiWorkforce.codeLensEnabled`, `agiWorkforce.hoverEnabled`, `agiWorkforce.inlineCompletions.{enabled,debounceMs,maxLength}`, `agiWorkforce.agent.{mode,effort,thinking}`, and `agiWorkforce.mcp.enabled`. Inline completions, MCP, the Desktop bridge, provider-stream transport, and telemetry all default off. The tier override preserves the canonical plan values (`local`, `byok`, `free`, `basic`, `pro`, `team`, `max`, `max_15x`, `enterprise`); retired `hobby` and `pro_plus` values are accepted only when normalizing legacy server data. The compatibility command id `agi-workforce.openInviteCodeModal` is presented as “Sign In to AGI Cloud” and routes directly to device sign-in; it is not an invite or waitlist gate. Cross-surface settings sync remains planned; settings are currently device/workspace-scoped.

## Theme

The sidebar webview and inline UI inherit the active VS Code color theme rather than shipping a bespoke theme picker; command and view icons use built-in codicons (`$(...)`) declared in `contributes.commands` ✅. Theme-token correctness is guarded by `apps/extension-vscode/scripts/check-vscode-theme-tokens.mjs` via the `check:vscode-theme-tokens` script ✅, and shared visual tokens come from `@agiworkforce/design-tokens` (declared in `package.json` dependencies) ✅. Requirements: webview CSS must reference VS Code theme CSS variables (foreground/background/border/accent) so light, dark, and high-contrast themes render legibly with sufficient contrast; no hardcoded hex that breaks a theme. A dedicated in-extension theme/appearance picker is **not** built 🔭 — theme follows the editor.

## Keyboard Shortcuts

Keybindings are declared in `contributes.keybindings` (14 bindings) with mac/win/linux keys and `when` clauses ✅. Notable: `agi-workforce.chat` on `cmd/ctrl+shift+a` is intentionally dual-bound with `agi-workforce.acceptCurrentDiff` via mutually exclusive `when` guards (`!agi-workforce.hasDiff` vs `agi-workforce.hasDiff && editorTextFocus`) — this is by design, not a duplicate-binding bug. `agi-workforce.cycleAgentMode` binds `shift+tab` scoped to `agi-workforce.sidebarFocus || agi-workforce.chatFocus`. Requirements: every binding carries a `when` clause where it could collide with editor defaults; users rebind through VS Code's native Keyboard Shortcuts editor (the extension does not fork keybinding storage). Diff accept/reject bindings (`acceptCurrentDiff`, `rejectCurrentDiff`, `acceptAllDiffsGlobal`, `rejectAllDiffsGlobal`, `rejectDiff` on `escape`) are gated on `agi-workforce.hasDiff` so they never fire outside a review flow ✅.

## Providers

Provider/model selection is exposed through `agiWorkforce.model`, `agiWorkforce.apiEndpoint`, and `agiWorkforce.gatewayUrl`, plus the catalog-driven model picker under `apps/extension-vscode/src/features/model-picker`. There is no independent provider selector: provider-stream routing derives the provider from the selected catalog model, avoiding invalid model/provider pairs. `agiWorkforce.useProviderStream` is an opt-in account-authenticated transport for older cloud-backed editor utilities only; it does not affect the local `@agi`, sidebar, or editor developer sessions. Device sign-in and bearer-token use are wired. A legacy gateway API key can be entered with `AGI Workforce: Set API Key` and is stored in VS Code `SecretStorage`, never settings JSON. The local app-server owns developer-session providers and exposes installed local models through `model/list`. The UI labels the Local host and the resolved provider or “Auto routing”; crossing a live session's provider boundary starts a new runtime thread and visibly states that the earlier transcript was not forwarded. The complete context-selection/payload-preview handoff ceremony remains required before any future feature attempts to forward an existing Local transcript.

## Permissions

Agent-action permissions are governed by `agiWorkforce.agent.mode` (`ask` | `auto` | `plan` | `bypass`) and `agiWorkforce.autoApplyFixes` ✅. Workspace-trust permissions are declared in `capabilities.untrustedWorkspaces` with `supported: "limited"`: `apiEndpoint`, `gatewayUrl`, `cliPath`, `autoApplyFixes`, `telemetryEndpoint`, and `tier` cannot be overridden by an untrusted workspace. The manifest no longer lists nonexistent `systemPrompt` or `agent.autoApply` settings as restricted configurations. Agent-mode file writes remain disabled until the workspace is trusted. `bypass` must surface a clear, revocable warning and never be silently defaulted. Remote control of an editor session from phone/web remains planned.

## Privacy

Telemetry is **off by default**: `agiWorkforce.telemetryEnabled` defaults to `false` and `agiWorkforce.telemetryEndpoint` is a restricted configuration ✅. Outbound telemetry is scrubbed by `redactSecrets`/`redactProperties` in `apps/extension-vscode/src/core/telemetry.ts` (Bearer-token and secret patterns) ✅, covered by `src/__tests__/telemetryRedaction.test.ts`. Requirements: no chat content, file bodies, or secrets in telemetry; IDE context never auto-syncs into app chat history (any handoff to app chat is explicit and redacted). Local/BYOK sessions and their data never enter Neon delta-sync — that path is Managed-Cloud chats only, Web↔Mobile↔Desktop.

## Security

BYOK keys live only in VS Code `SecretStorage` (`src/utils/api.ts`) ✅. The desktop bridge reuses the shared token at `~/.agiworkforce/bridge-token`, enforced `0600`, read via `readBridgeToken` in `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — the reader refuses group/world-readable files and opens-then-fstats a single fd to close a TOCTOU race ✅. Transport is `ws://127.0.0.1:8787/ws` (localhost, outbound), with a stated migration target of Unix domain socket / named pipe behind `agiWorkforce.desktopBridge.transport` 🔭. Requirements: endpoint, gateway, CLI-path, auto-apply, telemetry-endpoint, and tier overrides stay untrusted-workspace-restricted; secret material never lands in settings, logs, or telemetry.

## Repository map

- `apps/extension-vscode/package.json` — `contributes.configuration`, `contributes.keybindings`, `capabilities.untrustedWorkspaces`.
- `apps/extension-vscode/src/utils/api.ts` — SecretStorage key get/set/clear.
- `apps/extension-vscode/src/core/telemetry.ts` — telemetry + secret redaction.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — bridge token + transport.
- `apps/extension-vscode/src/features/model-picker/` — provider/model selection.
- `apps/extension-vscode/scripts/check-vscode-theme-tokens.mjs` — theme-token guard.
- `packages/contracts/types/src/models.json` — model ID source of truth.

## Competitor notes

Claude Code and Codex IDE extensions expose a mostly single-vendor settings surface (their own account, model family, approval mode) with editor-native keybindings and workspace trust. AGI deliberately diverges: **multi-provider** selection from a governed catalog, **BYOK** where the trust matrix allows it (Desktop/CLI/VS Code — never Web/Mobile), **per-surface trust** with an explicit Local→BYOK fork, and **local-first** privacy (telemetry off by default, keys in SecretStorage, bridge staying on localhost). Where competitors default to cloud, AGI keeps Local and BYOK as first-class free access modes with visible provider labels.

## Acceptance / Definition of Done

Settings are production-ready when every key has a default, is scoped/restricted correctly, and matches the canonical trust and pricing model.

- [ ] Build: `pnpm --filter agi-workforce typecheck` and `check:vscode-theme-tokens` pass; every `agiWorkforce.*` key documents its default/range/enum.
- [ ] Trust: no prior transcript is forwarded across a provider-boundary reset; active host/provider is visible; the tier enum preserves all canonical plan values.
- [ ] Security/Privacy: credentials use SecretStorage; telemetry is off by default and redacted; endpoint/gateway/CLI/auto-apply/telemetry/tier remain untrusted-workspace-restricted; bridge token 0600 enforced.

## Anti-patterns

- Storing API keys in settings JSON or `globalState` instead of `SecretStorage`.
- Hardcoding a model ID instead of resolving from `packages/contracts/types/src/models.json`.
- Referencing removed tiers ("Plus", `pro_plus`, "Hobby") or inventing INR prices for Pro/Max; offering credit top-ups.
- Auto-syncing IDE context into app chat, or routing Local/BYOK data into Neon delta-sync.
- Enabling telemetry or `agent.mode: bypass` by default, or without a clear warning.
- Removing settings from `restrictedConfigurations`, exposing the bridge beyond localhost without the socket migration, or referencing Supabase (fully migrated away — use Clerk + Neon + Stripe).
