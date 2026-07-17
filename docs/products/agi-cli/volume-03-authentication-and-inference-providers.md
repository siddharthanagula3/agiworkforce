# AGI CLI — Volume 03 — Authentication & Inference Providers

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/cli/AGENTS.md`, `docs/cli/COMMAND_SURFACE.md`. Grounded in real CLI source: `apps/cli/src/agent/mod.rs`, `apps/cli/src/auth.rs`, `apps/cli/src/auth_oauth.rs`, `apps/cli/src/oauth.rs`, `apps/cli/src/cloud.rs`, `apps/cli/src/config.rs`, `apps/cli/src/local_models.rs`, `apps/cli/src/tier_cache.rs`, `apps/cli/src/mcp/oauth_store.rs`, `apps/cli/src/lib.rs`, and `crates/agiworkforce-app-server/src/lib.rs`. Model IDs come only from `packages/contracts/types/src/models.json`.

## Overview & stance

AGI CLI is the pure-Rust (Ratatui TUI) developer surface. It is one of only three surfaces that expose **all three trust modes** — **Local**, **BYOK**, **Managed Cloud** — alongside Desktop and VS Code. Trust selection is explicit and enforced in code: `apps/cli/src/agent/mod.rs` defines `PrivacyMode { Local, Byok, Managed }` and `validate_privacy_boundary()`, which **blocks** a Local session from silently routing to a non-local provider (`local_privacy_blocks_cloud_provider_until_explicit_byok` test) — ✅ Built. Local→BYOK is an explicit fork armed by `/continue-with-byok`; drafting is not consent, and the transition fires only when the user resends the reviewed preamble (`arm_byok_handoff` / `consume_byok_handoff`) — ✅ Built. Sessions are workspace/session-scoped; there is **no automatic app-chat sync**, and any handoff to app chat must be explicit and redacted. All command examples use the `agi` binary; `agiworkforce` is a compatibility alias only.

## AGI Subscription

### Sign In

`agi login [provider]` authenticates to AGI Managed Cloud (default) or an LLM provider; `provider` accepts `agiworkforce`, `anthropic`, `openai`, `copilot`, `chatgpt` (`apps/cli/src/lib.rs` `Command::Login`) — ✅ Built. The interactive `/login` slash command mirrors this (`docs/cli/COMMAND_SURFACE.md`). Managed Cloud is public alpha, open by default for signed-in users; the CLI must not present an invite/waitlist gate.

### OAuth

Browser-based PKCE (RFC 7636) is implemented in `apps/cli/src/auth_oauth.rs` and `apps/cli/src/oauth.rs`: a random `code_verifier`, `code_challenge = base64url(sha256(verifier))`, a one-shot loopback listener, and `state` validation — ✅ Built. Provider endpoints (`ANTHROPIC_OAUTH`, `OPENAI_OAUTH`, `AGIWORKFORCE_OAUTH`) are defined in `oauth.rs`; Anthropic echoes `state` in the returned code and it is validated, never skipped (`echoes_state_in_code`). Requirement: `state` mismatch and any missing required fragment must fail closed.

### Device Authorization

Device-code flow (`urn:ietf:params:oauth:grant-type:device_code`) is implemented for GitHub Copilot and ChatGPT, polling at 5s intervals up to the cap in `apps/cli/src/auth.rs` — ✅ Built. AGI device login targets the web origin endpoints `POST /api/auth/device/code` and `/token` (documented in `auth.rs`); the CLI displays the `verification_uri` and `user_code`.

### Session Management

Tokens persist as `AuthEntry::OAuth { refresh, access, expires, account_id }` or `AuthEntry::ApiKey` in an `AuthStore` (`apps/cli/src/auth.rs`) — ✅ Built. Refresh is typed (`RefreshError::{InvalidGrant, NetworkError, ServerError, Unknown}`) so expired grants prompt re-auth while transient failures retry. Requirement: expired access tokens refresh transparently; a revoked refresh token surfaces an actionable re-login prompt.

### Subscription Verification

`apps/cli/src/tier_cache.rs` resolves the account tier via the AGI Workforce API with a 1-hour on-disk TTL at `~/.agiworkforce/cache/tier.toml` and a 3s fetch timeout — ✅ Built. `UserTier` currently enumerates `Free, Pro, Max, Enterprise, Byok` and lacks a **Basic ($8 / ₹399)** variant required by the 2026-06-30 pricing ladder — 🟡 Partial (gap: add `Basic`; keep in sync with `normalizeProductTier` in `packages/contracts/types/src/model-catalog.ts`). Removed tiers (Plus, `pro_plus`, Hobby) must never reappear.

### Usage Limits

Subscription is a **flat model — no token caps, no credits, no usage cents, no top-ups** (`tier_cache.rs` header). Session-level budget guarding exists via `max_budget_usd` / `BudgetSink` in `agent/mod.rs` plus `/cost`, `/usage`, `/extra-usage` (`docs/cli/COMMAND_SURFACE.md`) — ✅ Built. Server-side per-plan metering/abuse enforcement for public alpha is owned by the web/services layer — 🔭 Planned here.

### Logout

`agi logout` and `/logout` clear stored credentials; `agi auth-status` reports auth state, expiry, refresh availability, and file-permission security (`AuthStatusEntry` in `auth.rs`) — ✅ Built.

## BYOK (Desktop / CLI / VS Code only — never Web or Mobile)

### API Key Management

Keys resolve through `CliConfig::resolve_api_key(provider)` in `apps/cli/src/config.rs`, reading each provider's configured `api_key_env` — ✅ Built. `ApiKey` entries can also live in the `AuthStore` with `0o600` permissions.

### Provider Selection

Model/provider is chosen via the top-level `--provider` flag, `set_provider_override`, and `/model` / `/providers`; `switch_model` re-detects the provider and re-adopts the correct privacy mode (`agent/mod.rs`) — ✅ Built. BYOK models route directly to the user's provider, labeled visibly as BYOK.

### Multiple Providers

`config.rs` ships a provider table with per-provider `api_key_env` for Anthropic, OpenAI, Google, Mistral, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, OpenRouter, NVIDIA, and Ollama — ✅ Built. OpenRouter BYOK models fetched at runtime are honored by `switch_model` via the OpenRouter cache.

### Environment Variables

Provider keys are read from environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `MISTRAL_API_KEY`, `XAI_API_KEY`, `DEEPSEEK_API_KEY`, and the rest of the `config.rs` table; `apps/cli/src/cloud.rs` surfaces their presence) — ✅ Built. `AGIWORKFORCE_NO_KEYRING` opts out of the OS keyring. Do not invent env var names beyond the source table.

### Secret Storage

MCP OAuth tokens use `apps/cli/src/mcp/oauth_store.rs`: OS keyring primary (service `agiworkforce-mcp-oauth`), file fallback at `~/.agiworkforce/secrets/<server>.token` with `0o600` — ✅ Built. `ByokConfig` in `cloud.rs` has a hand-written `Debug` that redacts key **values** and prints only provider names — ✅ Built. Requirement: secrets never appear in logs, `{:?}`, or transcripts.

### Key Validation

Presence/format checks and env-status reporting exist (`resolve_api_key`, `agi cloud models`, `agi doctor`) — 🟡 Partial. A live provider round-trip that validates a BYOK key before the first turn is not yet a dedicated command — 🔭 Planned.

## Local Models

### Ollama

`probe_ollama` queries `/api/tags` at `http://localhost:11434` (`apps/cli/src/local_models.rs`), normalizing the host root and blocking unsafe URLs — ✅ Built. `Provider::Ollama(OllamaMode::Local)` maps to `PrivacyMode::Local` in `agent/mod.rs`.

### LM Studio

`probe_openai_compatible_local("lmstudio", …)` targets `http://localhost:1234/v1` — ✅ Built. Local OpenAI-compatible endpoints with no API key are classified Local by `is_local_provider_url` (`agent/mod.rs`).

### llama.cpp

No dedicated llama.cpp probe exists; a llama.cpp server is reachable today as an OpenAI-compatible / `Custom` local endpoint that `provider_privacy_mode` treats as Local when its base URL is loopback and no key is set (`agent/mod.rs`, `config.rs`) — 🟡 Partial (gap: first-class discovery/registration). A native runtime probe is 🔭 Planned.

### Runtime Discovery

`discover_all` probes Ollama and LM Studio in parallel with a 2.5s timeout and returns `LocalProviderProbe` status + models (`local_models.rs`) — ✅ Built. Discovery must never leave the device.

### Model Registration

`agi models set <model> [--provider]` registers the default model, inferring the provider from installed local models or catalog metadata (`ModelsSubcommand::Set`, `lib.rs`) — ✅ Built.

### Model Management

`agi models list | status | scan | set` cover catalog + local inventory (`ModelsSubcommand`, `lib.rs`) — ✅ Built. `scan` refreshes the discovered-model cache used by pickers.

### Model Validation

`local_models.rs` verifies a selected model is installed before use and checks tool capability via Ollama `/api/show` (`ollama_model_supports_tools`), disabling tool schemas when unsupported — ✅ Built.

## Repository map

- `apps/cli/src/agent/mod.rs` — `PrivacyMode`, boundary enforcement, BYOK handoff.
- `apps/cli/src/{auth.rs, auth_oauth.rs, oauth.rs}` — OAuth PKCE, device code, `AuthStore`.
- `apps/cli/src/tier_cache.rs` — subscription tier resolution + cache.
- `apps/cli/src/{cloud.rs, config.rs}` — managed-cloud status, BYOK provider table, key resolution.
- `apps/cli/src/local_models.rs` — Ollama/LM Studio discovery + validation.
- `apps/cli/src/mcp/oauth_store.rs` — keyring-backed secret storage.
- `apps/cli/src/lib.rs` — `login`/`logout`/`auth-status`/`models`/`cloud` commands.
- `crates/agiworkforce-app-server/src/lib.rs` — JSON-RPC/WS tool host consumed by the CLI.

## Competitor notes

Claude Code and Codex CLI center on a single first-party subscription/API-key path (Anthropic, OpenAI respectively). AGI deliberately diverges: **three explicit trust modes**, **multi-provider BYOK** with no markup across the `config.rs` table, and **local-first** discovery (Ollama, LM Studio, llama.cpp) that never leaves the device. Managed Cloud is one open option, not the only path. Remote control of a running CLI session from phone/web — mirroring Claude Code Remote Control and Codex remote connections (session keeps running locally, outbound-only, QR + HMAC, approval-gated) — is 🔭 Planned and is not a fourth trust mode.

## Acceptance / Definition of Done

- [ ] Build: `cargo check -p agiworkforce-cli` and `cargo test -p agiworkforce-cli --lib` green, including the privacy-boundary tests.
- [ ] Trust: a Local session cannot reach a cloud/BYOK provider without an explicit consented `/continue-with-byok`; the provider label is always visible; no CLI/VS Code session syncs to app chat automatically.
- [ ] Security: secrets stored `0o600`/keyring, redacted from all output; OAuth `state`/PKCE validated fail-closed; refresh errors typed and actionable.

## Anti-patterns

- Silently routing Local chats/files/sessions to BYOK or Managed Cloud, or auto-syncing CLI sessions to app chat.
- Hardcoding or inventing model IDs instead of reading `packages/contracts/types/src/models.json`.
- Reintroducing removed tiers (Plus, `pro_plus`, Hobby), credit top-ups, or invented Pro/Max INR prices.
- Printing API keys or tokens in logs, `{:?}`, or transcripts; weakening `0o600`/keyring storage.
- Referencing Supabase (fully migrated; use Clerk + Neon + Stripe) or renaming `proxy.ts` to `middleware.ts`.
- Using `agiworkforce <cmd>` in examples; claiming shipped state without a real repo path.
