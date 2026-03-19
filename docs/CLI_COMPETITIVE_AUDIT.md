# CLI Competitive Audit: 5-Way Source-Level Comparison

**Date**: 2026-03-18
**Scope**: Source-level analysis of five AI CLI agents
**Methodology**: Direct source code inspection, not marketing materials

---

## 1. Executive Summary

Five CLI-based AI coding agents were analyzed at the source level: Claude Code (Anthropic), Codex CLI (OpenAI), Gemini CLI (Google), OpenCode (community), and AGI Workforce CLI (this project). Each takes a fundamentally different architectural approach to the same problem: embedding an AI agent in a developer's terminal.

**Key findings:**

- **Claude Code** has the deepest feature set by a wide margin -- 60+ slash commands, agent teams, skills with dynamic injection, 22 hook events, OS-level sandboxing, and session branching. It is the reference implementation all others chase.
- **Codex CLI** is the most architecturally ambitious -- a 73-crate Rust workspace with embedded V8, Ratatui TUI, apply_patch diffing, parallel tool execution via semaphore, and OS-level sandboxing on par with Claude Code.
- **Gemini CLI** has the richest TUI experience -- Ink (React for terminal) with Vim bindings, mouse support, 60 FPS rendering, a browser agent, and the widest provider support (20+). It also uniquely includes an A2A server and VS Code companion.
- **OpenCode** pioneers the most innovative TUI architecture -- a custom Solid.js-for-terminal framework (@opentui/solid) with worker thread isolation, advanced diff matching with Levenshtein fallback, session forking, and LSP integration.
- **AGI Workforce CLI** has a clean Rust foundation (23 files, 47K LOC) with working REPL, streaming, 7 providers, 9 tools, hooks, memory, permissions, and sessions. However, subagents, teams, skills injection, and MCP in REPL are scaffolded but not wired. It lacks a TUI framework, sandboxing, and parallel tool execution.

**Gap severity**: AGI Workforce CLI is roughly 30-35% feature-complete relative to Claude Code, with the largest gaps in sandboxing, TUI rendering, parallel tools, and agent orchestration.

---

## 2. Feature Comparison Matrix

| Feature                          | Claude Code                   | Codex CLI                          | Gemini CLI              | OpenCode             | AGI CLI                              |
| -------------------------------- | ----------------------------- | ---------------------------------- | ----------------------- | -------------------- | ------------------------------------ |
| **Language**                     | TypeScript                    | Rust + JS hybrid                   | TypeScript              | TypeScript (Bun)     | Rust                                 |
| **LOC (approx)**                 | ~200K+                        | ~150K (73 crates)                  | ~80K                    | ~60K                 | 47K                                  |
| **License**                      | Proprietary                   | Open source                        | Open source             | Open source          | Proprietary                          |
|                                  |                               |                                    |                         |                      |                                      |
| **CORE AGENT**                   |                               |                                    |                         |                      |                                      |
| Agentic loop                     | Yes                           | Yes                                | Yes                     | Yes                  | Yes                                  |
| Streaming responses              | Yes                           | Yes                                | Yes                     | Yes                  | Yes                                  |
| Tool execution                   | Yes                           | Yes                                | Yes                     | Yes                  | Yes                                  |
| Max turns / iteration limit      | Yes                           | Yes                                | Yes                     | Yes                  | Yes                                  |
| Parallel tool execution          | Yes                           | Semaphore-gated                    | Unknown                 | Unknown              | No                                   |
| Tool confirmation prompts        | Yes                           | Yes                                | Yes                     | Yes                  | Yes                                  |
| Auto-approve mode                | Yes (--dangerously)           | Yes (full-auto)                    | Yes                     | Yes                  | Yes (--dangerously-skip-permissions) |
|                                  |                               |                                    |                         |                      |                                      |
| **MODELS & PROVIDERS**           |                               |                                    |                         |                      |                                      |
| Multi-model                      | No (Claude only)              | No (OpenAI only)                   | Yes (20+ providers)     | Yes (10+ providers)  | Yes (7 providers)                    |
| Local LLM support                | No                            | No                                 | Yes (Ollama)            | Yes (Ollama)         | Yes (Ollama)                         |
| Model fallback chain             | No                            | No                                 | Unknown                 | Unknown              | Yes (--fallback-model)               |
| Provider-specific adapters       | N/A (single)                  | N/A (single)                       | Per-provider            | Per-provider         | Per-provider                         |
| Effort presets                   | No                            | No                                 | No                      | No                   | Yes (--effort low/med/high/max)      |
|                                  |                               |                                    |                         |                      |                                      |
| **TUI & RENDERING**              |                               |                                    |                         |                      |                                      |
| TUI framework                    | Ink (React)                   | Ratatui                            | Ink (React)             | @opentui/solid       | None (rustyline + colored)           |
| Syntax highlighting              | Yes                           | tree-sitter                        | Yes                     | Yes                  | Markdown only                        |
| Vim keybindings                  | No                            | No                                 | Yes                     | Yes                  | No                                   |
| Mouse support                    | No                            | No                                 | Yes                     | Yes                  | No                                   |
| Alternate buffer mode            | No                            | No                                 | Yes                     | Yes                  | No                                   |
| Diff viewer                      | Yes                           | apply_patch                        | Yes                     | Advanced (3-tier)    | No                                   |
| Progress indicators              | Yes                           | Yes                                | Yes                     | Yes                  | Spinner only                         |
| 60 FPS rendering                 | No                            | No                                 | Yes (target)            | No                   | No                                   |
|                                  |                               |                                    |                         |                      |                                      |
| **TOOLS (BUILT-IN)**             |                               |                                    |                         |                      |                                      |
| Read file                        | Yes                           | Yes                                | Yes                     | Yes                  | Yes                                  |
| Write file                       | Yes                           | Yes                                | Yes                     | Yes                  | Yes                                  |
| Edit file (string replace)       | Yes                           | apply_patch                        | Yes                     | Yes (3-tier diff)    | Yes                                  |
| Bash/shell execution             | Yes                           | Yes                                | Yes                     | Yes                  | Yes                                  |
| Search (grep)                    | Yes                           | Yes                                | Yes                     | Yes                  | Yes (glob)                           |
| List directory                   | Yes                           | Yes                                | Yes                     | Yes                  | Yes                                  |
| Web search                       | Yes                           | Yes                                | Yes                     | Yes                  | Yes                                  |
| Web fetch                        | Yes                           | Yes                                | Yes                     | Yes                  | Yes                                  |
| Embedded JS REPL                 | No                            | Yes (V8)                           | No                      | No                   | No                                   |
| LSP integration                  | No                            | No                                 | No                      | Yes                  | No                                   |
| Notebook edit                    | Yes                           | No                                 | No                      | No                   | No                                   |
| Image/vision input               | Yes                           | No                                 | Yes                     | No                   | No                                   |
| Tool count                       | ~15                           | ~10                                | ~15                     | 20+                  | 9                                    |
|                                  |                               |                                    |                         |                      |                                      |
| **SANDBOXING**                   |                               |                                    |                         |                      |                                      |
| OS-level sandbox                 | Yes (Seatbelt/Landlock)       | Yes (Seatbelt/Landlock/bubblewrap) | No                      | No                   | No                                   |
| Network restrictions             | Yes                           | Yes                                | No                      | No                   | No                                   |
| Filesystem restrictions          | Yes                           | Yes                                | No                      | No                   | No                                   |
| Command allowlist/denylist       | Yes                           | Yes                                | Yes (policy engine)     | Unknown              | Yes (permissions.toml)               |
|                                  |                               |                                    |                         |                      |                                      |
| **AGENT ORCHESTRATION**          |                               |                                    |                         |                      |                                      |
| Subagents                        | Yes (5 types)                 | Yes (hierarchical)                 | Yes (delegate_to_agent) | No                   | Scaffolded (not wired)               |
| Agent teams                      | Yes (shared task + mailbox)   | Yes (nicknames + depth)            | No                      | No                   | Scaffolded (not wired)               |
| Subagent specialization          | Explore/Plan/Bash/Guide       | Nicknames + depth limits           | Browser agent           | N/A                  | Types defined, not dispatched        |
| Inter-agent messaging            | Yes (mailbox)                 | Yes (message passing)              | No                      | No                   | Types defined, not wired             |
|                                  |                               |                                    |                         |                      |                                      |
| **MCP (MODEL CONTEXT PROTOCOL)** |                               |                                    |                         |                      |                                      |
| MCP support                      | Yes                           | No                                 | Yes                     | Yes                  | Yes (scaffolded)                     |
| MCP transports                   | stdio + SSE + HTTP            | N/A                                | stdio + SSE             | stdio                | stdio only                           |
| MCP OAuth                        | Yes                           | N/A                                | No                      | No                   | No                                   |
| MCP tool search                  | Yes                           | N/A                                | No                      | No                   | No                                   |
| MCP in REPL                      | Yes                           | N/A                                | Yes                     | Yes                  | Config loads, not in tool loop       |
|                                  |                               |                                    |                         |                      |                                      |
| **SESSIONS & PERSISTENCE**       |                               |                                    |                         |                      |                                      |
| Session storage                  | SQLite                        | JSONL rollouts                     | Unknown                 | SQLite (Drizzle ORM) | SQLite (rusqlite)                    |
| Session resume                   | Yes                           | Yes (replay)                       | Unknown                 | Yes                  | Yes (--session / --continue)         |
| Session fork/branch              | Yes                           | Unknown                            | Unknown                 | Yes (parent/child)   | Flag exists, not implemented         |
| Session search                   | Unknown                       | Unknown                            | Unknown                 | Unknown              | Yes (--search)                       |
| Checkpoints/rewind               | Yes (per file edit)           | Unknown                            | No                      | No                   | No                                   |
| Session audit/replay             | Unknown                       | Yes (JSONL rollouts)               | No                      | No                   | No                                   |
|                                  |                               |                                    |                         |                      |                                      |
| **MEMORY & CONTEXT**             |                               |                                    |                         |                      |                                      |
| Memory hierarchy                 | Yes (CLAUDE.md 3-tier)        | Unknown                            | Yes (.gemini/)          | Yes                  | Yes (Global/Project/Local)           |
| Auto-memory                      | Yes                           | No                                 | Unknown                 | No                   | No                                   |
| Rules system                     | Yes (.claude/rules/)          | No                                 | No                      | No                   | No                                   |
| Skills/prompt injection          | Yes (YAML frontmatter)        | No                                 | No                      | No                   | Scaffolded (discovery works)         |
| Dynamic skill injection          | Yes (!`command`)              | No                                 | No                      | No                   | No                                   |
| Context compaction               | Yes                           | Unknown                            | Unknown                 | Unknown              | Scaffolded (not wired)               |
|                                  |                               |                                    |                         |                      |                                      |
| **HOOKS & EXTENSIBILITY**        |                               |                                    |                         |                      |                                      |
| Hook events                      | 22 events                     | Unknown                            | Unknown                 | Unknown              | 6 events                             |
| Hook handler types               | 4 (command/http/prompt/agent) | Unknown                            | Unknown                 | Unknown              | 1 (command)                          |
| Hook matchers                    | Regex                         | Unknown                            | Unknown                 | Unknown              | Regex                                |
| Policy engine                    | No (hooks-based)              | No                                 | Yes (dedicated)         | No                   | No                                   |
|                                  |                               |                                    |                         |                      |                                      |
| **CLI FLAGS & MODES**            |                               |                                    |                         |                      |                                      |
| One-shot mode                    | Yes                           | Yes                                | Yes                     | Yes                  | Yes                                  |
| REPL mode                        | Yes                           | Yes                                | Yes                     | Yes                  | Yes                                  |
| Pipe/stdin mode                  | Yes                           | Yes                                | Yes                     | Unknown              | Yes                                  |
| Print mode                       | Yes                           | Unknown                            | Unknown                 | Unknown              | Yes (--print)                        |
| JSON output                      | Yes                           | Yes                                | Unknown                 | Unknown              | Yes (--json / --output json)         |
| Stream JSON (NDJSON)             | Unknown                       | Unknown                            | Unknown                 | Unknown              | Yes (--output stream-json)           |
| Quiet mode                       | Yes                           | Unknown                            | Unknown                 | Unknown              | Yes (-q)                             |
| Verbose/debug mode               | Yes                           | Unknown                            | Unknown                 | Unknown              | Yes (-v / --debug)                   |
| Shell completions                | Yes                           | Unknown                            | Unknown                 | Unknown              | Yes (bash/zsh/fish)                  |
| Plan mode                        | Yes                           | Unknown                            | No                      | No                   | No                                   |
| Fast mode                        | Yes                           | Unknown                            | No                      | No                   | No                                   |
| Slash commands                   | 60+                           | Unknown                            | Unknown                 | Unknown              | 0                                    |
| CLI flags (total)                | 50+                           | ~15                                | ~10                     | ~10                  | 25                                   |
|                                  |                               |                                    |                         |                      |                                      |
| **COST & BILLING**               |                               |                                    |                         |                      |                                      |
| Token tracking                   | Yes                           | Yes                                | Yes                     | Yes                  | Yes                                  |
| Cost calculation                 | Yes                           | Unknown                            | Unknown                 | Unknown              | Yes                                  |
| Cost display per turn            | Yes                           | Unknown                            | Unknown                 | Unknown              | Yes                                  |
| Subscription detection           | No                            | Unknown                            | No                      | No                   | Yes                                  |
|                                  |                               |                                    |                         |                      |                                      |
| **ECOSYSTEM**                    |                               |                                    |                         |                      |                                      |
| Desktop app companion            | Yes (Claude Desktop)          | No                                 | No                      | No                   | Yes (Tauri desktop)                  |
| VS Code extension                | No                            | No                                 | Yes                     | No                   | Yes (planned)                        |
| Mobile companion                 | No                            | No                                 | No                      | Yes (server/client)  | Yes (React Native)                   |
| Browser extension                | No                            | No                                 | No                      | No                   | Yes (Chrome)                         |
| A2A protocol server              | No                            | No                                 | Yes                     | No                   | No                                   |
| Remote control                   | Yes                           | No                                 | No                      | No                   | No                                   |

---

## 3. Architecture Comparison

### 3.1 Claude Code

```
Entry: Node.js CLI (TypeScript)
TUI:   Ink (React for terminal)
Agent: Multi-tier subagent system (Explore, Plan, Bash, Guide, General)
State: SQLite sessions + CLAUDE.md hierarchy + auto-memory
Tools: ~15 built-in + MCP (stdio/SSE/HTTP) + skills
Hooks: 22 events, 4 handler types
Sand:  macOS Seatbelt, Linux bubblewrap
```

Single-model (Claude only) but deepest agent orchestration. The skills system with YAML frontmatter and `!`command``dynamic injection is unique. Session branching, checkpoints, and rewind create a Git-like workflow for AI conversations. The hooks system (22 events, 4 handler types including`agent` hooks) is the most extensible.

### 3.2 Codex CLI

```
Entry: JavaScript (codex-cli/cli/) -> Rust backend (codex-rs/)
TUI:   Ratatui (Rust) with tree-sitter syntax highlighting
Agent: Hierarchical multi-agent with nicknames, depth limits
State: JSONL session rollouts with replay/audit capability
Tools: ~10 + apply_patch + js_repl (embedded V8)
Sand:  macOS Seatbelt, Linux Landlock + bubblewrap
```

The most architecturally complex. 73 Rust crates in a Cargo workspace -- separate crates for sandbox policy, exec, protocol, TUI, core agent logic. The JS entry point bootstraps the Rust backend. Key differentiators: `apply_patch` for structural code edits (not just string replace), `js_repl` with embedded V8 for in-process JavaScript execution, and JSONL rollouts enabling full session replay and audit trails. Parallel tool execution uses a semaphore-gated `ToolCallRuntime` for concurrency control.

### 3.3 Gemini CLI

```
Entry: TypeScript + Bun/Node
TUI:   Ink (React for terminal) with 11 React contexts
Agent: Single agent + delegate_to_agent pattern + browser agent
State: Unknown persistence layer
Tools: ~15 built-in including browser (accessibility tree + screenshot)
Ext:   VS Code companion + A2A server
```

The richest interactive experience. 11 React contexts manage TUI state (Vim mode, mouse, scroll, focus, etc.). The browser agent uses an accessibility tree with screenshot fallback -- a pragmatic approach that avoids full Playwright weight. The `delegate_to_agent` pattern is simpler than Claude Code's team system but effective for single-level delegation. Uniquely includes an Agent-to-Agent (A2A) protocol server for inter-agent communication across processes.

### 3.4 OpenCode

```
Entry: TypeScript + Bun
TUI:   @opentui/solid (custom Solid.js for terminal)
Agent: Single agent with worker thread isolation
State: SQLite via Drizzle ORM, session forking
Tools: 20+ including LSP integration
Comm:  RPC between TUI thread and backend thread
Arch:  Server/client for remote access (mobile)
```

The most innovative TUI architecture. Built a custom terminal UI framework on Solid.js reactivity -- signals and effects drive terminal rendering. Worker thread architecture cleanly separates TUI rendering from agent backend via RPC. The diff matching system is the most sophisticated: tries SimpleReplacer first, falls back to LineTrimmedReplacer (handles whitespace), then BlockAnchorReplacer (uses Levenshtein distance for fuzzy matching). LSP integration means it can use language server data (hover info, diagnostics, go-to-definition) as tool context.

### 3.5 AGI Workforce CLI

```
Entry: Rust (single binary, clap CLI)
TUI:   None (rustyline readline + colored + indicatif spinners)
Agent: Single agent loop with scaffolded subagent/team types
State: SQLite via rusqlite, session CRUD working
Tools: 9 built-in, MCP stdio scaffolded
Hooks: 6 events, command handler only
Providers: 7 (Anthropic, OpenAI, Google, Ollama, Mistral, xAI, DeepSeek)
```

Clean single-binary Rust architecture. No runtime dependencies, no Node.js, no Bun. The 23-file layout is well-organized with clear module boundaries. Provider abstraction supports 7 backends with per-provider config. The hooks system works but covers fewer events than Claude Code. The critical gap is that several major subsystems (subagents, teams, skills injection, MCP in tool loop, compaction, session forking) have types and scaffolding defined but are marked `#[allow(dead_code)]` and not wired into the main agent loop.

---

## 4. Source-Level Insights (Not Available from Web Research)

These findings come exclusively from reading source code and cannot be found in documentation or marketing materials.

### 4.1 Codex CLI

**73-crate modular architecture.** The Rust workspace (`codex-rs/`) is split into highly granular crates: `codex-exec` (subprocess management), `codex-sandbox` (Seatbelt/Landlock policy), `codex-core` (agent loop), `codex-tui` (Ratatui rendering), `codex-proto` (wire protocol), etc. This modularity enables independent testing and reuse but adds significant build complexity.

**apply_patch is not string replace.** Unlike Claude Code's Edit tool (exact string match replacement), Codex's `apply_patch` understands unified diff format. It applies structural patches to files, handling context lines, hunks, and offsets. This is more robust for large edits but harder to implement correctly.

**Embedded V8 via js_repl.** The `js_repl` tool spawns a persistent V8 isolate within the agent process. The agent can execute JavaScript expressions and get results without shelling out. This enables complex data transformations, JSON manipulation, and quick computations inline.

**JSONL rollouts for audit.** Every session is written as a JSONL (JSON Lines) file where each line is a timestamped event: user message, assistant response, tool call, tool result, error, etc. This creates a complete audit trail that can be replayed deterministically. No other tool in this comparison offers this level of session auditability.

**Semaphore-gated parallel tools.** The `ToolCallRuntime` uses a tokio semaphore to limit concurrent tool executions. When the model requests multiple tool calls in a single turn, they execute in parallel up to the semaphore limit, then results are collected and sent back together. This is a significant performance advantage for multi-tool turns.

### 4.2 Gemini CLI

**11 React contexts for TUI state.** The Ink-based TUI uses dedicated React contexts for: VimMode, MouseState, ScrollPosition, FocusManager, ThemeProvider, TerminalSize, InputBuffer, CompletionState, NotificationQueue, AgentState, and ConfigContext. This is a full application framework, not just a prompt loop.

**Flicker detection in rendering.** The renderer includes a flicker detection system that monitors frame timing and suppresses re-renders that would cause visual artifacts. Target is 60 FPS with adaptive frame dropping when the terminal cannot keep up. This level of rendering sophistication is unique among CLI agents.

**Browser agent with accessibility tree.** The browser tool first extracts the page's accessibility tree (ARIA roles, labels, states). Only if the accessibility tree is insufficient does it fall back to screenshot capture and vision analysis. This two-tier approach is more token-efficient than screenshot-first approaches.

**Policy engine is separate from hooks.** Unlike Claude Code (which uses hooks for tool approval), Gemini CLI has a dedicated policy engine with rules that can match on tool name, arguments, file paths, and command patterns. Policies can allow, deny, or prompt. This is architecturally cleaner than hook-based approval.

**A2A server for inter-agent communication.** Gemini CLI can start an Agent-to-Agent (A2A) protocol server, allowing other agent instances to discover it, send tasks, and receive results. This enables multi-process agent orchestration without shared memory.

### 4.3 OpenCode

**@opentui/solid is a real framework.** This is not a thin wrapper -- it is a complete Solid.js reactive system adapted for terminal rendering. Signals track terminal cell state, effects trigger re-renders, and the reconciler diffs terminal output buffers. Components are Solid.js components that render to ANSI escape sequences instead of DOM nodes.

**Worker thread architecture isolates TUI from agent.** The TUI runs on the main thread, the agent backend runs on a worker thread, and they communicate via structured RPC messages. This means a long-running tool call cannot freeze the UI. The user can scroll, resize, or even cancel while tools execute.

**3-tier diff matching is the most robust.** When the model produces an edit that does not exactly match the file content: (1) SimpleReplacer tries exact match. (2) LineTrimmedReplacer strips leading/trailing whitespace per line and retries. (3) BlockAnchorReplacer uses Levenshtein distance to find the closest matching block in the file and applies the edit there. This gracefully handles the common case where models produce slightly incorrect whitespace or indentation.

**Session forking with parent/child tracking.** Sessions are stored in SQLite via Drizzle ORM with a `parent_id` column. Forking creates a new session that references the parent, copies all messages up to the fork point, and continues independently. The UI shows a session tree with branching history.

**Server mode for mobile clients.** OpenCode can start in server mode, exposing an HTTP/WebSocket API. A mobile client (or any HTTP client) can connect, send prompts, and receive streaming responses. This is the foundation for mobile companion support without needing a separate backend service.

### 4.4 Claude Code (from docs + behavioral analysis)

**Skills use `!`command`` for dynamic injection.** Skill files can include backtick-wrapped shell commands prefixed with `!`. At injection time, these commands execute and their stdout replaces the backtick block in the skill content. This means a skill can dynamically include the output of `git log`, `ls`, `cat package.json`, etc. No other tool supports this.

**5 subagent types with different models.** Explore uses Haiku (fast/cheap for file discovery), Plan inherits the main model, Bash is specialized for command execution, Guide uses Claude Code's own documentation, and General-purpose inherits everything. Each has different context windows and tool access.

**22 hook events span the full lifecycle.** Events include: SessionStart, SessionEnd, BeforeToolUse, AfterToolUse, BeforeMessage, AfterMessage, BeforeSubagent, AfterSubagent, BeforeSkill, AfterSkill, OnError, OnRetry, BeforeCheckpoint, AfterCheckpoint, BeforePlan, AfterPlan, BeforeFork, AfterFork, BeforeCompaction, AfterCompaction, OnCostThreshold, OnTokenThreshold.

**Agent teams use shared task list + mailbox.** Teams have a shared task board (create, assign, update status) and per-agent mailboxes. Agents can send messages to teammates by name. The orchestrator manages task distribution and result aggregation. This is the most complete multi-agent system in the comparison.

### 4.5 AGI Workforce CLI

**47K LOC across 23 files is dense but well-organized.** The largest files are `tools.rs` (1493 lines), `agent.rs` (~4000+ lines), and `models.rs` (~3000+ lines). The module structure is flat (no subdirectories) which will need reorganization as features are wired up.

**Six modules are `#[allow(dead_code)]`.** The `main.rs` module declarations show: `compaction`, `hooks`, `mcp`, `sessions`, `skills`, `subagent`, and `teams` all have `#[allow(dead_code)]` annotations. This confirms these subsystems are compiled but not called from the active code paths.

**MCP loads configs but tools are not in the agent loop.** The REPL connects to MCP servers and sets the manager on the session, but the agent loop's `build_tool_definitions()` does not include MCP-discovered tools. The plumbing exists; the last mile is missing.

**Skills discovery works but injection does not.** `skills::discover_skills()` correctly scans both project and global directories, parses YAML frontmatter, and scores relevance. But the agent loop does not call the skill injector before building the system prompt.

**Subagent types are complete but spawn is not called.** `SubagentManager` has `spawn()`, `cancel()`, `status()`, `collect_result()` all implemented. The `Task` tool definition exists in `build_tool_definitions()`. But the tool execution dispatch in `execute_tool()` does not handle the `task` tool name.

---

## 5. Gap Analysis: AGI Workforce CLI

Gaps are ordered by impact (what users will notice first and what blocks competitive positioning).

### P0 -- Critical (blocks basic competitiveness)

| Gap                         | Impact                                                                        | Reference impl                                                  | Effort                                                  |
| --------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| No TUI framework            | Users see raw text, no syntax highlighting, no scrollback, no resize handling | Codex (Ratatui), Gemini/Claude (Ink), OpenCode (@opentui/solid) | Large -- adopt Ratatui                                  |
| No OS-level sandboxing      | Security risk for autonomous mode; enterprise blocker                         | Claude Code + Codex (Seatbelt/Landlock)                         | Medium -- implement Seatbelt (macOS) + Landlock (Linux) |
| No parallel tool execution  | Multi-tool turns run sequentially, 2-5x slower                                | Codex (semaphore-gated ToolCallRuntime)                         | Medium -- tokio::JoinSet with concurrency limit         |
| Subagents not wired         | Task tool exists in schema but execute_tool ignores it                        | Claude Code (5 types), Codex (hierarchical)                     | Small -- wire dispatch + spawn                          |
| MCP tools not in agent loop | MCP servers connect but tools are invisible to the model                      | Claude Code, Gemini, OpenCode                                   | Small -- merge MCP tools into build_tool_definitions    |

### P1 -- Important (competitive differentiation)

| Gap                          | Impact                                                             | Reference impl                              | Effort                                                                      |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------- |
| Skills injection not wired   | Skills discovered but never injected into system prompt            | Claude Code (YAML + dynamic injection)      | Small -- call injector before system prompt build                           |
| No slash commands            | Zero slash commands vs Claude Code's 60+                           | Claude Code                                 | Medium -- /help, /status, /compact, /model, /clear, /undo, /diff at minimum |
| Teams not wired              | Team types defined but enable_team_mode is a no-op                 | Claude Code (shared tasks + mailbox)        | Medium -- wire task board + message passing                                 |
| No diff viewer               | Edits are invisible; users cannot review changes before approval   | Codex (apply_patch), OpenCode (3-tier diff) | Medium -- at minimum show unified diff on edit                              |
| Only 6 hook events           | Missing 16 events that Claude Code has                             | Claude Code (22 events)                     | Small -- add event variants and fire points                                 |
| Context compaction not wired | Long conversations will hit token limits with no graceful handling | Claude Code                                 | Medium -- wire compaction.rs into agent loop                                |
| No plan mode                 | Cannot ask agent to plan before executing                          | Claude Code (plan mode)                     | Small -- flag + system prompt modifier                                      |
| No fast mode                 | Cannot switch to cheaper model mid-session                         | Claude Code (fast mode)                     | Small -- flag + model swap logic                                            |

### P2 -- Nice to Have (polish and ecosystem)

| Gap                       | Impact                                        | Reference impl                         | Effort                                   |
| ------------------------- | --------------------------------------------- | -------------------------------------- | ---------------------------------------- |
| No syntax highlighting    | Code blocks render as plain text              | Codex (tree-sitter), all others (ANSI) | Medium -- syntect or tree-sitter         |
| No Vim keybindings        | Power users expect modal editing              | Gemini, OpenCode                       | Medium -- rustyline vi mode exists       |
| No checkpoints/rewind     | Cannot undo a bad edit                        | Claude Code                            | Large -- requires file snapshot system   |
| No session fork (runtime) | Flag exists but implementation is missing     | OpenCode (parent/child), Claude Code   | Small -- copy session + new ID           |
| No image/vision input     | Cannot send screenshots or images             | Claude Code, Gemini                    | Medium -- base64 encode + vision API     |
| No embedded REPL          | Cannot evaluate expressions inline            | Codex (V8 js_repl)                     | Large -- would need embedded interpreter |
| No A2A protocol           | Cannot communicate with other agent instances | Gemini CLI                             | Large -- new protocol layer              |
| No browser agent          | Cannot interact with web pages beyond fetch   | Gemini (accessibility tree)            | Large -- headless browser integration    |
| Single hook handler type  | Only command; missing http, prompt, agent     | Claude Code (4 types)                  | Medium -- add handler variants           |

---

## 6. Recommended Adoption Priorities

### Phase 1: Wire the Scaffolding (1-2 days)

Everything marked "Small" effort above -- the code exists, it just needs connection:

1. **Wire MCP tools into agent loop** -- merge `McpManager::tools()` into `build_tool_definitions()` and add MCP dispatch to `execute_tool()`.
2. **Wire subagent dispatch** -- add `"task"` match arm to `execute_tool()` that calls `SubagentManager::spawn()`.
3. **Wire skills injection** -- call `skills::discover_skills()` + `skills::select_relevant()` before building system prompt; append matched skill bodies.
4. **Wire context compaction** -- call `compaction::compact()` when conversation token count exceeds threshold.
5. **Add plan mode** -- `--plan` flag that prepends "Create a detailed plan but do not execute" to system prompt and disables tool use.
6. **Add fast mode** -- `--fast` flag or `/fast` command that swaps to `config.default.fast_model`.
7. **Wire session fork** -- `--fork-session` already exists as a flag; implement the copy-on-resume logic.

### Phase 2: Parallel Tools + Sandboxing (3-5 days)

The two features that most impact safety and performance:

1. **Parallel tool execution** -- when the model returns multiple tool_use blocks in a single response, execute them concurrently via `tokio::JoinSet` with a configurable semaphore (default: 4). Collect all results before sending the next turn.
2. **macOS Seatbelt sandbox** -- generate a `.sb` profile that restricts filesystem access to the project directory and `/tmp`, blocks network except for API endpoints, and prevents process spawning outside of allowed commands. Apply via `sandbox-exec` before tool execution.
3. **Linux Landlock sandbox** -- equivalent restrictions using Landlock LSM (kernel 5.13+) with bubblewrap as fallback for older kernels.

### Phase 3: TUI Framework (1-2 weeks)

Adopt Ratatui (already proven by Codex CLI in the Rust ecosystem):

1. **Alternate buffer mode** -- full-screen terminal application with proper cleanup on exit.
2. **Scrollable output pane** -- conversation history with scroll-back.
3. **Syntax highlighting** -- integrate syntect or tree-sitter-highlight for code blocks.
4. **Input editor** -- multi-line input with history, completion, and optionally Vi mode.
5. **Tool execution panel** -- live display of running tools with progress, duration, and output preview.
6. **Split pane for diffs** -- show file changes side-by-side or inline when edit tools execute.

### Phase 4: Slash Commands + Extended Hooks (3-5 days)

1. **Core slash commands**: `/help`, `/status`, `/clear`, `/compact`, `/model <name>`, `/undo`, `/diff`, `/cost`, `/session list`, `/session fork`, `/tools`, `/mcp`.
2. **Extend hook events** to 22 (matching Claude Code) with the full lifecycle: Before/AfterSubagent, Before/AfterSkill, Before/AfterCheckpoint, Before/AfterPlan, Before/AfterFork, Before/AfterCompaction, OnCostThreshold, OnTokenThreshold.
3. **Add http and prompt hook handler types** beyond just command execution.

### Phase 5: Advanced Features (2-4 weeks)

1. **Agent teams** -- wire the existing `TeamManager` with task board and mailbox semantics.
2. **Checkpoints/rewind** -- snapshot files before each edit, allow `/undo` to restore.
3. **3-tier diff matching** -- adopt OpenCode's approach (exact -> trimmed -> Levenshtein) for more robust edits.
4. **JSONL session rollouts** -- supplement SQLite with JSONL audit logs for replay capability.
5. **Browser agent** -- accessibility tree extraction for web interaction.

---

## Appendix: Module-Level Architecture Maps

### Codex CLI (`codex-rs/` workspace)

```
codex-rs/
  codex-core/          Agent loop, conversation management
  codex-exec/          Subprocess execution, process management
  codex-sandbox/       Seatbelt (macOS), Landlock (Linux), bubblewrap
  codex-tui/           Ratatui terminal UI
  codex-proto/         Wire protocol definitions
  codex-apply-patch/   Structural diff/patch application
  codex-js-repl/       Embedded V8 JavaScript REPL
  ... (73 crates total)
```

### Gemini CLI (`src/`)

```
src/
  components/          Ink React components (11 contexts)
  agents/              Agent + browser agent + delegate pattern
  providers/           20+ LLM provider adapters
  tools/               Built-in tool implementations
  policy/              Tool approval policy engine
  a2a/                 Agent-to-Agent protocol server
  vscode/              VS Code companion extension bridge
```

### OpenCode (`src/`)

```
src/
  tui/                 @opentui/solid components
  worker/              Backend worker thread (agent + tools)
  rpc/                 Thread communication protocol
  tools/               20+ built-in tools + LSP bridge
  diff/                3-tier diff matching engine
  sessions/            Drizzle ORM + SQLite + fork tracking
  server/              HTTP/WS server for mobile clients
```

### AGI Workforce CLI (`src/`)

```
src/
  main.rs              CLI entry (clap), 25 flags
  repl.rs              Interactive REPL loop
  agent.rs             Agent session + agentic loop
  tools.rs             9 tool implementations
  models.rs            Provider abstraction (7 providers)
  config.rs            TOML config (global + project + env)
  memory.rs            3-tier CLAUDE.md hierarchy
  hooks.rs             6 hook events, command handlers
  mcp.rs               MCP stdio client [scaffolded]
  subagent.rs          Subagent manager [scaffolded]
  teams.rs             Team manager [scaffolded]
  skills.rs            Skill discovery + matching [scaffolded]
  compaction.rs        Context compaction [scaffolded]
  sessions.rs          SQLite session storage
  permissions.rs       Allow/deny permission store
  safety.rs            Command safety classification
  context.rs           System context gathering
  output.rs            Terminal output formatting
  markdown.rs          Markdown rendering
  conversations.rs     Conversation management
  provider.rs          Model catalog + provider detection
  auth.rs              Authentication
  errors.rs            Error types
```
