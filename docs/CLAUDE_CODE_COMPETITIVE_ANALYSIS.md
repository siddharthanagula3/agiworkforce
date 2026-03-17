# Claude Code Competitive Analysis & AGI Workforce CLI Plan

**Date**: 2026-03-17
**Scope**: Ultra-thorough competitive intelligence on Claude Code (Anthropic's CLI tool) with actionable differentiation plan for AGI Workforce CLI.

---

## Table of Contents

1. [Claude Code Architecture](#1-claude-code-architecture)
2. [Claude Code Features Deep-Dive](#2-claude-code-features-deep-dive)
3. [Claude Agent SDK](#3-claude-agent-sdk)
4. [Claude Code Pricing & Economics](#4-claude-code-pricing--economics)
5. [Claude Code Limitations & Weaknesses](#5-claude-code-limitations--weaknesses)
6. [Claude Code Plugins & Ecosystem](#6-claude-code-plugins--ecosystem)
7. [Market Position & Competitive Landscape](#7-market-position--competitive-landscape)
8. [AGI Workforce CLI Differentiation Strategy](#8-agi-workforce-cli-differentiation-strategy)
9. [AGI Workforce CLI Implementation Plan](#9-agi-workforce-cli-implementation-plan)

---

## 1. Claude Code Architecture

### 1.1 Core Design Philosophy

Claude Code is built as a **thin shell on top of the Claude model**. The Anthropic team explicitly tries to write as little business logic as possible, wanting users to "feel the model as raw as possible." The model itself defines the UI, and the shell exposes hooks for the model to modify behavior.

**Key architectural decisions:**

- **Tech stack**: TypeScript, React, Ink (terminal UI library), Yoga (flexbox layout engine), Bun (runtime)
- **Self-bootstrapping**: 90% of Claude Code's own code is written by Claude Code itself
- **Agent-first**: Not a chatbot with code generation -- it is an agentic system with shell access
- **Context-aware**: Reads your entire codebase, formulates plans, breaks into executable steps, runs commands, reads output, iterates

### 1.2 Agent Loop

When a user submits a prompt, Claude Code:

1. Formulates a plan from the prompt + codebase context
2. Breaks into executable steps
3. Writes and runs shell commands/scripts
4. Reads output
5. Iterates if a command fails (reads error, adjusts approach, retries)
6. Returns results when complete

### 1.3 Available Surfaces

Claude Code runs across 7 surfaces, all connected to the same underlying engine:

| Surface                  | Description                                                  | Status    |
| ------------------------ | ------------------------------------------------------------ | --------- |
| **Terminal CLI**         | Full-featured, primary interface                             | GA        |
| **VS Code Extension**    | Inline diffs, @-mentions, plan review                        | GA        |
| **JetBrains Plugin**     | IntelliJ, PyCharm, WebStorm                                  | GA (Beta) |
| **Desktop App**          | Standalone Electron-like app, visual diff review, scheduling | GA        |
| **Web (claude.ai/code)** | Browser-based, no local setup needed                         | GA        |
| **Chrome Extension**     | Browser automation, live debugging                           | Beta      |
| **Slack Integration**    | @Claude mentions route to Claude Code                        | Beta      |

All surfaces share CLAUDE.md files, settings, and MCP servers.

### 1.4 What Claude Code Does Well (Architecture)

- **Zero-config startup**: `curl install.sh | bash` then `claude` in any directory
- **Git-native**: Deep git integration (staging, commits, branches, PRs) baked into the agent loop
- **Context management**: Automatic compaction at ~95% capacity, resumable sessions
- **Cross-surface portability**: Start in terminal, hand off to desktop app, monitor from phone
- **Auto-updating**: Native installs update in background automatically

### 1.5 What Claude Code Does Poorly (Architecture)

- **Claude-only**: Locked to Anthropic models (Opus 4.6, Sonnet 4.6, Haiku 4.5). No GPT-4o, Gemini, DeepSeek, Llama, Mistral
- **No BYOK for other providers**: Third-party model support is only through API proxies (Bedrock, Vertex, Azure) -- still Claude models only
- **Closed source**: Proprietary codebase. GitHub repo contains docs/plugins, not source. "Not ready to be good public stewards"
- **Node.js runtime**: TypeScript/Bun means no native performance for compute-heavy tasks. No compiled binary advantages
- **No offline mode**: Requires internet connection to Anthropic servers at all times

---

## 2. Claude Code Features Deep-Dive

### 2.1 Skills System

Skills are markdown files (SKILL.md) that teach Claude repeatable workflows, invoked as slash commands.

**Structure:**

```markdown
---
name: skill-name
description: What the skill does
disable-model-invocation: true # optional
---

Instructions for Claude...
```

**Skill sources (priority order):**

1. CLI flags (session only)
2. `.claude/skills/` (project)
3. `~/.claude/skills/` (user)
4. Plugin skills

**Capabilities:**

- Frontmatter supports `tools`, `disallowedTools`, `model`, `context` (fork/inline), `hooks`
- Skills can spawn isolated subagents with their own context windows
- `$ARGUMENTS` placeholder captures user input after the command name
- Skills can be injected into subagent context via `skills:` frontmatter field

### 2.2 Hooks System (24 Events)

Hooks are shell commands, HTTP endpoints, LLM prompts, or agents that execute at specific lifecycle points.

**24 hook events:**

| Category       | Events                                      |
| -------------- | ------------------------------------------- |
| Session        | SessionStart, SessionEnd                    |
| User Input     | UserPromptSubmit                            |
| Tool Lifecycle | PreToolUse, PostToolUse, PostToolUseFailure |
| Permissions    | PermissionRequest                           |
| Notifications  | Notification                                |
| Subagents      | SubagentStart, SubagentStop                 |
| Agent Teams    | TeammateIdle, TaskCompleted                 |
| Context        | PreCompact, PostCompact, InstructionsLoaded |
| Configuration  | ConfigChange                                |
| Worktrees      | WorktreeCreate, WorktreeRemove              |
| MCP            | Elicitation, ElicitationResult              |
| Completion     | Stop                                        |

**4 hook handler types:**

1. **Command** (`type: "command"`): Shell commands, JSON via stdin, exit codes control behavior
2. **HTTP** (`type: "http"`): POST to URL, headers with env var interpolation
3. **Prompt** (`type: "prompt"`): Single-turn LLM evaluation, configurable model
4. **Agent** (`type: "agent"`): Subagent with tool access (Read, Grep, Glob)

**Decision control:**

- PreToolUse hooks can `allow`, `deny`, or `ask` per tool call
- Can modify tool input (`updatedInput`) before execution
- PostToolUse hooks can block results, inject additional context, or replace MCP output
- Stop hooks can prevent Claude from finishing (force continuation)

### 2.3 Sub-Agents

Subagents are isolated AI instances with their own context window, system prompt, tool access, and model.

**Built-in subagents:**

| Agent             | Model        | Tools     | Purpose                                      |
| ----------------- | ------------ | --------- | -------------------------------------------- |
| Explore           | Haiku (fast) | Read-only | Codebase search, file discovery              |
| Plan              | Inherit      | Read-only | Research for plan mode                       |
| General-purpose   | Inherit      | All       | Complex multi-step tasks                     |
| Bash              | Inherit      | Terminal  | Running commands in separate context         |
| Claude Code Guide | Haiku        | -         | Answering "how to use Claude Code" questions |

**Custom subagent configuration:**

- Markdown files with YAML frontmatter in `.claude/agents/` or `~/.claude/agents/`
- Model selection: `sonnet`, `opus`, `haiku`, full model IDs, or `inherit`
- Tool allowlists/denylists
- Permission modes: `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan`
- MCP server scoping (inline or reference)
- Persistent memory across sessions (`user`, `project`, `local` scopes)
- Worktree isolation (`isolation: "worktree"`)
- Background execution (Ctrl+B to background a running task)
- Resumable (transcripts persist, can continue where stopped)
- Auto-compaction at ~95% capacity

**Subagent limitation:** Cannot spawn other subagents (no nesting).

### 2.4 Agent Teams (February 5, 2026)

Agent Teams is the newest extension: collaborative squads where multiple Claude instances work together.

**Key differences from subagents:**

- Subagents are isolated workers reporting to a boss
- Agent Teams are collaborative -- they communicate directly, self-assign from shared task lists, challenge each other's findings
- Each teammate gets its own 1M token context window
- Task list with dependency tracking and auto-unblocking
- Mailbox system for direct agent-to-agent communication
- Git worktree isolation gives each agent its own branch

**Launch command:** `claude --teammate-mode`

### 2.5 Memory System

**Three-layer memory architecture:**

| Layer   | File                            | Purpose                    | Writability |
| ------- | ------------------------------- | -------------------------- | ----------- |
| User    | `~/.claude/CLAUDE.md`           | Cross-project instructions | Manual      |
| Project | `<project>/CLAUDE.md`           | Project-specific context   | Manual      |
| Auto    | `.claude/auto-memory/MEMORY.md` | Claude's self-notes        | Automatic   |

**Auto memory** (v2.1.59+):

- Claude saves notes for itself as it works: build commands, debugging insights, architecture patterns, workflow habits
- Not every session -- only when information would be useful in future conversations
- Top-down conflict resolution: project CLAUDE.md overrides user; auto-memory complements without overriding
- Best practice: Target under 200 lines per CLAUDE.md file

### 2.6 Remote Control & Scheduling

**Remote Control** (February 2026, research preview):

- Start a session in terminal, continue on phone/tablet/browser
- Session stays running on local machine -- phone is just a window
- Works with Claude iOS app, Android app, and claude.ai/code

**Scheduled Tasks:**

- Save a prompt to run on recurring cadence
- Only works while computer is awake and Desktop app is open
- No cloud-based scheduling for background execution

**Cloud Sessions:**

- For large refactors, test suites, migrations
- Run on Anthropic's cloud infrastructure
- Continue even if you close the app or shut down computer

### 2.7 CI/CD Integration

- **GitHub Actions**: Official `anthropics/claude-code-action@v1` for automated PR reviews, issue triage
- **GitLab CI/CD**: Beta, event-driven via @claude mentions
- **Code Review**: Multi-agent Code Review feature (Team/Enterprise only, research preview March 2026)

### 2.8 Built-in Tools

| Tool            | Capability                              |
| --------------- | --------------------------------------- |
| Read            | Read any file in working directory      |
| Write           | Create new files                        |
| Edit            | Precise edits to existing files         |
| Bash            | Run terminal commands, scripts, git ops |
| Glob            | Find files by pattern                   |
| Grep            | Search file contents with regex         |
| WebSearch       | Search the web                          |
| WebFetch        | Fetch and parse web pages               |
| AskUserQuestion | Ask user clarifying questions           |
| Agent           | Spawn subagents                         |
| SendMessage     | Resume/communicate with agents          |

---

## 3. Claude Agent SDK

### 3.1 Overview

Renamed from "Claude Code SDK" to "Claude Agent SDK". Available in Python and TypeScript.

**Core proposition:** The same tools, agent loop, and context management that power Claude Code, programmable in Python and TypeScript.

### 3.2 API Design

```python
# Python
from claude_agent_sdk import query, ClaudeAgentOptions

async for message in query(
    prompt="Find and fix the bug in auth.py",
    options=ClaudeAgentOptions(allowed_tools=["Read", "Edit", "Bash"]),
):
    print(message)
```

```typescript
// TypeScript
import { query } from '@anthropic-ai/claude-agent-sdk';

for await (const message of query({
  prompt: 'Find and fix the bug in auth.py',
  options: { allowedTools: ['Read', 'Edit', 'Bash'] },
})) {
  console.log(message);
}
```

### 3.3 SDK vs Client SDK

- **Client SDK**: You implement the tool loop yourself
- **Agent SDK**: Claude handles tools autonomously (built-in execution for Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch)

### 3.4 SDK Capabilities

- All built-in Claude Code tools
- Hooks (callback functions in Python/TypeScript, not shell commands)
- Custom subagent definitions
- MCP server connections
- Permission control (allowedTools, permissionMode)
- Session management (resume, fork)
- CLAUDE.md/skills/slash commands support via `settingSources`
- Plugin loading

### 3.5 Authentication

- Anthropic API key (primary)
- Amazon Bedrock (`CLAUDE_CODE_USE_BEDROCK=1`)
- Google Vertex AI (`CLAUDE_CODE_USE_VERTEX=1`)
- Microsoft Azure (`CLAUDE_CODE_USE_FOUNDRY=1`)
- **No third-party OAuth** -- Anthropic restricts third-party developers from using claude.ai login

### 3.6 Adoption

- Apple Xcode 26.3 natively integrates the Claude Agent SDK
- GitHub repo: `anthropics/claude-agent-sdk-python` and `anthropics/claude-agent-sdk-typescript`
- Used in production CI/CD pipelines

### 3.7 What the SDK Does Well

- Dead simple API: one `query()` function with streaming
- Built-in tool execution eliminates boilerplate
- Same capabilities as the full CLI
- Session resume/fork for multi-step workflows

### 3.8 What the SDK Lacks

- **Claude-only**: Cannot route to OpenAI, Google, or local models
- **No model selection**: Always uses Claude (can only switch between Opus/Sonnet/Haiku)
- **Heavy dependency**: Requires Claude Code binary installed
- **No custom tool definitions**: Can only use Claude Code's built-in tools + MCP
- **Enterprise-locked features**: Agent Teams, Code Review require Team/Enterprise plans

---

## 4. Claude Code Pricing & Economics

### 4.1 Plan Tiers

| Plan       | Price       | Claude Code Access | Usage                                     |
| ---------- | ----------- | ------------------ | ----------------------------------------- |
| Free       | $0/mo       | Limited            | Very limited tokens                       |
| Pro        | $20/mo      | Yes                | 5x free tier (insufficient for heavy use) |
| Max 5x     | $100/mo     | Yes                | 5x Pro, Opus access, priority             |
| Max 20x    | $200/mo     | Yes                | 20x Pro, Opus access, priority            |
| Team       | $25/user/mo | Yes                | Enterprise features                       |
| Enterprise | Custom      | Yes                | SSO, SCIM, audit logs                     |
| API (PAYG) | Per-token   | Via SDK            | No quota limits                           |

### 4.2 API Token Pricing

| Model      | Input (per 1M tokens) | Output (per 1M tokens) |
| ---------- | --------------------- | ---------------------- |
| Opus 4.6   | $5                    | $25                    |
| Sonnet 4.6 | $3                    | $15                    |
| Haiku 4.5  | $1                    | $5                     |

### 4.3 Cost Reality

- A "simple" edit command can consume 50,000-150,000 tokens per API call (full context window assembled)
- Heavy coding via API: can exceed $3,650/month
- Max $200/month subscription is ~18x cheaper than API for heavy users
- Pro plan ($20/mo) runs out in 10-15 minutes during heavy Sonnet sessions
- 10-100x more tokens per command than standard Claude chat

### 4.4 Rate Limit Pain Points

- Daily quota generous enough for hours of work, but per-minute limits gate burst speed
- 8-12 API calls per user-visible command during lint-fix-test cycles
- Context window growth: 15 iterative commands can send 200K+ input tokens on the final call
- ~60% reduction in effective token limits reported (January 2026)
- Opacity: limits not transparently defined upfront

---

## 5. Claude Code Limitations & Weaknesses

### 5.1 Model Lock-In (CRITICAL WEAKNESS)

- **Claude models only**: Opus 4.6, Sonnet 4.6, Haiku 4.5
- Cannot use GPT-4o, Gemini 2.5, DeepSeek V3, Llama, Mistral, Qwen, or any other model
- Third-party tools (OpenCode, Cursor, Windsurf) restricted from OAuth access (January 2026)
- Bedrock/Vertex/Azure support still only runs Claude models
- Users who want the best model for each task are stuck with Claude for everything

### 5.2 Rate Limits & Token Economics

- Pro plan ($20/mo) runs out in 10-15 minutes of heavy Sonnet usage
- Surprise usage limits have generated significant developer backlash
- Customer complaints reportedly silenced by Discord moderators
- Per-minute limits hit before daily caps during burst usage
- No transparent documentation of exact limits

### 5.3 Pricing Transparency

- "Extra usage limits apply" without specifying overages
- 70% more expensive than GitHub Copilot ($20 vs $10)
- Heavy users must pay $100-200/month for usable access
- API billing requires depositing credits to raise per-minute limits

### 5.4 Limited Editor Support

- Only VS Code and JetBrains officially supported
- No Neovim/Vim, Emacs, Sublime Text, or Zed integration
- Chrome extension limited to Chrome and Edge (not Brave, Arc)

### 5.5 No Offline Capability

- Always requires internet connection to Anthropic servers
- No local model fallback
- No offline file analysis or editing

### 5.6 Closed Source

- Proprietary codebase, not inspectable
- Community contributed 112K GitHub stars to OpenCode vs 71K for Claude Code
- No ability to fork, customize, or self-host the engine
- Branding restrictions: third-party tools cannot use "Claude Code" name/branding

### 5.7 Enterprise Gatekeeping

- Multi-agent Code Review: Team/Enterprise only
- Remote Control: Research preview, Max tier required ($100-200/mo)
- Scheduled tasks: Only while Desktop app is open
- Cloud sessions: Only for paid subscribers

### 5.8 Context Window Bloat

- Agentic loop sends entire conversation history with each call
- 200K+ input tokens on later commands in a session
- Auto-compaction helps but loses context at ~95% capacity
- No intelligent context windowing or selective history

---

## 6. Claude Code Plugins & Ecosystem

### 6.1 Plugin Architecture

**Plugin structure:**

```
my-plugin/
  .claude-plugin/
    plugin.json          # Manifest (name, version, description)
  commands/              # Slash commands (Markdown files)
  agents/                # Custom agent definitions
  skills/                # Agent Skills with SKILL.md
  hooks/
    hooks.json           # Event handlers
  .mcp.json              # MCP server configurations
  .lsp.json              # LSP server configurations
  settings.json          # Default settings
```

**Plugin capabilities:**

- Namespaced skills (`/plugin-name:skill-name`)
- Custom agents, hooks, MCP servers, LSP servers
- Default settings (`agent` key supported)
- Plugin marketplace submission (claude.ai/settings/plugins/submit)

### 6.2 Official Marketplace

- Anthropic-managed directory: `github.com/anthropics/claude-plugins-official`
- In-app submission forms at claude.ai and platform.claude.com
- Quality and security review required

### 6.3 Community Ecosystem

- **SkillsMP**: 500,000+ agent skills with search and filtering
- **claude-marketplace (GitHub)**: Local marketplace for personal skills/plugins
- **awesome-claude-code**: Curated list of skills, hooks, commands, plugins
- **alirezarezvani/claude-skills**: 192+ skills for multiple agents (Claude Code, Codex, Gemini CLI, Cursor)
- **SKILL.md open standard**: Compatible across Claude Code and other tools

### 6.4 What the Ecosystem Does Well

- Low barrier to entry (just markdown files)
- Official marketplace with quality control
- Plugin isolation prevents conflicts via namespacing
- LSP server support for real-time code intelligence
- Community already large and growing

### 6.5 What the Ecosystem Lacks

- **Code-developer focused**: Almost all plugins target software engineering
- **No non-coding skills**: No healthcare, legal, finance, education, creative skills
- **Claude-only**: All plugins assume Claude models
- **No GUI skills**: Terminal-only, no desktop automation or GUI interaction skills
- **No mobile companion**: Cannot approve/deny plugin actions from phone

---

## 7. Market Position & Competitive Landscape

### 7.1 Claude Code's Dominance

- **4% of all public GitHub commits** (135K commits/day)
- **29M daily installs** (30-day moving average), growing exponentially
- **42.8%** of surveyed developers use Claude models
- **29%** market share in enterprise AI assistants
- **70%** of Fortune 100 companies use Claude
- **$2.5B** estimated run-rate by early 2026

### 7.2 Key Competitors

| Tool            | Model Support     | Interface                 | Price             | Key Strength                       |
| --------------- | ----------------- | ------------------------- | ----------------- | ---------------------------------- |
| **Claude Code** | Claude only       | CLI + IDE + Desktop + Web | $20-200/mo        | Deepest agent loop, ecosystem      |
| **Cursor**      | Multi-model       | IDE                       | $20/mo            | Best IDE UX, $29.3B valuation      |
| **OpenCode**    | 75+ providers     | CLI                       | Free (OSS)        | Open source, 112K stars            |
| **Codex CLI**   | OpenAI only       | CLI                       | API pricing       | Open source, Rust-based            |
| **Gemini CLI**  | Gemini only       | CLI                       | Free (1K req/day) | Cheapest, 1M context               |
| **Cline**       | 10+ providers     | VS Code                   | Free (OSS)        | Best VS Code extension             |
| **Aider**       | Any LLM (LiteLLM) | CLI                       | Free (OSS)        | BYOK, broadest model support       |
| **Windsurf**    | Multi-model       | IDE                       | $15/mo            | Budget alternative, visual editing |

### 7.3 Gaps in the Market

1. **No tool combines**: Native desktop app + multi-model + CLI + MCP + non-coding skills
2. **No tool offers**: Mobile companion with live agent dashboard + approve/deny from phone
3. **No tool has**: 140+ non-coding AI skills (healthcare, legal, finance, education, creative)
4. **No tool provides**: Full BYOK + local LLMs + CLI + desktop GUI in one package
5. **No tool gives**: Shared Rust runtime powering both CLI and desktop app

---

## 8. AGI Workforce CLI Differentiation Strategy

### 8.1 Core Value Proposition

**"The multi-model Claude Code with a desktop app, 140+ skills, and no limits."**

AGI Workforce CLI is the only agentic CLI that:

1. Works with ANY LLM (9+ cloud providers + Ollama + LM Studio)
2. Shares its Rust agent runtime with a full desktop app
3. Offers 140+ non-coding AI skills out of the box
4. Uses the same MCP tools in CLI and desktop
5. Lets users bring their own API keys (true BYOK)
6. Has a mobile companion for live agent oversight

### 8.2 Differentiation Matrix

| Capability               | Claude Code                        | AGI Workforce CLI                       |
| ------------------------ | ---------------------------------- | --------------------------------------- |
| **Model Support**        | Claude only (3 models)             | 9+ providers, 100+ models               |
| **BYOK**                 | Claude keys only                   | Any provider's keys                     |
| **Local LLMs**           | No                                 | Ollama, LM Studio                       |
| **Offline Mode**         | No                                 | Yes (with local models)                 |
| **Desktop App**          | Separate (Electron-like)           | Shared Rust runtime (Tauri)             |
| **Mobile Companion**     | Remote Control (preview, Max tier) | QR-pair, free with any plan             |
| **Non-Coding Skills**    | 0 (code-focused)                   | 140+ (healthcare, legal, finance, etc.) |
| **MCP Tools**            | Unlimited                          | Unlimited                               |
| **Hooks**                | 24 events, 4 types                 | Match parity + desktop hooks            |
| **Subagents**            | Yes (Claude only)                  | Yes (any model per agent)               |
| **Agent Teams**          | Yes (experimental)                 | Yes (any model per teammate)            |
| **Plugins**              | Marketplace                        | Compatible format + own marketplace     |
| **Runtime**              | Node.js/Bun                        | Rust (compiled, native performance)     |
| **Open Source**          | No                                 | Proprietary but more flexible           |
| **Cost**                 | $20-200/mo                         | Pay your own API costs (often $5-15/mo) |
| **Tool Limit**           | Unlimited (but context-gated)      | Unlimited                               |
| **Pricing Transparency** | Opaque limits                      | Your API bill = your limit              |

### 8.3 Five Killer Differentiators

**1. Multi-Model Agent Loop**
Claude Code uses Claude for everything. AGI Workforce CLI routes the right model to the right task:

- Use GPT-4o for coding tasks where it excels
- Use Claude Opus for complex reasoning
- Use Gemini 2.5 Pro for long-context analysis (1M tokens natively)
- Use DeepSeek V3 for cost-effective batch operations
- Use Llama 3.3 locally for private/offline work
- Use Haiku/Flash for fast exploration subagents

**2. Shared Rust Runtime (CLI + Desktop)**
Claude Code's CLI (Node.js) and Desktop app are separate products. AGI Workforce CLI shares the same Rust agent runtime (`core/agent/`, `core/llm/`, `core/mcp/`, `core/skills/`) with the desktop app. Benefits:

- Same tool execution engine in both surfaces
- Fix a bug once, works everywhere
- Native performance (compiled Rust vs interpreted JS)
- Lower memory footprint
- Faster cold start

**3. 140+ Non-Coding Skills**
Claude Code skills are developer-focused. AGI Workforce ships 140+ skills across 9 categories:

- Healthcare (medical documentation, clinical decision support)
- Legal (contract review, compliance analysis)
- Finance (financial modeling, tax preparation)
- Education (curriculum design, tutoring)
- Creative (content creation, design briefs)
- Trades (project estimation, safety compliance)
- E-commerce (product listings, inventory management)
- Marketing (campaign planning, SEO optimization)
- Customer Service (ticket triage, response templates)

This makes AGI Workforce a **general-purpose AI workforce**, not just a coding assistant.

**4. True BYOK with Cost Transparency**
With Claude Code, you pay $20-200/month with opaque limits. With AGI Workforce CLI:

- Bring your own keys from any provider
- See exact token counts and costs per operation
- Route expensive tasks to cheaper models
- Run fully offline with local models (zero cost)
- No surprise rate limits -- your API bill is your limit

**5. Mobile Companion with Live Agent Dashboard**
Claude Code's Remote Control requires Max tier ($100-200/mo) and is research preview only. AGI Workforce:

- QR-pair desktop link from the mobile app
- Live agent dashboard showing all running tasks
- Approve/deny individual tool calls from phone
- Push notifications for agent milestones
- Available with any plan, not tier-gated

### 8.4 Compatibility Strategy

Maximize switching ease from Claude Code:

- **CLAUDE.md compatibility**: Read and respect CLAUDE.md files (same format)
- **SKILL.md compatibility**: Load Claude Code-format skills without modification
- **MCP compatibility**: Same .mcp.json format, all transports (stdio, SSE, HTTP)
- **Plugin format**: Read Claude Code plugin structure (.claude-plugin/plugin.json)
- **Hooks format**: Support Claude Code's JSON hook configuration (settings.json format)
- **Slash commands**: Same `/command` invocation pattern

---

## 9. AGI Workforce CLI Implementation Plan

### Phase 1: Foundation (Weeks 1-3)

**Goal**: Standalone CLI binary that shares the Rust runtime with the desktop app.

**9.1.1 Extract Shared Crate**

Create a shared Rust library crate that both the CLI and desktop app depend on:

```
apps/
  cli/                          # NEW: CLI binary crate
    src/
      main.rs                   # CLI entry point
      terminal_ui.rs            # Terminal UI (ratatui or crossterm)
      repl.rs                   # Interactive REPL loop
      commands.rs               # CLI command parsing (clap)
  desktop/
    src-tauri/                  # Existing desktop app
packages/
  core/                         # NEW: Shared Rust library crate
    src/
      llm/                      # Extracted from src-tauri/src/core/llm/
      agent/                    # Extracted from src-tauri/src/core/agent/
      mcp/                      # Extracted from src-tauri/src/core/mcp/
      skills/                   # Extracted from src-tauri/src/core/skills/
      embeddings/               # Extracted from src-tauri/src/core/embeddings/
      security/                 # ToolGuard, SecretManager
```

**Key modules to extract:**

- `core/llm/llm_router.rs` (2274 lines) -- LLM routing, multi-provider support
- `core/llm/provider_adapter.rs` -- Provider-specific API format translation
- `core/llm/sse_parser.rs` (1175 lines) -- SSE streaming
- `core/llm/cost_calculator.rs` -- Token cost tracking
- `core/llm/capability_detection.rs` -- Ollama/local LLM probing
- `core/agent/executor.rs` -- Agent execution engine
- `core/agent/planner.rs` -- Task planning
- `core/agent/autonomous.rs` -- Autonomous mode
- `core/mcp/*` -- Full MCP stack (14 files)
- `core/skills/*` -- Skills system (5 files)
- `sys/security/tool_guard.rs` (1778 lines) -- Tool validation
- `core/llm/tool_executor/` -- 21 tool executor files (file, edit, git, terminal, search, etc.)

**9.1.2 CLI Binary**

```rust
// apps/cli/src/main.rs
use clap::Parser;
use agiworkforce_core::{LLMRouter, AgentExecutor, MCPManager, SkillManager, ToolGuard};

#[derive(Parser)]
#[command(name = "agi", about = "AGI Workforce CLI")]
struct Cli {
    /// Run a one-shot prompt
    #[arg(short, long)]
    prompt: Option<String>,

    /// Model to use (e.g., "claude-opus-4-6", "gpt-4o", "gemini-2.5-pro", "ollama:llama3.3")
    #[arg(short, long)]
    model: Option<String>,

    /// Working directory
    #[arg(short = 'd', long)]
    dir: Option<PathBuf>,

    /// Enable plan mode (read-only analysis)
    #[arg(long)]
    plan: bool,

    /// Permission mode
    #[arg(long, default_value = "default")]
    permission_mode: String,

    /// MCP servers config file
    #[arg(long)]
    mcp_config: Option<PathBuf>,

    /// Plugin directories
    #[arg(long)]
    plugin_dir: Vec<PathBuf>,
}
```

**9.1.3 Terminal UI**

Use `ratatui` for rich terminal UI (vs Claude Code's Ink/React):

- Streaming output with syntax highlighting
- Tool execution timeline (same as desktop's ToolTimeline)
- Diff view for file changes
- Model selector
- Cost tracker sidebar

### Phase 2: Feature Parity (Weeks 4-6)

**9.2.1 Multi-Model Agent Loop**

The existing `llm_router.rs` already supports 18+ providers. Wire it into CLI:

```rust
// CLI model selection
let model = match args.model.as_deref() {
    Some("claude") | Some("opus") => "claude-opus-4-6",
    Some("sonnet") => "claude-sonnet-4-6",
    Some("gpt4") | Some("gpt-4o") => "gpt-4o",
    Some("gemini") => "gemini-2.5-pro",
    Some("deepseek") => "deepseek-v3",
    Some(m) if m.starts_with("ollama:") => m, // local model
    Some(m) => m, // full model ID
    None => config.default_model(),
};
```

**9.2.2 Hooks System**

Implement Claude Code-compatible hooks with extensions:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "./validate.sh" },
          { "type": "http", "url": "http://localhost:3000/hooks/validate" },
          { "type": "prompt", "prompt": "Is this safe?", "model": "haiku" },
          { "type": "agent", "prompt": "Verify...", "model": "gpt-4o-mini" }
        ]
      }
    ]
  }
}
```

**Extension over Claude Code:** Prompt and agent hooks can specify any model, not just Claude.

**9.2.3 Subagent System**

```rust
// Subagent with model routing
SubagentConfig {
    name: "explorer",
    model: "gpt-4o-mini",  // Cheap, fast model for exploration
    tools: vec!["Read", "Grep", "Glob"],
    permission_mode: PermissionMode::Plan,
}

SubagentConfig {
    name: "implementer",
    model: "claude-opus-4-6",  // Best reasoning for implementation
    tools: vec!["Read", "Write", "Edit", "Bash"],
    permission_mode: PermissionMode::AcceptEdits,
}
```

**Extension over Claude Code:** Each subagent can use a different provider/model.

**9.2.4 Skills Loading**

The existing `core/skills/` already supports SKILL.md with YAML frontmatter, three source tiers (bundled, managed, workspace), and slash commands. Add:

- Claude Code SKILL.md format compatibility layer
- 140+ bundled non-coding skills
- Skill marketplace integration

### Phase 3: Differentiation (Weeks 7-10)

**9.3.1 Cost Intelligence Dashboard**

```
AGI Workforce CLI v1.0 | Model: gpt-4o | Cost: $0.12 | Tokens: 4,521
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> Fixing auth bug in auth.py

[Plan] Analyzing codebase...           ✓ $0.02 (gpt-4o-mini)
[Read] auth.py                         ✓ $0.00
[Read] tests/test_auth.py              ✓ $0.00
[Think] Identifying root cause...       ✓ $0.08 (gpt-4o)
[Edit] auth.py:42-58                   ✓ $0.00
[Bash] python -m pytest tests/         ✓ $0.02 (gpt-4o-mini)

Total: $0.12 | Saved vs Claude Code: ~$0.45 (73%)
```

Real-time cost tracking per operation, per model, with savings comparison.

**9.3.2 Smart Model Routing**

Automatically select the best model for each task phase:

| Task Phase      | Default Model          | Rationale                         |
| --------------- | ---------------------- | --------------------------------- |
| Exploration     | gpt-4o-mini / Haiku    | Fast, cheap                       |
| Planning        | Claude Opus / GPT-4o   | Best reasoning                    |
| Code Generation | Claude Sonnet / GPT-4o | Best coding                       |
| Testing         | gpt-4o-mini / Haiku    | Fast validation                   |
| Long Context    | Gemini 2.5 Pro         | 1M native context                 |
| Offline/Private | Ollama (Llama 3.3)     | Zero cost, no data leaves machine |

User can override per-phase:

```bash
agi --explore-model gpt-4o-mini --code-model claude-opus-4-6 --test-model haiku
```

**9.3.3 Desktop Handoff**

Seamless transition between CLI and desktop app:

```bash
agi /desktop      # Hand off current session to desktop app
agi /mobile       # Share session to mobile companion
```

Both share the same Rust runtime, so session state transfers natively without serialization overhead.

**9.3.4 Offline Mode**

```bash
agi --offline     # Use only local models
agi --model ollama:codellama  # Specific local model
```

Full agent loop works offline with Ollama/LM Studio models. No internet required.

### Phase 4: Ecosystem & Polish (Weeks 11-14)

**9.4.1 Claude Code Migration Tool**

```bash
agi migrate --from-claude-code
```

Automatically:

- Imports CLAUDE.md files
- Converts .claude/settings.json to AGI Workforce format
- Migrates MCP server configs (.mcp.json)
- Imports installed plugins
- Maps Claude-specific model references to multi-model equivalents

**9.4.2 Plugin Compatibility Layer**

Read Claude Code plugins natively:

```bash
agi plugin install --from-claude-marketplace "plugin-name"
agi plugin install --plugin-dir ./my-claude-plugin
```

**9.4.3 CI/CD Actions**

```yaml
# GitHub Actions
- uses: agiworkforce/cli-action@v1
  with:
    prompt: 'Review this PR for security issues'
    model: 'gpt-4o' # Not locked to Claude
    api-key: ${{ secrets.OPENAI_API_KEY }} # Any provider
```

**9.4.4 Distribution**

```bash
# macOS
brew install agiworkforce-cli

# Linux / WSL
curl -fsSL https://agiworkforce.com/install.sh | bash

# Windows
winget install AGIWorkforce.CLI

# npm (for Node.js users)
npm install -g @agiworkforce/cli

# Cargo (for Rust users)
cargo install agiworkforce-cli
```

---

## Appendix A: Claude Code Feature Parity Checklist

| Feature                        | Claude Code        | AGI CLI Target   | Priority |
| ------------------------------ | ------------------ | ---------------- | -------- |
| Agent loop with tool execution | Yes                | Phase 1          | P0       |
| File read/write/edit tools     | Yes                | Phase 1          | P0       |
| Bash command execution         | Yes                | Phase 1          | P0       |
| Glob/Grep search               | Yes                | Phase 1          | P0       |
| Git integration                | Yes                | Phase 1          | P0       |
| SSE streaming output           | Yes                | Phase 1          | P0       |
| CLAUDE.md memory files         | Yes                | Phase 1          | P0       |
| Auto-memory                    | Yes                | Phase 2          | P1       |
| MCP servers (stdio)            | Yes                | Phase 1          | P0       |
| MCP servers (SSE/HTTP)         | Yes                | Phase 2          | P0       |
| Skills system (SKILL.md)       | Yes                | Phase 1          | P0       |
| Slash commands                 | Yes                | Phase 1          | P0       |
| Hooks (24 events)              | Yes                | Phase 2          | P0       |
| Subagents                      | Yes                | Phase 2          | P0       |
| Agent Teams                    | Yes                | Phase 3          | P1       |
| Worktree isolation             | Yes                | Phase 3          | P1       |
| Plugins (.claude-plugin/)      | Yes                | Phase 2          | P1       |
| Plugin marketplace             | Yes                | Phase 4          | P2       |
| WebSearch/WebFetch             | Yes                | Phase 1          | P0       |
| Plan mode (read-only)          | Yes                | Phase 1          | P0       |
| Permission modes               | Yes                | Phase 1          | P0       |
| Context compaction             | Yes                | Phase 2          | P1       |
| Session resume/fork            | Yes                | Phase 2          | P1       |
| Remote Control                 | Yes (preview)      | Phase 3          | P1       |
| Scheduled tasks                | Yes (desktop only) | Phase 4          | P2       |
| Cloud sessions                 | Yes                | Phase 4          | P2       |
| GitHub Actions                 | Yes                | Phase 4          | P1       |
| GitLab CI/CD                   | Beta               | Phase 4          | P2       |
| Chrome integration             | Beta               | Phase 3          | P2       |
| Slack integration              | Beta               | Phase 4          | P2       |
| Code Review (multi-agent)      | Team/Enterprise    | Phase 4          | P2       |
| VS Code extension              | Yes                | Phase 3          | P1       |
| JetBrains plugin               | Yes                | Phase 4          | P2       |
| Desktop app integration        | Separate product   | Phase 1 (shared) | P0       |
| LSP server support             | Yes (plugins)      | Phase 3          | P2       |

## Appendix B: Pricing Comparison for Users

### Scenario: Heavy Developer (8 hours/day, 5 days/week)

| Tool                           | Monthly Cost  | Model Access        | Limits              |
| ------------------------------ | ------------- | ------------------- | ------------------- |
| Claude Code (Max 20x)          | $200/mo       | Claude only         | 20x Pro quota       |
| Claude Code (API)              | $500-3,650/mo | Claude only         | Per-token           |
| AGI Workforce CLI (GPT-4o API) | $30-80/mo     | GPT-4o              | Per-token, no quota |
| AGI Workforce CLI (Mixed)      | $15-50/mo     | Best model per task | Per-token, no quota |
| AGI Workforce CLI (Local)      | $0/mo         | Ollama              | Unlimited           |
| AGI Workforce CLI (DeepSeek)   | $5-15/mo      | DeepSeek V3         | Per-token           |

### Scenario: Light Developer (2 hours/day, casual)

| Tool              | Monthly Cost                        |
| ----------------- | ----------------------------------- |
| Claude Code Pro   | $20/mo (frequently rate-limited)    |
| AGI Workforce CLI | $5-10/mo (pay-as-you-go, any model) |

---

## Sources

### Architecture & Features

- [Claude Code overview - Official Docs](https://code.claude.com/docs/en/overview)
- [Codex CLI vs Claude Code in 2026: Architecture Deep Dive](https://blakecrosley.com/blog/codex-vs-claude-code-2026)
- [How Claude Code is built - Gergely Orosz](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built)
- [Claude Code Complete Guide 2026](https://claude-world.com/articles/claude-code-complete-guide-2026/)

### Skills, Hooks, Sub-Agents

- [Hooks reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)
- [Create custom subagents - Claude Code Docs](https://code.claude.com/docs/en/sub-agents)
- [Create plugins - Claude Code Docs](https://code.claude.com/docs/en/plugins)
- [Claude Code Agent Skills 2.0 - Towards AI](https://medium.com/@richardhightower/claude-code-agent-skills-2-0-from-custom-instructions-to-programmable-agents-ab6e4563c176)
- [Claude Code Extensions Explained - Medium](https://muneebsa.medium.com/claude-code-extensions-explained-skills-mcp-hooks-subagents-agent-teams-plugins-9294907e84ff)
- [Claude Code Agent Teams: The Complete Guide 2026](https://claudefa.st/blog/guide/agents/agent-teams)
- [Best Claude Code Skills to Try in 2026](https://www.firecrawl.dev/blog/best-claude-code-skills)

### Agent SDK

- [Agent SDK overview - Claude API Docs](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Building agents with the Claude Agent SDK - Anthropic](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [Claude Agent SDK - GitHub (Python)](https://github.com/anthropics/claude-agent-sdk-python)
- [Claude Agent SDK - GitHub (TypeScript)](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Apple's Xcode now supports the Claude Agent SDK](https://www.anthropic.com/news/apple-xcode-claude-agent-sdk)

### Pricing

- [Claude Code Pricing Guide](https://www.ksred.com/claude-code-pricing-guide-which-plan-actually-saves-you-money/)
- [Plans & Pricing - Claude](https://claude.com/pricing)
- [Claude Code Pricing: Complete Guide](https://www.braingrid.ai/blog/claude-code-pricing)
- [Claude Code in March 2026: The Economics of the Quota](https://medium.com/@william.couturier/claude-code-in-march-2026-the-economics-of-the-quota-792449b63edb)

### Limitations & Complaints

- [Claude devs complain about surprise usage limits - The Register](https://www.theregister.com/2026/01/05/claude_devs_usage_limits/)
- [Why Developers Are Suddenly Turning Against Claude Code](https://ucstrategies.com/news/why-developers-are-suddenly-turning-against-claude-code/)
- [Claude Code Rate Limits Explained 2026](https://www.sitepoint.com/claude-code-rate-limits-explained/)
- [Claude Code: Rate limits, pricing, and alternatives](https://northflank.com/blog/claude-rate-limits-claude-code-pricing-cost)

### Alternatives & Market

- [10 Claude Code Alternatives for AI-Powered Coding in 2026 - DigitalOcean](https://www.digitalocean.com/resources/articles/claude-code-alternatives)
- [Claude Code Alternatives (2026): 11 Tested, 3 That Beat It](https://www.morphllm.com/comparisons/claude-code-alternatives)
- [OpenCode vs Claude Code (2026)](https://www.morphllm.com/comparisons/opencode-vs-claude-code)
- [Claude AI Statistics 2026](https://www.getpanto.ai/blog/claude-ai-statistics)
- [Anthropic's Claude Code is having its "ChatGPT" moment](https://www.uncoveralpha.com/p/anthropics-claude-code-is-having)

### Enterprise & Security

- [Security - Claude Code Docs](https://code.claude.com/docs/en/security)
- [Claude Code Security - Anthropic](https://www.anthropic.com/news/claude-code-security)
- [Enterprise AI Development Gets a Major Upgrade](https://devops.com/enterprise-ai-development-gets-a-major-upgrade-claude-code-now-bundled-with-team-and-enterprise-plans/)

### Memory & Remote Control

- [How Claude remembers your project - Claude Code Docs](https://code.claude.com/docs/en/memory)
- [Claude Code Remote Control - Simon Willison](https://simonwillison.net/2026/Feb/25/claude-code-remote-control/)
- [Claude Code Scheduled Tasks Guide](https://claudefa.st/blog/guide/development/scheduled-tasks)

### Licensing

- [Claude Code LICENSE.md - GitHub](https://github.com/anthropics/claude-code/blob/main/LICENSE.md)
- [OpenCode vs Claude Code: Open Source Freedom vs Anthropic Polish](https://www.morphllm.com/comparisons/opencode-vs-claude-code)
