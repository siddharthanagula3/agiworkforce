# AGI CLI — Volume 25 — QA Test Cases

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (root) and `apps/cli/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); grounded in `apps/cli/src/{agent/mod.rs,lib.rs,cli_options.rs,models.rs,sandbox.rs,mcp/,hooks.rs}`, `crates/agiworkforce-app-server/src/lib.rs`, `crates/agiworkforce-command-registry/src/lib.rs`, `apps/cli/Cargo.toml`, and `packages/types/src/models.json`.

## Overview & stance

This volume is the QA test-case catalog for AGI CLI, the pure-Rust (Ratatui TUI) developer surface. Its central obligation is proving the three trust modes stay separate: `PrivacyMode::{Local,Byok,Managed}` in `apps/cli/src/agent/mod.rs` must keep a Local session from silently reaching a non-local provider, and Local→BYOK must stay an explicit, consented fork. Sessions are workspace/session-scoped — no automatic app-chat sync; any handoff is explicit and redacted. Cases below assert observable behavior and cite the code under test. Examples use the `agi` binary (`agiworkforce` is an alias per `apps/cli/Cargo.toml`). Model IDs in fixtures resolve from `packages/types/src/models.json` — never hardcode a catalog ID.

## Functional

✅ Built — `apps/cli/src/lib.rs` declares the Clap `Cli` and top-level subcommands (`exec`/`e`, `review`, `apply`/`a`, `sandbox`, `mcp-server`, `app-server`, `resume`, `fork`, `session`, `cloud`, `mcp`, `hooks`, `features`, `execpolicy`, `cost`, `auth`, `login`, `logout`, `auth-status`, `plugin`, `init`, `onboarding`, `daemon`, `ecosystem`, `sync`, `a2a`, `models`) — confirm the exact set from source before asserting counts. Cases: (1) `agi --help`/`--version` exit 0 and print the resolved binary name. (2) each subcommand `--help` renders without panic. (3) an unknown subcommand exits non-zero with a Clap error. (4) `agi models list` renders catalog entries from `models.json`.

## Interactive Mode

✅ Built — the interactive TUI (`apps/cli/src/tui/tui_app.rs`) and classic line REPL (`--no-tui`, `apps/cli/src/repl/`) dispatch the shared slash registry (`crates/agiworkforce-command-registry/src/lib.rs`, ~58 builtins — confirm from source). Cases: (1) the palette lists builtins and honors aliases (`/m`→`/model`, `/perms`→`/permissions`); coverage enforced by `registered_builtin_commands_have_tui_runtime_coverage`. (2) `/model` switch mid-session preserves history (`AgentSession::switch_model`) and rejects unknown IDs. (3) `/plan` locks mutating tools until approval (`handle_update_plan`, `plan_approved`). (4) `/clear` truncates to the system prompt only (`AgentSession::clear`). (5) the visible provider label reflects `provider_privacy_mode`. 🔭 Planned: `/remote-control` phone/web window over a locally-running session (QR + HMAC, outbound-only, approval-gated) — a parity target, not a trust mode.

## Non-interactive Mode

✅ Built — one-shot exec (`apps/cli/src/features/exec/mod.rs`) with flags in `apps/cli/src/{lib.rs,cli_options.rs}`: `--json`, `--output-format`, `--json-events`, `--max-turns`, `--max-budget-usd`, `--allowed-tools`/`--disallowed-tools`, `--permission-mode`. Cases: (1) `agi exec "prompt"` prints the answer, exits 0; piped stdin works. (2) `--json`/`--output-format` emits parseable structured output (`OneShotOutputMode`). (3) `--json-events` streams `MessageDelta` JSONL with `json_session_id`. (4) `--max-turns`/`--max-budget-usd` stop the loop and emit the cap event (`on_budget_exhausted`). (5) exit codes distinguish success, tool-denied, and provider error. (6) non-interactive runs never open an approval prompt without a TTY.

## AGI Subscription

🟡 Partial — Managed Cloud is public alpha, open by default for signed-in users (founder decision 2026-06-27); `agi login` and the `cloud` subcommand (`apps/cli/src/cloud.rs`) reach it, and `agi cost`/`/usage` report spend (`crate::cost_ledger::CostLedger`). Gap: `apps/cli/src/cloud.rs` carries a stale private-beta gate to reconcile against public-alpha canon. Cases: (1) `/pricing` shows only Free / Basic $8 (₹399) / Pro $20 / Max $100 and $200 / Enterprise — no "Plus"/`pro_plus`/"Hobby", no INR for Pro/Max, no top-ups. (2) plan-gated models are refused with an upgrade hint, not a crash. (3) signed-out cloud use prompts `agi login`. (4) the private-beta kill-switch env re-gates only as incident response.

## BYOK

✅ Built — BYOK is Desktop/CLI/VS Code only; keys come from env or `AuthEntry::ApiKey` (`apps/cli/src/cloud.rs`, redacted `Debug`). Local→BYOK is armed then consented: `arm_byok_handoff` records the reviewed draft preamble without changing mode; `consume_byok_handoff` fires the transition only when the sent message carries that preamble; `validate_privacy_boundary` blocks the leak until then. Cases (mirroring `byok_handoff_consents_only_on_matching_draft_send`): (1) drafting alone keeps `PrivacyMode::Local`. (2) an unrelated Local message does NOT complete the handoff — the boundary stays blocking. (3) sending the reviewed draft completes the fork, clears the boundary, and surfaces context selection, secret scan, payload preview, and a visible provider label.

## Local Models

✅ Built — `provider_privacy_mode` in `apps/cli/src/agent/mod.rs` classifies Ollama-local and keyless OpenAI-compatible/Custom providers on loopback URLs (`is_local_provider_url`: `localhost`, `127.`, `[::1]`, `0.0.0.0`) as `PrivacyMode::Local`; LMStudio/Ollama are named providers (`apps/cli/src/models.rs`). Cases (mirroring `local_privacy_blocks_cloud_provider_until_explicit_byok`): (1) a Local session on a local model is `PrivacyMode::Local`. (2) switching to a cloud catalog model keeps mode Local and makes `validate_privacy_boundary()` return `Err` until explicit BYOK. (3) `agi models scan` discovers local models; unknown hosted IDs fail closed via `new_checked`. (4) the advisor tool's Local guard tracks the session mode (`set_advisor_local_privacy_mode`) so a Local session never reaches the cloud advisor.

## MCP

✅ Built — client transports stdio/SSE/Streamable-HTTP with optional OAuth (`apps/cli/src/mcp/{mod.rs,sse.rs,http.rs,oauth_flow.rs}`); `agi mcp-server` exposes AGI itself as a stdio server; tokens are OS-keychain-backed (`apps/cli/src/mcp/oauth_store.rs`). Cases: (1) `agi mcp` add/list/remove round-trips a config. (2) connected MCP tools are namespaced via `mcp_info()`/`effective_tool_definitions` and honor `--disallowed-tools`. (3) MCP OAuth stores tokens in the keyring (file fallback under `AGIWORKFORCE_NO_KEYRING`), never in plaintext logs. (4) a failed handshake degrades gracefully without aborting the session.

## Tool Calling

✅ Built — `crate::runtime::tool_catalog::built_in_tool_definitions()` (43 builtins in the 2026-05-17 audit — confirm from source), team tools = 4 (`send_message`, `team_task`, `read_messages`, `list_teammates`). Cases (mirroring `apps/cli/src/agent/mod.rs` tests): (1) every def has a non-empty name/description and JSON-Schema `type: object` with `properties`. (2) `read_file` exposes optional `start_line`/`end_line`; `web_search` requires `query` only; `web_fetch` requires `url`. (3) plan mode hides mutating tools until approval. (4) loop guard `detect_content_loop`/`hash_tool_call` with `LOOP_DETECTION_THRESHOLD == 5` stops repeated identical calls. (5) path-affecting tools reject targets outside registered roots (`apps/cli/src/path_security.rs`).

## Performance

🟡 Partial — perf primitives exist (fallback chain `crate::routing::fallback::FallbackChain` + `on_fallback` sink, budget cap, streaming deltas, compaction `apps/cli/src/compaction.rs`), but no committed perf-regression harness yet. Cases: (1) startup/`--help` latency stays within a recorded budget. (2) streaming first-token and throughput are measured per provider. (3) fallback rotation fires on provider error and records `(from,to,kind)`. (4) large-file attach honors caps (`MAX_TOTAL_CHARS`/`MAX_PER_FILE_CHARS`). 🔭 Planned: a tracked latency/throughput benchmark suite with thresholds.

## Security

✅ Built — `crates/agiworkforce-app-server/src/lib.rs` requires a non-empty `auth_token`, enforces an Origin allowlist (`origin_allowed`), binds loopback, and disables `?token=` query auth by default (`allow_query_token = false`); approvals are Deny-precedence (`apps/cli/src/exec_policy.rs`) with append-only audit (`apps/cli/src/approval_audit.rs`). Cases: (1) app-server rejects missing/blank token and cross-origin upgrades. (2) `--dangerously-skip-permissions` is the only approval bypass and must be explicit. (3) sandbox network defaults to Deny; Windows/Landlock fallthrough must HARD-REFUSE, not run unsandboxed (open P0). (4) no secret value appears in `approvals.jsonl` or logs.

## Regression

✅ Built — the suite is the regression net: `cargo test -p agiworkforce-cli --lib` (privacy-boundary, BYOK-handoff, tool-schema, loop-detection tests in `apps/cli/src/agent/mod.rs`) and `cargo test -p agiworkforce-command-registry --test slash_palette_golden` for command-surface drift. Cases: (1) trust-boundary tests are non-skippable and fail closed. (2) the slash-registry golden catches added/removed builtins. (3) provider-list drift (`apps/cli/src/models.rs:287-310`) is asserted. (4) no test is faked/`#[ignore]`d; `pnpm check:llm-failures` guards swallowed assertions and stubs.

## Repository map

- `apps/cli/src/agent/mod.rs` — `PrivacyMode`, boundary enforcement, BYOK handoff, tool/loop tests.
- `apps/cli/src/{lib.rs,cli_options.rs}` — subcommands and exec/output flags.
- `apps/cli/src/features/exec/` — non-interactive exec.
- `apps/cli/src/mcp/` — MCP client transports and OAuth store.
- `apps/cli/src/{sandbox.rs,exec_policy.rs,approval_audit.rs}` — sandbox, approvals, audit.
- `crates/agiworkforce-app-server/src/lib.rs` — app-server transport admission.
- `crates/agiworkforce-command-registry/src/lib.rs` — shared slash registry + golden test.

## Competitor notes

Claude Code and Codex CLI ship one-shot and interactive modes, MCP, sandboxed execution, and PKCE OAuth; Claude Code adds Remote Control (research preview) keeping compute on the host. AGI's divergence: multi-provider by default, BYOK as a first-class free access mode where the surface allows it (Desktop/CLI/VS Code only), a hard per-surface trust matrix, and Local-first enforcement — QA treats a silent Local→cloud leak as a release-blocking failure, which no competitor encodes as three enforced trust modes on one CLI.

## Acceptance / Definition of Done

Production-ready when trust-boundary, BYOK-handoff, tool-schema, and command-surface tests are green and non-skippable; non-interactive output is stable and parseable; MCP/tool filters behave; and the app-server admits only authenticated same-origin loopback clients.

- [ ] Build: `cargo test -p agiworkforce-cli --lib` and `cargo test -p agiworkforce-command-registry --test slash_palette_golden` green.
- [ ] Trust: Local→BYOK/Managed requires context selection, secret scan, payload preview, visible provider label, and consent; no silent route.
- [ ] Security: app-server rejects missing token / cross-origin; sandbox network defaults Deny; no secrets in audit/logs.

## Anti-patterns

- Asserting trust behavior without exercising `validate_privacy_boundary`/`consume_byok_handoff`, or `#[ignore]`-ing those tests.
- Faked/always-green tests, swallowed mock assertions, or production stubs presented as passing QA.
- Hardcoding/inventing model IDs (resolve from `packages/types/src/models.json`), citing counts without checking source, or asserting shipped state with no repo path.
- Referencing removed tiers ("Plus"/`pro_plus`/"Hobby"), inventing Pro/Max INR prices, adding credit top-ups, or referencing Supabase.
- Using `agiworkforce <cmd>` in examples (alias only), or treating Remote Control as a fourth trust mode.
- Letting the stale cloud private-beta gate (`apps/cli/src/cloud.rs`) hard-block public-alpha access, or shipping the Windows/Landlock sandbox fallthrough as silent.
