# AGI CLI — Honest Competitive Standing vs Claude Code & OpenAI Codex CLI

Date: 2026-06-13
Method: 27-agent workflow — 13 dimensions × (compare → adversarial source-verification) + synthesis.
Sources compared:

- AGI CLI — `apps/cli/src` (~88.6K LOC Rust, 171 files, v1.7.1, ratatui)
- Claude Code — `~/Desktop/reference/claude_reference/src` (bundled TS/Ink, Anthropic-only)
- Codex CLI — `~/Desktop/reference/codex-cli/codex-rs` (~958K LOC Rust, ~110 crates, Apache-2.0, OpenAI-only)

Every AGI claim below was ground-truthed against source (open the cited file, confirm real code not a stub). Where the first-pass comparison overstated AGI, the verifier's correction is reflected.

## 1. Bottom line

AGI CLI is a real, production-grade Rust agent CLI (~88.6K LOC, v1.7.1, zero `todo!`/`unimplemented!` macros, ~1638 test fns) that is genuinely competitive on breadth and clearly distinctive on multi-provider routing — but it trails both rivals on the depth dimensions power users feel daily (context engine, interactive editor, sandbox enforcement, headless/SDK surface). Its standout, source-verified lead is **Providers/Routing/Auth** (15-16 providers across 3 native wire formats, a real cross-vendor fallback chain with a fail-closed privacy guard, live local-model discovery) where it scores ahead of both Codex and Claude Code. It is at credible parity on built-in tools breadth, slash/custom commands, and hooks taxonomy. It is materially behind on the agent loop's context engine (heuristic-only compaction, a dead extended-thinking control), the TUI input editor (single-line composer, no diff body, no image paste), OS sandbox enforcement depth, and especially headless/SDK integration (read-only app-server stub, no published SDK). Across 13 verified dimensions AGI averages ~6.4/10 vs Claude Code ~8.8 and Codex ~8.7 — a credible peer in shape, a generation behind in finish on the hard parts.

## 2. Scorecard

| Dimension                                    | AGI      | Claude Code | Codex    | AGI standing                   |
| -------------------------------------------- | -------- | ----------- | -------- | ------------------------------ |
| Architecture & Distribution                  | 7        | 9           | 10       | mixed                          |
| Agent Loop & Context Engine                  | 6.5      | 9.5         | 9        | behind                         |
| Built-in Tools                               | 7        | 9           | 8        | mixed                          |
| TUI & Interactive UX                         | 5.5      | 9           | 9.5      | behind                         |
| Providers, Models, Routing & Auth            | 8.5      | 7           | 6.5      | **ahead**                      |
| MCP (Model Context Protocol)                 | 6.5      | 9.5         | 9        | behind                         |
| Permissions, Sandboxing & Approvals          | 5.5      | 8           | 9.5      | behind                         |
| Slash & Custom Commands                      | 8        | 9.5         | 7        | mixed                          |
| Hooks & Lifecycle Events                     | 8        | 9           | 9        | mixed                          |
| Sessions, Persistence, Resume & Fork         | 6        | 8           | 9.5      | behind                         |
| Subagents, Multi-Agent, Teams & Cloud        | 6        | 9.5         | 9        | behind                         |
| Headless, SDK, App-Server & CI               | 4.5      | 8           | 9.5      | behind                         |
| Skills, Plugins, Marketplace & Extensibility | 6        | 9           | 8        | behind                         |
| **Average**                                  | **6.42** | **8.77**    | **8.73** | **behind overall, ahead on 1** |

## 3. Where AGI genuinely leads (source-backed, verification-confirmed)

- **Multi-provider breadth across 3 native wire formats.** 15-16 pre-registered providers (`provider.rs`, `models/provider_dispatch.rs`) with native Anthropic Messages, Google Gemini, and Ollama NDJSON handlers in one binary — Codex's `WireApi` enum has a single `Responses` variant (no Anthropic/Gemini path at all), and Claude Code is Anthropic-only. Decisive and verified.
- **Cross-vendor mid-turn fallback chain with a fail-closed privacy guard.** `-m a,b,c` parses a `FallbackChain` that rotates on 429/network/5xx/stream-error (`routing/fallback.rs`), and runs `validate_privacy_boundary()` _before_ any cross-provider egress (`agent/chat.rs:406-498`), restoring state and breaking fail-closed if a Local session would leak to cloud. Neither competitor can fall back across providers; neither has this guard.
- **Live local-model discovery + tool-capability probing.** `local_models.rs discover_all` concurrently probes Ollama `/api/tags` and LM Studio `/v1/models`, verifies install before use, and queries `/api/show` to decide whether to send tool schemas. Claude has no local models; Codex configures ports but ships no equivalent live discovery.
- **Always-on cost HUD anchored top-right.** `cost_hud.rs` (12 unit tests) shows catalog-priced `$` plus in/out/cache/reasoning tokens and context% with color thresholds, rendered every frame. Rivals surface tokens via `/status` cards or status lines; the persistent top-right `$` placement is a genuine (if modest) edge.
- **In-CLI trigger daemon.** `daemon.rs` (~1331 LOC) runs cron + axum webhook (≥32-char token auth) + filesystem watchers, each spawning a throttled non-interactive `AgentSession`. Verified wired (`lib.rs:2144`). Neither Codex's CLI nor Claude Code ships an event-trigger daemon.
- **A2A (agent-to-agent) network protocol — unique.** `features/a2a/` ships HTTP `serve_a2a` (agent cards, task endpoints, semaphore) + WebSocket JSON-RPC with bearer auth + client `delegate_task` + peer registry, with hardened delegated execution (restricted tool allowlist, prompt-injection quarantine). Neither rival has a cross-instance card protocol.
- **Ecosystem importer + learned-skills generator + voice STT — three unique features.** `ecosystem.rs` scans and adopts MCP/skills/instructions from Claude Code/Codex/Gemini/Cursor/VS Code/Zed/Cline; `skill_learner.rs` mines 3+-session tool patterns into durable `SKILL.md` files (wired at session end); `voice.rs` is a real privacy-aware Whisper STT loop. None exist in either competitor.
- **Plugin/hook/file-security hardening.** SHA-256 plugin install integrity + symlink-escape guards (`plugins.rs`); hooks.json refuses to load on UID-mismatch (anti-symlink) and warns on group/other perms (`hooks.rs:666-704`); MCP stdio env sanitization is `env_clear()` + 11-var allowlist + 15-var blocklist (blocks DYLD/LD_PRELOAD/NODE_OPTIONS/\*\_PROXY/PYTHONPATH). Stronger file-level hardening than either SDK-based rival exposes.

## 4. Where AGI is at parity

- **Hooks taxonomy breadth (8/8 vs 9/9).** 32 real `HookEvent` variants, every one with a verified fire site — broader than Codex's 10 and Claude's ~12 user-configurable events, including a unique daemon hook category (Cron/Webhook/FileChanged) and an uncredited arg-rewrite security audit log. Behind only on the _execution model_ (no allow/ask permission decisions, no schema validation, no project config layer).
- **Slash & custom commands (8 vs 9.5/7).** Real 87-command shared registry + a markdown custom-command system ($ARGUMENTS/$1-$9, colon namespacing, frontmatter, `.claude/commands` interop) wired into both REPL and TUI, triple-test-guarded against dead commands. **Leads Codex** (which has no markdown custom-command-to-slash system); trails Claude on named args, inline `!`bash``, and per-command tool scoping.
- **Built-in tools breadth (7 vs 9/8).** Widest _dedicated_ schema-typed catalog (~40 tools) and best-hardened `web_fetch` (SSRF blocklist + DNS-rebind pinning + per-hop redirect re-validation). Matches Claude's dedicated-tool shape; deferred-loading + per-tool size-cap/concurrency metadata is richer than either rival exposes.
- **Memory/learning pipeline and output styles.** Real LLM-backed session-summary extraction with dedupe/merge (`memory_pipeline.rs`) into the prompt, and 3 built-in + user output styles injected into the system prompt — at parity with both, and output styles beat Codex (which ships none).

## 5. Where AGI is behind (grouped, by severity)

**Context engine — a clear generation behind (P0/P1):**

- Compaction is heuristic-only (token-budget truncation + tool-output pruning, _zero_ LLM calls; source literally comments "if any future LLM-based compaction"). Codex has 3 summarization backends; Claude has 5 strategies.
- Extended-thinking is a **dead control**: the Effort picker computes `anthropic_budget_tokens()` but the request body never sends a `thinking` block, no `thinking_delta` parsing, `reasoning_output_tokens` hardcoded `0` in 4 places. Both rivals send reasoning effort.
- Compaction triggers only once at turn start and is never re-checked mid-loop (up to 25 iterations can blow past the window); token accounting is a 4-bytes/token heuristic, no real tokenizer.
- Mid-turn steering (`message_queue.rs`) is scaffolded-only — instantiated only in its own tests.

**Interactive TUI editor (P0):**

- Single-line composer: Enter always submits, no Shift+Enter/multiline, no prompt history/Ctrl-R, no @-file completion, no external `$EDITOR`, no image paste/display, no mouse/native scrollback.
- The live `/diff-review` builds `FileDiff` with **empty hunks and 0/0 stats** — it ships a bare filename list with no diff body. Both rivals have full colored/line-numbered diffs.

**Sandbox enforcement depth (P1):** Linux seccomp/Landlock is builder-only (`install_filter` bails without the feature); Windows sandbox always bails (Phase-2 stub); the `platform/policy/*` engine is dead code; the live Seatbelt/bwrap profile is hardcoded workspace-write (the `SandboxPolicy` enum never drives it); network policy is binary Deny/Allow; and the `/sandbox` preset UX is a **misleading dead control** (advertises a `--sandbox` flag/env/inline mode that are all unwired). Codex ships a 16.5K-LOC Windows sandbox + runtime seccomp/Landlock + execpolicy DSL.

**Headless/SDK/app-server (P1) — AGI's weakest dimension (4.5):** `app-server` is a 4-method dispatcher exposing 7 callable read-only tools with no agent loop or thread/session methods; `mcp-server` advertises zero tools; the `sdk_io` bidirectional control channel is fully typed but explicitly reserved/unconsumed; the `stream-json` one-shot path is a no-op-callback 3-event placeholder; `RunningTool`/`ToolResult` events are defined but never emitted; `TurnUsage.cumulative_dollars` is hardcoded `0.0` in the streaming path; and there is **no published SDK**. Codex has a 179-method app-server + TS/Python SDKs; Claude has a 60-schema control protocol + Agent SDK.

**Sessions/multi-agent/MCP/cloud gaps (P1):**

- `agi session fork --at-turn N --as <name>` is **cosmetic** — it persists a full untruncated copy under a random UUID and ignores `--as` (a real bug); no in-TUI resume/fork picker ("Inline turn picker coming in v0.2"); `/rewind` is in-memory message-only with no file-state restore.
- Cloud is a fail-closed stub; `task_create`/`team_create`/`spawn_teammate` are metadata-only registries that never execute; `--agent` launch flag is parsed but never applied.
- MCP resources are structs-only (no `resources/list`/`read` RPC); MCP server mode returns empty tools; no `list_changed` notifications.
- Skills are injected **wholesale** into every prompt — the scoring/matching machinery and `extract_skill_mentions` are dead code, and there's no skill-as-tool; the marketplace is a placeholder URL.

## 6. Marketing-vs-reality (README claims the verification found overstated)

- **Hook event count.** README/`mod.rs` say "19", the README competitive table says "27" — the real enum is **32**. Stale marketing that _undercounts_ the real strength. Fix the docs.
- **`--json-events` "unique to AGI" (rivals marked ❌).** **False.** Both Claude Code (`--output-format stream-json` + `--include-partial-messages`) and Codex (exec JSONL `ThreadEvent`) ship richer machine-readable streams. AGI's own `RunningTool`/`ToolResult` events aren't even emitted.
- **Cost HUD "unique / ❌ for everyone else" (README L34).** **Overstated.** Codex has a `/status` token card + footer indicator; Claude has StatusLine + TokenWarning with context%. The genuine edge is only the always-on top-right `$` placement.
- **Provider count "16".** Source has **15** distinct providers (11 OpenAI-compat + Anthropic + Google + Ollama-local + Ollama-cloud). Minor inflation by one.
- **Homebrew formula.** Pins version `1.0.0` with `PLACEHOLDER_SHA256` on all platforms against a 1.7.1 npm package — the tap is 7 minors stale and was never finalized with real SHAs.
- **Plan mode / freshness "uniform across edit/multiedit/apply_patch".** `apply_patch` has **no** read-before-edit freshness gate (cited line 913 is actually multiedit). The "uniform" claim is overstated.
- **Turn-fork as a first-class verb.** Documented `--at-turn`/`--as` are cosmetic in the `agi session fork` path (see §5).

## 7. Prioritized roadmap to parity

**P0 — close the most credibility-damaging, cheapest-first:**

1. **Fix or remove the dead/misleading controls (S, ~1-2 days total).** Wire `--agent` at startup; fix `agi session fork --at-turn/--as` to actually truncate + rename (real bug); emit `RunningTool`/`ToolResult` in `--json-events` (variants already exist); populate `TurnUsage.cumulative_dollars` in the streaming path; remove the unwired `/sandbox` preset UX or wire it; correct the README hook count (32), the `--json-events`/cost-HUD uniqueness claims, and the provider count. Mostly 1-line/small fixes that stop the binary from advertising capabilities it doesn't have — the single biggest honesty/credibility win.
2. **Multiline TUI composer + input history + @-file completion (M-L).** Adopt `tui-textarea` to shortcut the buffer/cursor rework; add a prompt ring buffer (Up/Down recall + Ctrl-R) and an `@`-triggered fuzzy file popup. The most-felt daily-use gap.
3. **Render real diff hunks (M).** `/diff-review` currently shows no diff body; populate hunks from `git diff` and colorize +/- lines (syntect already available).
4. **Cut a real `v-cli-1.7.1` release + fill Homebrew SHAs (M, run-it task).** Pipeline already exists; this is the difference between "scaffolded" and "shipped."

**P1 — close the depth gaps:** 5. **Wire extended-thinking end-to-end (M).** Thread effort/budget through `stream_completion` into the Anthropic `thinking` block, parse `thinking_delta`, propagate reasoning tokens. Turns a dead picker into a real feature. 6. **LLM-based compaction (L).** Summarize-then-replace older history; wire into the existing `chat.rs:165` trigger and add a mid-loop re-check. 7. **Streaming/background shell + multimodal `view_image` + a working out-of-box web_search (M each).** The three highest-leverage built-in-tool robustness gaps vs both rivals. 8. **MCP resources (`resources/list`/`read`) + a non-stub server mode (M, ~1-2 days each).** Structs already exist; the `cli_tool_catalog` already exists to expose. 9. **Anthropic OAuth → inference (M).** The Claude-subscription token is captured but never sent (only `x-api-key`); wiring it closes a real auth gap users will hit. 10. **In-TUI resume/fork picker + file-restoring rewind (M-L).** Backend (`list_managed_sessions`/`fork_managed_session`) already exists; only the ratatui overlay is missing.

## 8. Verdict

AGI CLI is a **credible peer in architecture and breadth but not yet in finish.** It is honest production code — no panic-stubs, real sandboxing on the happy path, a genuinely unique multi-provider routing core that legitimately beats both Codex and Claude Code on the providers/auth dimension, plus three features (A2A, ecosystem import, learned-skills/voice) neither rival has. But it is held back by a recurring pattern the verification surfaced repeatedly: **well-designed capabilities that are scaffolded, dead-wired, or cosmetically advertised** — the dead extended-thinking picker, the empty-hunk diff viewer, the unwired `/sandbox` presets, the cosmetic `--at-turn` fork, the captured-but-unused Anthropic OAuth, the dead skill-scoring machinery, and the overstated README claims. The single highest-leverage thing to fix is not a new feature — it is to **eliminate the dead/misleading controls and correct the overstated README claims (P0 item 1)**, because every phantom control and false "unique" badge converts AGI's real, verifiable strengths into a credibility liability the moment a technical buyer reads the source. Make the binary tell the truth first; then close the context-engine and TUI-editor gaps that separate it from the category leaders.
