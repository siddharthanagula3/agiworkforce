# AGI VS Code Extension — Volume 22 — Local Storage

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root), `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`, and real repo paths: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/data/conversationStore.ts`, `apps/extension-vscode/src/data/checkpointManager.ts`, `apps/extension-vscode/src/data/workspaceIndexer.ts`, `apps/extension-vscode/src/data/sendQueue.ts`, `apps/extension-vscode/src/memory/memoryStore.ts`, `apps/extension-vscode/src/platform/config.ts`, `apps/extension-vscode/src/utils/api.ts`, `apps/extension-vscode/src/core/telemetry.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `apps/extension-vscode/src/features/account-auth/deviceAuth.ts`, `apps/extension-vscode/src/integrations/tierResolver.ts`.

## Overview & stance

This volume specifies how the AGI VS Code Extension persists data **on the developer's machine**. The extension is the IDE-native, **workspace-scoped** surface: it supports Local, BYOK, and Managed Cloud with explicit selection and visible labels, but it is **not** a synced chat surface. Neon delta-sync (`apps/web/app/api/{chat,memory,projects}/sync`) is Web ↔ Mobile ↔ Desktop only; the VS Code extension writes **no app-chat tables** and pushes nothing to Neon automatically. Any handoff to app chat is an explicit, redacted user action, never an automatic write.

All persistence therefore rides on VS Code's own storage primitives — `ExtensionContext.globalState` (device/user-scoped), `workspaceState` (per-workspace), `SecretStorage` (OS-keychain-backed), on-disk `globalStorageUri`/`logUri`, git-native snapshots, and `OutputChannel` logs. There is no bespoke database. Local and BYOK data never leave the device except when the user explicitly forks a Local session to BYOK (context selection, secret scan, payload preview, visible provider label, consent) or invokes an explicit cloud action.

## Shared Session Database

There is **no SQLite/embedded database and no app-chat schema**. "Session state" is a set of JSON records in VS Code state stores, each with an explicit key and prune cap:

- Conversations: `globalState` key `agiWorkforce.conversations`, capped at 50 (oldest pruned). ✅ Built — `apps/extension-vscode/src/data/conversationStore.ts`.
- Memory facts: `globalState` key `agiWorkforce.memoryFacts`, device-scoped and **never synced** (VS Code is not a synced chat surface). ✅ Built — `apps/extension-vscode/src/memory/memoryStore.ts` (see the "persisted in globalState ONLY" contract in `src/core/commandSetup.ts`).
- Checkpoint metadata: `globalState` key `agiWorkforce.checkpoints`, capped at 20. ✅ Built — `apps/extension-vscode/src/data/checkpointManager.ts`.
- Sessions history browsing: command `agi-workforce.showSessionsHistory` reads the above. ✅ Built — `apps/extension-vscode/package.json`.

Requirements: every record store MUST declare a stable key, a bounded size, and a deterministic prune order; records MUST NOT contain provider secrets (those live in SecretStorage). A **shared session database with the CLI** (unified developer-session schema in `packages/types` / Rust crates) is a target direction, not wired. 🔭 Planned — per `apps/extension-vscode/AGENTS.md` ("Shared developer-session schemas belong in `packages/types`").

## Configuration

User configuration is the `agiWorkforce.*` settings tree, declared in `package.json` (`contributes.configuration`) and read through typed accessors so defaults live in one place. ✅ Built — `apps/extension-vscode/src/platform/config.ts` (mirrors `package.json` defaults).

Workspace-trust gating is mandatory: in untrusted workspaces the endpoint/gateway/CLI-path/system-prompt/auto-apply/telemetry/tier keys cannot be overridden by workspace settings, and agent file writes are disabled until trust is granted. ✅ Built — `capabilities.untrustedWorkspaces.restrictedConfigurations` in `apps/extension-vscode/package.json`; trust-restricted accessors read `inspect().globalValue` only (`src/utils/api.ts`, `getCloudApiEndpoint`/`getGatewayUrl`).

Requirements: sensitive keys (`apiEndpoint`, `gatewayUrl`, `cliPath`, `systemPrompt`, `agent.autoApply`, `telemetryEndpoint`, `tier`) MUST refuse workspace-scoped overrides when the workspace is untrusted. The default model MUST be a resolver alias (`agiWorkforce.model` default `auto-economy`), never a hardcoded catalog model ID — real IDs resolve only from `packages/types/src/models.json`.

🟡 Partial gap: the `agiWorkforce.tier` enum still encodes removed tiers (`hobby`, `pro_plus`) in `apps/extension-vscode/package.json`. Per canon the tier ladder is Free / Basic ($8·₹399) / Pro ($20) / Max ($100 & $200) / Enterprise; this reconciliation is a separate tracked task (`packages/types/src/billing-catalog.ts`).

## Workspace Cache

Per-workspace derived data lives in `workspaceState` so it never bleeds across projects:

- Workspace index: `workspaceState` key `agiWorkforce.workspaceIndex`, capped at 500 files / 5000 symbols, re-indexed when older than 24h; incremental updates via a `FileSystemWatcher`. ✅ Built — `apps/extension-vscode/src/data/workspaceIndexer.ts`.
- Offline send queue: `workspaceState` key `agiworkforce.queue.vscode` (workspace-scoped, in-flight commands only). ✅ Built — `apps/extension-vscode/src/data/sendQueue.ts`.
- Pinned/auto context files: the Context Files tree tracks the working set. ✅ Built — `apps/extension-vscode/src/features/trees/contextPanelProvider.ts`.

Requirements: cache entries MUST be timestamped and age-bounded; index contents MUST stay derived (safe to delete and rebuild) and MUST NOT be treated as a source of truth or synced anywhere. Cache MUST be cleared on `Clear Context` and rebuilt lazily.

## Provider Configuration

Provider credentials never touch settings JSON or plaintext files — they use VS Code `SecretStorage` (OS keychain):

- BYOK / API key: SecretStorage key `agiWorkforce.apiKey`. ✅ Built — `apps/extension-vscode/src/utils/api.ts` (`getApiKey`/`setApiKey`/`clearApiKey`).
- Managed-Cloud account token: SecretStorage key `agiWorkforce.accountToken`. ✅ Built — `apps/extension-vscode/src/utils/api.ts`.
- Device salt (for anonymized device identity): `globalState` key `agiWorkforce.deviceSalt`. ✅ Built — `apps/extension-vscode/src/features/account-auth/deviceAuth.ts`.
- Provider/model selection: `agiWorkforce.providerStreamProvider` (enum: `auto`, `anthropic`, `openai`, `google`, `ollama`, `ollama-cloud`, `xai`, `deepseek`, `perplexity`, `qwen`, `moonshot`, `zhipu`, `lmstudio`, `custom`) and `agiWorkforce.model`. ✅ Built — `apps/extension-vscode/package.json`.
- Resolved tier cache: `globalState` key `tierStatus.cachedTier`. ✅ Built — `apps/extension-vscode/src/integrations/tierResolver.ts`, `src/extension.ts`.

Requirements: secrets MUST live only in SecretStorage; the three trust modes MUST stay separate; switching a Local session to a BYOK/Cloud provider MUST be an explicit fork with a visible provider label and consent — never silent (see `src/integrations/providerSwitchGuard.ts`). The desktop-bridge token is not stored by the extension: it is read from `~/.agiworkforce/bridge-token` (0600) written by Desktop. ✅ Built — `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` (migration target: Unix domain socket / named pipe).

## Runtime Logs

Diagnostic output uses VS Code `OutputChannel`s and `logUri`, kept local:

- `AGI Workforce: Git`, `AGI Workforce: Patches`, `AGI Workforce: Checkpoints` channels. ✅ Built — `apps/extension-vscode/src/core/commandSetup.ts`, `src/integrations/patchEngine.ts`, `src/data/checkpointManager.ts`.
- Telemetry: VS Code `TelemetryLogger`, **off by default** (`agiWorkforce.telemetryEnabled` default `false`), honoring the global VS Code telemetry setting, with secret redaction applied before send. ✅ Built — `apps/extension-vscode/src/core/telemetry.ts` (`redactSecrets`).

Requirements: logs MUST redact credentials/JWTs/API keys before display or transmission; telemetry MUST be double-gated (global + extension) and default off; no chat content, file contents, or workspace paths beyond anonymized event fields may be transmitted. Logs stay on-device unless the user opts into telemetry.

## Repository map

- `apps/extension-vscode/src/data/` — `conversationStore.ts`, `checkpointManager.ts`, `workspaceIndexer.ts`, `sendQueue.ts`, `tokenCounter.ts`.
- `apps/extension-vscode/src/memory/memoryStore.ts` — device-scoped memory facts.
- `apps/extension-vscode/src/platform/config.ts` — typed `agiWorkforce.*` accessors.
- `apps/extension-vscode/src/utils/api.ts` — SecretStorage credential accessors.
- `apps/extension-vscode/src/integrations/tierResolver.ts`, `providerSwitchGuard.ts` — tier cache, trust-mode guard.
- `apps/extension-vscode/src/core/telemetry.ts` — telemetry + redaction.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — bridge token consumption.
- `apps/extension-vscode/package.json` — settings, untrusted-workspace restrictions.

## Competitor notes

Claude Code and the Codex IDE extension persist workspace-scoped session/config state locally and treat cloud runs as a separate path; Claude Code Remote Control keeps compute on the host ("nothing moves to the cloud"). AGI's deliberate divergence: **multi-provider** credential storage (many providers, no single-vendor lock-in), **BYOK where allowed** (Desktop/CLI/VS Code only), **per-surface trust** (VS Code stays workspace-scoped with no automatic app-chat sync), and **local-first** defaults (telemetry off, secrets in the OS keychain, index rebuildable). Unlike a cloud-first assistant, AGI never silently uploads IDE context.

## Acceptance / Definition of Done

Production-ready when every store has a bounded, keyed, rebuildable contract; secrets exist only in SecretStorage; untrusted workspaces cannot override sensitive keys; and no path writes IDE data to Neon automatically.

- [ ] Build: `pnpm --filter agi-workforce typecheck` and `pnpm --filter agi-workforce test` pass; each state key has a documented cap and prune order.
- [ ] Trust: Local/BYOK/Cloud stay separate; Local→BYOK/Cloud is an explicit, labeled, consented fork; no automatic app-chat sync from the extension.
- [ ] Security: credentials only in SecretStorage; logs/telemetry redact secrets; telemetry double-gated and default off; bridge token permission check (0600) enforced.

## Anti-patterns

- Writing chat/memory/session rows to Neon or any `apps/web/app/api/*/sync` endpoint from the extension.
- Storing API keys, account tokens, or the bridge token in settings JSON, `globalState`, or plaintext files.
- Silently routing a Local session to BYOK or Cloud, or hiding the active provider label.
- Hardcoding a catalog model ID instead of resolving from `packages/types/src/models.json`.
- Reintroducing removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups; referencing Supabase (fully migrated — use Clerk + Neon + Stripe).
- Letting the workspace index or send queue grow unbounded, or treating derived cache as a source of truth.
- Accepting workspace-scoped overrides of sensitive config in untrusted workspaces.
