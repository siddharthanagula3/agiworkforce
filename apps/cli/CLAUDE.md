# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`agiworkforce-cli` — a multi-model AI agent CLI. Binary name: `agiworkforce`. Rust crate at `apps/cli/` within the AGI Workforce monorepo. ~39K LOC across 52 modules, plus a 104K LOC TUI subsystem (`src/tui/`) ported from Codex CLI.

## Build & Run Commands

```bash
cargo check -p agiworkforce-cli          # Fast type check (start here)
cargo clippy -p agiworkforce-cli         # Lint (warnings = errors for unused/unsafe)
cargo build -p agiworkforce-cli          # Debug build
cargo build -p agiworkforce-cli --release # Release build
cargo run -p agiworkforce-cli -- "prompt" # One-shot with prompt
cargo run -p agiworkforce-cli             # Interactive REPL
cargo run -p agiworkforce-cli -- --no-tui # Line-based REPL (no full-screen TUI)
cargo test -p agiworkforce-cli            # Run tests (only when asked)
cargo test -p agiworkforce-cli -- test_name # Single test
```

## Lint Configuration

Defined in `Cargo.toml` `[lints.rust]`:
- `deny`: `unsafe_code`, `dead_code`, `unused_imports`, `unused_variables`, `unused_mut`
- `allow`: `clippy::await_holding_lock`
- Three modules use `#[allow(dead_code)]`: `a2a`, `marketplace`, `memory_pipeline`, `skill_learner` — these are in-progress

## Architecture

### Entry Point & Flow

```
main.rs (Cli struct via clap derive)
  ├─ No args → repl::run_repl() (interactive REPL with 30+ slash commands)
  ├─ PROMPT arg → agent::execute_prompt() (one-shot agentic turn)
  ├─ --daemon → daemon::run_daemon() (cron/webhooks/file watchers via Axum)
  └─ Subcommand → exec, review, apply, sandbox, mcp-server, app-server,
                   resume, fork, cloud, plugin, features, execpolicy,
                   ecosystem, sync, login, logout, auth-status
```

### Core Loop (agent.rs)

The agentic loop in `agent.rs` drives all execution:
1. Assembles system prompt via `context.rs` (memory tiers + CLAUDE.md + skills + MCP tools)
2. Sends messages to LLM via `models.rs` (streaming SSE)
3. Receives tool calls → classifies safety via `safety.rs` → executes via `tools.rs`
4. Appends results, loops until LLM stops calling tools or hits `max_turns`
5. At 90% context capacity, triggers `compaction.rs` to summarize old messages

### Module Map (by layer)

**LLM & Providers**: `models.rs` (7 providers: Anthropic/OpenAI/Google/Ollama/Mistral/xAI/DeepSeek, SSE parser), `provider.rs` (token limits, costs, fallback chains), `model_catalog.rs` (3-tier registry: bundled → disk cache 5min TTL → remote fetch from models.dev)

**Agent & Tools**: `agent.rs` (agentic loop), `tools.rs` (9 built-in tools + 4 team tools), `safety.rs` (3-tier: safe/unknown/dangerous), `permissions.rs`, `subagent.rs` (parallel delegation), `teams.rs` (multi-agent messaging)

**Session & Memory**: `sessions.rs` (SQLite at `~/.agiworkforce/sessions.db`), `memory.rs` (3-tier: global/project/local), `compaction.rs` (context window management), `context.rs` (system prompt assembly), `history.rs`

**Config**: `config.rs` (4-layer TOML merge: bundled defaults → system `~/.agiworkforce/config.toml` → project `.agiworkforce/config.toml` → env vars)

**Interactive**: `repl.rs` (rustyline editor, 30+ slash commands, vim mode via `AGIWORKFORCE_VI=1`), `voice.rs` (Whisper STT via cpal/hound), `onboarding.rs` (first-run provider setup)

**Auth**: `auth.rs` (OAuth refresh + API key management, tokens at `~/.agiworkforce/auth.json`), `oauth.rs` (OAuth flow), `agiworkforce-login` crate

**Extensibility**: `mcp.rs` (MCP stdio client, JSON-RPC 2.0), `plugins.rs` (discovery from `~/.agiworkforce/plugins/`), `skills.rs` (YAML frontmatter markdown, keyword matching), `hooks.rs` (event triggers), `ecosystem.rs` (scans Claude/Codex/Cursor/Gemini dotfiles)

**Infrastructure**: `daemon.rs` (Axum HTTP for webhooks, cron, file watchers), `sandbox.rs` (macOS Seatbelt, Linux Bubblewrap/Landlock), `a2a.rs` (agent-to-agent protocol), `cloud.rs` (BYOK cloud tasks), `sync.rs` (dotfile export/import)

**TUI**: `src/tui/` (121 files, ratatui-based full-screen UI ported from Codex CLI — chat widget, diff rendering, history, audio)

### Tool Safety Classification

Tools are classified into three tiers that determine confirmation behavior:
- **Safe** (`-y` auto-approves): `read_file`, `search_files`, `list_directory`, `web_search`, `web_fetch`
- **Unknown** (always prompts): `mkdir`, `cp`, custom scripts
- **Dangerous** (always prompts, even with `-y`): `sudo`, `rm -rf`, `git push --force`, `dd`

The classifier in `safety.rs` uses command whitelists/blacklists with pattern matching.

### Config Layers (merge order)

1. Bundled defaults (compiled in)
2. System: `~/.agiworkforce/config.toml`
3. Project: `.agiworkforce/config.toml` (in git root)
4. Environment: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.

Later layers override earlier ones. User model overrides in config always win over the model catalog.

### Storage Locations

| Path | Purpose |
|------|---------|
| `~/.agiworkforce/config.toml` | Global config |
| `~/.agiworkforce/auth.json` | OAuth tokens + API keys (0o600) |
| `~/.agiworkforce/sessions.db` | SQLite: messages, metadata, costs |
| `~/.agiworkforce/cache/models.json` | Model catalog cache (5min TTL) |
| `~/.agiworkforce/skills/` | Global skill files |
| `~/.agiworkforce/plugins/` | Plugin registry |
| `~/.agiworkforce/triggers.json` | Cron/webhook/file-watcher config |
| `~/.agiworkforce/daemon-logs/` | Trigger execution logs |
| `.agiworkforce/config.toml` | Project-level config |
| `CLAUDE.md` (git root) | Project memory (auto-loaded into system prompt) |

## Key Dependencies

- `tokio` (full) — async runtime
- `clap` (derive) — CLI parsing with 20+ flags and 18 subcommands
- `reqwest` (stream, json) — HTTP client for LLM APIs
- `rustyline` — terminal editor for REPL
- `ratatui` + `crossterm` — full-screen TUI
- `rusqlite` (bundled) — SQLite sessions
- `axum` + `tower` — webhook HTTP server (daemon mode)
- `cpal` + `hound` — audio capture for voice mode
- `syntect` + `two-face` — code highlighting in markdown output
- `agiworkforce-sandbox-policy` — OS-level sandbox (Seatbelt/Bubblewrap/Landlock)
- `agiworkforce-login` — OAuth flow library

## Conventions & Gotchas

- **No feature flags** in this crate — all capabilities compile unconditionally (unlike the desktop app). Platform-specific deps use `[target.'cfg(...)'.dependencies]` instead.
- **`#[allow(dead_code)]` on modules** (`a2a`, `marketplace`, `memory_pipeline`, `skill_learner`) means they're wired but not fully called yet — don't delete the allow annotations.
- **Effort presets** (`--effort low/medium/high/max`) bundle `max_turns`, `max_tokens`, and `temperature` together — modify all three when changing a preset.
- **Model catalog is 3-tier**: bundled defaults → disk cache → remote API. Never hardcode model IDs; read from the catalog or `models.json`.
- **Context compaction** triggers automatically at 90% capacity. The summarization itself uses the same LLM, so compaction failures can cascade.
- **Session forking** (`--fork-session`) creates a new SQLite row pointing to the same parent — the original session is never modified.
- **REPL shortcuts**: `!` prefix runs shell commands, `#` appends to CLAUDE.md, `\` enables multiline input.
- **Platform-specific**: `arboard` (clipboard), `tiny_http`, `two-face`, `pulldown-cmark` are excluded on Android. `nix` (signals) is Unix-only.
- **TUI subsystem** (`src/tui/`) is 104K LOC ported from Codex CLI. It's a separate world — changes there should be isolated from the core CLI modules.
