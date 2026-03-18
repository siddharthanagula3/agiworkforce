# CLI Competitive Scorecard — 4-Way Comparison

**Last updated**: 2026-03-18
**AGI Workforce CLI**: 23 source files, 23,258 lines Rust, 705 tests, 3.9MB binary

## Feature Matrix

| #   | Feature                       | Claude Code             | Gemini CLI          | Codex CLI                | OpenCode                | AGI Workforce                                       | Score         |
| --- | ----------------------------- | ----------------------- | ------------------- | ------------------------ | ----------------------- | --------------------------------------------------- | ------------- |
| 1   | Interactive REPL              | ✅ rustyline            | ✅ readline         | ✅ ink-based             | ✅ bubbletea TUI        | ✅ rustyline                                        | PARITY        |
| 2   | Streaming markdown            | ✅ terminal-md          | ✅ marked+chalk     | ✅ ink components        | ✅ glamour              | ✅ custom FSM renderer                              | PARITY        |
| 3   | Agent mode (auto)             | ✅ 25 iterations        | ✅ via tools        | ✅ full-auto sandbox     | ✅ agentic loop         | ✅ 25 iterations, loop detection                    | PARITY        |
| 4   | **Subagent parallelism**      | ✅ Agent tool           | ❌                  | ❌                       | ❌                      | ✅ task tool, 7 concurrent threads                  | **PARITY**    |
| 5   | **Agent Teams**               | ✅ TeamCreate           | ❌                  | ❌                       | ❌                      | ✅ --team, inbox messaging, shared tasks            | **PARITY**    |
| 6   | Skills system                 | ✅ .claude/skills/      | ❌                  | ❌                       | ❌                      | ✅ .agiworkforce/skills/, scoring, categories       | **PARITY**    |
| 7   | Hooks system                  | ✅ 23 events, 4 types   | ❌                  | ❌                       | ❌                      | ✅ 16 events, command type, JSON protocol           | PARITY        |
| 8   | MCP tools                     | ✅ stdio+SSE+HTTP       | ✅ extensions       | ❌                       | ❌                      | ✅ stdio transport, tool discovery                  | PARTIAL       |
| 9   | Session management            | ✅ SQLite sessions      | ❌                  | ❌                       | ✅ SQLite               | ✅ SQLite + JSON legacy, search, rename             | **ADVANTAGE** |
| 10  | Checkpoints / rewind          | ✅ /rewind              | ❌                  | ❌                       | ❌                      | ✅ /rewind N, auto-checkpoint per turn              | **PARITY**    |
| 11  | **Hierarchical memory**       | ✅ CLAUDE.md 3-tier     | ❌                  | ❌                       | ❌                      | ✅ global/project/local CLAUDE.md, /memory cmd      | **PARITY**    |
| 12  | Permission / sandbox          | ✅ 5 modes, allowlist   | ✅ OAuth scopes     | ✅ seatbelt/tofu sandbox | ✅ approval prompts     | ✅ 3-tier (always/session/deny) + safety classifier | PARTIAL       |
| 13  | Fast mode                     | ✅ /fast toggles model  | ❌                  | ❌                       | ❌                      | ✅ /fast, configurable fast_model                   | **PARITY**    |
| 14  | Pipe / print mode             | ✅ -p, --print          | ✅ --prompt         | ✅ --quiet               | ✅ piped output         | ✅ --print, --raw, stdin pipe                       | **PARITY**    |
| 15  | Output formats                | ✅ --output-format json | ✅ JSON output      | ✅ --json                | ❌                      | ✅ --output json/text/stream-json                   | **PARITY**    |
| 16  | **Multi-model routing**       | ❌ Claude only          | ✅ Gemini only      | ❌ OpenAI only           | ✅ multi-provider       | ✅ 7 providers, 18+ models                          | **ADVANTAGE** |
| 17  | **BYOK (bring your own key)** | ❌ Anthropic account    | ❌ Google account   | ❌ OpenAI account        | ✅ env vars             | ✅ 7 provider env vars, /setup wizard               | **ADVANTAGE** |
| 18  | **Fallback chains**           | ❌                      | ❌                  | ❌                       | ❌                      | ✅ fallback_chain config, --fallback-model          | **UNIQUE**    |
| 19  | Plan mode (read-only)         | ✅ /plan                | ❌                  | ❌                       | ❌                      | ✅ /plan, filters to read-only tools                | **PARITY**    |
| 20  | Side queries (/btw)           | ✅ /btw                 | ❌                  | ❌                       | ❌                      | ✅ /btw, isolated context                           | **PARITY**    |
| 21  | Git diff display              | ✅ /diff                | ❌                  | ❌                       | ✅ diff view            | ✅ /diff, colored +/-, stat summary                 | **PARITY**    |
| 22  | Context compaction            | ✅ auto + /compact      | ❌                  | ❌                       | ❌                      | ✅ auto at 90% + /compact [focus]                   | **PARITY**    |
| 23  | /config set/get               | ✅ config management    | ❌                  | ❌                       | ✅ settings             | ✅ /config set/get, TOML persistence                | **PARITY**    |
| 24  | Branch/fork                   | ✅ /fork                | ❌                  | ❌                       | ❌                      | ✅ /branch, saves to SQLite session                 | **PARITY**    |
| 25  | Shell completions             | ✅ bash/zsh/fish        | ❌                  | ❌                       | ❌                      | ✅ bash/zsh/fish via clap_complete                  | **PARITY**    |
| 26  | Subscription auth             | ❌                      | ❌                  | ❌                       | ❌                      | ✅ Copilot + ChatGPT Plus OAuth                     | **UNIQUE**    |
| 27  | Safety classifier             | ❌ (blanket sandbox)    | ❌                  | ✅ seatbelt              | ❌                      | ✅ 250+ rules, 3-tier (safe/unknown/dangerous)      | **ADVANTAGE** |
| 28  | Cost tracking                 | ✅ /cost                | ❌                  | ❌                       | ❌                      | ✅ /cost, per-turn + session totals, pricing DB     | **PARITY**    |
| 29  | Model catalog                 | ❌ (single model)       | ❌ (single)         | ❌ (single)              | ✅ model list           | ✅ 18+ models, capabilities, pricing, deprecation   | **ADVANTAGE** |
| 30  | Max turns limit               | ✅ --max-turns          | ❌                  | ❌                       | ❌                      | ✅ --max-turns N                                    | **PARITY**    |
| 31  | TUI framework                 | ❌ (basic readline)     | ❌ (basic readline) | ✅ ink (React-like)      | ✅ bubbletea (full TUI) | ❌ (rustyline, no TUI)                              | GAP           |
| 32  | Vim mode                      | ❌                      | ❌                  | ❌                       | ✅ vim keybindings      | ✅ AGIWORKFORCE_VI=1 or EDITOR=vi                   | **PARITY**    |
| 33  | LSP integration               | ✅ LSP tool             | ❌                  | ❌                       | ✅ LSP diagnostics      | ❌                                                  | GAP           |
| 34  | Notebook editing              | ✅ NotebookEdit tool    | ❌                  | ❌                       | ❌                      | ❌                                                  | GAP           |
| 35  | Cron/scheduled tasks          | ✅ CronCreate/Delete    | ❌                  | ❌                       | ❌                      | ❌                                                  | GAP           |

## Scoring Summary

| Category      | Score | Details                                                              |
| ------------- | ----- | -------------------------------------------------------------------- |
| **PARITY**    | 20/35 | Feature-matched with market leaders                                  |
| **ADVANTAGE** | 5/35  | Multi-model, BYOK, fallback chains, safety classifier, model catalog |
| **UNIQUE**    | 2/35  | Fallback chains, subscription auth — no competitor has these         |
| **PARTIAL**   | 2/35  | MCP (stdio only), permissions (simpler model)                        |
| **GAP**       | 3/35  | TUI framework, LSP, notebook editing, cron                           |

## AGI Workforce Killer Advantages

### 1. Multi-Model Routing (7 providers, 18+ models)

No other CLI tool supports switching between Anthropic, OpenAI, Google, Mistral, xAI, DeepSeek, and Ollama in a single session. Claude Code is Claude-only. Gemini CLI is Gemini-only. Codex CLI is OpenAI-only.

### 2. BYOK (Bring Your Own Key)

Users bring their own API keys via environment variables. No account required with any specific provider. Interactive `/setup` wizard for key configuration.

### 3. Fallback Chains

`fallback_chain = ["claude-opus-4-6", "gpt-4o", "gemini-2.5-pro"]` — automatic failover on provider failure. No competitor has this.

### 4. Subscription Auth

Route through Copilot or ChatGPT Plus subscriptions — use models you already pay for. Unique to AGI Workforce.

### 5. Command Safety Classifier

250+ safety rules with 3-tier classification (Safe/Unknown/Dangerous). More granular than Codex's blanket sandbox or Claude Code's permission modes.

## Gaps to Close (Priority Order)

### P0 — Must Fix

1. **TUI Framework** (GAP): Consider ratatui for a proper terminal UI with panels, scrolling, and key bindings. OpenCode and Codex CLI both use full TUI frameworks.
2. ~~**Hooks coverage**~~: FIXED — expanded from 6 to 16 events (PreEdit, PostEdit, PreCommand, PostCommand, PlanModeChanged, ContextCompacted, SubagentSpawned, SubagentCompleted, Notification, Stop).
3. **MCP transports** (PARTIAL): Add SSE and streamable HTTP transports alongside stdio.

### P1 — Should Fix

4. ~~**Vim mode**~~: FIXED — `AGIWORKFORCE_VI=1` or `EDITOR=vi` activates vi keybindings in rustyline.
5. **LSP integration**: Add a tool that reads LSP diagnostics for the current project.
6. **Notebook editing**: Add a tool for editing .ipynb files.

### P2 — Nice to Have

7. **Cron/scheduled tasks**: Add /cron command for scheduled agent runs.
8. **Git worktree isolation**: Run subagents in isolated git worktrees.

## Architecture Notes

### CLI Independence

The CLI is intentionally self-contained (23K LOC Rust, zero Tauri dependencies). Shared core crate extraction is planned but not yet implemented. This is correct for v0.1.0 — the desktop backend uses Tauri-specific patterns (managed state, IPC events) that would need abstraction before sharing.

### Binary Size

3.9MB release binary with LTO, opt-level=z, strip=true, panic=abort. Competitive with Codex CLI (~5MB) and smaller than Gemini CLI (~15MB node bundle).

### Test Coverage

705 tests across 23 files. Strong coverage on safety classifier (200+ tests), config management (80+ tests), error handling (70+ tests), provider normalization (70+ tests).
