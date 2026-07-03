# AGI VS Code Extension — Volume 15 — Inference Providers

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (root) and `apps/extension-vscode/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `docs/surfaces/vscode-extension.md`; and real repo paths: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/features/model-picker/modelConstants.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `apps/extension-vscode/src/core/commandSetup.ts`, `packages/providers/`, `packages/types/src/models.json`.

## Overview & stance

This volume defines how the AGI VS Code extension reaches inference: through the AGI Managed-Cloud subscription, through user-supplied keys (BYOK), and through local runtimes. VS Code is a full trust surface — **Local + BYOK + Managed Cloud** — but each mode is a distinct trust boundary with an explicit, visibly-labeled selection. The extension is workspace-scoped: there is **no automatic app-chat sync**, and any handoff to app chat is explicit and redacted (Volume-cross-ref: sync/trust volumes).

The model picker never hardcodes model IDs. `modelConstants.ts` derives every option from the shared catalog in `packages/types/src/models.json` via `@agiworkforce/types` helpers (`getCoreManualModelOptions`, `getModelMetadataById`, `getModelContextLimits`, `getModelCostRates`) ✅ (`apps/extension-vscode/src/features/model-picker/modelConstants.ts`). The provider client set lives in `packages/providers/` (`anthropic`, `openai`, `google`, `xai`, `deepseek`, `perplexity`, `ollama`, `lmstudio`) ✅. Providers not present as a client package or in the extension's `providerStreamProvider` enum are **🔭 Planned** here, not shipped.

## AGI subscription (Managed Cloud): included models

The Managed-Cloud subscription ladder is the canon ladder — used everywhere, no other tiers:

| Plan       | USD / mo      | INR / mo  | Notes                                  |
| ---------- | ------------- | --------- | -------------------------------------- |
| Free       | $0            | ₹0        | Entry cloud chat, limited usage.       |
| Basic      | $8            | ₹399      | Entry paid tier (US + India).          |
| Pro        | $20           | (INR TBD) | Main paid tier.                        |
| Max        | $100 and $200 | (INR TBD) | Two power tiers (usage/limits/models). |
| Enterprise | custom        | custom    | Org controls, SSO, seats, contracts.   |

Local and BYOK are **free access modes**, not plans. Included models per plan are resolved from the catalog and plan gating — the extension surfaces them through the model picker, which reads catalog tier metadata (`getPickerModelTier`, auto-tiers `auto-economy`/`auto-balanced`/`auto-premium`) 🟡 (`modelConstants.ts`; per-plan entitlement gating is catalog/server-driven and not fully enforced in-extension). Managed Cloud is public alpha, open by default for signed-in users; sign-in uses device auth ✅ (`apps/extension-vscode/src/features/account-auth/deviceAuth.ts`).

### Usage

Metered usage is the model; **no credit top-ups** (policy). The extension exposes read-side usage: `agi-workforce.showAccountUsage`, `agi-workforce.showTierStatus`, `agi-workforce.showTokenBreakdown`, `agi-workforce.modelDashboard`, and `agi-workforce.resetTokenCounter` ✅ (`apps/extension-vscode/package.json`; token/cost estimation via `MODEL_COST_RATES`/`MODEL_CONTEXT_LIMITS` in `modelConstants.ts`). Tier is fetched on activation via `fetchTierInfo(context.secrets)` ✅ (`apps/extension-vscode/src/core/commandSetup.ts`). Local and BYOK sessions must not draw against managed-cloud usage.

### Billing

Billing is **Stripe on the web account** (`agiworkforce.com/pricing`); the extension performs **no in-editor checkout** — it reads the resolved plan and links out. 🟡 Gap: `agiWorkforce.tier` in `package.json` still encodes retired tiers (`hobby`, `pro_plus`) and `agi-workforce.openInviteCodeModal` ("Unlock Cloud Features") is a stale invite/waitlist gate; both contradict the canon ladder and the open-by-default alpha and must be reconciled with `packages/types/src/billing-catalog.ts` (separate tracked task).

## BYOK (Desktop / CLI / VS Code only)

BYOK is sanctioned on VS Code. A single API key is stored in VS Code SecretStorage via `agi-workforce.setApiKey` / `clearApiKey` (`getApiKey`/`setApiKey` from `src/utils/api.ts`) ✅ (`apps/extension-vscode/src/core/commandSetup.ts`). The multi-provider `provider-stream` path (`agiWorkforce.useProviderStream`, `agiWorkforce.gatewayUrl`, `agiWorkforce.providerStreamProvider`) exists but its config note states AGI account web auth "is not wired in the VS Code extension yet" 🟡 (`package.json`). The required Local→BYOK **fork ceremony** — context selection, secret scan, payload preview, consent, visible provider label — is **🔭 Planned**; do not route Local content to a provider key without it.

### OpenAI

🟡 Catalog `gpt-*`/`o*` rows + `packages/providers/openai` client + `providerStreamProvider: "openai"` (auto-inferred from `gpt-*` prefix). Direct-key BYOK fork not yet wired.

### Anthropic

🟡 Catalog `claude-*` rows + `packages/providers/anthropic` + enum `"anthropic"` (auto from `claude-*`). Extended-thinking axis via `agiWorkforce.agent.thinking`/`agent.effort`. Fork ceremony 🔭.

### Google

🟡 Catalog `gemini-*` rows + `packages/providers/google` + enum `"google"` (auto from `gemini-*`). Fork ceremony 🔭.

### xAI

🟡 Catalog `grok-*` rows + `packages/providers/xai` + enum `"xai"`. Fork ceremony 🔭.

### OpenRouter

🔭 A registry entry exists (`open_router`) in `packages/types/src/models.json`, but there is no `packages/providers/openrouter` client and no `providerStreamProvider` enum value in the extension. Planned aggregator BYOK.

### Groq

🔭 Registry entry `groq` exists in `models.json`, but no client package and no extension enum value. Planned.

### Together

🔭 Registry entry `together` exists in `models.json`, but no client package and no extension enum value. Planned.

### DeepSeek

🟡 Catalog rows + `packages/providers/deepseek` + enum `"deepseek"`. Fork ceremony 🔭.

## Local (on-device runtime)

Local runs on-device and is never silently routed to BYOK or Cloud. The catalog gates any `requiresEnvironment` model through `evaluateModelEnvironment`; today `environmentAvailability()` is a Phase-A stub returning `{ configured: false }`, so local-runtime availability is not yet detected in-extension 🟡 (`modelConstants.ts`). Local inference can also be reached indirectly through the authenticated desktop bridge (`ws://127.0.0.1:8787/ws`, token `~/.agiworkforce/bridge-token` 0600) ✅ (`apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`).

### Ollama

🟡 `packages/providers/ollama` client + enum `"ollama"`/`"ollama-cloud"`. Runtime detection/model-list in-extension not wired (Phase-A stub). Non-catalog local engine IDs stay grounded in `packages/providers/ollama`, not re-listed here.

### LM Studio

🟡 `packages/providers/lmstudio` client + enum `"lmstudio"`. In-extension endpoint discovery/health not yet wired.

### llama.cpp

🔭 No `packages/providers/llamacpp` client, no registry entry, no enum value. Planned local runtime.

## Repository map

- `apps/extension-vscode/package.json` — provider/model settings, `providerStreamProvider` enum, tier enum, commands.
- `apps/extension-vscode/src/features/model-picker/` — catalog-driven picker (`modelConstants.ts`, `modelMetrics.ts`, `index.ts`).
- `apps/extension-vscode/src/core/commandSetup.ts`, `src/utils/api.ts` — key storage, sign-in, tier/usage fetch.
- `apps/extension-vscode/src/features/account-auth/deviceAuth.ts`, `src/features/cloud-bridge/` — cloud auth + (stale) invite modal.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — localhost bridge to local/desktop compute.
- `packages/providers/{anthropic,openai,google,xai,deepseek,perplexity,ollama,lmstudio}` — provider clients.
- `packages/types/src/models.json` — SSOT model catalog + provider registry.

## Competitor notes

Claude Code (VS Code) and Codex IDE bind to a single first-party account/provider. AGI's deliberate divergence: **multi-provider by catalog** (model picker reads `models.json`, not a fixed list), **BYOK where the trust boundary allows it** (Desktop/CLI/VS Code only — never Web or Mobile), **local-first** (Ollama/LM Studio/llama.cpp targets, on-device inference that never leaks to cloud), and **per-surface trust** with visible provider labels. AGI competes on "your models, no markup, private, everywhere," not on a single frontier model.

## Acceptance / Definition of Done

Production-ready when: the picker only ever shows catalog-derived IDs; the active provider/mode is visibly labeled at all times; Local content cannot reach a BYOK key or Cloud without the fork ceremony; BYOK keys live only in SecretStorage; and usage/billing read-outs match the canon ladder.

- [ ] Build: model picker sourced entirely from `models.json`; no hardcoded model IDs; `pnpm --filter agi-workforce test` green.
- [ ] Trust: Local / BYOK / Managed selection is explicit and labeled; Local→BYOK fork (context selection, secret scan, payload preview, consent) enforced before any provider-key call.
- [ ] Security/billing: BYOK keys in SecretStorage only; no in-editor checkout; `agiWorkforce.tier` enum + invite modal reconciled to canon ladder (Free/Basic/Pro/Max/Enterprise).

## Anti-patterns

- Hardcoding or inventing model IDs instead of reading `packages/types/src/models.json`.
- Silently routing Local chats/files to BYOK or Cloud, or skipping the fork ceremony and provider label.
- Claiming OpenRouter, Groq, Together, or llama.cpp are shipped — they have no client package and no extension wiring (🔭).
- Reintroducing retired tiers (`hobby`, `pro_plus`, "Plus", "Hobby") or credit top-ups; offering BYOK on Web or Mobile.
- Referencing Supabase (fully migrated away); the stack is Clerk + Neon + Stripe.
- Treating the invite/waitlist modal as an access gate — Managed Cloud is open by default for signed-in users.
