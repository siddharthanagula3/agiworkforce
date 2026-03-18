# CLI Competitive Scorecard — 4-Way Comparison

**Last updated**: 2026-03-18 (verified from competitor source code + live docs)
**AGI Workforce CLI**: 23 source files, 23,258 lines Rust, 705 tests, 3.9MB binary

## Sources

- Claude Code: WebFetch docs.anthropic.com + live docs (60+ pages, 22 hook events, 30+ tools, 50+ flags)
- Codex CLI: Source code exploration ~/Desktop/codex-cli/ (Rust + ratatui TUI, 45+ crates)
- Gemini CLI: Source code exploration ~/Desktop/gemini-cli/ (TypeScript + Ink/React, 7 packages)
- OpenCode: Source code exploration ~/Desktop/opencode/ (TypeScript + SolidJS/OpenTUI, 57 components)

## Feature Matrix

| #   | Feature                 | Claude Code                                   | Gemini CLI                  | Codex CLI               | OpenCode                    | AGI Workforce                           | Score         |
| --- | ----------------------- | --------------------------------------------- | --------------------------- | ----------------------- | --------------------------- | --------------------------------------- | ------------- |
| 1   | Interactive REPL        | ✅ rustyline                                  | ✅ Ink (React)              | ✅ ratatui TUI          | ✅ SolidJS/OpenTUI          | ✅ rustyline + vi mode                  | PARITY        |
| 2   | Streaming markdown      | ✅ custom renderer                            | ✅ AnsiOutput               | ✅ markdown_stream      | ✅ OpenTUI renderer         | ✅ custom FSM renderer                  | PARITY        |
| 3   | Agent mode (auto)       | ✅ 25 turns default                           | ✅ ReAct loop               | ✅ full-auto + sandbox  | ✅ build agent              | ✅ 25 turns + loop detection            | PARITY        |
| 4   | Subagent parallelism    | ✅ Agent tool (types: Explore, Plan, general) | ❌                          | ✅ spawn_agent + fork   | ❌                          | ✅ task tool, 7 concurrent threads      | **PARITY**    |
| 5   | Agent Teams             | ✅ experimental (messaging + task claiming)   | ❌                          | ❌                      | ❌                          | ✅ --team, inbox, shared tasks, deps    | **PARITY**    |
| 6   | Skills system           | ✅ SKILL.md + frontmatter, 5 bundled          | ❌                          | ❌                      | ❌                          | ✅ .agiworkforce/skills/, scoring       | **PARITY**    |
| 7   | Hooks system            | ✅ 22 events, 4 types (cmd/http/prompt/agent) | ❌                          | ✅ Smart Approvals      | ❌                          | ✅ 16 events, command type              | PARTIAL       |
| 8   | MCP tools               | ✅ stdio+SSE+HTTP, OAuth                      | ✅ stdio+SSE+HTTP, OAuth    | ✅ MCP + Agents SDK     | ✅ stdio+SSE+HTTP           | ✅ stdio only                           | PARTIAL       |
| 9   | Session management      | ✅ persist, resume, fork, name, export        | ✅ checkpointing            | ✅ thread/rollout JSONL | ✅ SQLite + Drizzle ORM     | ✅ SQLite + JSON, search, rename        | PARITY        |
| 10  | Checkpoints / rewind    | ✅ /rewind code+conversation                  | ❌                          | ✅ rollout replay       | ✅ session revert           | ✅ /rewind N, auto-checkpoint           | **PARITY**    |
| 11  | Hierarchical memory     | ✅ managed/project/user + rules/              | ✅ global/extension/project | ❌                      | ❌                          | ✅ global/project/local, /memory cmd    | **PARITY**    |
| 12  | Permission / sandbox    | ✅ 5 modes, 78 rules, managed policy          | ✅ Docker/gVisor sandbox    | ✅ Seatbelt + Landlock  | ✅ ask permission per tool  | ✅ 3-tier + 250-rule safety classifier  | PARTIAL       |
| 13  | Fast mode               | ✅ /fast → Haiku                              | ❌                          | ❌                      | ❌                          | ✅ /fast, configurable fast_model       | **PARITY**    |
| 14  | Pipe / print mode       | ✅ -p + --output-format                       | ✅ non-interactive          | ✅ --quiet              | ✅ piped output             | ✅ --print, --raw, stdin pipe           | **PARITY**    |
| 15  | Output formats          | ✅ text/json/stream-json                      | ✅ JSON                     | ✅ --json               | ❌                          | ✅ text/json/stream-json                | **PARITY**    |
| 16  | **Multi-model routing** | ❌ Claude only                                | ❌ Gemini only              | ❌ OpenAI (+Ollama)     | ✅ 75+ providers            | ✅ 7 providers, 18+ models              | **ADVANTAGE** |
| 17  | **BYOK**                | ❌ Anthropic acct                             | ❌ Google acct              | ❌ OpenAI acct          | ✅ env vars                 | ✅ 7 provider env vars, /setup wizard   | **ADVANTAGE** |
| 18  | **Fallback chains**     | ✅ --fallback-model (single)                  | ❌                          | ❌                      | ❌                          | ✅ fallback_chain config (multi-model)  | **ADVANTAGE** |
| 19  | Plan mode               | ✅ /plan + EnterPlanMode tool                 | ❌                          | ❌                      | ✅ Tab to switch plan agent | ✅ /plan, filters to read-only tools    | **PARITY**    |
| 20  | Side queries (/btw)     | ✅ /btw                                       | ❌                          | ❌                      | ❌                          | ✅ /btw, isolated context               | **PARITY**    |
| 21  | Git diff display        | ✅ /diff interactive                          | ❌                          | ✅ diff_render.rs       | ✅ npm diff                 | ✅ /diff, colored, stat summary         | **PARITY**    |
| 22  | Context compaction      | ✅ auto 95% + /compact [focus]                | ❌                          | ❌                      | ✅ session compaction       | ✅ auto 90% + /compact [focus]          | **PARITY**    |
| 23  | /config set/get         | ✅ /config                                    | ❌                          | ✅ config.toml          | ✅ tui.json settings        | ✅ /config set/get, TOML persistence    | **PARITY**    |
| 24  | Branch/fork             | ✅ /branch, /fork                             | ❌                          | ✅ thread fork          | ✅ parent/child sessions    | ✅ /branch → SQLite session             | **PARITY**    |
| 25  | Shell completions       | ✅ bash/zsh/fish                              | ❌                          | ❌                      | ❌                          | ✅ bash/zsh/fish via clap_complete      | **PARITY**    |
| 26  | **Subscription auth**   | ❌                                            | ❌                          | ❌                      | ❌                          | ✅ Copilot + ChatGPT Plus OAuth         | **UNIQUE**    |
| 27  | **Safety classifier**   | ❌ (rule-based perms)                         | ❌                          | ✅ execpolicy rules     | ❌                          | ✅ 250+ rules, 3-tier classification    | **ADVANTAGE** |
| 28  | Cost tracking           | ✅ /cost, /usage                              | ❌                          | ❌                      | ❌                          | ✅ /cost per-turn + session, pricing DB | **PARITY**    |
| 29  | **Model catalog**       | ❌ (single model)                             | ❌ (single)                 | ❌ (single)             | ✅ model list               | ✅ 18+ models, pricing, deprecation     | **ADVANTAGE** |
| 30  | Max turns limit         | ✅ --max-turns                                | ❌                          | ❌                      | ❌                          | ✅ --max-turns N                        | **PARITY**    |
| 31  | Vim mode                | ✅ /vim toggle                                | ❌                          | ❌                      | ✅ hjkl + leader key        | ✅ AGIWORKFORCE_VI=1                    | **PARITY**    |
| 32  | ! bash prefix           | ✅ ! runs shell direct                        | ❌                          | ❌                      | ❌                          | ❌                                      | GAP           |
| 33  | @ file mentions         | ✅ @ autocomplete                             | ❌                          | ❌                      | ❌                          | ❌                                      | GAP           |
| 34  | --effort level          | ✅ low/medium/high/max                        | ❌                          | ❌                      | ❌                          | ❌                                      | GAP           |
| 35  | TUI framework           | ❌ (readline)                                 | ✅ Ink (React)              | ✅ ratatui              | ✅ OpenTUI (SolidJS)        | ❌ (rustyline)                          | GAP           |
| 36  | OS sandbox              | ❌                                            | ✅ Docker/gVisor            | ✅ Seatbelt/Landlock    | ❌                          | ❌                                      | GAP           |
| 37  | LSP integration         | ✅ LSP tool                                   | ❌                          | ❌                      | ✅ LSP tool                 | ❌                                      | GAP           |
| 38  | Voice dictation         | ✅ hold Space PTT                             | ❌                          | ❌                      | ❌                          | ❌                                      | GAP           |
| 39  | Extensions marketplace  | ❌ (plugins)                                  | ✅ marketplace              | ❌                      | ❌                          | ❌                                      | GAP           |
| 40  | Web/remote sessions     | ✅ --remote, --teleport                       | ❌                          | ❌                      | ✅ HTTP remote attach       | ❌                                      | GAP           |

## Scoring Summary

| Category      | Score | Details                                                                      |
| ------------- | ----- | ---------------------------------------------------------------------------- |
| **PARITY**    | 19/40 | Feature-matched with market leaders                                          |
| **ADVANTAGE** | 5/40  | Multi-model, BYOK, fallback chains, safety classifier, model catalog         |
| **UNIQUE**    | 1/40  | Subscription auth (Copilot + ChatGPT Plus OAuth)                             |
| **PARTIAL**   | 3/40  | Hooks (16 vs 22), MCP (stdio only), permissions (simpler model)              |
| **GAP**       | 9/40  | ! prefix, @ mentions, --effort, TUI, sandbox, LSP, voice, extensions, remote |

**Overall parity: 62.5%** (25/40 at parity or better)

## AGI Workforce Killer Advantages

### 1. Multi-Model Routing (7 providers, 18+ models)

Claude Code: Claude only. Gemini CLI: Gemini only. Codex CLI: OpenAI + Ollama. OpenCode: 75+ providers (closest competitor but TypeScript, not standalone binary). AGI Workforce is the only **Rust-native** CLI with multi-provider support.

### 2. BYOK (Bring Your Own Key)

No vendor lock-in. Users configure any provider via env vars or `/setup` wizard. No account creation required.

### 3. Fallback Chains (UNIQUE)

`fallback_chain = ["claude-opus-4-6", "gpt-4o", "gemini-2.5-pro"]` — automatic cross-provider failover. Claude Code's `--fallback-model` is single-model only. No other CLI has multi-step fallback.

### 4. Command Safety Classifier

250+ heuristic rules with 3-tier classification (Safe/Unknown/Dangerous). More granular than Codex's policy engine or Claude Code's permission modes. Detects dangerous patterns in pipes, redirects, and compound commands.

### 5. Subscription Auth (UNIQUE)

Route through Copilot or ChatGPT Plus subscriptions. Use models you already pay for without separate API keys.

## Competitor Patterns Worth Adopting

### From Codex CLI (Rust, ratatui)

- **Approval modal UX**: Show command + risk level + "Approve/Deny/Always OK/Edit" keyboard shortcuts
- **SQ/EQ event pattern**: Submission queue / event queue for async message handling
- **Agent nicknames**: Visual distinction between parent and sub-agents in chat output
- **Rollout-based persistence**: Append-only JSONL (vs mutation-heavy SQLite)
- **Seatbelt/Landlock sandbox**: OS-level process isolation

### From Gemini CLI (TypeScript, Ink)

- **Composite strategy routing**: FallbackStrategy → OverrideStrategy → ClassifierStrategy → DefaultStrategy
- **Streaming event types**: CHUNK | RETRY | AGENT_EXECUTION_STOPPED (vs generic "data arrived")
- **Extensions marketplace**: Pre-packaged integrations with installation and playbooks
- **Content validation during streaming**: Auto-remove malformed model outputs
- **MessageBus for tool confirmations**: Decouple execution from confirmation UI

### From OpenCode (TypeScript, SolidJS/OpenTUI)

- **Leader-key bindings**: Vim-style leader key with 2s timeout for power users
- **Drizzle ORM for sessions**: Type-safe SQLite queries with parent/child session relationships
- **Permission patterns with wildcards**: Per-tool allowlists with glob support
- **60 FPS target rendering**: Granular reactivity for smooth TUI updates
- **Session summary stats**: Track additions, deletions, files changed per session

### From Claude Code (Node.js, rustyline)

- **22 hook events with 4 types** (command/http/prompt/agent): Our 16 events are close; add 6 more
- **! prefix for direct bash**: Zero-friction shell command execution
- **@ file mention autocomplete**: Fast file path injection into prompts
- **--effort level**: Preset bundles (low=fast/cheap, max=thorough/expensive)
- **Rules system**: `.claude/rules/` with path-scoped conditional loading
- **Auto-memory**: Agent writes notes for itself across sessions

## Gaps to Close (Priority Order)

### P0 — Quick Wins (< 50 LOC each)

1. **`!` bash prefix** in REPL — direct shell execution without tool call overhead
2. **`--effort` flag** — preset bundles for max_turns + max_tokens + temperature
3. **`/status` command** — show version, model, provider, auth status, context usage

### P1 — Medium Effort

4. **6 more hook events** — match Claude Code's 22 (add WorktreeCreate/Remove, PreCompact/PostCompact, ConfigChange, TeammateIdle)
5. **MCP SSE transport** — add SSE alongside existing stdio support
6. **`/doctor` command** — diagnose API keys, config, MCP servers, git

### P2 — Larger Efforts (Future Sprint)

7. **TUI framework** — migrate from rustyline to ratatui (major effort, separate sprint)
8. **OS sandbox** — Seatbelt (macOS) / Landlock (Linux) for `--dangerously-skip-permissions`
9. **LSP integration** — tool that reads diagnostics from running language servers
10. **Remote sessions** — web-based session continuation

## Architecture Notes

### CLI Independence

The CLI is intentionally self-contained (23K LOC Rust, zero Tauri dependencies). Shared core crate extraction is planned but not yet implemented. This is correct for v0.1.0 — the desktop backend uses Tauri-specific patterns (managed state, IPC events) that would need abstraction before sharing.

### Binary Size Comparison

| CLI           | Size  | Language   | Runtime       |
| ------------- | ----- | ---------- | ------------- |
| AGI Workforce | 3.9MB | Rust       | None (static) |
| Codex CLI     | ~5MB  | Rust       | None (static) |
| Claude Code   | ~60MB | Node.js    | Node runtime  |
| Gemini CLI    | ~15MB | TypeScript | Node runtime  |
| OpenCode      | ~12MB | TypeScript | Bun runtime   |

### Test Coverage

705 tests across 23 files. Strong coverage on safety classifier (200+ tests), config management (80+ tests), error handling (70+ tests), provider normalization (70+ tests).
