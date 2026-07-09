# Rust Engine Extraction — Staged Implementation Plan

Status: Active
Owner: Founder + platform lead
Last updated: 2026-07-09
Supersedes: details §7 P4 of `docs/plans/monorepo-restructure-2026-07-08.md`
Superseded by: -

Design produced 2026-07-09 from code reads of both binaries and all 14 crates. Goal: end the CLI/desktop split-brain (today they share only `agiworkforce-sandbox-policy`) by extracting `agiworkforce-llm`, `agiworkforce-mcp`, and `agiworkforce-agent-core`, adopting `agiworkforce-execpolicy` in desktop, and wiring the dormant ts-rs codegen.

## Code findings that adjust prior assumptions

1. The CLI's execpolicy bridge already exists — `apps/cli/src/features/exec/exec_policy.rs` (112 LOC) is the stage-(a) blueprint (build Policy with forbidden prefixes; heuristics fallback via `policy.check`). `apps/cli/src/exec_policy.rs` (220 LOC, `#![allow(dead_code)]`) is unrelated legacy — delete in cleanup.
2. reqwest split: desktop 0.13 (+middleware/retry, rustls, no default features); CLI + protocol 0.12 (CLI native-tls on macOS). A shared HTTP crate forces a version AND TLS decision — an egress-behavior change, handled in PR0 (target 0.13 workspace-wide; TLS behind `tls-rustls`/`tls-native` features, desktop rustls, CLI native initially).
3. The tokio-tungstenite fork patch is a non-issue for the new crates (no WS needed; MCP SSE transports are reqwest-based).
4. Desktop `llm_router.rs` (2,504 LOC) is rusqlite-coupled — routing POLICY stays app-local; `fallback_chain.rs` (1,616, pure) moves. Neither is tauri-coupled. Desktop MCP tauri coupling is confined to `events.rs` + `health.rs`.
5. BYOK vault never enters the crates: desktop resolves keys in the tauri command layer and passes opaque strings (`sys/commands/chat/provider_access.rs`, `sys/commands/llm.rs`). Vault, key storage, provider labels stay app-local by construction.
6. Desktop `StreamChunk` carries `credits: Option<CreditsInfo>` (managed-cloud billing) — shared `StreamEvent` gets a `Vendor { event, data }` escape hatch, not a credits field.
7. Desktop's 28-variant `Provider` enum is PERSISTED (sqlite/IPC `as_string()` values) — stays app-local with a `Provider -> ProviderSpec` conversion.
8. protocol ts-rs: 200+ types derive `TS`, only 3 have `export_to`, no export test exists. ts-rs 11 exports during `cargo test`; committed generated tree needs a barrel, prettier/eslint ignores, and a drift guard.
9. CLI links protocol in only 2 files; protocol's `models.rs` is sandbox/permission types, NOT chat types — protocol is a natural dep for stage (d) (its `mcp.rs` wire types) and (e), not for agiworkforce-llm. "Desktop links protocol" lands honestly via agiworkforce-mcp.
10. Desktop `deny(dead_code)` forces same-PR deletion of replaced modules (aligned with strangler rule; inflates swap PRs).
11. `provider_adapter_tests.rs` (3,097 LOC) is the golden corpus for byte-equality request-body parity when collapsing the 28-arm factory into dialect flags.
12. Editions fine (protocol is edition 2024 and already builds everywhere). New crates: edition 2024.
13. Runaway detection is split across `models/streaming.rs` (stage c) and loop guards (stage e). Both apps have separate fallback engines; the crate adopts desktop's (rate-limit cooldown tracking).
14. The desktop IPC streaming contract is concentrated in `sys/commands/chat/send_message_execution.rs` (1,909 LOC, ~20 emit sites) + StreamChunk serde — freeze with snapshots in PR0.
15. `apps/desktop/check-wiring.sh` already guards the ~366-command `generate_handler` — reuse as a per-PR gate.

## Cross-cutting prep (PR0)

`[workspace.dependencies]` for tokio/serde/serde_json/futures-util/bytes/thiserror/reqwest/async-trait/tracing/uuid/chrono; reqwest 0.13 decision (fallback: protocol stays 0.12 — dual reqwest legal, costs size); TLS features on the new crates (default rustls; CLI native initially); contract freezes — insta/serde snapshots for desktop StreamChunk JSON, chat tauri event payloads, and the CLI JSONL event stream (extend `apps/cli/tests/json_events_jsonl.rs`).

## Stages

### (a) Desktop adopts agiworkforce-execpolicy — M

Replace the decision core (`sys/security/command_validator.rs` 687 + `sys/security/policy/*` ~1,974 LOC total) with the crate via a new `sys/security/exec_gate.rs` ported from the CLI bridge (forbidden prefixes = union of both lists; desktop classifier as heuristics fallback; shlex argv split). Stays app-local: input hygiene pre-filter (null bytes/length/metachars), approval UI, audit logging. `Decision::Prompt` MUST route into desktop's approval flow and `Forbidden` hard-blocks — never auto-allow (security watch-item with owner). Fixtures: `exec_policy_corpus.jsonl` `{command, expected}` replayed by both apps; assertion is same-or-stricter (Allow must never weaken). PR-A1 bridge+corpus (no flips), PR-A2 flip + delete (security review).

### (b) Protocol ts-rs codegen -> packages/types — M

Export test `crates/agiworkforce-protocol/tests/export_bindings.rs` using `export_all_to` on root envelope types (recursive — no need to annotate all 200+). Committed tree at `packages/types/src/generated/protocol/` (web builds can't run cargo) + generated barrel + prettier/eslint ignores. Subpath export `"./protocol"` — NOT root re-export (name collisions with hand-authored `Provider`/`ToolEvent`). Drift guard `pnpm check:protocol-types` (regenerate + `git diff --exit-code`) in the cargo-capable CI job. Adoption proof: convert exactly ONE hand-mirror (tool-events or MCP types) with an `Expect<Equal<Hand, Generated>>` shim; the remaining mirrors are a tracked per-file campaign outside this pass.

### (c) Extract agiworkforce-llm (provider HTTP + SSE) — XL

INTO crate: CLI `models/{sse_decoder (Utf8StreamDecoder verbatim), serialization, streaming's 4 dialect fns, idle watchdog, paywall/error classification}` + chat wire types (Message/ContentBlock/ToolDefinition incl. `#[serde(skip)]` scheduling metadata) + tool-call delta assembly; desktop `sse_parser` decode internals, `provider_adapter` request building as dialect flags, `providers/http_client{,_factory}` (-> `HttpConfig`), `fallback_chain` -> `agiworkforce_llm::fallback`, retry classification + parameterized idle timeout (CLI 300s / desktop 30s), bedrock behind cargo feature, azure as spec data.

STAYS app-local: CLI config/keys, subscription-auth streams (copilot/codex), TUI notices (event/callback), provider-selection UX; desktop Provider enum (persisted), LLMRequest/Response/StreamChunk (IPC contract, converted at boundary), llm_router policy + sqlite ledger, managed_cloud_provider (consumes crate; Vendor events -> CreditsInfo), models_config/capability/cost/prompt policy, vault.

API core: `Dialect { Anthropic, Gemini, OllamaNative, OpenAiCompat(OpenAiOpts) }`; `ProviderSpec { id, dialect, base_url, auth, extra_headers }`; `LlmClient::stream_chat(&spec, &req) -> Stream<StreamEvent>`; `StreamEvent { TextDelta, ReasoningDelta, ToolCallStart/ArgsDelta, Usage, Keepalive, Vendor{event,data}, End{stop_reason} }`; `ToolCallAssembler`, `Utf8StreamDecoder`, `IdleWatchdog`, `retry::RetryClass`, `fallback::{FallbackChain, RateLimitTracker}`. 21/28 desktop arms are OpenAiCompat spec rows; `model_uses_responses_api` stays desktop-side feeding the flag.

Order: c1 crate-from-CLI + CLI facade switch same PR (`stream_completion` signature preserved — ZERO TUI changes by construction) -> c2a desktop parity snapshots vs OLD parser -> c2b decode swap (StreamChunk + emit sites untouched; replay == c2a) -> c2c request serialization w/ golden old-vs-new byte-equality bodies before arm deletion -> c3 bedrock/azure/managed-cloud -> c4 fallback/retry move (+optional CLI routing adoption).

Fixtures: `crates/agiworkforce-llm/tests/fixtures/*.jsonl` `{name, dialect, chunks(b64), expected_events, expected_error?}` exposed via `test-fixtures` feature; cases: UTF-8 multibyte splits (incl. byte-at-a-time), `data:` split across chunks, CRLF framing, out-of-order/interleaved tool indexes (desktop Bug #27), malformed args marker, keepalive/ping, usage-only final, thinking deltas, Responses-API set, `[DONE]`, 429+retry-after, paywall corpus, idle-timeout stall. Redaction test: TRACE output contains no key material (crate handles BYOK keys for both binaries after this stage).

### (d) Extract agiworkforce-mcp — L

INTO crate: JSON-RPC framing/correlation/timeouts (desktop `transport.rs` 2,270 is the hardened base: reconnect caps, SSE idle timeout, session-id stickiness) + 3 transports + CLI's complete OAuth (RFC 9728/8414 discovery, RFC 7591 registration) behind `trait TokenStore` + wire types REUSED from `agiworkforce-protocol/src/mcp.rs` (this is where desktop links protocol honestly) + pooling + status snapshots. STAYS: CLI tui_handler/elicitation UI (crate `trait ElicitationHandler`), config loading; desktop extensions/connectors/marketplace, manager/registry/health interfaces, tauri events, desktop's MCP SERVER, token persistence (both stores implement TokenStore). d1 crate-from-CLI + CLI switch; d2 desktop internals swap behind unchanged interfaces. Fixtures: scripted fake MCP server (stdio + axum SSE/HTTP sim) — init versions, list/call, session stickiness, 401->discovery->registration->retry, drop->reconnect, stale timeout, oversized frame. WATCH: desktop links protocol transitively -> measure binary size/build time (icu/quick-xml/encoding_rs; landlock/seccompiler on Linux); contingency: feature-gate protocol's heavy modules.

### (e) Extract agiworkforce-agent-core (turn loop) — XL

Scope = LOOP MECHANICS ONLY from CLI `agent/chat.rs::Session::send` (1,919 LOC) + executor: stream driving, tool-call assembly, sequential + parallel read-only dispatch (caps), iteration/runaway/budget guards, turn events. NOT in scope: CLI hooks engine, compaction, plan mode, privacy-boundary consent (stays in CLI Session — trust-boundary code), memory/skills/subagents; desktop `core/agi` (71 files) and planner/reflection/checkpoints/RAG. Desktop adopts ONLY in the local-chat tool loop (`send_message_execution.rs`); autonomous/AGI flows are an explicit tracked follow-up. API: `TurnEngine::run_turn(llm, spec, req, host)` with `trait TurnHost { dispatch() -> &dyn agiworkforce_app_server::ToolDispatch /* REUSE */, approve(), before/after_tool(), on_event(TurnEvent) }` — ToolDispatch reuse also makes desktop app-server-compatible later. e1 CLI switch (Session::send signature + event cadence bit-identical; JSONL transcript equality gate; CALENDAR-ISOLATED from the 3 pending TUI refactors); e2 desktop local-chat swap (IPC event snapshots unchanged; wdio e2e; check-wiring.sh). Fixtures: scripted StreamEvent sequences × scripted tool results -> expected TurnEvent transcripts (single call, parallel batch, tool error, runaway trip, iteration/budget trips, malformed args, mid-stream error -> `finalize_cancelled_turn` semantics).

### (f) Rename crates/sandbox-policy -> crates/agiworkforce-sandbox-policy — S

`git mv` + 2 path-dep updates (cli Cargo.toml:41, src-tauri Cargo.toml:31). Crate NAME already correct; move-only PR. DO FIRST — zero-risk, avoids rebase noise in later Cargo.toml-touching PRs.

## Dependency order

PR0 -> everything. (f) first. (a), (b), (c1), (d1) parallelizable. (c) serial internally; (d) d1->d2; (e) REQUIRES (c), prefers (d) done. Desktop-side swaps (a2, c2\*, d2, e2) serialize with each other for reviewability. (b) soft-precedes (d) only for generated MCP TS types.

## PR sequence (17; every PR gates on cargo build --workspace + workspace clippy + pnpm check:llm-failures)

1. PR0 prep (S) — workspace deps, reqwest/TLS decision, contract snapshots.
2. (f) rename (S).
3. a1 exec_gate + corpus (S). 4. a2 flip + delete (M, security review).
4. b1 export test + committed tree + barrel + subpath + check:protocol-types (M). 6. b2 first adoption + equality shim (S).
5. c1 crate + CLI facade (L; live smoke Ollama + one cloud). 8. c2a parity snapshots (S). 9. c2b decode swap (M; 4-provider live smoke). 10. c2c dialect serialization w/ golden bodies (L). 11. c3 bedrock/azure/managed-cloud credits e2e (M). 12. c4 fallback/retry move (S).
6. d1 crate + CLI switch + MCP sim (L). 14. d2 desktop swap + size/build report (M).
7. e1 TurnEngine + CLI switch (L; transcript-identical; TUI-refactor window). 16. e2 desktop local-chat swap (L; IPC snapshots + wdio).
8. cleanup (S) — delete legacy cli exec_policy.rs, docs/known-flaws/boundaries rules, final size report.

## Top-5 risk moments

1. PR9 desktop SSE decode swap — c2a snapshots before swap; StreamChunk + emit sites untouched; live smoke; single-PR revert.
2. PR10 28 arms -> dialect flags — golden byte-equality suite (ported from the 3,097-LOC test file) green before deletion.
3. PR15 CLI turn-loop extraction — mechanics only; bit-identical cadence; JSONL gate; never lands while a TUI refactor is in flight.
4. PR7 reqwest/TLS for CLI — PR0 decision; TLS feature gate; proxy/CA smoke.
5. PR14 desktop links protocol — cargo-bloat before/after; feature-gate contingency for icu users.

Watch-items with owners: (a) Prompt-vs-Deny mapping into desktop approvals; agiworkforce-llm key-redaction tests.

Key anchors: `apps/cli/src/features/exec/exec_policy.rs`; `apps/cli/src/models/{mod,streaming,sse_decoder,serialization,provider_dispatch}.rs`; `apps/desktop/src-tauri/src/core/llm/{provider_adapter,sse_parser,llm_router,fallback_chain}.rs`; `.../providers/{direct_api_provider,http_client_factory,managed_cloud_provider,bedrock}.rs`; `.../sys/security/{command_validator.rs,policy/}`; `.../sys/commands/chat/send_message_execution.rs`; `crates/agiworkforce-app-server/src/lib.rs` (ToolDispatch); `crates/agiworkforce-protocol/src/mcp.rs`.
