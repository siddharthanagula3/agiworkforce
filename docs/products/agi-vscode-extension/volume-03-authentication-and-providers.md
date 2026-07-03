# AGI VS Code Extension — Volume 03 — Authentication & Providers

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/extension-vscode/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `docs/surfaces/vscode-extension.md`. Grounded in real repo paths: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/utils/api.ts`, `apps/extension-vscode/src/features/account-auth/deviceAuth.ts`, `apps/extension-vscode/src/core/commandSetup.ts`, `apps/extension-vscode/src/data/usageMeter.ts`, `apps/extension-vscode/src/integrations/providerStreamClient.ts`, `apps/extension-vscode/src/features/model-picker/modelConstants.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `packages/types/src/models.json`.

## Overview & stance

The VS Code extension is the IDE-native developer surface: workspace-scoped, editor-embedded, and the only place besides Desktop and CLI where **all three trust modes coexist** — Local (on-device runtime), BYOK (user-supplied provider keys), and Managed Cloud (public alpha, open by default for signed-in users). This volume specifies how a developer authenticates to AGI Cloud, how BYOK keys are stored and selected, and how local model backends are wired.

Three rules shape every requirement here. First, **secrets never touch plaintext state** — auth tokens and API keys live in VS Code `SecretStorage`, never in `settings.json`, `globalState`, or logs. Second, **mode selection is explicit and labeled** — the active trust mode (Local / BYOK / Managed) is always visible, and Local sessions are never silently promoted to BYOK or Cloud. Third, **the extension stays workspace/task-scoped** — signing in enables Managed Cloud calls, but IDE context is not auto-synced into Web/Mobile/Desktop app chat history; any handoff is explicit and redacted.

## AGI Subscription

### Login

Sign-in uses a secretless RFC-8628-style device flow ✅ (`apps/extension-vscode/src/features/account-auth/deviceAuth.ts`, command `agi-workforce.signIn` in `package.json`). A public Marketplace extension cannot ship a client secret, so the flow derives a stable `device_id`/`fingerprint` from `vscode.env.machineId` plus a per-install salt, opens the AGI web connect page for the signed-in user to approve, then polls `POST /api/device/poll` until it returns `{status:'approved', access_token}`. The returned Clerk token is stored via `setAccountToken` into SecretStorage ✅ (`apps/extension-vscode/src/utils/api.ts`). Auth is **Clerk + Neon + Stripe** — no Supabase, no custom URI scheme (so it works identically in VS Code, Cursor, Windsurf, Antigravity).

### Logout

`agi-workforce.signOut` clears the account token from SecretStorage via `clearAccountToken(context.secrets)` ✅ (`apps/extension-vscode/src/core/commandSetup.ts`). Requirement: logout must delete the token key, drop the cached tier, and return the surface to BYOK/Local without leaving residual bearer material in `globalState`.

### Subscription Verification

After sign-in the extension resolves the plan from the account/server: `fetchTierInfo(secrets)` calls the tier endpoint with the bearer token and caches the result 🟡 (`apps/extension-vscode/src/utils/api.ts`; `tierStatus.cachedTier` in `globalState` at `apps/extension-vscode/src/extension.ts`). Commands `agi-workforce.showTierStatus` and `agi-workforce.showAccountUsage` render it. **Gap:** the `agiWorkforce.tier` override enum and `usageMeter.ts` still encode the removed `hobby`/`pro_plus` tiers, which contradict the canon ladder (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise). Reconciling `packages/types/src/billing-catalog.ts` and these enums to the founder pricing model is a separate tracked task (🟡). Plans and model-by-plan gating are always verified server-side; there is no checkout inside the extension.

### Usage Limits

Usage is metered and classified by source ✅ (`apps/extension-vscode/src/data/usageMeter.ts`): local-provider models report `unbounded`, a Managed tier reports quota fields from the server, and BYOK reports `user-api-key` with **no invented quota**. Token accounting is surfaced by `agi-workforce.showTokenBreakdown`, `agi-workforce.modelDashboard`, and reset via `agi-workforce.resetTokenCounter` (`package.json`). Requirement: the extension must never fabricate limits for BYOK/Local; only the server is authoritative for Managed quota. No credit top-ups exist (policy).

## BYOK

### API Keys

BYOK keys are stored in `SecretStorage` via `setApiKey`/`getApiKey`/`clearApiKey` under key `agiWorkforce.apiKey` ✅ (`apps/extension-vscode/src/utils/api.ts`, commands `agi-workforce.setApiKey`/`clearApiKey`). Today this single key is treated as a legacy gateway credential (dormant during the account-token transition — `getAuthToken` prefers the account token, then falls back to this key). **Per-provider key vaulting** (distinct Anthropic/OpenAI/Google keys, each labeled) is 🔭. BYOK is available on Desktop/CLI/VS Code only — never Web or Mobile.

### Provider Configuration

Provider routing is configured by `agiWorkforce.providerStreamProvider` (enum includes `auto`, `anthropic`, `openai`, `google`, `ollama`, `ollama-cloud`, `xai`, `deepseek`, `perplexity`, `qwen`, `moonshot`, `zhipu`, `lmstudio`, `custom`) plus `agiWorkforce.gatewayUrl` 🟡 (`apps/extension-vscode/package.json`). The provider-stream client currently wires only `anthropic | openai | ollama | google` (`apps/extension-vscode/src/integrations/providerStreamClient.ts`), and `streamChatCompletionViaProvider` throws "not available in the VS Code extension yet" — account-gated provider streaming is 🔭. Model IDs come only from `packages/types/src/models.json`; the extension must not hardcode or invent them.

### Multiple Providers

The model picker (`agi-workforce.selectModel`, `apps/extension-vscode/src/features/model-picker/`) is auto-balanced across the provider catalog and marks local providers with a home glyph 🟡. In-thread multi-provider switching with per-provider BYOK keys and a visible provider label on every response is 🔭. Any Local→BYOK or Local→Cloud transition must be an explicit fork (context selection, secret scan, payload preview, consent, visible provider label) — never automatic.

### Environment Variables

Endpoint/gateway overrides are configurable but hardened: `apiEndpoint`, `gatewayUrl`, `cliPath`, `systemPrompt`, and `tier` are in `capabilities.untrustedWorkspaces.restrictedConfigurations` and cannot be overridden by an untrusted workspace ✅ (`apps/extension-vscode/package.json`). Importing provider keys from shell environment variables (e.g. an `ANTHROPIC_API_KEY` already exported in the host) is 🔭 — the extension reads keys from SecretStorage, not `process.env`. The desktop bridge token is file-based at `~/.agiworkforce/bridge-token` (0600) ✅ (`apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`), not an env var.

## Local Models

### Ollama

Ollama and Ollama-Cloud are recognized as providers in configuration and detected as local (`ollama/` prefix → `unbounded`) 🟡 (`package.json`, `apps/extension-vscode/src/data/usageMeter.ts`, `apps/extension-vscode/src/features/model-picker/modelConstants.ts`). Direct on-device connection to a running Ollama daemon from the extension is 🔭: no local endpoint client (e.g. `127.0.0.1:11434`) exists in extension source; local access is designed to route through the gateway/provider-stream path, which is not yet wired.

### LM Studio

LM Studio (`lmstudio`) is likewise a recognized provider with local classification (`lmstudio/`, `lms/` prefixes) 🟡 (same paths). Direct connection to an LM Studio OpenAI-compatible local server is 🔭.

### llama.cpp

`llama.cpp` is 🔭 — it is not present in the provider enum or model-picker constants, and no server integration exists in extension source. Adding it requires a local OpenAI-compatible client plus catalog entries; do not claim it as shipped.

### Model Discovery

Static catalog discovery ✅: the model picker enumerates models from `packages/types/src/models.json` and lets the user pick per session. **Live** local-endpoint discovery (querying a running Ollama/LM Studio server for installed models, e.g. `/api/tags`, and merging them into the picker) is 🔭. Requirement: discovered local models must be tagged Local and never counted against Managed quota.

## Repository map

- `apps/extension-vscode/src/features/account-auth/deviceAuth.ts` — device-flow sign-in.
- `apps/extension-vscode/src/utils/api.ts` — SecretStorage token/key helpers, tier fetch, provider-stream entry.
- `apps/extension-vscode/src/core/commandSetup.ts` — sign-in/out, set/clear key commands.
- `apps/extension-vscode/src/data/usageMeter.ts` — usage classification & limits.
- `apps/extension-vscode/src/integrations/providerStreamClient.ts` — provider stream adapters.
- `apps/extension-vscode/src/features/model-picker/` — model picker & local detection.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — localhost bridge + token.
- `apps/extension-vscode/package.json` — commands, settings, untrusted-workspace restrictions.
- `packages/types/src/models.json` — model catalog SSOT.

## Competitor notes

Claude Code and Codex IDE extensions authenticate to a single first-party account and route inference through that vendor's cloud; keys and model choice are effectively fixed to one provider. AGI's deliberate divergence: **multi-provider by design** (catalog from `models.json`), **BYOK where the trust boundary allows** (Desktop/CLI/VS Code only), **per-surface trust modes** with visible labels, and **local-first** backends (Ollama/LM Studio, llama.cpp planned) so a developer can run entirely on-device with no cloud dependency. Where competitors assume "signed in = cloud," AGI keeps Local and BYOK as free access modes that never require an account.

## Acceptance / Definition of Done

Production-ready when sign-in/out, tier verification, BYOK key storage, and at least one live local backend all work with visible trust labels and no plaintext secret leakage.

- [ ] **Build:** `pnpm --filter agi-workforce typecheck` and `pnpm --filter agi-workforce test` pass; sign-in device flow and `fetchTierInfo` covered by tests.
- [ ] **Trust:** active mode (Local/BYOK/Managed) is always visible; Local is never auto-routed to BYOK/Cloud; Local→BYOK is an explicit consented fork; tier enums reconciled to canon pricing (Free/Basic/Pro/Max/Enterprise; no `hobby`/`pro_plus`).
- [ ] **Security:** all tokens/keys in SecretStorage only; endpoint overrides blocked in untrusted workspaces; no key read from `process.env` without explicit consent; no secret in logs.

## Anti-patterns

- Storing tokens or API keys in `settings.json` or `globalState` instead of `SecretStorage`.
- Silently routing a Local chat/file to BYOK or Managed Cloud, or hiding the active provider label.
- Hardcoding or inventing model IDs instead of reading `packages/types/src/models.json`.
- Referencing removed tiers (`Plus`, `pro_plus`, `Hobby`) or inventing INR prices for Pro/Max; adding credit top-ups.
- Referencing Supabase or renaming `proxy.ts` to `middleware.ts` on the web side.
- Claiming Ollama/LM Studio/llama.cpp or account-gated provider streaming as shipped without a wired local/gateway client.
- Auto-syncing IDE workspace context into Web/Mobile/Desktop app chat history.
