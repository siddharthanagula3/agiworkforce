# AGI Runtime — Volume 10 — Provider Engine

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `packages/ai/providers/AGENTS.md`, `packages/ai/providers/README.md`. Grounded in `packages/contracts/types/src/{provider.ts,provider-adapter.ts,models.json,capabilities.ts,billing-catalog.ts}`, `packages/ai/providers/*/src/{index.ts,catalog.ts}`, `packages/ai/routing/src/{classify.ts,pricing.ts}`, `packages/ai/provider-runtime/src/{fallback.ts,retry.ts,gateway.ts,errors.ts}`, and `apps/desktop/src-tauri/src/sys/security/secret_manager.rs`.

## Overview & stance

The Provider Engine is the Runtime layer that turns a raw chat request into a streamed completion from _some_ model provider, then reports what it cost. It is **internal**: no surface talks to a vendor SDK directly. Every LLM call resolves to one `ProviderAdapter` (`packages/contracts/types/src/provider-adapter.ts`) — a uniform `stream(req, signal)` contract that normalizes vendor SSE/NDJSON into the canonical `StreamChunk` union.

Provider modes map **exactly** onto the three trust modes:

- **Local** — on-device runtimes (`ollama`, `lmstudio`; `packages/ai/providers/{ollama,lmstudio}`). Never silently routed elsewhere.
- **BYOK** — user-supplied keys to hosted vendors (`anthropic`, `openai`, `google`, `xai`, `deepseek`, `perplexity`, …). Available **only** on Desktop, CLI, VS Code. Local→BYOK is an explicit fork (context selection, secret scan, payload preview, visible provider label, consent).
- **Managed Cloud** — the `managed_cloud` provider (`packages/contracts/types/src/models.json`), billed by AGI, open by default for signed-in users. A distinct trust boundary; never fed Local/BYOK data silently.

Web and Mobile hold **no provider keys** and run no local inference: they reach models only through Managed Cloud. Model IDs come **only** from `models.json` — the engine never hardcodes them.

## Provider Registry — register providers

**🟡 Partial.** The registry-of-record for provider _identity_ exists: the `Provider` union in `packages/contracts/types/src/provider.ts` (25+ `snake_case` ids), the `providers` map in `packages/contracts/types/src/models.json` (label, `defaultModel`, `defaultPricing`, `sseDelimiter`, `tokenMultiplier`, `taskRouting`, `modelPrefixes`, aliases), and `providersInOrder` for display ordering. Each vendor ships an adapter plus a factory export — e.g. `anthropicAdapterFactory` (`packages/ai/providers/anthropic/src/index.ts`), `openaiAdapterFactory`, `ollamaAdapterFactory` — all typed `ProviderAdapterFactory`.

**Gap:** there is **no central runtime registry** that maps a `Provider` id to its factory; call sites import factories directly. Requirements: a single Runtime-owned registry keyed by `Provider` that (a) refuses to register an id absent from the union, (b) tags each provider with its allowed trust mode(s), and (c) never exposes a BYOK/Local factory to Web or Mobile. Adding a provider must remain: add the union literal → add the `models.json` entry → mirror the Rust `Provider` enum (`apps/desktop/src-tauri/src/core/llm/models_config.rs`) → ship the leaf adapter. 🔭 the trust-tagged registry object itself.

## Provider Selection — select provider per request

**🟡 Partial.** Local heuristic selection exists: `classifyTaskLocally` (`packages/ai/routing/src/classify.ts`) produces an 11-value task taxonomy, and each provider entry carries a `taskRouting` map (`fast_completion`, `code_generation`, `complex_reasoning`, `vision`, `long_context`, `computer_use`) plus `tierAllowedModels` (`economy`, `pro_additions`, `flagship_additions`) in `models.json`. Given a resolved model, the vendor is implied by that model's `provider` field.

**Gaps / requirements (🔭):** selection must be **trust-mode-first** — the active surface's trust mode narrows the candidate set _before_ task/tier ranking (Web/Mobile → `managed_cloud` only; BYOK surfaces → providers with a configured key; Local → on-device only). Plan-gating (`tierAllowedModels`) is enforced server-side for Managed Cloud, never client-trusted. Selection must be deterministic given (surface, trust mode, task, plan, available keys) and must expose the chosen provider+model to the UI for the visible-provider-label requirement.

## Authentication — authenticate providers

**🟡 Partial.** The credential model is built: `AuthMethod` (`api-key`, `oauth`, `oauth-device-code`, `aws-signature`, `gcp-adc`, `none`) and `ProviderCredentials` in `packages/contracts/types/src/provider-adapter.ts`; each adapter declares its methods — e.g. Anthropic advertises `api-key` (env `ANTHROPIC_API_KEY`) and console OAuth (`packages/ai/providers/anthropic/src/index.ts`). BYOK secret storage is real on Desktop: `apps/desktop/src-tauri/src/sys/security/secret_manager.rs` with machine-bound keying (`machine_key.rs`) and coverage in `apps/desktop/src-tauri/src/tests/byok_vault_tests.rs`.

**Requirements:** BYOK keys live in the OS keychain / encrypted vault on Desktop/CLI/VS Code — **never** synced, never sent to Neon, never present on Web/Mobile. Managed Cloud authenticates the _user_ via Clerk and holds vendor keys server-side only. Local needs no credential. Keys are redacted from logs, payload previews, and telemetry. 🔭 the CLI/VS Code shared vault contract and OAuth device-code flows for headless surfaces.

## Capability Detection — detect provider capabilities

**✅ Built (static) / 🟡 (live).** Per-model capability metadata (`vision`, `tools`, `codeExecution`, context window, cost, quality tier) lives in `models.json`; `adapter.catalog()` returns it by filtering that JSON on `provider` (`packages/ai/providers/anthropic/src/catalog.ts`). The **platform** axis is the frozen `PLATFORM_CAPABILITIES` matrix (`packages/contracts/types/src/capabilities.ts`) — orthogonal to model capability. UI gates on platform capability first, then model capability.

**Gap (🔭):** live probing. Providers with a discovery endpoint (OpenAI-style `/v1/models`, local `ollama`/`lmstudio` tags) should reconcile the static catalog against what the key/runtime actually serves, degrading gracefully to the JSON fallback (Anthropic exposes no discovery endpoint, so JSON is canonical there). Detected-but-unlisted models must never be silently used to bypass plan gating.

## Failover — switch providers after failure

**🟡 Partial.** The primitives ship in `packages/ai/provider-runtime`: `classifyError` (30+ branch error taxonomy, `errors.ts`), `withRetry` with sticky `RetryContext` and capped backoff (`retry.ts`), `buildFallbackChain` (`fallback.ts`) resolving next-model targets **from `models.json`** via catalog helpers (never hardcoded), and `detectGateway` (`gateway.ts`) to avoid misattributing aggregator-gateway 429s (Helicone/LiteLLM/Portkey) as upstream failures. Strategies: `same-provider-cheaper`, `economy-tier`, `cross-provider`.

**Requirements (🔭 for enforcement):** failover must **never cross a trust boundary** — a Local or BYOK failure may fall back within the same trust mode, but must not silently escalate to Managed Cloud; cross-provider fallback under BYOK requires a key for the target provider or it is skipped. Every hop is surfaced to the user with the new provider label. (Note: `fallback.ts` comments still reference a removed "Hobby" tier — a cosmetic 🟡 to reconcile.)

## Billing — track provider billing

**🟡 Partial.** Token accounting exists at the wire: `StreamChunkUsage` (`input/output/cacheRead/cacheWrite/reasoning` tokens) and per-provider `tokenMultiplier` + `defaultPricing` in `models.json`; `effectiveInputPrice`/`effectiveOutputPrice` (`packages/ai/routing/src/pricing.ts`) apply promo-expiry switching.

**Gaps / requirements:** only **Managed Cloud** usage is metered and billed — Local and BYOK are free access modes and must **never** emit billing rows. Managed-Cloud metering must reconcile to Stripe against the canon ladder: **Free $0 / Basic $8 (₹399) / Pro $20 / Max $100 & $200 / Enterprise custom** — no Plus, no `pro_plus`, no Hobby, **no credit top-ups**. `packages/contracts/types/src/billing-catalog.ts` still encodes stale tiers (a `$25` tier, yearly prices, missing Basic) — flagged **🟡**; reconciliation is a separate tracked task and this spec does not authorize it. 🔭 the per-request Managed-Cloud metering → Neon usage ledger → Stripe reporting path.

## Repository map

- `packages/ai/providers/{anthropic,openai,google,xai,deepseek,perplexity,ollama,lmstudio}/src/{index.ts,catalog.ts,translate.ts,stream.ts}` — leaf adapters + factories.
- `packages/contracts/types/src/{provider.ts,provider-adapter.ts,models.json,model-catalog.ts,capabilities.ts,billing-catalog.ts}` — contracts, SSOT catalog, capability matrix.
- `packages/ai/routing/src/{classify.ts,pricing.ts,indic.ts,types.ts}` — task classification, effective pricing.
- `packages/ai/provider-runtime/src/{fallback.ts,retry.ts,gateway.ts,errors.ts,watchdog.ts,headers.ts}` — retry/failover/error/gateway infra.
- `apps/desktop/src-tauri/src/sys/security/{secret_manager.rs,machine_key.rs}` — BYOK vault. `services/api-gateway/src/` — server-side Managed proxy.

## Competitor notes

Claude, ChatGPT, and Codex are **single-vendor**: the provider is fixed, keys are the vendor's, and "model selection" is a menu of that vendor's own models. AGI's deliberate divergence is a **multi-provider engine behind one adapter contract** with per-surface trust: Local (Ollama/LM Studio, no key, no egress), BYOK direct-to-vendor with no markup on Desktop/CLI/VS Code, and Managed Cloud for Web/Mobile. Failover can cross vendors (something a single-vendor product cannot do) but only within a trust boundary. Capabilities and prices are data-driven from `models.json`, not baked into code.

## Acceptance / Definition of Done

Production-ready when: every LLM call routes through a `ProviderAdapter`; provider/model resolution is trust-mode-first and deterministic; BYOK keys never leave the device or reach Web/Mobile; failover never crosses a trust boundary; Managed-Cloud usage meters to Stripe on the canon ladder while Local/BYOK emit zero billing.

- [ ] **Build:** central trust-tagged registry maps `Provider`→factory; adding a provider needs no hardcoded model ID; `scripts/check-no-hardcoded-models.sh` passes.
- [ ] **Trust:** Web/Mobile registries expose only `managed_cloud`; Local→BYOK fork enforces context selection + secret scan + payload preview + consent + visible label.
- [ ] **Security:** BYOK secrets redacted from logs/previews/telemetry; failover and metering assert trust-mode invariants in tests (`byok_vault_tests.rs` and provider adapter tests green).

## Anti-patterns

- Hardcoding a model ID or fallback target instead of reading `models.json`.
- Silently escalating a Local or BYOK failure to Managed Cloud, or exposing a BYOK factory on Web/Mobile.
- Emitting billing rows for Local/BYOK, or shipping Plus/`pro_plus`/Hobby tiers, credit top-ups, or invented INR prices for Pro/Max.
- Faking capability badges or "available" models the key/runtime cannot actually serve.
- Referencing Supabase, or renaming `proxy.ts` back to `middleware.ts`.
- Treating a discovery endpoint's extra models as a plan-gate bypass.
