# CLI Product & Technical Specification

## 1. Mission

The CLI should be the terminal-native AGI Workforce runtime: fast to start, safe by default, deeply scriptable, and strong enough for serious developer and operator workflows.

It should be the best AGI Workforce surface for users who live in the shell.

## 2. Users and jobs-to-be-done

### Primary users

- developers working in terminal-heavy environments
- operators and platform engineers running repeatable tasks
- advanced users who want automation and scripting
- CI or local automation users who need machine-readable output

### Jobs-to-be-done

- ask a one-shot question and get a fast answer
- iterate in a long-running REPL session
- run agentic coding tasks from the terminal
- inspect, resume, branch, and search prior sessions
- use tools safely from a shell-native interface
- stream results into other commands and systems

## 3. Scope and feature ownership

### The CLI owns

- one-shot terminal prompting
- interactive REPL conversations
- structured output for automation
- terminal-native tool calling
- slash-command-driven power workflows
- session and memory management for shell users
- direct or abstracted provider/model access

### The CLI does not own

- visual dashboard UX
- billing and account management
- browser-native UX
- mobile companion behavior
- general-purpose desktop automation UI

## 4. Feature set

### Core interaction features

- one-shot mode via positional prompt
- interactive REPL mode when no prompt is passed
- stdin/pipe mode
- print mode for non-interactive workflows
- raw, text, JSON, and stream-JSON output modes

### Agent features

- multi-turn agentic loops with a configurable turn budget
- plan mode for read-only exploration first
- side queries that do not mutate the main conversation
- session continuation, resume, and fork
- team mode and subagent workflows

### Model features

- model selection by explicit model id
- provider override
- fallback model support
- effort presets that bundle tokens, temperature, and iteration depth
- model listing and model catalog inspection

### Memory and context features

- memory hierarchy support
- project and local context loading
- file attachment via `--file`
- custom system prompt and system prompt append
- conversation compaction

### Tooling features

- file read and write
- file edit and patch application
- directory listing and search
- shell command execution
- web search and web fetch
- MCP tool execution

### Operational features

- session cost inspection
- config inspection
- shell completions
- debug logging
- safe approval controls

## 4A. Competitive benchmark lens

The CLI feature set should be informed by the full competitive landscape as of March 2026.

### Claude Code

80K+ GitHub stars, v2.1.79. The current reference implementation for agentic CLI tooling.

- Agent Teams with team leads and parallel subagent workers
- Skills 2.0 with forked context, hot reload, and custom agent definitions
- Hooks system (PreToolUse, PostToolUse, Stop, SessionStart) for lifecycle automation
- Plugin marketplace and distribution model
- Voice mode via `/voice` with push-to-talk, 20 language support
- Git worktree support for parallel branch work
- Remote control mode for headless and CI execution
- MCP elicitation for interactive server prompts
- 1M token context window on Max, Team, and Enterprise plans
- Opus 4.6 as default model

AGI CLI should match or exceed Claude Code on skills, hooks, approval UX, and intelligent context gathering. Claude Code reads project files as needed rather than forcing manual context curation. It shows proposed changes and asks for approval before edits. It treats Git operations conversationally. AGI CLI should treat all of these as first-class patterns.

Applicable official references:

- Claude Code overview: `https://docs.anthropic.com/en/docs/claude-code/overview`
- Claude Code quickstart: `https://code.claude.com/docs/en/quickstart`
- Claude apps release notes: `https://support.claude.com/en/articles/12138966-release-notes`

### OpenAI Codex CLI

66K+ GitHub stars, v0.116. Rewritten in Rust. The primary cross-surface competitor.

- Plugin system with reusable skill library
- Multi-agent TUI with structured panel layout
- Voice transcription for terminal input
- Terminal reading and JS REPL execution
- Smart approval system with tiered safety classification
- GPT-5.4 as default model
- Windows native support
- Cloud delegation for long-running tasks
- Spans CLI, web, IDE extension, and app with shared login and shared product concepts

AGI CLI should align with the rest of the AGI Workforce surfaces without losing terminal-native behavior. Codex’s reusable skill library and cross-surface admin controls set expectations for enterprise users.

Applicable official references:

- Introducing the Codex app: `https://openai.com/index/introducing-the-codex-app/`
- Codex is now generally available: `https://openai.com/index/codex-now-generally-available/`
- Codex CLI GitHub: `https://github.com/openai/codex`

### Gemini CLI

98K+ GitHub stars. The free tier champion with the largest open-source community.

- 60 requests per minute free, 1,000 requests per day free
- Plan mode for structured task decomposition
- Agent Skills system for reusable automation
- A2A (agent-to-agent) protocol support for cross-agent communication
- Browser agent for web interaction from CLI
- 1M token context window
- Deep integration with Google ecosystem services

AGI CLI should address accessibility and free-tier onboarding as seriously as Gemini does. The A2A protocol represents a potential interoperability standard AGI CLI should track.

Applicable official references:

- Gemini CLI GitHub: `https://github.com/google-gemini/gemini-cli`
- Gemini CLI docs: `https://googlegemini.github.io/gemini-cli/`
- A2A protocol: `https://github.com/google/A2A`

### GitHub Copilot CLI

GA February 25, 2026. The deepest GitHub-integrated CLI agent.

- Plan, Agent, and Autopilot execution modes
- Multi-model support (Claude, GPT, Gemini) via model picker
- Extensions system for third-party integrations
- Hooks for lifecycle customization
- OpenTelemetry-based observability
- Native GitHub issue, PR, and Actions integration

AGI CLI should not attempt to replicate GitHub-native integration depth but should match the execution mode flexibility and multi-model breadth.

Applicable official references:

- GitHub Copilot CLI docs: `https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-in-the-command-line`
- Copilot coding agent: `https://docs.github.com/en/copilot/using-github-copilot/using-the-copilot-coding-agent`

### Other notable competitors

- **Aider** (42K+ stars): SWE-Bench SOTA performer. Git-native edit-commit workflow. Strong benchmark results. Reference: `https://github.com/paul-gauthier/aider`
- **Warp 2.0**: Agentic terminal concept where the terminal itself is the AI interface. Background agents, natural language shell commands. Reference: `https://www.warp.dev/`
- **OpenCode** (75+ provider support): Broad model coverage across providers. Reference: `https://github.com/opencode-ai/opencode`
- **Cursor CLI**: Extension of Cursor IDE into terminal workflows. 40-tool MCP cap. Reference: `https://www.cursor.com/`

## 5. End-to-end flows

### Flow A: one-shot request

1. User runs `agiworkforce "prompt"`.
2. CLI parses flags, resolves model/provider config, and loads system context.
3. If files are provided, it assembles them into context.
4. LM request starts streaming output.
5. If tool use is needed, tools execute under the configured approval policy.
6. Final answer prints in terminal-friendly markdown/text.
7. Session metadata is stored for later resume and search.

### Flow B: interactive REPL session

1. User starts CLI with no prompt.
2. Banner prints with current model/provider.
3. User enters messages, slash commands, `!` shell commands, or `#` memory entries.
4. Session maintains message history, memory references, MCP state, and tool results.
5. Agent loop continues until a final answer, turn cap, or permission stop.
6. User can compact, fork, search, or resume sessions without leaving the terminal.

### Flow C: CI or automation flow

1. External tool pipes input or invokes CLI with machine-oriented flags.
2. CLI runs in non-interactive mode with structured output.
3. Safe tools can auto-approve; dangerous operations still require explicit override.
4. Output emits as JSON or NDJSON for downstream parsers.
5. Exit code reflects success or failure cleanly.

## 6. UI, look, and layout

### Visual model

The CLI UI should remain deliberately minimal:

- readable banner
- clear prompt line
- spinner while model is working
- streaming assistant output
- explicit tool status lines
- compact warnings and errors
- confirmation prompts only when needed

### Layout model

The layout should always feel linear and shell-native:

1. banner or command output header
2. prompt input
3. tool/runtime messages inline with the conversation
4. streamed answer body
5. concise footer state where needed

### Look and feel rules

- prioritize scanability over decoration
- use color only for meaning: warnings, approvals, success, errors, model/status hints
- never flood the screen with verbose scaffolding
- keep tool progress legible during long tasks
- preserve clean copy-paste behavior

## 7. UI components

The CLI does not have React components, but it still has presentation components that must behave consistently.

### Required presentation components

- banner renderer
- user prompt renderer
- markdown answer renderer
- spinner/status indicator
- tool execution status line
- confirmation prompt
- slash-command help output
- cost and config summaries

### Component rules

- every component should degrade to plain text cleanly
- structured output mode should bypass decorative formatting
- tool output should be truncated safely and predictably
- confirmation prompts should clearly show risk level

## 8. Frontend architecture

For the CLI, the “frontend” is the terminal-facing layer.

### Responsibilities

- parse arguments with a stable command contract
- run the REPL loop
- render markdown and streaming output
- handle slash commands and prefixes
- route user intent into the agent session

### Key modules

- `apps/cli/src/main.rs`
- `apps/cli/src/repl.rs`
- `apps/cli/src/output.rs`
- `apps/cli/src/markdown.rs`
- `apps/cli/src/config.rs`

### Design rules

- parsing logic, rendering logic, and runtime logic should remain separated
- the REPL should be resilient to network, tool, and provider failures
- the terminal layer should not embed provider-specific logic

## 9. Backend/runtime architecture

For the CLI, the backend is the local Rust runtime behind the prompt loop.

### Responsibilities

- session management
- model/provider abstraction
- safety and permission checks
- memory loading and persistence
- tool dispatch
- MCP connection management
- hooks, skills, and subagent orchestration

### Runtime modules

- `agent.rs`
- `sessions.rs`
- `memory.rs`
- `provider.rs`
- `tools.rs`
- `mcp.rs`
- `skills.rs`
- `hooks.rs`
- `subagent.rs`
- `teams.rs`

### Persistence model

- local config and history under the CLI config directory
- durable sessions for resume/search/fork
- memory tiers for global, project, and local context

## 10. LM architecture

### Model selection

- explicit `--model` should override defaults
- provider should be inferred from model when possible
- fallback models should trigger only on real failure conditions
- effort presets should tune iteration depth and token budgets predictably

### Context assembly

- system context should be built before each run
- attached files should be bounded and clearly represented
- memory tiers should be loaded deterministically
- conversation history should be compacted when needed

### Inference behavior

- streaming should be the default
- non-streaming should remain available for automation
- tool-use loops should be bounded by `max_turns`
- plan mode should bias toward read-only inspection before mutation

### Failure handling

- provider failures should surface clearly
- retry behavior should be conservative and explicit
- fallback model logic should not create hidden behavior

## 11. API architecture

### External APIs

The CLI should speak to model providers through a provider abstraction layer. The rest of the runtime should not care whether a model request is direct-to-provider or routed through a hosted AGI Workforce service.

### Internal contracts

- request envelope should include model, messages, streaming mode, temperature, and optional tool schema
- streamed events should normalize provider-specific chunk formats
- session metadata should capture cost, tokens, and provider/model provenance

### API rules

- all provider-specific quirks should stay in provider modules
- retries should be limited and safe
- auth material must stay out of logs and terminal output

## 12. Tool architecture

### Tool inventory

The CLI tool layer should expose, at minimum:

- `read_file`
- `write_file`
- `edit_file`
- `run_command`
- `search_files`
- `list_directory`
- `web_search`
- `web_fetch`
- MCP-discovered tools
- subagent/team tasks

### Tool execution rules

- safe read-only tools may auto-approve under `--yes`
- write and command tools should prompt unless explicitly overridden
- dangerous shell commands should be classified before execution
- long outputs should be truncated and annotated
- command execution should respect timeouts

### Tool UX rules

- print an intent line before execution
- show whether execution succeeded
- preserve enough output for the model and user to reason correctly
- never hide a destructive action behind silent behavior

## 13. Data, state, and sync

### Required state

- active conversation state
- session metadata
- tool execution outcomes
- model and provider selection
- memory tier contents
- persisted config and history

### Sync model

The CLI should be able to operate fully locally. Any optional syncing should be additive rather than required.

## 14. Security and privacy

- dangerous commands must be classified before execution
- user confirmation must be the default for mutating operations
- secrets must not be printed back to the terminal
- memory and session persistence should avoid storing unnecessary secrets
- hooks and MCP integrations should be explicit and inspectable

## 15. Performance and reliability

- startup should feel immediate
- streaming should begin quickly
- file operations should avoid unbounded reads
- tool execution should respect line, byte, and timeout limits
- crashes in one provider/tool path should not corrupt session history

## 16. Observability, testing, and release gates

### Minimum quality bar

- argument parsing must be stable
- REPL slash commands must be tested
- tool safety behavior must be tested
- structured output modes must be tested
- session resume and memory flows must be tested

### Release gates

- help output is correct
- all core flags parse
- REPL launches correctly
- one-shot mode works
- streaming and non-streaming both work
- tool confirmations behave correctly

## 17. Definition of done

The CLI is in the correct state when:

- it is the fastest AGI Workforce surface to use from a shell
- it supports serious coding and ops workflows
- it remains safe by default
- it is scriptable enough for automation and CI
- it does not depend on desktop to be credible

## 18. Canonical implementation anchors

- `apps/cli/src/main.rs`
- `apps/cli/src/repl.rs`
- `apps/cli/src/agent.rs`
- `apps/cli/src/tools.rs`
- `apps/cli/src/mcp.rs`
- `apps/cli/src/memory.rs`
- `docs/CLI_PARITY_SCORECARD.md`

## 19. Interaction inventory

### Entry modes

- one-shot prompt invocation
- interactive REPL
- stdin/pipe mode
- raw print mode
- structured JSON mode
- structured stream-JSON mode

### Slash-command inventory

Based on the current codebase, the CLI should treat the following command families as first-class:

- model selection and model listing
- plan mode
- context compaction
- side query
- memory inspect/add/edit
- help and status flows

### Approval and safety interactions

- read-only safe tools auto-approved only when explicitly configured
- mutating file and command tools prompt by default
- danger-classified commands should surface clear warnings before execution

## 20. Tool and API inventory

### Tool inventory

- file read
- file write
- file edit
- directory list
- file search
- shell execution
- web search
- web fetch
- MCP tools
- subagent/team tasks

### Internal API inventory

- provider request abstraction
- session persistence contract
- memory manager contract
- tool-call envelope
- MCP transport contract
- hook input and lifecycle contract

## 21. Phased roadmap

### Phase 1: plugin and skill ecosystem parity

- implement skills system aligned with Claude Code Skills 2.0 patterns (forked context, hot reload, custom agents)
- implement hooks system with PreToolUse, PostToolUse, Stop, and SessionStart lifecycle events
- build plugin loading and distribution model compatible with marketplace patterns
- align slash-command and workflow abstractions with emerging SKILL.md and AGENTS.md standards
- reach feature parity with Claude Code on reusable workflow discovery and execution

### Phase 2: multi-agent orchestration

- implement agent teams with team lead coordination and parallel subagent workers
- build subagent workflow dispatch with configurable concurrency and result aggregation
- support parallel execution of independent tool chains within a single session
- add event-triggered automation patterns (cron schedules, webhook listeners, CI/CD triggers)
- implement inter-agent communication compatible with A2A protocol concepts

### Phase 3: voice and multi-modal

- implement voice mode in terminal with push-to-talk interaction model
- support voice transcription input as an alternative to typed prompts
- add image inspection and description as context input
- support multi-modal context assembly (text, image, audio transcription) in a single session
- reach parity with Claude Code voice mode on language breadth

### Phase 4: enterprise and cross-surface

- implement enterprise policy controls (managed approval rules, tool restrictions, audit logging)
- add analytics and observability export aligned with OpenTelemetry patterns
- build shared skill and workflow distribution across desktop, web, mobile, and IDE surfaces
- support remote control and headless execution for CI and server environments
- implement cloud delegation for long-running tasks that outlive terminal sessions

## 22. Gap analysis

### Gaps relative to Claude Code

- plugin ecosystem depth: Claude Code has a functioning marketplace with community-contributed plugins; AGI CLI has no plugin distribution yet
- agent teams maturity: Claude Code agent teams ship with team lead coordination and parallel worker dispatch; AGI CLI team mode is structural but not production-exercised
- voice mode: Claude Code ships `/voice` with push-to-talk and 20 language support; AGI CLI has no voice input
- 1M token context: Claude Code leverages 1M context on Max/Team/Enterprise plans; AGI CLI context window is bounded by provider defaults without explicit large-context optimization
- remote control: Claude Code supports headless remote execution for CI and server use; AGI CLI requires an interactive terminal
- skills 2.0 patterns: Claude Code skills use forked context with hot reload; AGI CLI skills are static

### Gaps relative to Codex CLI

- Rust performance: Codex CLI completed its Rust rewrite; AGI CLI is Rust-native but has not benchmarked startup and throughput against Codex
- Windows native: Codex CLI ships Windows native binaries; AGI CLI targets Unix-first
- cloud delegation: Codex CLI can delegate long-running tasks to cloud; AGI CLI is terminal-bound
- TUI polish: Codex CLI multi-agent TUI has structured panel layout; AGI CLI output is linear stream only

### Gaps relative to Gemini CLI

- free tier accessibility: Gemini CLI offers 60 req/min and 1,000 req/day free; AGI CLI requires user-provided API keys with no free tier
- A2A protocol: Gemini CLI supports agent-to-agent protocol for cross-agent communication; AGI CLI has no A2A support
- star count and community: Gemini CLI has 98K+ stars and broad open-source engagement; AGI CLI community is nascent

### Gaps relative to Copilot CLI

- GitHub ecosystem integration: Copilot CLI has native issue, PR, and Actions integration; AGI CLI treats GitHub as an external tool
- autopilot mode: Copilot CLI has a fully autonomous execution mode with minimal user intervention; AGI CLI requires explicit approval for mutating operations
- multi-model breadth: Copilot CLI ships Claude, GPT, and Gemini via a single model picker; AGI CLI supports 9+ providers but model switching UX is less polished

### Gaps relative to Aider and Warp

- git-native workflows: Aider treats every edit as a git commit with automatic diff review; AGI CLI git support is additive rather than deeply integrated into the edit loop
- agentic terminal concept: Warp 2.0 reimagines the terminal itself as an AI interface with background agents; AGI CLI operates within a traditional terminal emulator

## 22A. Protocol and ecosystem standards

### MCP specification (2025-11-25 revision)

The MCP specification has evolved significantly since initial adoption. The current spec includes:

- **Tasks**: long-running operation tracking with progress reporting and cancellation
- **Extensions**: server-defined capability extensions beyond the base protocol
- **OAuth overhaul (CIMD)**: client-initiated metadata discovery for OAuth-based auth flows
- **Elicitation**: servers can request structured input from users during tool execution
- **Sampling with Tools**: servers can request LLM completions with tool schemas attached
- **MCP Bundles**: packaged server configurations for one-click deployment

AGI CLI should track the full spec surface. The hooks and skills systems should compose cleanly with MCP lifecycle events.

### MCP adoption scale

- 10K+ registered MCP servers across public registries
- 97M+ cumulative SDK downloads across TypeScript, Python, Rust, and Go SDKs
- Universal adoption across Claude Code, Codex CLI, Gemini CLI, Copilot CLI, Cursor, and Warp
- MCP is the de facto standard for tool integration in agentic CLI tooling

### A2A protocol

Google's agent-to-agent protocol defines a standard for cross-agent communication, task delegation, and capability discovery. Gemini CLI implements A2A natively. AGI CLI should evaluate A2A as an interoperability layer for multi-agent workflows that span different agent runtimes.

Reference: `https://github.com/google/A2A`

### Emerging configuration standards

- **AGENTS.md**: project-level agent configuration files emerging from Codex CLI and Cursor conventions. Defines agent behavior, tool access, and safety rules per repository.
- **SKILL.md**: skill definition files that declare reusable automation recipes. Aligned with Claude Code Skills 2.0 patterns.

AGI CLI should support reading AGENTS.md and SKILL.md from project roots and translating them into runtime configuration.

### CLI tools vs MCP tools

Benchmark data indicates CLI-native tools achieve 28% higher task completion rates and 33% better token efficiency compared to equivalent MCP-wrapped tools. The overhead comes from MCP transport serialization, capability negotiation, and connection lifecycle management. AGI CLI should prefer native tool implementations for core operations (file, shell, search) and reserve MCP for external integrations where native implementation is impractical.

## 22B. Agent automation patterns

### Hooks system

Hooks intercept agent lifecycle events and execute user-defined logic. The standard hook points are:

- **PreToolUse**: fires before any tool execution. Can modify arguments, block execution, or inject approvals.
- **PostToolUse**: fires after tool execution completes. Can inspect results, trigger follow-up actions, or log outcomes.
- **Stop**: fires when the agent loop terminates. Can run cleanup, summary, or notification logic.
- **SessionStart**: fires when a new session initializes. Can load project context, set defaults, or run warm-up tasks.

Hooks should be defined in project-level configuration files and composable with MCP server events.

### Skills 2.0

Skills are reusable automation recipes that run in forked context:

- each skill executes in an isolated context fork to prevent contamination of the main session
- skills support hot reload during development without restarting the CLI
- custom agent definitions allow skills to specify their own system prompts, tool access, and safety rules
- skills can be distributed as files, git repositories, or marketplace packages

### Plugin marketplaces and distribution

The competitive landscape has converged on plugin marketplaces as the distribution mechanism for agent extensions:

- Claude Code ships a plugin marketplace with community contributions
- Codex CLI bundles a skill library with the app
- AGI CLI should define a plugin manifest format, a local plugin registry, and a remote marketplace protocol

### Multi-agent orchestration

Multi-agent patterns observed across competitors:

- **team leads**: a coordinating agent that decomposes tasks and assigns them to specialized workers
- **subagents**: child agents that execute focused subtasks and return results to the parent
- **parallel workers**: multiple agents executing independent work items concurrently with result aggregation
- **handoff protocols**: structured task handoff between agents with context transfer and capability matching

AGI CLI team mode should implement all four patterns with configurable concurrency limits and failure handling.

### Event-triggered automation

Automation should extend beyond interactive sessions:

- **cron schedules**: recurring task execution on time-based triggers
- **webhook listeners**: HTTP endpoints that trigger agent workflows from external events
- **CI/CD triggers**: integration with CI pipelines for automated code review, testing, and deployment tasks
- **file watchers**: filesystem event triggers for reactive automation

### Voice-in-terminal

Voice input in terminal is an emerging interaction paradigm:

- Claude Code ships `/voice` with push-to-talk and transcription
- Codex CLI supports voice transcription as terminal input
- The pattern treats voice as an alternative input modality alongside typed text, not as a separate mode
- AGI CLI should implement voice input as a composable input source that feeds into the standard prompt pipeline

## 23. Feature acceptance criteria

| Feature                    | Acceptance criteria                                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One-shot prompt mode       | Accepts a prompt directly, resolves model/config correctly, streams by default, exits cleanly, persists session metadata, and returns a non-zero exit code on fatal failure. |
| Interactive REPL           | Launches without prompt, preserves history, supports multiline entry, supports slash commands, and keeps session state coherent across turns.                                |
| Session resume/fork/search | User can resume by id, search prior sessions, fork an existing session, and continue without corrupting source history.                                                      |
| Model selection            | `--model`, provider inference, fallback model, and effort presets behave deterministically and surface the active model clearly.                                             |
| Memory hierarchy           | Global, project, and local memory can be shown, added to, and edited; memory loading is deterministic and visible in behavior.                                               |
| File context               | `--file` attachments load predictably, respect size limits, and are represented clearly in the runtime context.                                                              |
| Tool execution             | Read tools, write tools, shell tools, and web tools execute through one consistent dispatcher with timeouts, truncation, and typed results.                                  |
| Safety and approvals       | Safe tools can auto-approve only when configured; mutating actions prompt by default; dangerous shell commands are classified before execution.                              |
| Structured output          | JSON and stream-JSON outputs are parseable, stable, and omit decorative terminal formatting.                                                                                 |
| MCP integration            | CLI can discover configured MCP servers, connect, list tools, and execute them without destabilizing the session.                                                            |
| Side query and plan mode   | `/btw` does not mutate main history; `/plan` changes runtime behavior in a visible and reversible way.                                                                       |
| Team mode                  | Team mode enables shared-task and teammate semantics without breaking non-team sessions.                                                                                     |

## 24. Interaction-by-interaction implementation checklist

### Startup and config

- parse all CLI flags before runtime init
- load config, history, memory, and optional MCP configs
- resolve model/provider/fallback before first request
- render startup banner only in interactive modes

### One-shot execution

- normalize prompt source: positional arg vs stdin vs explicit mode
- assemble system context and attached files
- initialize agent session with safety settings
- stream answer and tool events in correct order
- persist session and cost metadata on completion

### REPL execution

- initialize editor mode and history file
- support empty-line skip, multiline continuation, and slash command routing
- support `#` memory shorthand and `!` shell shorthand
- flush markdown renderer after streaming completes
- keep history and session in sync across recoverable errors

### Slash commands

- `/model` updates active model cleanly
- `/models` lists available models
- `/plan` toggles plan mode visibly
- `/compact` compacts context safely
- `/btw` forks a temporary side query
- `/memory` supports show/add/edit flows with tier handling
- `/help` remains complete and current

### Tooling

- route tool calls through one dispatcher
- print a clear tool status line before execution
- enforce per-tool timeout and output limits
- return structured tool results to agent runtime
- prompt for risky operations with plain-language confirmation

### Persistence and search

- persist session transcript and metadata
- support search over stored sessions
- support resume and fork without history corruption
- keep history and session ids stable across CLI restarts
