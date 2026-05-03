# AGI Workforce CLI — Architecture

> Single source of truth for new contributors. Maps the 422-file / 151K-LOC codebase to its 14 subsystems.

This is a Rust monolithic binary (`agiworkforce`) compiled from `apps/cli/src/main.rs`. The workspace declares 115 crates in `crates/`, but **98 are excluded** (Sprint 5 FIX-022). The CLI links only two path crates: `agiworkforce-protocol` and `agiworkforce-sandbox-policy`.

## 0. The big picture

```
                            ┌──────────────────────────────────────┐
                            │ bin/agiworkforce (Rust binary)       │
                            │ entry: apps/cli/src/main.rs (~2.2K) │
                            └───────────────┬──────────────────────┘
                                            │ #[tokio::main] async fn main()
                                            ↓
                          Cli::parse() (clap, 35+ flags)
                                            ↓
              ┌─── First-run? ──→ init::init_home_dir(~/.agiworkforce/)
              │                   onboarding::run_onboarding() (if interactive)
              ↓
   Subcommand? ──→ Exec | Review | Apply | Sandbox | McpServer | AppServer |
                   Resume | Fork | Session | Cloud | Plugin | Features |
                   Execpolicy | Ecosystem | History | Sync | Login | Logout |
                   AuthStatus | Marketplace | Init | Onboarding   (21 total)
              │
              ↓ no subcommand
   --search? --stats? --daemon? --init? --cost? --list-models? --completions?
              │
              ↓ none of those
   final_prompt = build_final_prompt(positional, stdin, file_context)
              │
              ↓
   final_prompt.is_some()? ──→ run_oneshot()  (one-shot, prints, exits)
              │
              ↓ no
   --no-tui? ──→ repl::run_repl()  (rustyline line editor)
              │
              ↓ default
   tui::run()  (Ratatui+Crossterm full-screen, 125 files in src/tui/)
              │
              ↓
   ┌─── inside TUI/REPL ───────────────────────────────────────────┐
   │  user input → AgentSession::send() (agent.rs)                 │
   │     ↓                                                          │
   │  compaction::context_usage() → 90%? compact to 70%             │
   │     ↓                                                          │
   │  models::stream_completion() — provider-specific SSE           │
   │     ├─ Anthropic / OpenAI / Google / Ollama / Mistral / xAI    │
   │     ├─ DeepSeek / OllamaCloud / Copilot / ChatGPT subscription │
   │     └─ FallbackChain rotates on RateLimit/Transient/Any        │
   │     ↓ assistant returns text + tool_use blocks                  │
   │  partition tool_calls: task → SubagentManager (concurrent),    │
   │                        else → sequential                       │
   │     ↓                                                          │
   │  3-layer permission gate per tool:                             │
   │     1. CommandSafety (Safe/Unknown/Dangerous heuristic)        │
   │     2. PermissionStore (always_allow/deny + session_allow)     │
   │     3. PolicyEngine (TOML rules, priority-based)               │
   │     + optional SDK CanUseTool RPC to embedder                  │
   │     ↓                                                          │
   │  exec under sandbox (Seatbelt/Bwrap/Landlock if available)     │
   │     ↓                                                          │
   │  ToolResult appended → next LLM iteration (≤ max_turns)        │
   │     ↓ on completion:                                           │
   │  managed session JSONL persisted (~/.agiworkforce/...)         │
   │  memory_pipeline::extract_session_summary() (background)       │
   └──────────────────────────────────────────────────────────────┘
```

**Numbers**: 422 files, 151,493 LOC under `apps/cli/src/`. Single binary. No `lib.rs` — every module mounted directly under `main.rs`. 65 top-level modules plus 7 sub-trees: `tui/`, `runtime/`, `routing/`, `policy/`, `sdk_io/`, `output_styles/`, `notifications/`.

**Distribution**: dual-channel.

- Native: `cargo install --path apps/cli` → `~/.cargo/bin/agiworkforce`
- npm: `@agiworkforce/cli` is a thin Node wrapper at `apps/cli/npm/bin/agiworkforce.js` (97 LOC) that resolves the right platform package (6 platforms: darwin-arm64/x64, linux-arm64/x64, win32-arm64/x64) and `spawn`s the native binary with `stdio: 'inherit'`.

---

## 1. Boot path — `main()` ([apps/cli/src/main.rs](src/main.rs))

The single 1,000-line `async fn main` does linear dispatch (no React-style render-after-init):

1. `Cli::parse()` — clap derives 35+ flags + `Command` subcommand enum (`main.rs:782`)
2. `cli_options::CliOptions::from_cli(&cli)` — normalize permission_mode, allowed/disallowed tools, mcp_config_paths, additional_dirs (`main.rs:784`)
3. `config::CliConfig::load_merged()` — global TOML + project TOML + env vars (`AGIWORKFORCE_MODEL`, `AGIWORKFORCE_PROVIDER`, `AGIWORKFORCE_MAX_TOKENS`) (`main.rs:787`)
4. `cli.debug.is_some()` → enable verbose logging
5. `app_config.validate()` — warn but continue with defaults
6. `init::init_home_dir(~/.agiworkforce/)` — idempotent: creates plugins/, skills/, skills/.system/, skills/learned/, rules/, memories/, memories/session_summaries/, shell_snapshots/, log/, cache/. Generates default config.toml, INSTRUCTIONS.md, mcp.json, rules/default.rules, 5 built-in `.system` skills (code-review, refactor, test-writer, explain, security-audit) (`main.rs:817`)
7. First-run gate: `cli.command.is_none() && cli.prompt.is_none() && stdin.is_terminal() && !onboarding::is_setup_complete()` → `onboarding::run_onboarding()` (`main.rs:822`)
8. **Subcommand dispatch** if `cli.command` set (`main.rs:843–1481`)
9. **Flag-only commands** if no subcommand: `--search`, `--stats`, `--daemon`, `--init`, `--cost`, `--list-models`, `--completions` (`main.rs:1482–1620`)
10. Detect piped stdin
11. Apply `--effort` preset (Low/Medium/High/Max)
12. Apply explicit overrides (max_tokens, no_stream, temperature)
13. Resolve model, read `--file` contents
14. `context::gather_system_context()` — git, project type, monorepo, package manager, CI, containerization, editor, OS, shell
15. `build_final_prompt(positional, stdin, file_context)` — assembles `<file>…</file>\n\n<stdin>…</stdin>\n\nprompt`
16. **Mode selection**: oneshot vs REPL vs TUI (`main.rs:1717–1833`)

---

## 2. Subcommand catalog (21 total)

Defined as `enum Command` at `main.rs:421–521`.

| Subcommand                                         | Purpose                                               | Distinct from REPL?             |
| -------------------------------------------------- | ----------------------------------------------------- | ------------------------------- |
| `exec` (alias `e`)                                 | One-shot prompt with optional `--full-auto`, `--json` | Yes — non-interactive           |
| `review`                                           | Code review against base/commit                       | Yes — review.rs prompt          |
| `apply` (alias `a`)                                | Apply latest diff as git patch                        | Yes — apply_patch.rs            |
| `sandbox`                                          | Run arbitrary command under sandbox                   | Yes — direct sandbox invocation |
| `mcp-server`                                       | This CLI as MCP server (stdio)                        | Yes — embedder consumes         |
| `app-server`                                       | This CLI as JSON-RPC server (stdio or WebSocket)      | Yes — IDE integration           |
| `resume`, `fork`                                   | REPL with prior session loaded                        | Routes to REPL                  |
| `session list/show/fork`                           | Read-only session inspection                          | Yes                             |
| `cloud exec/list/models`                           | BYOK cloud submission                                 | Yes — cloud.rs                  |
| `plugin list/install`                              | Plugin management                                     | Yes                             |
| `marketplace search/install/uninstall/list/update` | Plugin marketplace                                    | Yes — registry.agiworkforce.com |
| `ecosystem scan/import/show`                       | Discover other AI tools' configs                      | Yes — ecosystem.rs              |
| `sync status/export/import`                        | Cross-device dotfile sync                             | Yes — sync.rs                   |
| `history`                                          | Browse session history                                | Yes                             |
| `login`, `logout`, `auth-status`                   | OAuth/API key management                              | Yes                             |
| `features`, `execpolicy`                           | Inspect runtime config                                | Yes                             |
| `init`, `onboarding`                               | Explicit setup re-runs                                | Yes                             |

---

## 3. The agentic loop ([agent.rs](src/agent.rs))

`AgentSession::send(config, user_input, on_chunk)` is the heart. Per-turn flow:

1. **Compaction check** — `compaction::context_usage(&messages, &model)`. If `fraction > 0.90`, `compact_messages(target = limit*70/100)`. 6-phase pipeline:
   1. Reverse token budget walk (truncate oldest tool outputs first)
   2. History split (preserve last 30%)
   3. Prune (replace tool_outputs >1000 tokens with summary)
   4. Truncate (text >500 tokens → shorten)
   5. Remove (drop tool_results if still over)
   6. Select (last N messages fitting budget)

2. **Append user message**, save checkpoint (for `/rewind`)

3. **Persist** to `~/.agiworkforce/managed_sessions/{session_id}.jsonl` (append-friendly JSONL with header record + one message per line)

4. **Build tool list** from `runtime::tool_catalog::effective_tool_definitions(plan_mode, team_mode, allowed_tools, mcp_tools)`. Built-in catalog: `read_file`, `write_file`, `edit_file`, `run_command`, `search_files`, `list_directory`, `web_search`, `web_fetch`, `task` (delegated subagent), plus extended `apply_patch`, `grep_files`, `tool_search`. MCP tools merged.

5. **First model call** via `models::stream_completion(provider, model, messages, tools, on_chunk)`. Provider-dispatched SSE parsing.
   - Non-retryable + `fallback_chain` set → walk to next model
   - Retryable → exponential backoff up to 30s, max 3 attempts
   - `--demo` mode synthesizes 429 on first call to demo fallback chain

6. **Build assistant message** with text + tool_use blocks, update token counters

7. **Agentic loop** while `tool_calls.len() > 0 && turn < effective_max` (default 25):
   - **Loop detection**: hash last 5 `(tool_name, args)`. Strike 1 → dialoguer confirm. Strike 2 → auto-stop.
   - **Partition** at `agent.rs:904–906`: `task` calls → `SubagentManager` (concurrent, max 7 dedicated OS threads). Others → sequential.
   - For each tool call: BeforeToolUse hook → permission gate → `tools::execute_tool()` → AfterToolUse hook
   - Sub-agent: full `AgentSession` with `max_turns = 15`, isolated runtime, `skip_permissions` propagated
   - Append `ContentBlock::ToolResult { is_error, output }` blocks
   - Re-call model with extended messages

8. **TurnResult**: `{response: String, input_tokens, output_tokens, via_subscription}`

**Multi-agent extensions**:

- [a2a.rs](src/a2a.rs) — Agent-to-Agent protocol with `AgentCard` advertisements, constant-time token comparison, whitelisted tools
- [teams.rs](src/teams.rs) — `TeamManager` with git worktree isolation per teammate
- [subagent.rs](src/subagent.rs) — local in-process spawning, dedicated OS threads, file modification tracking

---

## 4. Tool system ([tools.rs](src/tools.rs), [runtime/tool_catalog.rs](src/runtime/tool_catalog.rs), [mcp.rs](src/mcp.rs), [tool_search.rs](src/tool_search.rs))

**`ToolDefinition` struct** at [models.rs:56](src/models.rs):

```rust
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
    pub is_read_only: bool,           // (Phase 6 — concurrency hint)
    pub is_concurrency_safe: bool,    // (Phase 6 — concurrency hint)
    pub max_result_size_chars: Option<usize>, // (Phase 8 — per-tool size cap)
}
```

**Built-in tools** registered in [runtime/tool_catalog.rs:6](src/runtime/tool_catalog.rs):

- `read_file(path, start_line?, end_line?)` — read-only, concurrency-safe
- `write_file(path, content)`
- `edit_file(path, old_string, new_string)`
- `run_command(command)`
- `search_files(pattern, path?)` — read-only, concurrency-safe
- `list_directory(path?)` — read-only, concurrency-safe
- `web_search(query, max_results?)` — read-only, concurrency-safe
- `web_fetch(url)` — read-only, concurrency-safe
- `task(description, prompt)` — spawns subagent
- `apply_patch`, `grep_files`, `tool_search`

**MCP**: The CLI is both a client and a server.

- As client ([mcp.rs](src/mcp.rs)): JSON-RPC 2.0 over stdio. Configs from `.mcp.json` (project) + `~/.agiworkforce/.mcp.json` (global). Auto-reconnect with exponential backoff. Tools namespaced as `mcp_<server>_<tool>`.
- As server: `agiworkforce mcp-server` exposes own tools over MCP stdio. `agiworkforce app-server` is broader: JSON-RPC for IDE integration with `tools/list`, `initialize`, `shutdown`.

**[tool_search.rs](src/tool_search.rs)** (95 lines): scoring search across discoverable tools. Exact name +10, substring +5, description +2. Feature-flagged.

---

## 5. Permission stack ([permissions.rs](src/permissions.rs), [safety.rs](src/safety.rs), [policy/](src/policy/), [sandbox.rs](src/sandbox.rs))

**Three-layer permission stack** — evaluated in order:

| Layer                       | Source                                                      | Decisions                                                  |
| --------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| 1. CommandSafety classifier | hardcoded heuristic ([safety.rs](src/safety.rs), 1,515 LOC) | Safe / Unknown / Dangerous                                 |
| 2. PermissionStore          | `~/.agiworkforce/permissions.toml` (0o600)                  | always_allow / always_deny / session_allow                 |
| 3. PolicyEngine             | `~/.agiworkforce/policy.toml` (priority-ordered TOML rules) | Allow / Deny / Ask                                         |
| 4. SDK CanUseTool RPC       | embedder via stdin/stdout                                   | PermissionDecision::Allow{updated_input?} \| Deny{reason?} |

[exec_policy.rs](src/exec_policy.rs) is a separate lower-level rule format (`allow|deny prefix|regex|heuristic|program <pattern>`) loaded from `.agiworkforce/rules/*.rules`.

**Sandbox** ([sandbox.rs](src/sandbox.rs), 174 LOC): `SandboxType::detect()` at runtime — macOS Seatbelt, Linux Bubblewrap, Linux Landlock, Windows Restricted Token. Workspace policy at [crates/sandbox-policy/src/lib.rs](../../crates/sandbox-policy/src/lib.rs) defines `SandboxPolicy::{DangerFullAccess, ReadOnly, WorkspaceWrite{writable_roots}, ExternalSandbox}`.

`agiworkforce sandbox <cmd>` exposes raw access for debugging.

---

## 6. TUI layer ([src/tui/](src/tui/), 125 files, 47K LOC)

Ratatui+Crossterm full-screen UI ported from OpenAI Codex CLI. Key files:

- [tui_app.rs](src/tui/tui_app.rs) (1,938 LOC) — main app loop entry `run()`
- [app.rs](src/tui/app.rs) (8,251 LOC) — central `App` state machine, holds ChatWidget+config, event routing, protocol integration
- [app_event.rs](src/tui/app_event.rs) (579 LOC) — `AppEvent` enum (50+ variants — event bus)
- [chatwidget.rs](src/tui/chatwidget.rs) (9,733 LOC) — core chat surface, transcript, active cell, streaming, overlays
- [history_cell.rs](src/tui/history_cell.rs) (4,462 LOC) — `HistoryCell` trait + variants
- [pager_overlay.rs](src/tui/pager_overlay.rs) (1,298 LOC) — Ctrl+T transcript overlay with cache key invalidation
- [diff_render.rs](src/tui/diff_render.rs) (2,426 LOC) — unified diff with syntect highlighting

**Subdirectories**:

- [bottom_pane/](src/tui/bottom_pane/) (21 files, ~13K LOC) — input area + popup stack. Largest: `chat_composer.rs` (9,873 LOC)
- [chatwidget/](src/tui/chatwidget/) (9 files, ~12K LOC) — plugins, skills, realtime, status
- [streaming/](src/tui/streaming/) (4 files) — `StreamState`, `StreamController`, chunking, commit_tick
- [render/](src/tui/render/) (3 files) — `Renderable` trait + combinators; `highlight.rs` (1,496 LOC syntect)
- [status/](src/tui/status/) (5 files) — `/status` card, rate-limit display
- [tui/](src/tui/tui/) (4 files) — `EventBroker`, `FrameRequester`, `JobControl`, `FrameRateLimiter`

**`Renderable` trait** (the equivalent of React Component):

```rust
pub trait Renderable {
    fn render(&self, area: Rect, buf: &mut Buffer);
    fn desired_height(&self, width: u16) -> u16;
    fn cursor_pos(&self, area: Rect) -> Option<(u16, u16)>;
}
```

**Streaming pipeline**: 4 stages.

1. Model SSE delta → `MarkdownStreamCollector::push_delta()` (buffer until newline)
2. Newline → commit complete lines to `StreamState.queued_lines: VecDeque<QueuedLine>`
3. `StreamController::on_commit_tick()` drains N lines per frame (adaptive chunking)
4. Drained lines emitted as `HistoryCell` into transcript

**Slash commands at TUI level** ([slash_command.rs](src/tui/slash_command.rs), [bottom_pane/slash_commands.rs](src/tui/bottom_pane/slash_commands.rs)): 50+ commands. Gated by `BuiltinCommandFlags`.

**[tui_basic.rs](src/tui_basic.rs)** (930 LOC) is a _separate_ simpler TUI (currently `#[allow(dead_code)]`).

---

## 7. Models, routing, providers ([models.rs](src/models.rs), [model_catalog.rs](src/model_catalog.rs), [routing/](src/routing/), [provider.rs](src/provider.rs))

**Model catalog** — 4 tiers, lowercased HashMap for O(1) lookup:

1. **Bundled** — 18 models hardcoded via `legacy_bundled_models()`. Ensures offline operation
2. **Disk cache** — `~/.agiworkforce/cache/models.json`, 1h TTL, version-tagged
3. **Remote fetch** — `models.dev/api.json`, 5s timeout, non-blocking background refresh
4. **User overrides** — `[[models]]` section in `~/.agiworkforce/config.toml`

**Schema** ([crates/agiworkforce-models-manager/models.json](../../crates/agiworkforce-models-manager/models.json)):

```json
{
  "slug": "gpt-5.5",
  "context_window": 272000,
  "input_modalities": ["text", "image"],
  "supports_parallel_tool_calls": true,
  "default_reasoning_level": "medium",
  "supported_reasoning_levels": [{ "effort": "low|medium|high|xhigh" }],
  "input_price_per_1m": 1.25,
  "output_price_per_1m": 10.0
}
```

**8 hardcoded providers** ([models.rs](src/models.rs)::Provider enum): Anthropic, OpenAI, Google, Ollama, Mistral, Xai, Deepseek, OllamaCloud. Subscription paths for GitHub Copilot (`~/.copilot/token.json`) and ChatGPT Plus.

**FallbackChain** ([routing/fallback.rs](src/routing/fallback.rs)):

```bash
agiworkforce -m "claude-opus-4-6,gpt-5.4,llama3.1:8b"
```

- Comma-separated, parsed by `FallbackChain::parse()`
- `FallbackOn::{RateLimit (default), Transient, Any}` controls rotation triggers
- Emits `FallbackTriggered` AgentEvent on rotation

**Routing strategies** ([routing/strategy.rs](src/routing/strategy.rs)) — chain-of-responsibility:

1. `FallbackStrategy` — primary unavailable? walk chain
2. `CostStrategy` (optional) — `session_cost_usd / max_session_cost_usd ≥ 0.8` → cheapest viable model
3. `DefaultStrategy` (terminal) — always returns configured default

---

## 8. Memory pipeline ([memory.rs](src/memory.rs), [memory_pipeline.rs](src/memory_pipeline.rs))

**3-tier memory** ([memory.rs](src/memory.rs), 688 LOC):

- Global: `~/.agi/CLAUDE.md`
- Project: `<project_root>/CLAUDE.md` or `.agiworkforce/CLAUDE.md`
- Local: `.agiworkforce/CLAUDE.md` (only when cwd ≠ project_root)

`get_context_prompt()` ([memory.rs:85](src/memory.rs)): concatenate Global → Project → Local into `<memory-hierarchy>` tags.

**Rules system** ([memory.rs:170](src/memory.rs)): `.agiworkforce/rules/*.md` with YAML frontmatter glob patterns. Active-file-filtered injection.

**Memory typing** (Phase 9): `kind: user | feedback | project | reference` frontmatter routes entries into typed sub-blocks (`<user-preferences>`, `<feedback>`, `<project-context>`, `<reference>`).

**Auto-consolidation pipeline** ([memory_pipeline.rs](src/memory_pipeline.rs), 637 LOC):

**Phase 1** — `extract_session_summary()`:

- Triggered at session end
- Collects last N messages (max 20K chars)
- LLM call: "Extract user preferences, project patterns, tool usage patterns, coding style, technical decisions"
- 30s timeout; fallback to keyword scan
- Writes to `~/.agiworkforce/memories/session_summaries/{session_id}.md`

**Phase 2** — `consolidate()`:

- 1h cooldown (`CONSOLIDATION_COOLDOWN_SECS = 3600`)
- LLM merges into deduplicated `~/.agiworkforce/memories/raw_memories.md` (60s timeout)
- Prunes summaries > 30 days old

---

## 9. Skills, plugins, marketplace

**Skills** ([skills.rs](src/skills.rs), 846 LOC):

- Locations: project / global / `.system/` / `learned/`
- Format: YAML frontmatter (name, description, allow_implicit, category, env_vars) + markdown body
- Matching: exact name 1.0 / `$skill` mention 0.9 / word overlap 0.3–0.8 / substring 0.5
- Injection: matched skills wrapped in `<skills><skill name="…">…</skill></skills>`

**Skill learner** ([skill_learner.rs](src/skill_learner.rs), 618 LOC):

- Auto-generates skills from repeated tool patterns in completed sessions
- 70% overlap threshold, ≥3 tools, 3+ session frequency, 30-day lookback
- Auto-naming, auto-categorization (Code Modification & Build / Code Analysis / Research & Analysis / Testing & Validation)
- Cap 50 learned skills

**Plugins** ([plugins.rs](src/plugins.rs), 258 LOC):

- Manifest: `.app.json` or `.mcp.json` with `name`, `mcp_servers`, `apps`, `skill_roots`
- Security: shell injection prevention rejects `|`, `;`, `&`, `$`, `` ` ``, `\0`

**Marketplace** ([marketplace.rs](src/marketplace.rs), 668 LOC):

- Remote registry: `https://registry.agiworkforce.com/plugins/v1`
- Installation tracking: `~/.agiworkforce/plugins/installed.json`
- Operations: search / install / uninstall / update / list

---

## 10. Hooks ([hooks.rs](src/hooks.rs), 1,236 LOC) + Triggers

**20 lifecycle events**: `SessionStart, SessionEnd, BeforeToolUse, AfterToolUse, BeforeMessage, AfterMessage, PreEdit, PostEdit, PreCommand, PostCommand, PlanModeChanged, ContextCompacted, SubagentSpawned, SubagentCompleted, Notification, Stop, CronTriggered, WebhookReceived, FileChanged, DaemonStarted, DaemonStopped`.

Config: `~/.agiworkforce/hooks.json`:

```json
{
  "events": {
    "BeforeToolUse": [
      {
        "command": "python3",
        "args": ["my_hook.py"],
        "timeout": 5000,
        "blocking": true,
        "matcher": "^mcp_.*"
      }
    ]
  }
}
```

**Hook output schema** (Phase 10):

```json
{
  "decision": "block|allow",
  "reason": "...",
  "continue": false,
  "updated_input": {...},
  "additional_context": "Note: redacted PII",
  "updated_mcp_tool_output": "Sanitized output"
}
```

Hooks become transformers, not just gates. Aggregation: Block > Stop > Continue. `updated_input` last-writer-wins. `additional_context` concatenated newline-separated.

**Triggers** (`~/.agiworkforce/triggers.json`) drive daemon mode:

- cron_triggers (`0 9 * * *`)
- webhook_triggers (port + path + auth_token + max_parallel)
- file_watchers (path glob + max_parallel)

---

## 11. SDK protocol ([sdk_io/](src/sdk_io/))

**NDJSON Writer** ([sdk_io/ndjson.rs](src/sdk_io/ndjson.rs), 109 LOC): one event per line, mutex-protected, escapes U+2028/U+2029 to `\uXXXX` for JS parser safety.

**Outbound `SdkEvent`** ([sdk_io/protocol.rs:15](src/sdk_io/protocol.rs)): UserMessage / AssistantMessage / ToolResult / StreamEvent / ControlRequest / ControlCancelRequest / StatusUpdate / Error.

**Control requests** (RPC to embedder):

1. `CanUseTool { request_id, tool_name, input, tool_use_id, agent_id }` → `PermissionDecision::{Allow{updated_input?, message?}, Deny{reason?}}`
2. `HookCallback { callback_id, hook_event, payload }` → `HookResult::{Continue{modified_input?}, Block{reason?}}`
3. `Elicitation { server, schema }` → arbitrary JSON
4. `McpMessage { server, payload }` → JSON-RPC reply

**Inbound `SdkInputMessage`**: User / ControlResponse / ControlCancelRequest / SetModel / SetPermissionMode / Interrupt / Initialize / KeepAlive.

**This protocol mirrors `@anthropic-ai/claude-agent-sdk`** — embedders interchangeable.

[agent_events.rs](src/agent_events.rs) (`AgentEvent` enum): Spawning / ReadyForPrompt / RunningTool / ToolResult / MessageDelta / TurnUsage / FallbackTriggered / Finished / Error. Emitted via `--json-events` for CI/dashboards. Secret redaction (regex on key/token/secret/password).

---

## 12. Sandbox details

[sandbox.rs](src/sandbox.rs):

```rust
pub enum SandboxType {
    None, MacosSeatbelt, LinuxBubblewrap, LinuxLandlock, WindowsRestrictedToken,
}
```

- macOS profile: deny-by-default; allow process-exec, process-fork, sysctls, mach-lookup, network-outbound; RO `/usr /bin /sbin /Library /System`; RW workspace + `/tmp`
- Linux Bubblewrap: `--unshare-pid --unshare-uts --die-with-parent --ro-bind / / --bind <workspace> <workspace> --tmpfs /tmp`
- `agiworkforce sandbox` subcommand exposes raw access for debugging

---

## 13. Daemon mode ([daemon.rs](src/daemon.rs), 1,266 LOC)

Loads `~/.agiworkforce/triggers.json`, runs cron + webhook + file-watcher concurrently with `Semaphore(max_parallel=4)`. 60 req/min per-endpoint rate limiter, constant-time token compare for webhooks. Logs to `~/.agiworkforce/daemon-logs/`. Each fired trigger spawns non-interactive `AgentSession`.

---

## 14. Cross-cutting

### Errors ([errors.rs](src/errors.rs), 872 LOC)

`CliError` enum: `Api / Auth / Config / Tool / Network / ContextOverflow / RateLimited / StreamError`.

`detect_context_overflow()` — 17 regex patterns covering Anthropic, AWS Bedrock, OpenAI, Google, xAI, Groq, OpenRouter, GitHub Copilot, llama.cpp, LM Studio, MiniMax, Kimi, generic, HTTP 413.

Each error has `kind()` (machine-readable), `hint()` (actionable runbook), `is_retryable()`, `retry_delay()`, `retry_delay_with_backoff(attempt) = min(2^(attempt-1), 30)`.

### Telemetry

`--json-events` emits AgentEvent NDJSON for CI/dashboards. Secret redaction at the boundary. No first-party Datadog/BigQuery integration today.

### Cost tracking

`session_cost_usd` accumulator on `AgentSession`. `tui/cost_hud.rs:49–52` already has correct cache pricing math (10% read rate, 100% creation rate). Anthropic prompt-cache token extraction is wired in Phase 4–5.

### Voice mode ([voice.rs](src/voice.rs), 814 LOC)

Whisper STT (OpenAI API or local binary). `cpal` 16 kHz mono PCM, `hound` WAV encoding. Push-to-talk via SPACE/ESC.

### Cross-device sync ([sync.rs](src/sync.rs), 705 LOC)

`agiworkforce sync export/import` bundles `config.toml`, `mcp.json`, `memories/raw_memories.md`, `projects.json`, `INSTRUCTIONS.md`. Excludes session history + shell snapshots + plugin caches.

---

## File counts

```
Total: 422 .rs files, 151,493 LOC

src/                      (top-level CLI modules)        ~28K LOC across 65 files
src/tui/                  (Ratatui TUI)                   47K LOC across 47 files
src/tui/bottom_pane/      (input + popups)              ~13K LOC across 21 files
src/tui/chatwidget/       (extensions + tests)          ~12K LOC across 9 files

Top files by LOC:
  src/tui/chatwidget/tests.rs                            12,648
  src/tui/bottom_pane/chat_composer.rs                    9,873
  src/tui/chatwidget.rs                                   9,733
  src/tui/app.rs                                          8,251
  src/tui/history_cell.rs                                 4,462
  src/tui/diff_render.rs                                  2,426
  src/main.rs                                             2,204
  src/safety.rs                                           1,515
  src/agent.rs                                           ~2,500+
  src/hooks.rs                                            1,236
  src/markdown.rs                                         1,204
  src/context.rs                                          1,199
  src/config.rs                                           1,271
  src/daemon.rs                                           1,266
```

---

## Architectural patterns

### Single mutable agent state

`AgentSession` ([agent.rs:72](src/agent.rs)) holds all session state — messages, total tokens, fallback chain, hooks config, managed session handle. Methods are `&mut self`; no internal locking. Concurrent tool execution (Phase 7) batches read-only futures via `tokio::join_all` but feeds results back to a single mutable session.

### Provider polymorphism via dispatch

`models::stream_completion` dispatches to per-provider functions (`stream_anthropic`, `stream_openai_compatible`, `stream_google`, `stream_ollama`, `stream_mistral`, `stream_copilot_api`, `stream_chatgpt_codex`). 5-min idle timeout across all SSE parsers. Provider-specific quirks (Mistral truncate IDs to 9 chars, Gemini schema sanitize) handled at the dispatch boundary.

### Linear main.rs dispatch

No router or middleware. `main()` is a 1,000-line linear pipeline of subcommand match → flag-only checks → mode selection. Trade-off: easy to read top-to-bottom, harder to refactor.

### `#[allow(dead_code)]` for in-progress modules

23 modules at the top of [main.rs](src/main.rs) marked `#[allow(dead_code)]` indicating compiled-but-not-wired. These are deliberate parking spots for half-built features (a2a, sdk_io, history, init, marketplace, memory_pipeline, models_cache, oauth, onboarding, project_registry, shell_snapshot, skill_learner, sync, etc.).

### Persistent / managed / legacy session formats

Three coexisting formats for session storage:

- **Managed sessions** (current): JSONL at `~/.agiworkforce/managed_sessions/`. `ManagedSession::load_from_path` / `save_to_path`
- **Legacy conversations**: JSON via `conversations::load_conversation()`. `--resume` falls back here
- **SQLite session DB** ([sessions.rs](src/sessions.rs)): full-text search index for `--search "query"`

`resolve_resume_payload(reference, fork)` ([main.rs:664](src/main.rs)) tries managed first, falls back to legacy.

---

## Conventions for contributors

1. **Lints**: `unsafe_code = "deny"`, `dead_code = "deny"`, `unused = "deny"` workspace-wide. Use `#[allow(dead_code)]` only for in-progress modules.
2. **Tools**: New tools register in [runtime/tool_catalog.rs](src/runtime/tool_catalog.rs) with `is_read_only` and `is_concurrency_safe` flags. Read-only tools that touch the filesystem must go through `validate_file_path()` ([tools.rs](src/tools.rs)).
3. **Hooks**: When firing a new lifecycle event, add to `HookEvent` enum at [hooks.rs:58](src/hooks.rs).
4. **Errors**: Wrap external errors in `CliError` variants. Provide `kind()` / `hint()` / `is_retryable()`.
5. **Telemetry**: Emit AgentEvents for CI consumption via `agent_events.rs::AgentEvent::*::emit_stdout()`. Redact secrets at the emission boundary.
6. **Permissions**: Tool execution that could read sensitive files must check `validate_file_path()`. New shell commands register in `safety.rs::CommandSafety`.
7. **TUI**: New widgets implement the `Renderable` trait at [render/renderable.rs](src/tui/render/renderable.rs). Long-running streams use `StreamController` ([streaming/](src/tui/streaming/)).
8. **Memory**: New memory types add a variant to `MemoryKind` at [memory.rs](src/memory.rs).

---

## See also

- README.md — user-facing docs
- BUILD.md — build instructions
- AUDIT_REPORT.md — security audit history
- FIX_QUEUE.md — known issues + sprint planning
