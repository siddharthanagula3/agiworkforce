# AGI VS Code Extension — Volume 15 — Inference Providers

Status: Current implementation notes
Owner: Founder + platform lead
Last updated: 2026-07-25

Authority: `AGENTS.md` (root) and `apps/extension-vscode/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `docs/surfaces/vscode-extension.md`; and real repo paths: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/features/model-picker/modelConstants.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `apps/extension-vscode/src/core/commandSetup.ts`, `packages/ai/providers/`, `packages/contracts/types/src/models.json`.

## Overview & stance

This volume defines how the AGI VS Code extension reaches inference: through the AGI Managed-Cloud subscription, through user-supplied keys (BYOK), and through local runtimes. VS Code is a full trust surface — **Local + BYOK + Managed Cloud** — but each mode is a distinct trust boundary with an explicit, visibly-labeled selection. The extension is workspace-scoped: there is **no automatic app-chat sync**, and any handoff to app chat is explicit and redacted (Volume-cross-ref: sync/trust volumes).

The model picker never hardcodes model IDs. `modelConstants.ts` derives every managed option from the shared catalog in `packages/contracts/types/src/models.json` via `@agiworkforce/types` helpers (`getCoreManualModelOptions`, `getModelMetadataById`, `getModelContextLimits`, `getModelCostRates`) ✅. The workspace app-server supplies installed local models through `model/list`. There is no independent provider selector: provider-stream utilities infer the provider from the selected catalog model, while developer-session inference remains app-server-owned.

## AGI subscription (Managed Cloud): included models

The Managed-Cloud subscription ladder is the canon ladder — used everywhere, no other tiers:

| Plan       | USD / mo      | INR / mo  | Notes                                  |
| ---------- | ------------- | --------- | -------------------------------------- |
| Free       | $0            | ₹0        | Entry cloud chat, limited usage.       |
| Basic      | $8            | ₹399      | Entry paid tier (US + India).          |
| Pro        | $20           | (INR TBD) | Main paid tier.                        |
| Max        | $100 and $200 | (INR TBD) | Two power tiers (usage/limits/models). |
| Enterprise | custom        | custom    | Org controls, SSO, seats, contracts.   |

Local and BYOK are **free access modes**, not plans. BYOK catalog rows remain selectable because the app-server performs provider/key admission; Local mode exposes only CLI-discovered local models. Managed developer access starts at Pro, so Local, Free, and Basic do not receive a fake managed-model selection. Pro/Max model admission is resolved from the shared catalog: the picker disables unreachable Auto/manual rows, and both command and webview handlers reject forged locked selections. Plain `auto` is classified from each developer turn and resolved within the active BYOK or managed tier. The server remains authoritative. Managed Cloud is public alpha, open by default for signed-in users; sign-in uses device auth.

### Usage

Metered usage is the model; **no credit top-ups** (policy). The extension exposes read-side usage: `agi-workforce.showAccountUsage`, `agi-workforce.showTierStatus`, `agi-workforce.showTokenBreakdown`, `agi-workforce.modelDashboard`, and `agi-workforce.resetTokenCounter` ✅ (`apps/extension-vscode/package.json`; token/cost estimation via `MODEL_COST_RATES`/`MODEL_CONTEXT_LIMITS` in `modelConstants.ts`). Tier is fetched on activation via `fetchTierInfo(context.secrets)` ✅ (`apps/extension-vscode/src/core/commandSetup.ts`). Local and BYOK sessions must not draw against managed-cloud usage.

### Billing

Billing is **Stripe on the web account** (`agiworkforce.com/pricing`); the extension performs **no in-editor checkout**. The extension tier override preserves `local`, `byok`, `free`, `basic`, `pro`, `team`, `max`, `max_15x`, and `enterprise`. The compatibility command id `agi-workforce.openInviteCodeModal` is labeled “Sign In to AGI Cloud” and directly starts device sign-in; it is not an invite/waitlist gate.

## BYOK (Desktop / CLI / VS Code only)

BYOK is sanctioned on VS Code. A legacy gateway API key is stored in VS Code SecretStorage via `agi-workforce.setApiKey` / `clearApiKey`. `agiWorkforce.useProviderStream` is a separate, opt-in account-authenticated transport for cloud-backed editor utilities; `chatCompletion` is wired to it and the provider is inferred from the selected model. It does not reroute local `@agi`, sidebar, or editor sessions. The sidebar labels the Local host and provider/Auto routing; a provider-boundary selection starts a new thread, does not forward the earlier transcript, and emits a visible session notice. Any future feature that forwards existing Local context must implement the complete context-selection, secret-scan, payload-preview, and consent ceremony first.

### OpenAI

✅ Catalog `gpt-*`/`o*` rows route through the app-server for developer sessions. The opt-in cloud-utility provider stream supports OpenAI and infers it from the selected model. A direct per-provider key vault remains planned.

### Anthropic

✅ Catalog `claude-*` rows route through the app-server; the opt-in cloud-utility provider stream supports Anthropic. `agent.effort` applies to developer sessions. `agent.thinking` is explicitly scoped to legacy cloud-backed editor utilities.

### Google

✅ Catalog `gemini-*` rows route through the app-server; the opt-in cloud-utility provider stream supports Google.

### xAI

🟡 Catalog `grok-*` rows are available to the app-server subject to plan/provider configuration. The optional editor-utility provider stream does not support xAI and fails visibly instead of silently changing providers.

### OpenRouter

🔭 A registry entry exists (`open_router`) in `packages/contracts/types/src/models.json`, but the optional extension editor-utility stream has no OpenRouter adapter. Planned aggregator BYOK.

### Groq

🔭 Registry entry `groq` exists in `models.json`, but the optional extension editor-utility stream has no Groq adapter.

### Together

🔭 Registry entry `together` exists in `models.json`, but the optional extension editor-utility stream has no Together adapter.

### DeepSeek

🟡 Catalog rows are available to the app-server subject to plan/provider configuration. The optional extension editor-utility stream has no DeepSeek adapter.

## Local (on-device runtime)

Local runs on-device and is never silently routed to BYOK or Cloud. The workspace app-server owns inference and returns installed local models through `model/list`; the sidebar merges them into the catalog picker with Local labels. Static catalog rows that declare `requiresEnvironment` remain fail-closed until a real environment-availability signal exists. The optional Desktop bridge (`ws://127.0.0.1:8787/ws`, token `~/.agiworkforce/bridge-token` 0600) is a separate explicit integration.

### Ollama

✅ The app-server discovers installed Ollama models and owns their inference. The extension classifies `ollama/` IDs as local and unmetered; it does not maintain a duplicate direct Ollama HTTP client.

### LM Studio

✅ The app-server discovers installed LM Studio models and owns their inference. The extension classifies `lmstudio/` and `lms/` IDs as local and unmetered.

### llama.cpp

🔭 No `packages/ai/providers/llamacpp` client, no registry entry, no enum value. Planned local runtime.

## Repository map

- `apps/extension-vscode/package.json` — provider/model transport settings, tier enum, commands.
- `apps/extension-vscode/src/features/model-picker/` — catalog-driven picker (`modelConstants.ts`, `modelMetrics.ts`, `index.ts`).
- `apps/extension-vscode/src/core/commandSetup.ts`, `src/utils/api.ts` — key storage, sign-in, tier/usage fetch.
- `apps/extension-vscode/src/features/account-auth/deviceAuth.ts`, `src/features/cloud-bridge/` — cloud auth + (stale) invite modal.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — localhost bridge to local/desktop compute.
- `packages/ai/providers/{anthropic,openai,google,xai,deepseek,perplexity,ollama,lmstudio}` — provider clients.
- `packages/contracts/types/src/models.json` — SSOT model catalog + provider registry.

## Competitor notes

Claude Code (VS Code) and Codex IDE bind to a single first-party account/provider. AGI's deliberate divergence: **multi-provider by catalog** (model picker reads `models.json`, not a fixed list), **BYOK where the trust boundary allows it** (Desktop/CLI/VS Code only — never Web or Mobile), **local-first** (Ollama/LM Studio/llama.cpp targets, on-device inference that never leaks to cloud), and **per-surface trust** with visible provider labels. AGI competes on "your models, no markup, private, everywhere," not on a single frontier model.

## Acceptance / Definition of Done

Production-ready when: the picker only ever shows catalog-derived IDs; the active provider/mode is visibly labeled at all times; Local content cannot reach a BYOK key or Cloud without the fork ceremony; BYOK keys live only in SecretStorage; and usage/billing read-outs match the canon ladder.

- [ ] Build: model picker sourced entirely from `models.json`; no hardcoded model IDs; `pnpm --filter agi-workforce test` green.
- [ ] Trust: Local / BYOK / Managed selection is explicit and labeled; Local→BYOK fork (context selection, secret scan, payload preview, consent) enforced before any provider-key call.
- [ ] Security/billing: credentials in SecretStorage only; no in-editor checkout; extension tier enum contains only current access modes; legacy invite command routes to sign-in.

## Anti-patterns

- Hardcoding or inventing model IDs instead of reading `packages/contracts/types/src/models.json`.
- Silently routing Local chats/files to BYOK or Cloud, or skipping the fork ceremony and provider label.
- Claiming OpenRouter, Groq, Together, or llama.cpp are shipped — they have no client package and no extension wiring (🔭).
- Reintroducing retired tiers (`hobby`, `pro_plus`, "Plus", "Hobby") or credit top-ups; offering BYOK on Web or Mobile.
- Referencing Supabase (fully migrated away); the stack is Clerk + Neon + Stripe.
- Treating the invite/waitlist modal as an access gate — Managed Cloud is open by default for signed-in users.
