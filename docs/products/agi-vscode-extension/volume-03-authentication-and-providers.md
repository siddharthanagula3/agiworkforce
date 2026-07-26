# AGI VS Code Extension — Volume 03 — Authentication & Providers

Status: Current implementation notes
Owner: Founder + platform lead
Last updated: 2026-07-25

Authority: `AGENTS.md`, `apps/extension-vscode/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `docs/surfaces/vscode-extension.md`. Grounded in real repo paths: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/utils/api.ts`, `apps/extension-vscode/src/features/account-auth/deviceAuth.ts`, `apps/extension-vscode/src/core/commandSetup.ts`, `apps/extension-vscode/src/data/usageMeter.ts`, `apps/extension-vscode/src/integrations/providerStreamClient.ts`, `apps/extension-vscode/src/features/model-picker/modelConstants.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `packages/contracts/types/src/models.json`.

## Overview & stance

The VS Code extension is the IDE-native developer surface: workspace-scoped, editor-embedded, and the only place besides Desktop and CLI where **all three trust modes coexist** — Local (on-device runtime), BYOK (user-supplied provider keys), and Managed Cloud (public alpha, open by default for signed-in users). This volume specifies how a developer authenticates to AGI Cloud, how BYOK keys are stored and selected, and how local model backends are wired.

Three rules shape every requirement here. First, **secrets never touch plaintext state** — auth tokens and API keys live in VS Code `SecretStorage`, never in `settings.json`, `globalState`, or logs. Second, **mode selection is explicit and labeled** — the active trust mode (Local / BYOK / Managed) is always visible, and Local sessions are never silently promoted to BYOK or Cloud. Third, **the extension stays workspace/task-scoped** — signing in enables Managed Cloud calls, but IDE context is not auto-synced into Web/Mobile/Desktop app chat history; any handoff is explicit and redacted.

## AGI Subscription

### Login

Sign-in uses a secretless RFC-8628-style device flow ✅ (`apps/extension-vscode/src/features/account-auth/deviceAuth.ts`, command `agi-workforce.signIn` in `package.json`). A public Marketplace extension cannot ship a client secret, so the flow derives a stable `device_id`/`fingerprint` from `vscode.env.machineId` plus a per-install salt, opens the AGI web connect page for the signed-in user to approve, then polls `POST /api/device/poll` until it returns `{status:'approved', access_token}`. The returned Clerk token is stored via `setAccountToken` into SecretStorage ✅ (`apps/extension-vscode/src/utils/api.ts`). Auth is **Clerk + Neon + Stripe** — no Supabase, no custom URI scheme (so it works identically in VS Code, Cursor, Windsurf, Antigravity).

### Logout

`agi-workforce.signOut` clears the account token from SecretStorage via `clearAccountToken(context.secrets)` ✅ (`apps/extension-vscode/src/core/commandSetup.ts`). Requirement: logout must delete the token key, drop the cached tier, and return the surface to BYOK/Local without leaving residual bearer material in `globalState`.

### Subscription Verification

After sign-in the extension resolves the plan from the account/server: `fetchTierInfo(secrets)` calls the canonical percentage-only usage endpoint with the bearer token and caches the result (`apps/extension-vscode/src/utils/api.ts`; `tierStatus.cachedTier` in `globalState` at `apps/extension-vscode/src/extension.ts`). Commands `agi-workforce.showTierStatus` and `agi-workforce.showAccountUsage` render it. The extension override and usage meter preserve `local`, `byok`, `free`, `basic`, `pro`, `team`, `max`, `max_15x`, and `enterprise`; legacy `hobby`/`pro_plus` server values are normalized but are not shown as selectable tiers. The model picker disables plans' unreachable rows, and command/webview handlers reject forged locked selections; the server remains authoritative. There is no checkout inside the extension.

### Usage Limits

Usage is metered and classified by source ✅ (`apps/extension-vscode/src/data/usageMeter.ts`): local-provider models report `unbounded`, a Managed tier reports quota fields from the server, and BYOK reports `user-api-key` with **no invented quota**. Token accounting is surfaced by `agi-workforce.showTokenBreakdown`, `agi-workforce.modelDashboard`, and reset via `agi-workforce.resetTokenCounter` (`package.json`). Requirement: the extension must never fabricate limits for BYOK/Local; only the server is authoritative for Managed quota. No credit top-ups exist (policy).

## BYOK

### API Keys

BYOK keys are stored in `SecretStorage` via `setApiKey`/`getApiKey`/`clearApiKey` under key `agiWorkforce.apiKey` ✅ (`apps/extension-vscode/src/utils/api.ts`, commands `agi-workforce.setApiKey`/`clearApiKey`). Today this single key is treated as a legacy gateway credential (dormant during the account-token transition — `getAuthToken` prefers the account token, then falls back to this key). **Per-provider key vaulting** (distinct Anthropic/OpenAI/Google keys, each labeled) is 🔭. BYOK is available on Desktop/CLI/VS Code only — never Web or Mobile.

### Provider Configuration

Provider selection follows the selected catalog model; the removed `agiWorkforce.providerStreamProvider` selector can no longer create invalid model/provider pairs. `agiWorkforce.useProviderStream` opts cloud-backed editor utilities into the account-authenticated `/api/v1/providers/:id/stream` path for supported providers (`anthropic | openai | ollama | google`). `chatCompletion` actually branches to this path, `streamChatCompletionViaProvider` reads the device-flow account token from SecretStorage, and unsupported provider/model combinations fail visibly. This setting does not affect the local `@agi`, sidebar, or editor developer sessions, which are owned by the app-server. Model IDs come only from `packages/contracts/types/src/models.json`.

### Multiple Providers

The model picker (`agi-workforce.selectModel`, `apps/extension-vscode/src/features/model-picker/`) reads the governed provider catalog, marks local providers with a home glyph, and resolves plain `auto` per task and tier. The sidebar labels the Local host plus the resolved provider or “Auto routing.” A catalog-model change that stays on the same provider preserves the runtime thread. A provider-boundary change starts a new thread, does not forward the earlier transcript, and emits a visible session notice. Any future feature that forwards existing Local context to BYOK or Cloud must add the full context-selection, secret-scan, payload-preview, and consent ceremony first.

### Environment Variables

Endpoint/gateway overrides are configurable but hardened: `apiEndpoint`, `gatewayUrl`, `cliPath`, `autoApplyFixes`, `telemetryEndpoint`, and `tier` are in `capabilities.untrustedWorkspaces.restrictedConfigurations` and cannot be overridden by an untrusted workspace (`apps/extension-vscode/package.json`). The manifest no longer claims nonexistent `systemPrompt` or `agent.autoApply` settings. Importing provider keys from shell environment variables is not supported; credentials come from SecretStorage. The desktop bridge token is file-based at `~/.agiworkforce/bridge-token` (0600), not an environment variable.

## Local Models

### Ollama

Ollama models are detected as local (`ollama/` prefix → `unbounded`) and are discovered through the workspace app-server's `model/list` response. The extension does not open a separate direct `127.0.0.1:11434` connection; the local runtime owns provider configuration, health, and inference. The account-authenticated provider-stream transport is a separate cloud-utility path and is never used as an implicit local fallback.

### LM Studio

LM Studio is likewise classified as local (`lmstudio/`, `lms/` prefixes) and is discovered through the app-server. A separate extension-owned LM Studio HTTP client is intentionally not required for developer sessions.

### llama.cpp

`llama.cpp` is 🔭 — it is not present in the provider enum or model-picker constants, and no server integration exists in extension source. Adding it requires a local OpenAI-compatible client plus catalog entries; do not claim it as shipped.

### Model Discovery

Managed/manual models come from `packages/contracts/types/src/models.json`. The sidebar also calls the app-server's `model/list` method and merges installed Ollama/LM Studio models into its picker. Discovered local rows are labeled Local, remain within the workspace-scoped runtime, and are not counted against Managed quota.

## Repository map

- `apps/extension-vscode/src/features/account-auth/deviceAuth.ts` — device-flow sign-in.
- `apps/extension-vscode/src/utils/api.ts` — SecretStorage token/key helpers, tier fetch, provider-stream entry.
- `apps/extension-vscode/src/core/commandSetup.ts` — sign-in/out, set/clear key commands.
- `apps/extension-vscode/src/data/usageMeter.ts` — usage classification & limits.
- `apps/extension-vscode/src/integrations/providerStreamClient.ts` — provider stream adapters.
- `apps/extension-vscode/src/features/model-picker/` — model picker & local detection.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — localhost bridge + token.
- `apps/extension-vscode/package.json` — commands, settings, untrusted-workspace restrictions.
- `packages/contracts/types/src/models.json` — model catalog SSOT.

## Competitor notes

Claude Code and Codex IDE extensions authenticate to a single first-party account and route inference through that vendor's cloud; keys and model choice are effectively fixed to one provider. AGI's deliberate divergence: **multi-provider by design** (catalog from `models.json`), **BYOK where the trust boundary allows** (Desktop/CLI/VS Code only), **per-surface trust modes** with visible labels, and **local-first** backends (Ollama/LM Studio, llama.cpp planned) so a developer can run entirely on-device with no cloud dependency. Where competitors assume "signed in = cloud," AGI keeps Local and BYOK as free access modes that never require an account.

## Acceptance / Definition of Done

Production-ready when sign-in/out, tier verification, BYOK key storage, and at least one live local backend all work with visible trust labels and no plaintext secret leakage.

- [ ] **Build:** `pnpm --filter agi-workforce typecheck` and `pnpm --filter agi-workforce test` pass; sign-in device flow and `fetchTierInfo` covered by tests.
- [ ] **Trust:** active host/provider is visible; Local is never auto-routed to BYOK/Cloud; prior transcript context is not forwarded across a provider-boundary reset; the extension tier enum contains only current access modes.
- [ ] **Security:** all tokens/keys in SecretStorage only; endpoint overrides blocked in untrusted workspaces; no key read from `process.env` without explicit consent; no secret in logs.

## Anti-patterns

- Storing tokens or API keys in `settings.json` or `globalState` instead of `SecretStorage`.
- Silently routing a Local chat/file to BYOK or Managed Cloud, or hiding the active provider label.
- Hardcoding or inventing model IDs instead of reading `packages/contracts/types/src/models.json`.
- Referencing removed tiers (`Plus`, `pro_plus`, `Hobby`) or inventing INR prices for Pro/Max; adding credit top-ups.
- Referencing Supabase or renaming `proxy.ts` to `middleware.ts` on the web side.
- Claiming llama.cpp as shipped, or claiming direct extension-owned Ollama/LM Studio HTTP clients; local discovery and inference are app-server-owned.
- Auto-syncing IDE workspace context into Web/Mobile/Desktop app chat history.
