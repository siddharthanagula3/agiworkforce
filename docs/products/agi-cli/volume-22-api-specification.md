# AGI CLI — Volume 22 — API Specification

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root) and `apps/cli/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `docs/surfaces/cli.md`; and the real repo surfaces this volume grounds in — `crates/agiworkforce-app-server/src/lib.rs`, `apps/cli/src/agent/mod.rs`, `apps/cli/src/{auth.rs,auth_oauth.rs,oauth.rs,cloud.rs}`, `apps/cli/src/models/provider_dispatch.rs`, `apps/cli/src/lib.rs`, `apps/web/app/api/{llm,models,billing,usage,me,user,v1/providers,chat/sync}`, and the model-ID SSOT `packages/types/src/models.json`.

## Overview & stance

This volume specifies the API contracts AGI CLI consumes and exposes: the hosted **AGI gateway** APIs (auth, models, chat, billing, usage, account), the **provider** wire formats it speaks (OpenAI-compatible, Anthropic, Google, xAI), and the **local runtime** endpoints it drives (Ollama, LM Studio, llama.cpp). AGI CLI is the pure-Rust (Ratatui) developer surface and carries all three trust modes — **Local + BYOK + Managed Cloud**. The trust boundary is load-bearing for every API call: `apps/cli/src/agent/mod.rs` (`PrivacyMode`, `validate_privacy_boundary`, `consume_byok_handoff`) is ✅ Built and **blocks a Local session from silently reaching any non-local provider**. BYOK is direct-to-provider with the user's own key; Managed Cloud routes through the AGI gateway. Sessions are workspace/session-scoped — there is **no automatic app-chat sync**; any handoff is explicit and redacted. Command examples use the `agi` binary only. Model IDs are never hardcoded; they come from `packages/types/src/models.json`.

## AGI APIs

### Authentication ✅ Built

`agi login` runs a browser PKCE OAuth flow (`apps/cli/src/auth_oauth.rs`) with per-provider config in `apps/cli/src/oauth.rs` (Anthropic Claude Max, OpenAI, GitHub Copilot; OpenAI device-auth in `apps/cli/src/auth.rs`). Tokens are stored keyring-backed as `AuthEntry::{OAuth,Api}` (`apps/cli/src/auth.rs`), refreshed on expiry, and validated against the gateway (`/api/me`, base `https://api.agiworkforce.com`). Requirements: PKCE `code_verifier`/`code_challenge`, CSRF `state` validation, one-shot loopback callback, no secret written to shell history. `agi logout` / `agi auth-status` inspect and revoke. AGI auth is **Clerk-backed** server-side (`apps/web/app/api/auth`); never reference Supabase.

### Models ✅ Built (gateway) / 🟡 Partial (CLI catalog source)

Managed model listing is served by `apps/web/app/api/llm/v1/models/route.ts` and `apps/web/app/api/models/route.ts`; the per-plan allow-list is `tierAllowedModels` in `packages/types/src/models.json`. `agi models list` shows catalog models; `agi models scan` discovers local models. 🟡 Gap: `apps/cli/src/model_catalog.rs` hydrates its catalog from `https://models.dev/api.json` at runtime, so CLI display can drift from the `models.json` SSOT — reconciliation to the SSOT feed is tracked. Requirement: never invent or hardcode a model ID; every catalog entry must resolve through `models.json` / the SSOT feed.

### Chat ✅ Built

Managed and BYOK turns dispatch through `apps/cli/src/models/provider_dispatch.rs`. The gateway exposes an **OpenAI-compatible** chat endpoint `apps/web/app/api/llm/v1/chat/completions/route.ts` (streaming, tool-loop, auth-gate under `lib/`), plus `apps/web/app/api/llm/v2/chat/route.ts` and the provider-stream proxy `apps/web/app/api/v1/providers/[providerId]/stream/route.ts` (guarded by `gateway-prod-guard.test.ts`). Requirements: streamed deltas map to the CLI transcript; tool calls round-trip as `tool_use`/`tool_result`; a Local session must fail `validate_privacy_boundary()` before any managed/BYOK request leaves the device. Cross-device chat _data_ sync (`apps/web/app/api/chat/sync`) is Managed-Cloud only and is **not** wired into CLI sessions — CLI stays workspace-scoped.

### Billing 🟡 Partial

Billing lives on the gateway (`apps/web/app/api/billing/*`, `apps/web/app/api/checkout`, `apps/web/app/api/stripe-webhook`) on **Stripe**; there is no in-CLI checkout. Tiers (canon 2026-06-30): **Free $0 · Basic $8/₹399 · Pro $20 · Max $100 and $200 · Enterprise custom**. Local + BYOK are free access modes. No credit top-ups. 🟡 Gap: `packages/types/src/billing-catalog.ts` and older pricing UIs still encode retired tiers — reconciliation is a separate tracked task; this spec uses the canon ladder. INR is fixed only for Basic (₹399); Pro/Max INR are TBD — do not invent them.

### Usage ✅ Built

The CLI reads managed balance from `GET {api_base}/api/llm/v1/credits/balance` (`apps/cli/src/lib.rs:1225`, bearer auth, 3s timeout, fails soft). Server-side usage/metering: `apps/web/app/api/usage/route.ts`, `usage/deduct`, `usage/history`, `usage/analytics`, `usage/providers`. Requirement: BYOK and Local turns are **not** metered by AGI (the user pays the provider or nothing); only Managed-Cloud turns deduct.

### Account ✅ Built

`GET /api/me` (`apps/web/app/api/me/route.ts`) returns identity, plan, and entitlements. Data-rights endpoints: `apps/web/app/api/user/{export,data,delete-account}`. CLI account state is surfaced via `agi auth-status`. Requirement: account/entitlement is verified server-side; the CLI never fabricates plan state locally.

## Provider APIs

### OpenAI-Compatible ✅ Built

The CLI ships a custom OpenAI-compatible HTTP client (no vendor SDKs; `apps/cli/src/models/provider_dispatch.rs`). Any `[providers.*]` block in config with a `base_url` (+ optional `api_key_env`) is accepted, with a base-URL safety check (`is_safe_provider_base_url`). This backs BYOK for OpenAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, Mistral, OpenRouter, NVIDIA, and user-defined endpoints.

### Anthropic ✅ Built

Anthropic BYOK/OAuth (Claude Max) via `apps/cli/src/oauth.rs`. Extended thinking is Anthropic-gated: `thinking_budget_tokens` in `apps/cli/src/agent/mod.rs` (mapped from the TUI Effort picker; applied only when the active provider is Anthropic). Model IDs resolve from `models.json` — never hardcoded.

### Google ✅ Built

Gemini models route via the named `google` provider in `apps/cli/src/models/provider_dispatch.rs`. BYOK key resolution follows the shared provider key path.

### xAI ✅ Built

Grok models route via the named `xai` provider in `provider_dispatch.rs`. Same BYOK key/base-URL contract as other named providers.

### Provider-specific Features 🟡 Partial

Cross-provider mechanics tracked per turn in `AgentSession` (`apps/cli/src/agent/mod.rs`): prompt-cache read/creation tokens, reasoning tokens, cost ledger, and a fallback chain (`apps/cli/src/routing/fallback`). 🟡 Gap: extended-thinking is Anthropic-only today; per-provider caching/reasoning surfacing is uneven and provider-capability metadata should drive UI rather than hardcoded assumptions.

## Local Runtime APIs

### Ollama ✅ Built

`Provider::Ollama(OllamaMode::Local)` is keyless and classified **Local** (`provider_privacy_mode` in `apps/cli/src/agent/mod.rs`; `provider_dispatch.rs`). `agi models scan` discovers installed models; `ollama:`-prefixed and llama-family names route to local Ollama. `OllamaMode::Cloud` requires `OLLAMA_API_KEY` / `agi login ollama-cloud` and is **not** Local.

### LM Studio ✅ Built

`lmstudio_provider()` (`apps/cli/src/models/provider_dispatch.rs`) is a keyless OpenAI-compatible local endpoint; loopback URLs (e.g. `http://127.0.0.1:1234`) are treated as Local by `is_local_provider_url`. No key required; requests never leave the device.

### llama.cpp 🟡 Partial

No first-class named `llama.cpp` provider exists. It is reachable today via a user-defined `[providers.*]` OpenAI-compatible block pointing at llama.cpp's server; a loopback `base_url` with no `api_key_env` is classified **Local** (`is_local_provider_url`, `provider_privacy_mode`). 🔭 Planned: a dedicated `llama.cpp` provider name with model discovery parity to Ollama/LM Studio.

## Repository map

- `crates/agiworkforce-app-server/src/lib.rs` — JSON-RPC (`initialize`, `tools/list`, `tools/call`, `shutdown`) over stdio + WebSocket; consumed by `agi app-server` (`apps/cli/src/lib.rs:1624`, binds `127.0.0.1:8788`, refuses non-loopback without `--allow-public-listen`, auto-generates an auth token). ✅
- `apps/cli/src/agent/mod.rs` — sessions, `PrivacyMode`, boundary enforcement, thinking budget. ✅
- `apps/cli/src/{auth.rs,auth_oauth.rs,oauth.rs}` — OAuth/PKCE + keyring token store. ✅
- `apps/cli/src/models/provider_dispatch.rs`, `model_catalog.rs` — provider routing + catalog. ✅/🟡
- `apps/cli/src/cloud.rs` — managed-cloud status/catalog (`https://cloud.agiworkforce.com/api/v1`); 🟡 the file comment still says "private beta / fails closed" — reconcile to canon public-alpha.
- `apps/cli/src/mcp/{mod.rs,sse.rs,http.rs,oauth_flow.rs}` — MCP client (stdio/SSE/Streamable-HTTP + OAuth); `agi mcp-server` exposes AGI as a stdio MCP server. ✅
- `apps/web/app/api/{llm,models,billing,checkout,usage,me,user,v1/providers,chat/sync}` — hosted gateway. ✅

## Competitor notes

Claude Code and Codex expose a single first-party provider (Anthropic / OpenAI) with subscription auth. AGI CLI deliberately diverges: **many providers** through one OpenAI-compatible client, **BYOK where allowed** (CLI/Desktop/VS Code only), and **per-surface trust** with a Local mode that blocks silent egress — a boundary neither competitor enforces at the client. Remote control of a running CLI session from phone/web (mirroring Claude Code Remote Control and Codex remote connections: session keeps running locally, outbound-only, QR + HMAC, approval-gated) is **🔭 Planned**, not a fourth trust mode.

## Acceptance / Definition of Done

Production-ready when every API path above is either ✅ with a cited path or explicitly 🟡/🔭 with the gap named, model IDs resolve only from `models.json`, and no Local session can reach a non-local provider.

- [ ] **Build:** `cargo test -p agiworkforce-cli` green; app-server JSON-RPC contract test (`crates/agiworkforce-app-server/tests/jsonrpc.rs`) passes.
- [ ] **Trust:** Local→BYOK requires explicit consented handoff (`consume_byok_handoff`); `validate_privacy_boundary()` blocks Local→managed/BYOK; app-server refuses non-loopback binds without opt-in.
- [ ] **Security:** gateway calls are bearer-authenticated; tokens keyring-stored; provider `base_url` passes the safety check; no key in logs/history.

## Anti-patterns

- Silently routing a Local chat/file/session to BYOK or Managed Cloud, or auto-syncing CLI sessions to app chat.
- Hardcoding a model ID or scraping one from training data instead of `packages/types/src/models.json`.
- Claiming a capability shipped without a real repo path, or presenting `cloud.rs` execution as live (it fails closed today).
- Reintroducing removed tiers (Plus / pro_plus / Hobby) or inventing Pro/Max INR prices or credit top-ups.
- Referencing Supabase, or renaming Next.js `proxy.ts` back to `middleware.ts`.
- Using `agiworkforce <cmd>` in examples instead of the `agi` binary.
