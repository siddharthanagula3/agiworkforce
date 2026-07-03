# AGI Runtime — Volume 12 — BYOK Providers

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/desktop/AGENTS.md`, `apps/cli/AGENTS.md`, `apps/extension-vscode/AGENTS.md`, `packages/providers/AGENTS.md`; `docs/current/byok-open-model-provider-strategy.md`; and the real repo paths cited inline (`apps/desktop/src-tauri/src/core/llm/providers/direct_api_provider.rs`, `apps/desktop/src/lib/byok-vault.ts`, `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`, `apps/desktop/src-tauri/src/core/llm/llm_router.rs`, `apps/desktop/src-tauri/src/sys/commands/llm.rs`, `apps/cli/src/config.rs`, `apps/extension-vscode/src/core/commandSetup.ts`, `packages/types/src/models.json`).

## Overview & stance

BYOK (bring-your-own-key) lets a user connect their own provider credentials and run inference **directly** against that provider, with **no AGI markup** and no managed-cloud proxy in the path. This is a core differentiation, not a convenience feature: the same models cost the user what the provider charges, and their prompts never transit AGI infrastructure.

BYOK is one of the three trust modes, and it lives on **exactly three surfaces — Desktop, CLI, VS Code**. It is **never** available on Web or Mobile (canon; `docs/products/README.md`). The Runtime treats BYOK as a distinct trust boundary from Local and Managed Cloud: a Local chat, file, or developer session is **never silently promoted** into a BYOK route. Local→BYOK is an explicit fork — context selection, secret scan, payload preview, a visible provider label, and consent — before any bytes leave the machine. Keys and prompts stay inside the surface's process/host; the AGI cloud is not a dependency for BYOK to function.

Provider and model identity are governed by the SSOT catalog `packages/types/src/models.json` (25 providers today). Model IDs are read from that file, never invented. Provider strategy (direct frontier, hosted-open-model, local runtimes) follows `docs/current/byok-open-model-provider-strategy.md`.

## Provider Configuration — configure providers

A BYOK provider is more than a name: the route is `provider + endpoint class + model id + capability metadata + pricing/retention metadata` (per `byok-open-model-provider-strategy.md`). Configuration must let the user pick a catalog provider, supply credentials, optionally override the base URL, and set a default.

- **Desktop** — ✅ Built: `llm_configure_provider` and `llm_set_default_provider` Tauri commands (`apps/desktop/src-tauri/src/sys/commands/llm.rs`) configure and default a provider; the catalog is `packages/types/src/models.json`.
- **CLI** — ✅ Built: `apps/cli/src/config.rs` defines `ProviderConfig { api_key_env, base_url }` per provider plus a `privacy` boundary of `local | byok | managed`, so BYOK is a first-class, per-session-selectable mode.
- **VS Code** — 🟡 Partial: `apps/extension-vscode/src/core/commandSetup.ts` stores a single AGI key in SecretStorage and selects models by plan; a per-provider BYOK configuration surface matching Desktop/CLI breadth is the gap (🔭).

## API Keys — manage user keys

Keys must be stored inside the surface's trust boundary, encrypted at rest, fail-closed, and never logged or synced. No BYOK key ever enters Neon delta-sync (canon: Local/BYOK rows never sync).

- **Desktop** — ✅ Built: `apps/desktop/src/lib/byok-vault.ts` wraps `tauri-plugin-stronghold` (Argon2id-derived key, on-disk `keys.stronghold` snapshot, single `byok-keys` client, fail-closed); round-trip/store/delete behavior is exercised by `apps/desktop/src-tauri/src/tests/byok_vault_tests.rs`. Platform secrets (JWT, DB key) use the separate machine-derived AES-256-GCM path in `apps/desktop/src-tauri/src/sys/security/secret_manager.rs` — BYOK keys stay in the Stronghold vault, not the cloud.
- **CLI** — ✅ Built: `apps/cli/src/config.rs` stores only the **env-var name** (`api_key_env`, e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`), never the secret itself — the key is resolved from the environment at runtime, so the config file is safe to commit or sync.
- **VS Code** — ✅ Built: `setApiKey`/`getApiKey`/`clearApiKey` persist via `context.secrets` (VS Code SecretStorage, OS-encrypted) in `apps/extension-vscode/src/core/commandSetup.ts`.

## Validation — validate credentials

Before a key is used, the surface should confirm shape, then confirm the credential actually authenticates against the provider, and surface a clear, non-leaking error otherwise.

- **Format validation** — 🟡 Partial: basic shape/non-empty checks exist (`apps/desktop/src/api/migration.ts` `validateApiKey`); provider status can be probed via `llm_check_provider_status` (`apps/desktop/src-tauri/src/sys/commands/llm.rs`).
- **Live credential test (pre-save round-trip)** — 🔭 Planned: a dedicated "test connection" that issues a minimal authenticated call per provider before storing the key, with capability detection (streaming/tools/JSON mode), is design intent, not yet a first-class flow. Errors must never echo the key.

## Routing — route requests

BYOK requests go **direct to the provider**, bypassing the managed-cloud proxy, with retry/fallback and a cost safety cap — and never cross into another trust boundary.

- **Direct dispatch** — ✅ Built: `apps/desktop/src-tauri/src/core/llm/providers/direct_api_provider.rs` sends BYOK requests straight to the provider API using the user's key (documented for 22+ providers incl. OpenAI, Anthropic, Google, DeepSeek, xAI, Mistral, Perplexity, Groq, Together, Fireworks, Cerebras, DeepInfra, Cohere, AI21, SambaNova, Azure). Azure/Bedrock have dedicated adapters (`providers/azure.rs`, `providers/bedrock.rs`).
- **Retry / fallback / cost cap** — ✅ Built: `apps/desktop/src-tauri/src/core/llm/llm_router.rs` handles exponential backoff, fallback candidates, and a `SESSION_COST_SAFETY_CAP`.
- **Trust-boundary routing** — 🟡 Partial: direct BYOK dispatch is real, but the explicit Local→BYOK **fork UI** (secret scan + payload preview + consent) as a Runtime-guaranteed gate is not yet wired end-to-end (🔭).

## OpenAI Compatibility — support OpenAI-compatible APIs

Many hosted-open-model and frontier providers speak the OpenAI Chat Completions shape; AGI reuses one adapter for them and allows a base-URL override for compatible/self-hosted endpoints.

- **Shared OpenAI adapter** — 🟡 Partial: `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs` (`ProviderAdapterFactory`) maps OpenAI-format providers to a shared `OpenAIAdapter` (e.g. xAI/Grok "uses OpenAI format"), with provider-specific adapters where behavior diverges (Anthropic, Google, DeepSeek, Perplexity strips tools).
- **Base-URL override** — 🟡 Partial: `apps/cli/src/config.rs` `base_url` overrides the endpoint (Ollama/local/proxies); Ollama has its own local path (`providers/ollama.rs`).
- **Generic "OpenAI-compatible custom endpoint" provider type** — 🔭 Planned: a first-class user-added compatible provider (arbitrary base URL + key + declared capabilities) is design intent.

## Repository map

- `apps/desktop/src-tauri/src/core/llm/providers/direct_api_provider.rs` — BYOK direct dispatch.
- `apps/desktop/src-tauri/src/core/llm/{provider_adapter.rs,llm_router.rs}` and `providers/{azure.rs,bedrock.rs,ollama.rs,http_client_factory.rs}` — adapters, routing, endpoints.
- `apps/desktop/src-tauri/src/sys/commands/llm.rs` — configure/default/status commands.
- `apps/desktop/src/lib/byok-vault.ts` + `apps/desktop/src-tauri/src/tests/byok_vault_tests.rs` — encrypted key vault + tests.
- `apps/desktop/src-tauri/src/sys/security/{secret_manager,storage,encryption,machine_key}.rs` — platform secret encryption primitives.
- `apps/cli/src/{config.rs,provider.rs}` — CLI provider config (env-var keys, base-URL) and provider trait.
- `apps/extension-vscode/src/core/commandSetup.ts` — VS Code SecretStorage key management.
- `packages/types/src/models.json` — provider/model SSOT.
- `docs/current/byok-open-model-provider-strategy.md` — provider ranking/strategy.

## Competitor notes

Claude, ChatGPT, and Codex are effectively single-vendor: you use that vendor's models through that vendor's billing, with no first-party path to route the same session to a rival provider or a self-hosted endpoint. AGI diverges deliberately: **multi-provider by design** (25-provider catalog), **BYOK with no markup** on the surfaces that can hold a key privately (Desktop/CLI/VS Code), **per-surface trust** (Web/Mobile deliberately cannot BYOK), and **local-first** (BYOK never depends on AGI cloud, and Local is never silently promoted to BYOK). Where competitors monetize the token, AGI monetizes managed convenience — BYOK stays free.

## Acceptance / Definition of Done

BYOK is production-ready on a surface when a user can add a key from the SSOT catalog, have it validated live, run direct-to-provider inference with fallback and a cost cap, and be certain the key never leaves the surface or reaches AGI cloud.

- [ ] **Build:** provider add/configure/default + direct dispatch works on Desktop and CLI; VS Code reaches parity or its gap is tracked; model IDs read only from `packages/types/src/models.json`.
- [ ] **Trust:** BYOK offered only on Desktop/CLI/VS Code; Local→BYOK requires the explicit fork (context selection, secret scan, payload preview, visible provider label, consent); no BYOK row enters Neon sync.
- [ ] **Security:** keys stored encrypted and fail-closed (Stronghold / SecretStorage / env-var indirection), never logged, never echoed in validation errors, never sent to managed cloud.

## Anti-patterns

- Offering BYOK on **Web or Mobile**, or silently promoting a Local/Managed chat into a BYOK route without the explicit fork.
- Writing a raw key into config, logs, telemetry, or any sync payload; routing a BYOK key through the managed-cloud proxy.
- Hardcoding or inventing model IDs, provider base URLs, env-var names, or INR prices — read the catalog and config; Pro/Max INR is TBD.
- Claiming a live "test connection" or a generic OpenAI-compatible custom-endpoint provider as shipped when they are 🔭.
- Referencing removed tiers (Plus/Hobby/`pro_plus`), credit top-ups, `middleware.ts`, or Supabase.
- Adding a provider to the selector before its capability metadata, adapter, and tests exist (honesty gap called out in the BYOK strategy doc).
