# AGI Workforce CLI Modernization Spec

## Goal

Make `apps/cli` a Rust-native AGI Workforce CLI with Claude Code-style product behavior and Codex-style Rust architecture.

Primary product reference: `Desktop/reference/src`.
Primary Rust architecture reference: `Desktop/reference/codex-cli`.
Secondary references: `Desktop/reference/opencode`, `Desktop/reference/gemini-cli`, `Desktop/reference/claw-code`.

## North Star

`apps/cli` should become a thin command dispatcher over reusable `crates/agiworkforce-*` crates. Product behavior should match the Claude-style reference: rich commands, slash commands, custom agents, subagents, teams, MCP, plugins/skills, permission modes, sessions, compaction, hooks, and stable non-interactive execution.

The current CLI has many of these ideas, but they are split between a monolithic `apps/cli/src/main.rs`, lightweight local modules, and richer Codex-shaped crates that are not wired as the default path.

## Reference Decisions

- Use `Desktop/reference/src` for command semantics, agent definitions, AgentTool behavior, MCP UX, plugin/skill loading, permission prompts, session UX, and team/subagent product behavior.
- Use `Desktop/reference/codex-cli` for crate boundaries, app-server protocol, exec/TUI separation, state/thread-store, sandbox/execpolicy integration, and integration test layout.
- Use `Desktop/reference/opencode` for policy-based permissions, agent mode modeling, MCP OAuth/status UX, and non-interactive event contracts.
- Use `Desktop/reference/gemini-cli` for tool registry discipline, MCP diagnostics/allow-block lists, and subagent-as-tool wrapper design.
- Use `Desktop/reference/claw-code` for Rust permission policy and typed config patterns where they are cleaner than the current CLI modules.

## Full Reference Audit Conclusions

The full `Desktop/reference` pass changes the order of work:

- The highest-leverage local slice is a single registry contract for built-ins, skills, custom prompts, plugin commands, and MCP prompts. Claude, Gemini, and OpenCode all converge on registry-driven commands/tools/prompts/resources rather than independent slash-command lists.
- `apps/cli` currently has duplicate stacks for TUI, MCP, config, skills, plugins, sessions, and non-interactive execution. The canonical implementations should be the existing Codex-shaped crates, especially `agiworkforce-core`, `agiworkforce-exec`, `agiworkforce-tui_app_server`, `agiworkforce-config`, `agiworkforce-state`, `agiworkforce-mcp-server`, `agiworkforce-rmcp-client`, `agiworkforce-execpolicy`, and `agiworkforce-sandboxing`.
- The app-server story is a blocker for true Codex parity: `agiworkforce-app-server-client` has protocol/client types, but there is no standalone `agiworkforce-app-server` crate and the in-process server path must become real before default TUI/exec can share one runtime.
- Non-interactive output must converge on a versioned contract. `agiworkforce-exec` already has the right ThreadEvent-style JSONL stream; `apps/cli` one-shot JSON is a separate aggregate shape and should either delegate to exec or be explicitly versioned as legacy.
- Agents and teams should use the core multi-agent/collaboration tools where possible. `apps/cli/src/subagent.rs` and `teams.rs` remain useful prototypes, but parity requires core-backed spawn/wait/message/job events, resumable state, and later worktree or tmux backends.
- MCP should collapse onto the core/rmcp stack. The local `apps/cli/src/mcp.rs` stdio-only client lacks HTTP/SSE, OAuth auth status, resources, prompts, elicitation, and diagnostics already represented in the crate stack.

## Target Architecture

### CLI Dispatcher

`apps/cli` should own:

- `clap` parsing and help text.
- Compatibility aliases for existing AGI Workforce commands.
- Delegation to domain crates.
- Small command modules while migration is in progress.

It should not own the agent loop, app-server protocol, state store, MCP server, sandbox policy, login/auth, or rich TUI internals long-term.

Target modules:

- `apps/cli/src/main.rs`: shrink to parse + dispatch.
- `apps/cli/src/commands/*`: temporary bridge modules for legacy command compatibility.
- `apps/cli/Cargo.toml`: depend on the existing crates it actually dispatches to.

### Runtime Crates

Adopt existing crates as canonical:

- `crates/agiworkforce-core`: agent loop, tool routing, config-backed runtime, protocol events.
- `crates/agiworkforce-exec`: non-interactive execution contract.
- `crates/agiworkforce-tui_app_server`: default interactive TUI.
- `crates/agiworkforce-app-server-protocol`: app/server JSON-RPC protocol.
- `crates/agiworkforce-app-server-client`: in-process and remote clients.
- `crates/agiworkforce-state`: SQLite projection and thread metadata.
- `crates/agiworkforce-login`: auth and login flows.
- `crates/agiworkforce-mcp-server`: CLI-as-MCP server.
- `crates/agiworkforce-config`: typed layered config.
- `crates/agiworkforce-execpolicy` and `crates/agiworkforce-sandboxing`: policy and sandbox enforcement.
- `crates/agiworkforce-skills`: skill loading and indexing.

### Product Systems

#### Commands And Slash Commands

Build a command registry modeled after `reference/src/types/command.ts` and `reference/src/commands.ts`:

- Built-in commands.
- Local commands.
- Prompt commands.
- Plugin commands.
- Skill commands.
- MCP-provided commands/prompts.
- Dynamic commands discovered during the session.

Rust target:

- `crates/agiworkforce-core/src/commands` or a new `crates/agiworkforce-command-registry`.
- `apps/cli/src/commands` only as compatibility glue.

#### Agents And Subagents

Support Claude-style agents:

- Built-in agents: general, explore, plan, verification, guide/reviewer.
- User/project/plugin agents from markdown frontmatter.
- Agent fields: description/when-to-use, tools, disallowed tools, model, effort, permission mode, MCP server requirements, hooks, max turns, skills, memory, background, isolation.
- AgentTool fields: description, prompt, subagent type, model, background, name, team name, permission mode, isolation/worktree, cwd.

Rust target:

- Promote `apps/cli/src/agents.rs` concepts into a crate-backed loader.
- Extend `apps/cli/src/subagent.rs` or replace with a core/app-server backed agent task system.
- Use `crates/agiworkforce-state` agent job metadata for resumable/background task tracking.

#### Teams

Team mode should become real multi-agent coordination:

- Named teammates.
- Team mailbox.
- Shared task list.
- In-process teammates first.
- Worktree isolation next.
- Optional tmux/pane backend later.

Rust target:

- Keep `apps/cli/src/teams.rs` as a prototype only.
- Move durable team state and spawn logic into a core crate once the app-server path is active.

#### MCP

Match Claude/OpenCode/Gemini-style MCP lifecycle:

- Stdio and HTTP/SSE/streamable HTTP clients.
- Config scopes: project, local, user, dynamic/plugin.
- `mcp add`, `remove`, `list`, `get`, `auth`, `logout`, `debug`, `serve`.
- OAuth-capable remote MCP servers.
- Tool, prompt, and resource discovery.
- Status diagnostics with deduplication.
- Admin allow/block lists.
- MCP tools exposed to the agent and commands exposed as slash/prompt commands.

Rust target:

- Expand `apps/cli/src/mcp.rs` behavior into a crate or reuse `agiworkforce-core` MCP manager.
- Use `crates/agiworkforce-mcp-server` for `agiworkforce mcp serve`.

#### Permissions And Policy

Replace ad hoc permission flags with a policy layer:

- Tool action categories: read, edit, write, bash, network, external directory, plan enter/exit, question, MCP, subagent.
- Rule outcomes: allow, ask, deny.
- Scope: global, project, session, agent, teammate/subagent.
- Hook overrides.
- Permission prompt surfaces in TUI and non-interactive denial behavior.

Rust target:

- Use `crates/agiworkforce-execpolicy`, `crates/agiworkforce-sandboxing`, and a new typed policy adapter.
- Preserve existing flags: `--yes`, `--dangerously-skip-permissions`, plan mode, sandbox mode.

#### Non-Interactive Contract

Adopt the stricter Codex/OpenCode contract:

- Default stdout: final assistant message only.
- Diagnostics and progress: stderr.
- `--json` / `--output stream-json`: valid one-event-per-line NDJSON.
- Stable event names for session, assistant delta, tool start/end, permission request, error, result.
- Exit codes documented and tested.

Rust target:

- `crates/agiworkforce-exec` is already the right home.
- Move current `apps/cli` one-shot mode onto `agiworkforce_exec::run_main`.

## Phased Implementation

### Phase 1: Dispatcher And Contracts

Purpose: stop growing the monolith and make behavior testable.

- Add `apps/cli/tests/` integration tests for command parsing, `exec`, `resume`, `mcp`, `agents`, permissions flags, and JSON/NDJSON output.
- Add a registry-backed command surface for built-ins, skills, custom prompts, plugin commands, and future MCP prompts.
- Add `apps/cli/src/commands/` modules to split command handlers without changing behavior.
- Wire `exec` subcommand to `crates/agiworkforce-exec` behind a feature or compatibility layer.
- Keep legacy `AgentSession` one-shot as fallback until parity tests pass.
- Document stdout/stderr/JSONL rules.

### Phase 2: Real TUI/App-Server Path

Purpose: use the richer Codex-style TUI/app-server stack already in the repo.

- Make default interactive mode use `crates/agiworkforce-tui_app_server`.
- Route TUI and exec through the same app-server protocol.
- Preserve `--no-tui` as a classic REPL compatibility path.
- Migrate session/resume/fork to thread/rollout metadata while keeping managed JSONL import compatibility.

### Phase 3: Agents, Subagents, And Teams

Purpose: match Claude-style AgentTool behavior.

- Implement canonical agent loader with built-in, project, user, plugin, and managed agents.
- Add `agiworkforce agents list/create/edit/validate`.
- Add `--agent` and `/agents` behavior.
- Extend Task/AgentTool with `subagent_type`, `model`, `run_in_background`, `name`, `team_name`, `mode`, `isolation`, and `cwd`.
- Make background agents resumable and visible through state.
- Upgrade team mode to durable teammates/mailbox/shared tasks with in-process first, worktree second.

### Phase 4: MCP And Plugins

Purpose: make MCP and plugin ecosystems first-class.

- Add full MCP command group: `serve`, `add`, `remove`, `list`, `get`, `auth`, `logout`, `debug`.
- Add HTTP/SSE/streamable HTTP transport and OAuth token handling.
- Discover MCP prompts/resources in addition to tools.
- Convert plugin MCP/skills/commands/agents into registry entries.
- Add status UI and diagnostics.

### Phase 5: Permissions, Config, And Polish

Purpose: make the CLI safe, configurable, and shippable.

- Implement policy-backed permissions with allow/ask/deny outcomes.
- Layer config through `agiworkforce-config`.
- Add schema generation for config and plugin/agent frontmatter.
- Add migration from old `~/.agiworkforce/config.toml` and managed sessions.
- Add docs for every command group.

## Initial Approval Request

Start with Phase 1 only. It is the safest foundation and creates tests that protect later rewiring.

Phase 1 deliverable:

- `apps/cli/src/main.rs` reduced in responsibility.
- Command handlers split by domain.
- `exec` path delegated to `crates/agiworkforce-exec` where possible.
- Integration tests for the CLI contract.
- No removal of legacy modules until parity tests pass.
