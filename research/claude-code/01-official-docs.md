# Claude Code Official Documentation Research

> Comprehensive analysis of Claude Code features, settings, integrations, and recent changes.
> Research date: 2026-02-28 | Source: code.claude.com/docs + GitHub changelog

---

## Table of Contents

1. [Overview and Architecture](#1-overview-and-architecture)
2. [Installation and Platforms](#2-installation-and-platforms)
3. [Complete Feature List](#3-complete-feature-list)
4. [Settings and Configuration](#4-settings-and-configuration)
5. [CLAUDE.md and Memory System](#5-claudemd-and-memory-system)
6. [Skills and Custom Slash Commands](#6-skills-and-custom-slash-commands)
7. [Sub-agents and Agent Teams](#7-sub-agents-and-agent-teams)
8. [Hooks System](#8-hooks-system)
9. [MCP Server Configuration](#9-mcp-server-configuration)
10. [IDE Integrations](#10-ide-integrations)
11. [GitHub Actions / CI Integration](#11-github-actions--ci-integration)
12. [CLI Reference](#12-cli-reference)
13. [Keyboard Shortcuts](#13-keyboard-shortcuts)
14. [Built-in Slash Commands](#14-built-in-slash-commands)
15. [Recent Changelog Highlights](#15-recent-changelog-highlights)
16. [Key Patterns for AGI Workforce](#16-key-patterns-for-agi-workforce)

---

## 1. Overview and Architecture

Claude Code is Anthropic's agentic coding tool that operates across terminal, IDE, desktop app, web, and browser. It reads codebases, edits files, runs commands, and integrates with development tools via MCP.

### Core Architecture

- **Agentic Loop**: Claude operates in a tool-use loop -- it reasons, selects a tool, executes it, observes results, and repeats until the task is done.
- **Built-in Tools**: Read, Edit, Write, Glob, Grep, Bash, WebFetch, WebSearch, NotebookEdit, and more.
- **Context Management**: Automatic context compaction when approaching limits. Auto-compaction at ~95% by default (configurable via `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`).
- **Session Persistence**: Conversations are saved and can be resumed with `claude -c` or `claude -r`.

### Supported Environments

| Surface | Description |
|---------|-------------|
| **Terminal CLI** | Full-featured CLI for direct terminal use |
| **VS Code Extension** | Native graphical panel with inline diffs, @-mentions, plan review |
| **JetBrains Plugin** | Plugin for IntelliJ, PyCharm, WebStorm with diff viewing |
| **Desktop App** | Standalone app for visual diff review, multiple sessions, cloud sessions |
| **Web (claude.ai/code)** | Browser-based, no local setup, long-running tasks |
| **Chrome Extension** | Browser automation and debugging |
| **Slack Integration** | @Claude mentions route to PR creation |
| **iOS App** | Mobile access to web sessions |
| **Remote Control** | Control local Claude Code from phone/browser |

### Authentication Methods

- Claude Pro/Max/Teams/Enterprise subscription (recommended)
- Anthropic Console (API with pre-paid credits)
- Third-party: Amazon Bedrock, Google Vertex AI, Microsoft Foundry

---

## 2. Installation and Platforms

### Native Install (Recommended -- auto-updates)

```bash
# macOS, Linux, WSL
curl -fsSL https://claude.ai/install.sh | bash

# Windows PowerShell
irm https://claude.ai/install.ps1 | iex

# Windows CMD
curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
```

### Package Managers (no auto-update)

```bash
# Homebrew
brew install --cask claude-code

# WinGet
winget install Anthropic.ClaudeCode
```

### Desktop App Downloads

- macOS: Universal (Intel + Apple Silicon) DMG
- Windows x64: EXE installer
- Windows ARM64: Remote sessions only

### Requirements

- VS Code 1.98.0+ for extension
- Git for Windows required on Windows
- Node.js not required (standalone binary)

---

## 3. Complete Feature List

### Core Capabilities

1. **Codebase Understanding** -- Reads and analyzes entire projects, understands architecture
2. **Multi-file Editing** -- Creates, modifies, and deletes files across a project
3. **Command Execution** -- Runs shell commands with permission controls
4. **Git Integration** -- Commits, branches, PRs, merge conflict resolution, worktrees
5. **Extended Thinking** -- Deeper reasoning for complex problems (toggle via `/` menu)
6. **Plan Mode** -- Read-only exploration before making changes
7. **Auto-accept Mode** -- Skip approval prompts for edits
8. **Context Compaction** -- Automatic context management, `/compact` for manual
9. **Session Management** -- Resume, fork, continue conversations
10. **Checkpointing** -- Track file edits, rewind to previous states (VS Code)

### Advanced Features

11. **Sub-agents** -- Delegate tasks to specialized agents (Explore, Plan, general-purpose, custom)
12. **Agent Teams** -- Multiple agents working in parallel with coordination (research preview)
13. **Skills System** -- Custom slash commands via SKILL.md files
14. **Hooks** -- Shell commands/HTTP endpoints triggered at lifecycle points
15. **MCP Integration** -- Connect to external tools via Model Context Protocol
16. **Plugins** -- Installable extensions with marketplaces
17. **Auto Memory** -- Claude saves learnings across sessions
18. **CLAUDE.md** -- Persistent project instructions
19. **@-mentions** -- Reference files, folders, terminals, MCP resources
20. **Remote Control** -- Control local sessions from phone/browser
21. **Teleport** -- Move web sessions to local terminal (`/teleport`)
22. **Desktop Handoff** -- Hand off terminal sessions to Desktop app (`/desktop`)
23. **Chrome Integration** -- Browser automation via Chrome extension
24. **Worktrees** -- Isolated git worktrees for parallel sessions (`-w` flag)
25. **Piping/Scripting** -- Unix-philosophy composability (`cat file | claude -p`)
26. **Structured Output** -- JSON schema validation for programmatic use (`--json-schema`)
27. **Background Tasks** -- Agents run in background while you continue working
28. **Bundled Skills** -- `/simplify` (code cleanup) and `/batch` (large-scale parallel changes)

### Model Support

- **Claude Opus 4.6** -- Most capable, 1M context window
- **Claude Sonnet 4.6** -- Balanced capability and speed
- **Claude Haiku** -- Fast, low-latency for sub-agents
- Models configurable per-session, per-agent, via env vars or settings

---

## 4. Settings and Configuration

### Configuration File Hierarchy (highest to lowest precedence)

| Scope | Location | Purpose |
|-------|----------|---------|
| **Managed** | System dirs / plist / registry | Organization-wide enforcement |
| **CLI args** | Command-line flags | Session overrides |
| **Local** | `.claude/settings.local.json` | Personal project overrides (gitignored) |
| **Project** | `.claude/settings.json` | Team-shared settings |
| **User** | `~/.claude/settings.json` | Personal preferences |

### Key Settings Categories

#### Authentication & API
- `apiKeyHelper` -- Script to generate auth values
- `forceLoginMethod` -- `claudeai` or `console`
- `forceLoginOrgUUID` -- Organization UUID

#### Model Configuration
- `model` -- Override default model
- `availableModels` -- Restrict selectable models
- `alwaysThinkingEnabled` -- Enable extended thinking by default

#### Permissions System
```json
{
  "permissions": {
    "allow": ["Bash(npm run lint)", "Bash(npm run test *)"],
    "ask": ["Bash(git push *)"],
    "deny": ["Bash(curl *)", "Read(./.env)"],
    "additionalDirectories": ["../docs/"],
    "defaultMode": "acceptEdits",
    "disableBypassPermissionsMode": "disable"
  }
}
```

Permission modes: `default`, `plan`, `acceptEdits`, `dontAsk`, `bypassPermissions`

Permission rule syntax:
- `Tool` -- Matches all uses
- `Tool(specifier)` -- Pattern-matched with wildcards
- `Read(./.env)` -- Specific file
- `Bash(npm run *)` -- Wildcard patterns
- `WebFetch(domain:example.com)` -- Domain matching
- `mcp__server__*` -- Wildcard for MCP tools
- `Agent(agent-name)` -- Specific sub-agent control

#### Sandbox Configuration
Full filesystem and network sandboxing:
- `sandbox.enabled` -- Enable sandbox
- `sandbox.autoAllowBashIfSandboxed` -- Auto-allow bash in sandbox
- `sandbox.filesystem.allowWrite` / `denyWrite` / `denyRead`
- `sandbox.network.allowedDomains` -- Domain allowlist
- `sandbox.network.httpProxyPort` / `socksProxyPort`

#### UI & UX Settings
- `outputStyle` -- System prompt adjustment
- `language` -- Response language
- `showTurnDuration` -- Show timing
- `spinnerVerbs` -- Custom action verbs
- `spinnerTipsEnabled` / `spinnerTipsOverride`
- `prefersReducedMotion` -- Reduce animations

#### Session Management
- `cleanupPeriodDays` -- Auto-delete inactive sessions (default: 30)
- `companyAnnouncements` -- Startup announcements
- `env` -- Environment variables for sessions

### Environment Variables (Key Ones)

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | API key |
| `ANTHROPIC_MODEL` | Override model |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | Disable auto memory |
| `CLAUDE_CODE_SIMPLE` | Minimal mode (Bash, Read, Edit only) |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | Enable agent teams |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | Max output tokens (default 32000, max 64000) |
| `CLAUDE_CODE_EFFORT_LEVEL` | `low`, `medium`, `high` |
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` | Disable background tasks |
| `CLAUDE_CODE_SUBAGENT_MODEL` | Model for subagents |
| `CLAUDE_CODE_PLAN_MODE_REQUIRED` | Require plan approval |
| `CLAUDE_CODE_SHELL` | Override shell detection |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | Auto-compaction trigger % |
| `ENABLE_TOOL_SEARCH` | MCP tool search: `auto`, `auto:N`, `true`, `false` |
| `CLAUDE_CODE_USE_BEDROCK` | Use AWS Bedrock |
| `CLAUDE_CODE_USE_VERTEX` | Use Google Vertex |
| `CLAUDE_CODE_USE_FOUNDRY` | Use Microsoft Foundry |
| `DISABLE_TELEMETRY` | Opt out of telemetry |

### JSON Schema for IDE Autocomplete

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json"
}
```

---

## 5. CLAUDE.md and Memory System

### CLAUDE.md File Locations

| Scope | Location | Shared With |
|-------|----------|-------------|
| **Managed policy** | `/Library/Application Support/ClaudeCode/CLAUDE.md` (macOS) | All org users |
| **Project** | `./CLAUDE.md` or `./.claude/CLAUDE.md` | Team via VCS |
| **User** | `~/.claude/CLAUDE.md` | Just you, all projects |
| **Local** | `./CLAUDE.local.md` | Just you, current project |

### Key Features

- **@-imports**: `@path/to/file` syntax expands referenced files inline (max 5 hops deep)
- **Rules directory**: `.claude/rules/*.md` for modular instructions
- **Path-specific rules**: YAML frontmatter `paths: ["src/**/*.ts"]` for conditional loading
- **Subdirectory discovery**: CLAUDE.md files in subdirs load on-demand
- **`/init` command**: Auto-generates CLAUDE.md from codebase analysis
- **`/memory` command**: Browse, toggle auto-memory, open memory files

### Auto Memory System

- Enabled by default; Claude saves learnings across sessions
- Storage: `~/.claude/projects/<project>/memory/` per project
- `MEMORY.md` entrypoint (first 200 lines loaded at startup)
- Topic files (e.g., `debugging.md`, `patterns.md`) loaded on-demand
- All worktrees in same repo share one auto memory directory
- Toggle: `autoMemoryEnabled: false` in settings or `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`

### Rules System (`.claude/rules/`)

- `.claude/rules/*.md` for modular instructions
- `~/.claude/rules/` for personal rules across all projects
- Path-specific rules with `paths:` frontmatter
- Symlinks supported for sharing rules across projects
- User rules load before project rules (project rules have higher priority)

---

## 6. Skills and Custom Slash Commands

### Overview

Skills extend Claude with custom capabilities via `SKILL.md` files. They follow the Agent Skills open standard (agentskills.io).

### Skill Locations

| Location | Path | Applies To |
|----------|------|------------|
| Enterprise | Managed settings | All org users |
| Personal | `~/.claude/skills/<name>/SKILL.md` | All your projects |
| Project | `.claude/skills/<name>/SKILL.md` | This project |
| Plugin | `<plugin>/skills/<name>/SKILL.md` | Where plugin enabled |

Legacy `.claude/commands/` still works; skills take precedence on name conflict.

### SKILL.md Format

```yaml
---
name: my-skill
description: What this skill does
argument-hint: "[filename] [format]"
disable-model-invocation: true   # Only user can invoke
user-invocable: false            # Only Claude can invoke
allowed-tools: Read, Grep, Glob  # Restricted tool access
model: sonnet                    # Override model
context: fork                    # Run in subagent
agent: Explore                   # Subagent type for fork
hooks: {}                        # Lifecycle hooks
---

Your skill instructions here...
Use $ARGUMENTS for all args, $ARGUMENTS[0] or $0 for specific args.
```

### Dynamic Context Injection

```yaml
## PR Context
- PR diff: !`gh pr diff`
- Changed files: !`gh pr diff --name-only`
```

Shell commands in backticks with `!` prefix run before skill content is sent to Claude.

### Bundled Skills

- **`/simplify`** -- Reviews recently changed files for code reuse, quality, efficiency; spawns 3 parallel review agents
- **`/batch <instruction>`** -- Orchestrates large-scale parallel changes; decomposes into 5-30 units, spawns one agent per unit in isolated worktrees, each opens a PR

### Supporting Files

Skills can include template files, example outputs, scripts, and reference docs in the skill directory alongside SKILL.md.

---

## 7. Sub-agents and Agent Teams

### Built-in Sub-agents

| Agent | Model | Tools | Purpose |
|-------|-------|-------|---------|
| **Explore** | Haiku (fast) | Read-only | File discovery, codebase exploration |
| **Plan** | Inherits | Read-only | Research for plan mode |
| **General-purpose** | Inherits | All | Complex multi-step tasks |
| **Bash** | Inherits | Terminal | Running commands in separate context |

### Custom Sub-agent Definition

File: `.claude/agents/<name>.md` or `~/.claude/agents/<name>.md`

```yaml
---
name: code-reviewer
description: Reviews code for quality and best practices
tools: Read, Glob, Grep, Bash
disallowedTools: Write, Edit
model: sonnet
permissionMode: default
maxTurns: 20
skills:
  - api-conventions
  - error-handling-patterns
memory: user            # Persistent memory: user, project, or local
background: true        # Always run as background task
isolation: worktree     # Run in isolated git worktree
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate.sh"
---

You are a code reviewer. When invoked, analyze code and provide feedback.
```

### Sub-agent Scopes

1. `--agents` CLI flag (session only, highest priority)
2. `.claude/agents/` (project level)
3. `~/.claude/agents/` (user level)
4. Plugin agents (lowest priority)

### Agent Teams (Research Preview)

- Multiple agents working in parallel and communicating
- Enable: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- Teammates mode: `auto`, `in-process`, or `tmux`
- Lead agent coordinates, assigns subtasks, merges results
- Each worker gets independent context
- Ctrl+F to kill background agents
- Shift+Down to navigate between teammates

### Key Sub-agent Features

- **Foreground vs Background**: Background agents run concurrently; pre-approve permissions
- **Resume**: Subagents can be resumed with full conversation history
- **Auto-compaction**: Subagents support auto-compaction at 95% capacity
- **Persistent Memory**: `memory: user|project|local` for cross-session learning
- **Isolation**: `isolation: worktree` for isolated git worktrees
- **Tool Restriction**: `Agent(worker, researcher)` syntax limits which agents can be spawned

---

## 8. Hooks System

### Hook Events

| Event | Matcher Input | When It Fires |
|-------|---------------|---------------|
| `SessionStart` | (none) | At session initialization |
| `PreToolUse` | Tool name | Before tool execution |
| `PostToolUse` | Tool name | After tool execution |
| `Notification` | Notification type | On notifications |
| `Stop` | (none) | When Claude stops responding |
| `SubagentStart` | Agent type name | When subagent begins |
| `SubagentStop` | Agent type name | When subagent completes |
| `WorktreeCreate` | (none) | When a worktree is created |
| `WorktreeRemove` | (none) | When a worktree is removed |
| `ConfigChange` | (none) | When config files change |

### Hook Types

1. **Command hooks**: Run shell commands, receive JSON on stdin
2. **HTTP hooks**: POST JSON to URLs (added in 2.1.63)
3. **Prompt hooks**: Run LLM prompts at hook points

### Hook Configuration (in settings.json)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/validate.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write $FILEPATH"
          }
        ]
      }
    ]
  }
}
```

### Exit Codes

- **0**: Success, continue
- **1**: Error (logged but continues)
- **2**: Block the operation (PreToolUse: prevents tool execution)

### Advanced Hook Features

- Hooks in sub-agent frontmatter (scoped to agent lifetime)
- Hooks in skill frontmatter (scoped to skill execution)
- HTTP hooks for POSTing JSON to URLs
- Async hooks
- `disableAllHooks` setting respects managed hierarchy
- `allowManagedHooksOnly` for enterprise control

---

## 9. MCP Server Configuration

### Transport Types

1. **HTTP (Streamable HTTP)** -- Recommended for remote servers
2. **SSE (Server-Sent Events)** -- Deprecated, use HTTP instead
3. **stdio** -- Local processes

### Adding MCP Servers

```bash
# HTTP remote server
claude mcp add --transport http notion https://mcp.notion.com/mcp

# With auth header
claude mcp add --transport http secure-api https://api.example.com/mcp \
  --header "Authorization: Bearer your-token"

# Local stdio server
claude mcp add --transport stdio --env API_KEY=xxx airtable \
  -- npx -y airtable-mcp-server

# From JSON config
claude mcp add-json weather '{"type":"http","url":"https://api.weather.com/mcp"}'

# Import from Claude Desktop
claude mcp add-from-claude-desktop
```

### MCP Scopes

| Scope | Storage | Sharing |
|-------|---------|---------|
| **Local** (default) | `~/.claude.json` per project | Just you, this project |
| **Project** | `.mcp.json` in project root | Team via VCS |
| **User** | `~/.claude.json` global | Just you, all projects |

### Key MCP Features

- **OAuth 2.0 Authentication**: `/mcp` command for browser-based auth
- **Pre-configured OAuth**: `--client-id`, `--client-secret` flags
- **Environment Variable Expansion**: `${VAR}` and `${VAR:-default}` in `.mcp.json`
- **Tool Search**: Auto-discovers MCP tools on-demand when many tools configured
- **MCP Resources**: Reference with `@server:protocol://resource/path`
- **MCP Prompts**: Available as `/mcp__servername__promptname` commands
- **Dynamic Tool Updates**: Supports `list_changed` notifications
- **Claude Code AS MCP Server**: `claude mcp serve` exposes Claude's tools
- **Claude.ai MCP Servers**: Auto-available if logged in with claude.ai account
- **Plugin MCP Servers**: Bundled with plugins, auto-start/stop

### Managed MCP Configuration

Two options for enterprise:
1. **`managed-mcp.json`** -- Fixed set of servers (exclusive control)
2. **`allowedMcpServers` / `deniedMcpServers`** -- Policy-based allowlists/denylists

---

## 10. IDE Integrations

### VS Code Extension

**Installation**: Search "Claude Code" in Extensions view or use direct install links.

**Key Features**:
- Native graphical chat panel (sidebar, tab, or window)
- Inline diffs with side-by-side comparison
- @-mentions with fuzzy file matching and line ranges (`@file.ts#5-10`)
- Plan review mode
- Conversation history with search
- Multiple concurrent conversations (tabs/windows)
- Resume remote sessions from claude.ai
- Plugin management UI (`/plugins`)
- Chrome browser integration (`@browser`)
- Checkpoints with rewind/fork

**VS Code Commands and Shortcuts**:

| Command | Shortcut | Description |
|---------|----------|-------------|
| Focus Input | `Cmd+Esc` / `Ctrl+Esc` | Toggle focus editor <-> Claude |
| Open in New Tab | `Cmd+Shift+Esc` / `Ctrl+Shift+Esc` | New conversation tab |
| New Conversation | `Cmd+N` / `Ctrl+N` | Start new (Claude focused) |
| Insert @-Mention | `Option+K` / `Alt+K` | Insert file+line reference |
| Open in Side Bar | -- | Move Claude to left sidebar |
| Show Logs | -- | View extension debug logs |

**VS Code Extension Settings**:

| Setting | Default | Description |
|---------|---------|-------------|
| `selectedModel` | `default` | Model for new conversations |
| `useTerminal` | `false` | CLI mode instead of graphical |
| `initialPermissionMode` | `default` | Approval mode |
| `autosave` | `true` | Auto-save before read/write |
| `useCtrlEnterToSend` | `false` | Ctrl+Enter to send |
| `respectGitIgnore` | `true` | Exclude gitignored from search |
| `allowDangerouslySkipPermissions` | `false` | Bypass all permissions |

### JetBrains Plugin

- Supports IntelliJ IDEA, PyCharm, WebStorm, and other JetBrains IDEs
- Interactive diff viewing
- Selection context sharing
- Install from JetBrains Marketplace

### Features Comparison: CLI vs VS Code Extension

| Feature | CLI | VS Code Extension |
|---------|-----|-------------------|
| All commands/skills | Yes | Subset (type `/`) |
| MCP server config | Yes | No (configure via CLI) |
| Checkpoints | Yes | Yes |
| `!` bash shortcut | Yes | No |
| Tab completion | Yes | No |
| Inline diffs | No | Yes |
| Multiple tabs | No | Yes |

---

## 11. GitHub Actions / CI Integration

### Quick Setup

```bash
# Inside Claude Code terminal
/install-github-app
```

### Manual Setup

1. Install Claude GitHub app: https://github.com/apps/claude
2. Add `ANTHROPIC_API_KEY` to repository secrets
3. Copy workflow from examples/claude.yml

### Basic Workflow

```yaml
name: Claude Code
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
jobs:
  claude:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Action Parameters

| Parameter | Description | Required |
|-----------|-------------|----------|
| `prompt` | Instructions (text or skill like `/review`) | No |
| `claude_args` | CLI arguments passed through | No |
| `anthropic_api_key` | Claude API key | Yes* |
| `github_token` | GitHub token | No |
| `trigger_phrase` | Custom trigger (default: "@claude") | No |
| `use_bedrock` | Use AWS Bedrock | No |
| `use_vertex` | Use Google Vertex AI | No |

### Use Cases

- `@claude implement this feature based on the issue description`
- `@claude fix the TypeError in the user dashboard component`
- `@claude how should I implement user authentication?`
- Automated code review on PR open
- Daily commit summaries via cron
- Issue-to-PR automation

### Cloud Provider Support

- **AWS Bedrock**: OIDC authentication, model format `us.anthropic.claude-sonnet-4-6`
- **Google Vertex AI**: Workload Identity Federation, model format `claude-sonnet-4@20250514`
- Both require custom GitHub App for best security

### GitLab CI/CD

Also supported (separate docs at `/en/gitlab-ci-cd`).

---

## 12. CLI Reference

### Commands

| Command | Description |
|---------|-------------|
| `claude` | Start interactive session |
| `claude "query"` | Start with initial prompt |
| `claude -p "query"` | Print mode (SDK), then exit |
| `cat file \| claude -p "query"` | Process piped content |
| `claude -c` | Continue most recent conversation |
| `claude -r "<session>"` | Resume by ID or name |
| `claude commit` | Create a git commit |
| `claude update` | Update to latest version |
| `claude auth login` | Sign in |
| `claude auth logout` | Sign out |
| `claude auth status` | Show auth status |
| `claude agents` | List all configured subagents |
| `claude mcp` | Configure MCP servers |
| `claude mcp serve` | Run Claude Code as MCP server |
| `claude remote-control` | Start Remote Control session |

### Key CLI Flags

| Flag | Description |
|------|-------------|
| `--model` | Set model (`sonnet`, `opus`, or full name) |
| `--agent` | Specify agent for session |
| `--agents` | Define subagents via JSON |
| `--worktree`, `-w` | Start in isolated git worktree |
| `--add-dir` | Add additional working directories |
| `--permission-mode` | Set permission mode |
| `--system-prompt` | Replace entire system prompt |
| `--append-system-prompt` | Append to system prompt |
| `--max-turns` | Limit agentic turns (print mode) |
| `--max-budget-usd` | Max dollar spend (print mode) |
| `--json-schema` | Structured JSON output |
| `--output-format` | `text`, `json`, `stream-json` |
| `--mcp-config` | Load MCP servers from file |
| `--chrome` / `--no-chrome` | Toggle Chrome integration |
| `--teleport` | Resume web session locally |
| `--remote` | Create web session on claude.ai |
| `--from-pr` | Resume sessions linked to PR |
| `--debug` | Debug mode with category filtering |
| `--verbose` | Full turn-by-turn output |
| `--fallback-model` | Auto-fallback on overload |
| `--tools` | Restrict available tools |
| `--allowedTools` | Auto-approve specific tools |
| `--disallowedTools` | Remove tools from context |

---

## 13. Keyboard Shortcuts

### Terminal Mode

| Shortcut | Action |
|----------|--------|
| `?` | Show all keyboard shortcuts |
| `Tab` | Command completion |
| Up arrow | Command history |
| `/` | Show all commands and skills |
| `Shift+Enter` | Multi-line input |
| `Ctrl+C` | Interrupt / exit |
| `Ctrl+F` | Kill background agents (two-press confirm) |
| `Shift+Down` | Navigate between teammates |
| `Ctrl+B` | Background a running task |

### VS Code

| Shortcut | Action |
|----------|--------|
| `Cmd+Esc` / `Ctrl+Esc` | Toggle focus: editor <-> Claude |
| `Cmd+Shift+Esc` / `Ctrl+Shift+Esc` | Open new tab |
| `Cmd+N` / `Ctrl+N` | New conversation (Claude focused) |
| `Option+K` / `Alt+K` | Insert @-mention reference |
| `Shift+Enter` | Multi-line input |

---

## 14. Built-in Slash Commands

### Session Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/clear` | Clear conversation history |
| `/compact` | Manually compact context |
| `/resume` or `/r` | Resume previous conversation |
| `/fork` | Fork conversation from current point |
| `/rename` | Rename current session |
| `/copy` | Interactive code block selection |

### Configuration Commands

| Command | Description |
|---------|-------------|
| `/config` | Open tabbed settings interface |
| `/status` | Show all active settings sources |
| `/login` | Switch accounts |
| `/model` | Switch model (shows current model) |
| `/memory` | Browse and manage memory files |
| `/init` | Generate CLAUDE.md from codebase |
| `/permissions` | Manage permission rules |
| `/mcp` | Manage MCP servers, authenticate |
| `/plugins` | Manage plugins and marketplaces |
| `/agents` | Create/edit/delete subagents |
| `/context` | Check context usage and warnings |

### Action Commands

| Command | Description |
|---------|-------------|
| `/commit` | Create git commit |
| `/review` | Code review |
| `/simplify` | Review changed files for improvements |
| `/batch <instruction>` | Large-scale parallel changes |
| `/desktop` | Hand off to Desktop app |
| `/teleport` | Resume web session locally |
| `/ide` | Connect to IDE |
| `/install-github-app` | Set up GitHub Actions |
| `/extra-usage` | (VS Code) Extra usage info |
| `/usage` | Show plan usage |

### Utility Commands

| Command | Description |
|---------|-------------|
| `/bug` | Report a bug |
| `/fast` | Toggle fast mode |
| `/statusline` | Configure status line |

---

## 15. Recent Changelog Highlights (2.1.45 - 2.1.63)

### Major Features Added

1. **Claude Sonnet 4.6 support** (v2.1.45)
2. **Claude Opus 4.6 with 1M context window** (v2.1.50)
3. **Agent Teams** (research preview) -- multi-agent collaboration
4. **`/simplify` and `/batch` bundled skills** (v2.1.63)
5. **Auto Memory** -- Claude saves context automatically (v2.1.59)
6. **`/copy` command** with interactive code block picker (v2.1.59)
7. **HTTP hooks** for POSTing JSON to URLs (v2.1.63)
8. **Git worktree support** (`--worktree` / `-w` flag) (v2.1.49)
9. **Background agents** with Ctrl+F kill, Ctrl+B background
10. **Isolation: worktree** for subagents (v2.1.50)
11. **Persistent agent memory** (user/project/local scopes)
12. **Remote Control** for controlling local sessions remotely (v2.1.58)
13. **Claude.ai MCP connectors** available in Claude Code (v2.1.46)
14. **Plugin system** with marketplaces, version pinning, npm registries
15. **MCP Tool Search** -- dynamic on-demand tool loading
16. **ConfigChange hook event** for enterprise security
17. **WorktreeCreate/WorktreeRemove hook events** (v2.1.50)
18. **`claude agents` CLI command** to list agents (v2.1.50)
19. **Managed settings via macOS plist or Windows Registry** (v2.1.51)
20. **`CLAUDE_CODE_SIMPLE` mode** fully strips down features (v2.1.50)

### Performance & Stability

- Massive memory leak fixes across v2.1.47-2.1.63 (bridge polling, MCP caches, git detection, task output, Yoga WASM, tree-sitter, etc.)
- Startup performance improvements (deferred hooks, MCP auth caching, batched token counting)
- Long-session memory optimization (cache clearing after compaction, progress message stripping)
- Improved Windows support (terminal rendering, CRLF, process spawning, ARM64)

### Enterprise Features

- Sandbox configuration (filesystem + network)
- Managed settings via system-level JSON, plist, or registry
- `allowManagedMcpServersOnly`, `allowManagedPermissionRulesOnly`
- `disableBypassPermissionsMode`
- Plugin marketplace allowlists/blocklists
- Config change hooks for audit

---

## 16. Key Patterns for AGI Workforce

### Architecture Patterns to Adopt

1. **CLAUDE.md System**: Persistent project instructions loaded at session start -- our `CLAUDE.md` already follows this pattern; ensure it stays concise (<200 lines recommended)

2. **Skills/Commands System**: Custom slash commands with SKILL.md files. Our "140 AI employees" should map to skills with:
   - `description` for auto-discovery
   - `disable-model-invocation: true` for action skills
   - `allowed-tools` for sandboxing
   - `context: fork` for isolated execution
   - `$ARGUMENTS` for parameterization

3. **Sub-agent Architecture**: Specialized agents with custom prompts, tool restrictions, and models. Key patterns:
   - Read-only Explore agent (Haiku model) for fast codebase search
   - Permission modes per agent (`plan`, `dontAsk`, etc.)
   - `isolation: worktree` for truly parallel work
   - `memory: user|project|local` for cross-session learning

4. **Agent Teams**: Multi-agent parallel collaboration with:
   - Lead agent coordinates
   - Workers in isolated worktrees
   - Task decomposition and assignment
   - Result merging

5. **Hooks System**: Lifecycle hooks for automation:
   - PreToolUse for validation/blocking
   - PostToolUse for auto-formatting/linting
   - HTTP hooks for external notifications
   - Hooks scoped to specific agents or skills

6. **MCP Integration**: Standard protocol for tool connectivity:
   - HTTP (streamable) as recommended transport
   - OAuth 2.0 for authenticated services
   - Tool Search for large tool sets
   - Project-scoped `.mcp.json` for team sharing
   - Managed MCP for enterprise control

7. **Permission Architecture**: Multi-layered security:
   - Managed (can't override) > Local > Project > User
   - Tool-specific rules with wildcards
   - Sandbox with filesystem + network controls
   - Domain-based network allowlists

8. **Context Management**:
   - Auto-compaction at configurable threshold
   - Sub-agents for context isolation
   - `/compact` for manual control
   - Worktrees for file isolation

### Competitive Advantages to Match

- **Multi-surface**: Terminal + IDE + Desktop + Web + Mobile + Chrome + Slack
- **Remote Control**: Continue sessions from any device
- **Teleport**: Move web sessions to local terminal
- **Worktrees**: True parallel isolated sessions
- **Agent Teams**: Multiple agents coordinating on complex tasks
- **Skills Marketplace**: Shareable, packageable skill definitions
- **Plugin System**: Full marketplace with version pinning
- **Enterprise Controls**: Managed settings, sandbox, MCP policies

---

*Research compiled from code.claude.com/docs and github.com/anthropics/claude-code*
