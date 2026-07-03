# AGI CLI — Volume 20 — Provider Integrations

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `apps/cli/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `docs/current/byok-open-model-provider-strategy.md`. Grounded in repo: `apps/cli/src/agent/mod.rs`, `apps/cli/src/models/mod.rs`, `apps/cli/src/models/provider_dispatch.rs`, `apps/cli/src/models/openrouter_models.rs`, `apps/cli/src/model_catalog.rs`, `apps/cli/src/local_models.rs`, `apps/cli/src/config.rs`, `apps/cli/src/auth.rs`, `apps/cli/src/tier_cache.rs`, `apps/cli/src/cost_ledger.rs`, `apps/cli/src/lib.rs`, `packages/types/src/models.json`, `packages/providers/*`, `crates/agiworkforce-app-server/src/lib.rs`.

## Overview & stance

AGI CLI is the pure-Rust (Ratatui TUI) developer surface. It exposes all three trust modes — Local, BYOK, and Managed Cloud — and enforces them at the session boundary, not in prompt text. `apps/cli/src/agent/mod.rs` carries a `PrivacyMode` enum (`Local`/`Byok`/`Managed`), and `validate_privacy_boundary()` **blocks** a Local session from silently emitting to any non-local provider (✅ Built, `apps/cli/src/agent/mod.rs`). Local→BYOK is an explicit, consented fork via `arm_byok_handoff` / `consume_byok_handoff` — drafting never leaves Local; only sending a message carrying the reviewed BYOK preamble completes the transition (✅ Built, same file). Model IDs come **only** from `packages/types/src/models.json`, compiled into the binary through `include_str!` (✅ Built, `apps/cli/src/model_catalog.rs`); the CLI maintains no separate model table. Sessions are workspace/session-scoped: no automatic app-chat sync. Command examples use the `agi` binary.

## AGI Subscription

### Authentication

`agi login` (provider omitted) authenticates the managed AGI Workforce account via OAuth; the token persists as an `OAuth` auth entry labeled `agiworkforce`/`managed_cloud` (✅ Built, `apps/cli/src/auth.rs`, `apps/cli/src/lib.rs` `Command::Login`). `AGIWORKFORCE_JWT` is honored as a headless fallback, and plan/tier state is cached in `apps/cli/src/tier_cache.rs` (✅ Built). `agi auth-status` and `agi logout` manage credentials. Auth uses Clerk-issued sessions server-side; the CLI never embeds Supabase.

### Available Models

Managed-cloud models come from the `managed_cloud` provider block in `packages/types/src/models.json`, gated by `tierAllowedModels` (✅ Built, catalog). `agi cloud models` prints the managed catalog plus BYOK env status; `agi models list` shows catalog + discovered local models (✅ Built, `apps/cli/src/lib.rs`). Managed **execution** from the CLI is not yet wired — `agi cloud exec` fails closed until the backend contract lands (🟡, `apps/cli/src/lib.rs` `CloudSubcommand::Exec`).

### Usage Limits

Managed usage is metered per plan; the CLI tracks per-session spend in `CostLedger` and enforces an optional hard cap via `max_budget_usd` + `BudgetSink` (✅ Built, `apps/cli/src/cost_ledger.rs`, `apps/cli/src/agent/mod.rs`). Server-side per-plan quotas/rate limits are 🔭 for the CLI path. Local and BYOK sessions are **not** AGI-metered — the user pays the provider (or nothing, for Local) directly.

### Billing

Plans (canon, founder decision 2026-06-30): **Free $0 · Basic $8 (₹399) · Pro $20 · Max $100 and $200 · Enterprise custom**. Local and BYOK are free access modes, not plans. Billing runs on Stripe + Neon; entitlements are verified server-side and cached in `tier_cache.rs`. There is **no checkout inside the CLI** and **no credit top-ups**. Managed Cloud is public alpha, open by default for signed-in users; `AGI_MANAGED_COMPUTE_PRIVATE_BETA` remains only as an incident kill-switch (🔭 for CLI-side billing UI). Some code/help strings still say "private beta" — reconcile to public alpha (🟡, `apps/cli/src/lib.rs`).

## BYOK

BYOK is first-class on the CLI. Keys are read from environment variables (or `[providers.*]` in `~/.agiworkforce/config.toml`); `agi login <provider>` supports OAuth where offered. Provider routing is resolved in `apps/cli/src/models/provider_dispatch.rs`.

### OpenAI

✅ Built — `openai_provider()` (`OPENAI_API_KEY`), plus OAuth `chatgpt`/`copilot` login paths (`apps/cli/src/models/mod.rs`, `apps/cli/src/auth.rs`). Shared adapter `packages/providers/openai`.

### Anthropic

✅ Built — native `Provider::Anthropic` (Messages API, `ANTHROPIC_API_KEY`); `agi login anthropic` OAuth supported. Extended-thinking budget is Anthropic-only (`thinking_budget_tokens`, `apps/cli/src/agent/mod.rs`). Adapter `packages/providers/anthropic`.

### Google

✅ Built — native `Provider::Google` (Gemini, `GOOGLE_API_KEY`), `apps/cli/src/models/mod.rs`. Adapter `packages/providers/google`.

### xAI

✅ Built — `xai_provider()` (`XAI_API_KEY`), OpenAI-compatible transport; aliases `xai`/`grok` (`apps/cli/src/models/provider_dispatch.rs`).

### OpenRouter

✅ Built — `openrouter_provider()` (`OPENROUTER_API_KEY`); runtime model catalog cached via `apps/cli/src/models/openrouter_models.rs`, so `switch_model` can route models not in the static catalog. Treated as an aggregator — do not assume native-tool parity.

### Groq

🔭 Planned as a named provider — no `groq_provider()` constructor and no `provider_from_name` mapping today (verified absent, `apps/cli/src/models/provider_dispatch.rs`). 🟡 reachable now via the OpenAI-Compatible custom path (below). `groq` exists as a provider definition in `models.json` but is not in `providersInOrder` and has no CLI wiring.

### Together AI

🔭 Planned — no named CLI provider; `together` is a provider definition in `models.json` with **no direct model entries** (per `docs/current/byok-open-model-provider-strategy.md`). 🟡 reachable now via the OpenAI-Compatible custom path.

### DeepSeek

✅ Built — `deepseek_provider()` (`DEEPSEEK_API_KEY`); direct catalog entries exist in `models.json` (e.g. `deepseek-v4-flash`, `deepseek-v4-pro` — IDs sourced from the SSOT, not hardcoded here).

### OpenAI-Compatible APIs

✅ Built — any OpenAI-compatible endpoint works through `Provider::OpenAICompatible` / `Provider::Custom`, defined in `~/.agiworkforce/config.toml` `[providers.*]` with `base_url` + optional `api_key_env`, loaded by `register_custom_providers` (`apps/cli/src/config.rs`, `apps/cli/src/models/mod.rs`). Keyless endpoints on a localhost URL are auto-classified Local via `is_local_provider_url` (`apps/cli/src/agent/mod.rs`). This is the honest path for Groq, Together, Fireworks, Cerebras, DeepInfra, NVIDIA NIM (`nvidia_provider()` is pre-wired), and similar until first-class adapters ship. Pre-wired OpenAI-compatible names also include `perplexity`, `qwen`, `moonshot`, `zhipu`, and `mistral`.

## Local

Local runs on-device with no key and is never silently routed to BYOK/Cloud.

### Ollama

✅ Built — `Provider::Ollama(OllamaMode::Local)`, default `http://localhost:11434`, keyless → `PrivacyMode::Local`; probed by `agi models scan` (`probe_ollama`, `apps/cli/src/local_models.rs`). Adapter `packages/providers/ollama`. (Hosted `ollama-cloud` requires `OLLAMA_API_KEY` and is a non-local route.)

### LM Studio

✅ Built — `lmstudio_provider()`, keyless `http://localhost:1234/v1`, probed by `agi models scan` (`probe_openai_compatible_local`, `apps/cli/src/local_models.rs`). Adapter `packages/providers/lmstudio`.

### llama.cpp

🟡 Partial — reachable today via an OpenAI-compatible local server (`llama-server` `/v1`) declared as a `[providers.*]` block; a keyless localhost URL is classified Local. Gap: no dedicated named adapter and no `agi models scan` probe, so it is not auto-discovered like Ollama/LM Studio.

### Future Local Providers

🔭 Planned — vLLM, Text Generation Inference (TGI), MLX/Apple-Silicon runtimes, and AGI-managed local runtime adapters, per `docs/current/byok-open-model-provider-strategy.md`. Each must land keyless-local classification, a scan probe, and capability metadata before being claimed as supported.

## Repository map

- `apps/cli/src/agent/mod.rs` — `PrivacyMode`, `validate_privacy_boundary`, BYOK handoff, budget cap.
- `apps/cli/src/models/mod.rs` — `Provider` enum + provider constructors.
- `apps/cli/src/models/provider_dispatch.rs` — `provider_from_name`, provider detection.
- `apps/cli/src/models/openrouter_models.rs` — OpenRouter runtime catalog cache.
- `apps/cli/src/model_catalog.rs` — reads `packages/types/src/models.json` (SSOT).
- `apps/cli/src/local_models.rs` — Ollama / LM Studio scan probes.
- `apps/cli/src/config.rs` — `[providers.*]` custom-provider config.
- `apps/cli/src/auth.rs`, `apps/cli/src/tier_cache.rs`, `apps/cli/src/cost_ledger.rs` — auth, tier cache, spend ledger.
- `packages/types/src/models.json`; `packages/providers/{openai,anthropic,google,deepseek,xai,perplexity,lmstudio,ollama}`.
- `crates/agiworkforce-app-server/src/lib.rs` — JSON-RPC/WS tool host consumed by the CLI.

## Competitor notes

Claude Code and Codex CLI bind to a single first-party vendor. AGI CLI deliberately diverges: one terminal fronts frontier direct keys, hosted open-model clouds, aggregators (OpenRouter), and local runtimes, with a hard Local/BYOK/Managed trust boundary the incumbents do not model. Like Claude/ChatGPT, the UX should feel first-party; unlike them, execution can be any route the user connects — and Local stays truly local. Remote control of a running CLI session from phone/web is 🔭, a parity target mirroring Claude Code Remote Control and Codex remote connections (session keeps running locally, outbound-only, QR + HMAC, approval-gated) — not a fourth trust mode.

## Acceptance / Definition of Done

Production-ready when every advertised provider has a real adapter, capability metadata, and a passing test; unbuilt providers are labeled 🔭 and never shown as available; and no route can cross a trust boundary silently.

- [ ] Build: each ✅ provider resolves through `provider_from_name`, streams, and reports token usage; `agi models list`/`scan` reflect real state.
- [ ] Trust: `validate_privacy_boundary` blocks Local→non-local; Local→BYOK requires an explicit consented handoff; managed and BYOK never see Local data implicitly.
- [ ] Security: API keys read only from env/config or OS keychain, redacted in logs (`redact_token`); no key material in transcripts, sessions, or app-chat handoffs.

## Anti-patterns

- Silently routing a Local session to BYOK/Managed, or skipping the `consume_byok_handoff` consent step.
- Hardcoding or inventing model IDs — always read `packages/types/src/models.json`.
- Claiming Groq/Together/Fireworks/Cerebras as first-class before named adapters exist; presenting a `models.json` provider definition with no model entries as "supported."
- Referencing Supabase, or using `agiworkforce <cmd>` in user-facing examples (use `agi`).
- Reintroducing removed tiers ("Plus", `pro_plus`, "Hobby"), inventing Pro/Max INR prices, or adding credit top-ups.
- Treating remote control as a fourth trust mode, or auto-syncing CLI sessions to app chat.
