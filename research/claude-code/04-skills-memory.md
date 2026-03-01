# Claude Code: Skills, Slash Commands, CLAUDE.md & Memory System

> Research report for AGI Workforce — building equivalent systems for 140 AI employees.
> Date: 2026-02-28 | Sources: Official docs (code.claude.com), community blogs, GitHub examples

---

## Table of Contents

1. [Built-in Slash Commands](#1-built-in-slash-commands)
2. [Skills System (Custom Slash Commands)](#2-skills-system-custom-slash-commands)
3. [SKILL.md Format & Frontmatter Reference](#3-skillmd-format--frontmatter-reference)
4. [Skill Triggering & Context Loading](#4-skill-triggering--context-loading)
5. [CLAUDE.md System](#5-claudemd-system)
6. [Memory System](#6-memory-system)
7. [Hooks System](#7-hooks-system)
8. [Skills vs Commands vs Hooks — Key Differences](#8-skills-vs-commands-vs-hooks--key-differences)
9. [Community CLAUDE.md Patterns](#9-community-claudemd-patterns)
10. [Implications for AGI Workforce](#10-implications-for-agi-workforce)

---

## 1. Built-in Slash Commands

Claude Code ships with these built-in commands (not customizable, part of core):

| Command | Purpose |
|---------|---------|
| `/clear` | Clear conversation history (reset context) |
| `/compact [instructions]` | Compact conversation with optional focus instructions |
| `/config` | Open Settings interface (Config tab) |
| `/context` | Visualize current context usage as colored grid |
| `/cost` | Show token usage statistics |
| `/copy` | Copy last response to clipboard (with code block picker) |
| `/debug [description]` | Troubleshoot session by reading debug log |
| `/desktop` | Hand off CLI session to Claude Code Desktop app |
| `/doctor` | Check health of Claude Code installation |
| `/exit` | Exit the REPL |
| `/export [filename]` | Export conversation to file or clipboard |
| `/help` | Get usage help |
| `/init` | Initialize project with CLAUDE.md guide (analyzes codebase) |
| `/mcp` | Manage MCP server connections and OAuth |
| `/memory` | Edit CLAUDE.md memory files (browse, toggle auto-memory) |
| `/model` | Select or change AI model (with effort level on Opus) |
| `/permissions` | View or update permission rules |
| `/plan` | Enter plan mode directly from prompt |
| `/rename [name]` | Rename current session |
| `/resume [session]` | Resume conversation by ID/name or open session picker |
| `/rewind` | Rewind conversation and/or code to checkpoint |
| `/stats` | Visualize daily usage, session history, streaks |
| `/status` | Show version, model, account, connectivity |
| `/statusline` | Set up status line UI |
| `/tasks` | List and manage background tasks |
| `/teleport` | Resume remote session from claude.ai |
| `/theme` | Change color theme |
| `/todos` | List current TODO items |
| `/usage` | Show plan usage limits and rate limit status |

### Bundled Skills (ship with Claude Code)

Two built-in skills available in every session:

1. **`/simplify`** — Reviews recently changed files for code reuse, quality, and efficiency. Spawns 3 parallel review agents, aggregates findings, applies fixes. Optional focus: `/simplify focus on memory efficiency`.

2. **`/batch <instruction>`** — Orchestrates large-scale parallel changes. Decomposes work into 5-30 independent units, spawns one background agent per unit in isolated git worktrees, each implements its unit, runs tests, opens a PR. Example: `/batch migrate src/ from Solid to React`.

### MCP Prompts as Commands

MCP servers expose prompts as commands in format `/mcp__<server>__<prompt>`. Dynamically discovered from connected servers.

---

## 2. Skills System (Custom Slash Commands)

### Evolution: Commands -> Skills

Custom slash commands have been **merged into skills**. Both paths work:
- Legacy: `.claude/commands/review.md` -> creates `/review`
- Modern: `.claude/skills/review/SKILL.md` -> creates `/review`

If both exist with same name, **skill takes precedence**. Legacy `.claude/commands/` files keep working with same frontmatter support.

### Skills follow the Agent Skills open standard

Claude Code skills follow the [Agent Skills](https://agentskills.io) open standard (works across multiple AI tools). Claude Code extends it with invocation control, subagent execution, and dynamic context injection.

### Where Skills Live (Priority Order)

| Location | Path | Applies to | Priority |
|----------|------|------------|----------|
| **Enterprise** | Managed settings | All org users | Highest |
| **Personal** | `~/.claude/skills/<name>/SKILL.md` | All your projects | High |
| **Project** | `.claude/skills/<name>/SKILL.md` | This project only | Medium |
| **Plugin** | `<plugin>/skills/<name>/SKILL.md` | Where plugin enabled | Namespaced (`plugin:skill`) |

Enterprise > Personal > Project when names conflict. Plugin skills use `plugin-name:skill-name` namespace so cannot conflict.

### Skill Directory Structure

```
my-skill/
  SKILL.md           # Main instructions (required, entrypoint)
  template.md        # Template for Claude to fill in (optional)
  examples/
    sample.md        # Example output showing expected format
  scripts/
    validate.sh      # Script Claude can execute
```

### Automatic Discovery

- **Nested directories**: Working in `packages/frontend/` also discovers skills in `packages/frontend/.claude/skills/`. Supports monorepos.
- **Additional directories**: Skills in `--add-dir` directories are loaded automatically with live change detection (edit during session without restart).

---

## 3. SKILL.md Format & Frontmatter Reference

### Basic Format

```yaml
---
name: my-skill
description: What this skill does and when to use it
---

Your skill instructions in markdown here...
```

Two parts: YAML frontmatter (between `---` markers) + markdown content body.

### Complete Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | No | Display name, becomes `/slash-command`. Lowercase letters, numbers, hyphens only (max 64 chars). Defaults to directory name |
| `description` | Recommended | What skill does and when to use it. Claude uses this to decide when to auto-load. Falls back to first paragraph of markdown |
| `argument-hint` | No | Hint shown during autocomplete. Example: `[issue-number]` or `[filename] [format]` |
| `disable-model-invocation` | No | `true` = only user can invoke (prevents auto-loading). Default: `false` |
| `user-invocable` | No | `false` = hidden from `/` menu (only Claude can invoke). Default: `true` |
| `allowed-tools` | No | Tools Claude can use without permission when skill is active. Example: `Read, Grep, Glob` |
| `model` | No | Force specific model when skill is active |
| `context` | No | Set to `fork` to run in forked subagent context |
| `agent` | No | Subagent type when `context: fork`. Options: `Explore`, `Plan`, `general-purpose`, or custom from `.claude/agents/` |
| `hooks` | No | Hooks scoped to this skill's lifecycle |

### String Substitutions in Skill Content

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | All arguments passed when invoking. If absent, args appended as `ARGUMENTS: <value>` |
| `$ARGUMENTS[N]` | Specific argument by 0-based index (`$ARGUMENTS[0]` = first) |
| `$N` | Shorthand (`$0` = first argument, `$1` = second) |
| `${CLAUDE_SESSION_ID}` | Current session ID for logging/correlation |

### Dynamic Context Injection

The `` !`command` `` syntax runs shell commands **before** skill content is sent to Claude. Output replaces the placeholder (preprocessing, not Claude execution).

```yaml
---
name: pr-summary
description: Summarize changes in a pull request
context: fork
agent: Explore
allowed-tools: Bash(gh *)
---
## Pull request context
- PR diff: !`gh pr diff`
- PR comments: !`gh pr view --comments`
- Changed files: !`gh pr diff --name-only`

## Your task
Summarize this pull request...
```

### Two Types of Skill Content

1. **Reference content** — Knowledge Claude applies to current work (conventions, patterns, style guides). Runs inline alongside conversation context.

```yaml
---
name: api-conventions
description: API design patterns for this codebase
---
When writing API endpoints:
- Use RESTful naming conventions
- Return consistent error formats
```

2. **Task content** — Step-by-step instructions for specific actions (deploy, commit, code gen). Often `disable-model-invocation: true`.

```yaml
---
name: deploy
description: Deploy the application to production
context: fork
disable-model-invocation: true
---
Deploy the application:
1. Run the test suite
2. Build the application
3. Push to the deployment target
```

---

## 4. Skill Triggering & Context Loading

### How Claude Decides When to Use a Skill

This is the core mechanism:

1. **Description always in context** (by default): Skill descriptions are loaded into Claude's context so it knows what's available. Full skill content only loads when invoked.

2. **Character budget**: Descriptions loaded at 2% of context window, fallback 16,000 characters. Override with `SLASH_COMMAND_TOOL_CHAR_BUDGET` env var.

3. **The Skill tool**: Claude Code provides a `Skill` tool with `command` parameter. The tool definition includes an `<available_skills>` section dynamically populated from all skill metadata.

4. **Matching**: Claude matches user requests against skill descriptions using natural language understanding. Keywords in the description help matching.

### Invocation Control Matrix

| Frontmatter | User can invoke | Claude can invoke | When loaded into context |
|-------------|----------------|-------------------|------------------------|
| (default) | Yes | Yes | Description always in context, full skill loads when invoked |
| `disable-model-invocation: true` | Yes | No | Description NOT in context at all, full skill loads on user invoke |
| `user-invocable: false` | No | Yes | Description always in context, full skill loads when invoked |

### Subagent Execution

With `context: fork`, skill runs in isolated subagent:
1. New isolated context created
2. Subagent receives skill content as its prompt
3. `agent` field determines execution environment (model, tools, permissions)
4. Results summarized and returned to main conversation

### Tool Access Control

```yaml
allowed-tools: Read, Grep, Glob  # Read-only mode
```

Permission rules in `/permissions`:
```
Skill(commit)        # Allow specific skill
Skill(review-pr *)   # Allow with prefix match
Skill(deploy *)      # Deny specific skill
```

---

## 5. CLAUDE.md System

### What CLAUDE.md Is

A markdown file loaded at the **start of every conversation** providing persistent context. It is context, not enforced configuration — Claude reads it and tries to follow it.

### File Locations & Hierarchy (Priority: Specific > Broad)

| Scope | Location | Purpose | Shared with |
|-------|----------|---------|-------------|
| **Managed policy** | macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md`; Linux: `/etc/claude-code/CLAUDE.md`; Windows: `C:\Program Files\ClaudeCode\CLAUDE.md` | Org-wide instructions (cannot be excluded) | All org users |
| **Project** | `./CLAUDE.md` or `./.claude/CLAUDE.md` | Team-shared project instructions | Team via source control |
| **User** | `~/.claude/CLAUDE.md` | Personal preferences for all projects | Just you (all projects) |
| **Local** | `./CLAUDE.local.md` | Personal project-specific, not checked in | Just you (current project) |
| **Child directories** | `src/components/CLAUDE.md` | Directory-specific instructions | Team via source control |

### Loading Behavior

1. **Walk up**: Claude Code walks up from working directory to filesystem root, loading every CLAUDE.md found
2. **Parent directories**: Loaded in full at launch (monorepo support)
3. **Child directories**: Load **on demand** when Claude reads files in those directories
4. **All loaded in full**: No line limit on CLAUDE.md files (unlike auto-memory), but shorter = better adherence
5. **Survives compaction**: After `/compact`, CLAUDE.md re-read from disk and re-injected fresh

### Import Syntax

```markdown
See @README.md for project overview and @package.json for npm commands.

# Additional Instructions
- Git workflow: @docs/git-instructions.md
- Personal: @~/.claude/my-project-instructions.md
```

- Relative paths resolve relative to the containing file
- Max import depth: 5 hops
- First encounter shows approval dialog for external imports
- Supports both relative and absolute paths

### Rules Directory (`.claude/rules/`)

Organized modular instructions:

```
.claude/
  CLAUDE.md
  rules/
    code-style.md     # Always loaded (no paths frontmatter)
    testing.md
    security.md
    api-rules.md      # Conditionally loaded with paths
```

#### Path-Specific Rules

```markdown
---
paths:
  - "src/api/**/*.ts"
---

# API Development Rules
- All endpoints must include input validation
- Use standard error response format
```

Rules without `paths` load unconditionally. Rules with `paths` trigger when Claude reads matching files.

Glob patterns: `**/*.ts`, `src/**/*`, `*.md`, `src/components/*.tsx`

#### Symlinks supported for shared rules across projects:
```bash
ln -s ~/shared-claude-rules .claude/rules/shared
```

#### User-level rules at `~/.claude/rules/` apply to all projects (lower priority than project rules).

### Exclusions

`claudeMdExcludes` in settings to skip irrelevant CLAUDE.md files:
```json
{
  "claudeMdExcludes": [
    "**/monorepo/CLAUDE.md",
    "/home/user/monorepo/other-team/.claude/rules/**"
  ]
}
```

### Writing Effective CLAUDE.md — Key Principles

1. **Size**: Target under 200 lines per file. Shorter = better adherence
2. **Structure**: Markdown headers and bullets (Claude scans structure like readers)
3. **Specificity**: Concrete, verifiable ("Use 2-space indentation" not "Format code properly")
4. **Consistency**: No contradicting rules across files
5. **Emphasis**: "IMPORTANT" or "YOU MUST" improves adherence
6. **Prune regularly**: Ask "Would removing this cause Claude to make mistakes?" If not, cut it.

### What to Include vs Exclude

| Include | Exclude |
|---------|---------|
| Bash commands Claude can't guess | Anything Claude can infer from code |
| Code style rules differing from defaults | Standard language conventions |
| Test instructions and preferred runners | Detailed API docs (link instead) |
| Repo etiquette (branch naming, PR conventions) | Frequently changing info |
| Architectural decisions specific to project | Long explanations or tutorials |
| Dev environment quirks (required env vars) | File-by-file codebase descriptions |
| Common gotchas or non-obvious behaviors | Self-evident practices |

### Instruction Limits

Frontier LLMs can follow approximately **150-200 instructions** with reasonable consistency. Claude Code's system prompt already contains ~50 instructions. So CLAUDE.md should contain **as few instructions as possible** — only universally applicable ones.

LLMs bias toward instructions at the very beginning and very end of the prompt. As instruction count increases, following quality decreases uniformly.

---

## 6. Memory System

### Two Memory Systems

| | CLAUDE.md files | Auto memory |
|--|-----------------|-------------|
| **Who writes** | You | Claude |
| **Contents** | Instructions and rules | Learnings and patterns |
| **Scope** | Project, user, or org | Per working tree (git repo) |
| **Loaded** | Every session (in full) | Every session (first 200 lines of MEMORY.md) |
| **Use for** | Coding standards, workflows, architecture | Build commands, debugging insights, discovered preferences |

### Auto Memory

Claude saves notes for itself as it works: build commands, debugging insights, architecture notes, code style preferences, workflow habits. Not every session — only when information would be useful in future conversations.

#### Storage Location

```
~/.claude/projects/<project>/memory/
  MEMORY.md          # Concise index, loaded every session (first 200 lines)
  debugging.md       # Detailed notes on debugging patterns
  api-conventions.md # API design decisions
  ...                # Any topic files Claude creates
```

- `<project>` path derived from **git repository** (all worktrees/subdirectories in same repo share one auto memory directory)
- Outside git repo: project root path is used
- Machine-local, never touches git

#### How It Works

1. First **200 lines** of `MEMORY.md` loaded at session start (hard limit — content beyond is not loaded)
2. `MEMORY.md` acts as an **index** of the memory directory
3. Claude keeps it concise by moving detailed notes to separate topic files
4. Topic files (debugging.md, patterns.md) are **NOT loaded at startup** — Claude reads them on demand
5. Claude reads/writes memory during session ("Writing memory" / "Recalled memory" indicators)

#### Subagent Memory

Subagents can maintain their own auto memory (separate from main conversation memory).

### The `/memory` Command

- Lists all CLAUDE.md and rules files loaded in current session
- Toggle auto memory on/off
- Link to open auto memory folder
- Select any file to open in editor
- When you say "remember X", Claude saves to auto memory
- To save to CLAUDE.md instead, say "add this to CLAUDE.md"

### Enable/Disable

- Default: **on**
- Toggle via `/memory` or `autoMemoryEnabled` in settings
- Env var: `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`

---

## 7. Hooks System

### What Hooks Are

User-defined shell commands, HTTP endpoints, or LLM prompts that execute **automatically** at specific lifecycle points. Unlike CLAUDE.md (advisory), hooks are **deterministic** — guaranteed to execute.

### Hook Events

| Event | When it fires | Can control |
|-------|---------------|-------------|
| `SessionStart` | Session begins/resumes | — |
| `UserPromptSubmit` | Before Claude processes your prompt | Modify/block prompt |
| `PreToolUse` | Before tool call executes | Block tool call |
| `PermissionRequest` | Permission dialog appears | Auto-approve/deny |
| `PostToolUse` | After tool call succeeds | Inject feedback |
| `PostToolUseFailure` | After tool call fails | Inject feedback |
| `Notification` | Claude Code sends notification | — |
| `SubagentStart` | Subagent spawned | — |
| `SubagentStop` | Subagent finishes | — |
| `Stop` | Claude finishes responding | Run post-processing |
| `TeammateIdle` | Agent team member going idle | — |
| `TaskCompleted` | Task marked completed | — |
| `ConfigChange` | Config file changes during session | — |
| `WorktreeCreate` | Worktree being created | Custom VCS isolation |
| `WorktreeRemove` | Worktree being removed | Custom cleanup |
| `PreCompact` | Before context compaction | — |
| `SessionEnd` | Session terminates | — |

### Configuration

Defined in JSON settings files:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/lint-check.sh"
          }
        ]
      }
    ]
  }
}
```

### Hook Locations

| Location | Scope |
|----------|-------|
| `~/.claude/settings.json` | All your projects |
| `.claude/settings.json` | Single project (committable) |
| `.claude/settings.local.json` | Single project (gitignored) |
| Managed policy settings | Organization-wide |
| Plugin `hooks/hooks.json` | When plugin enabled |
| Skill/agent frontmatter | While component active |

### Matcher Patterns

Regex-based filtering. Tool events match on tool name, session events on trigger type:
- `Bash` — match Bash tool
- `Edit|Write` — match either
- `mcp__.*` — match all MCP tools
- `"*"` or omit — match everything

### Hook Handler Types

1. **Command hooks** (`"type": "command"`) — Shell commands, receive JSON on stdin
2. **HTTP hooks** (`"type": "http"`) — POST to endpoints
3. **Prompt hooks** (`"type": "prompt"`) — LLM prompts
4. **Async hooks** — Fire-and-forget, don't block

### Key Use Cases

- Run linter after every file edit (PostToolUse)
- Block destructive commands like `rm -rf` (PreToolUse)
- Desktop notifications when Claude needs attention (Notification)
- Auto-format code after writes (PostToolUse + Stop)
- Enforce file boundaries (PreToolUse)
- Log all tool usage (PostToolUse)

---

## 8. Skills vs Commands vs Hooks — Key Differences

| Aspect | Skills | Commands (Legacy) | Hooks |
|--------|--------|-------------------|-------|
| **File format** | `SKILL.md` in directory | `.md` file in `.claude/commands/` | JSON in settings files |
| **Invocation** | `/name` or auto by Claude | `/name` only | Automatic at lifecycle events |
| **Content** | Instructions + supporting files | Instructions only | Shell commands / HTTP / prompts |
| **Execution** | Injected into Claude's context | Injected into Claude's context | Run outside Claude's context |
| **Control flow** | Claude decides based on description | User invokes manually | Deterministic, always fires |
| **Side effects** | Claude executes within conversation | Claude executes within conversation | External process execution |
| **When to use** | Repeatable workflows, domain knowledge | Simple prompt templates | Guaranteed actions, enforcement |
| **Supporting files** | Yes (scripts, templates, examples) | No | No |
| **Subagent support** | Yes (`context: fork`) | No | No |

### Decision Guide

- **Need guaranteed execution every time?** -> Hook
- **Need Claude to decide when it's relevant?** -> Skill (with description)
- **Need user to trigger manually?** -> Skill (with `disable-model-invocation: true`)
- **Need background knowledge Claude should know?** -> Skill (with `user-invocable: false`)
- **Need simple prompt template?** -> Either skill or legacy command

---

## 9. Community CLAUDE.md Patterns

### Pattern 1: Minimal & Focused (HumanLayer approach)

Under 60 lines. Only what Claude cannot infer:

```markdown
# Code style
- Use ES modules (import/export), not CommonJS (require)
- Destructure imports when possible

# Workflow
- Typecheck when done making changes
- Prefer single tests over full suite
```

### Pattern 2: Progressive Disclosure

Short CLAUDE.md + separate reference files:

```markdown
# Project
Full-stack app: Next.js + Supabase

# Commands
- `pnpm dev` — development server
- `pnpm test` — run tests

# References
- Architecture: @docs/architecture.md
- Database schema: @docs/schema.md
- API conventions: @docs/api-conventions.md
```

### Pattern 3: Monorepo with Nested CLAUDE.md

Root CLAUDE.md + package-specific:

```
root/CLAUDE.md          # Universal: monorepo structure, global commands
root/apps/web/CLAUDE.md # Web app specifics
root/apps/api/CLAUDE.md # API specifics
root/packages/shared/CLAUDE.md # Shared package patterns
```

### Pattern 4: Rules Directory

```
.claude/
  CLAUDE.md       # Core: project overview, key commands
  rules/
    testing.md    # Testing conventions (always loaded)
    frontend.md   # paths: ["src/components/**"] (conditional)
    api.md        # paths: ["src/api/**"] (conditional)
    security.md   # paths: ["src/auth/**"] (conditional)
```

### Pattern 5: Team + Individual

```
./CLAUDE.md         # Team standards (committed)
./CLAUDE.local.md   # Personal preferences (gitignored)
~/.claude/CLAUDE.md # Universal personal preferences
```

### Anti-Patterns to Avoid

1. **Kitchen sink CLAUDE.md** — Too many instructions, Claude ignores half
2. **Redundant style rules** — Claude infers from code; only add what differs from defaults
3. **Auto-generated content** — `/init` is a starting point, must be hand-curated
4. **Task-specific instructions** — Use skills for non-universal guidance
5. **Stale instructions** — Review regularly, prune what doesn't change behavior
6. **Contradicting rules** — Across nested CLAUDE.md files causes arbitrary behavior

---

## 10. Implications for AGI Workforce

### What to Build for Our 140 AI Employees

#### 1. Skill System Architecture

Map our 140 `.agi/employees/*.md` files to the Skills model:

```
.agi/skills/
  financial-advisor/
    SKILL.md           # System prompt + routing description
    tools.json         # Allowed tools/capabilities
    examples/          # Example interactions
    reference/         # Domain knowledge files
  code-reviewer/
    SKILL.md
    scripts/
      lint-check.sh    # Bundled scripts
```

**Key insight**: The `description` field is what drives auto-routing. Our `intelligent-agent-router.ts` does keyword scoring, but Claude Code lets the LLM itself decide based on description matching. We should do both: keyword scoring for speed, LLM matching for accuracy.

#### 2. Frontmatter Schema for AI Employees

```yaml
---
name: financial-advisor
description: Expert financial planning, investment analysis, tax optimization. Use when discussing money, investments, retirement, budgets, or financial goals.
category: finance-business
allowed-tools: web-search, calculator, document-read
model: claude-opus-4-6  # Thinking model for heavy reasoning
disable-model-invocation: false
user-invocable: true
argument-hint: [topic or question]
---
```

#### 3. Memory System for Agents

Each AI employee should maintain its own memory:

```
~/.agi/agents/<agent-id>/memory/
  MEMORY.md          # Index (200 line limit)
  user-preferences.md
  past-interactions.md
  domain-knowledge.md
```

#### 4. Project Instructions Hierarchy

```
.agi/
  INSTRUCTIONS.md          # Global project instructions (like CLAUDE.md)
  rules/
    security.md            # Always loaded
    api-conventions.md     # Path-scoped
  skills/                  # AI employee definitions
  agents/                  # Subagent configurations
  settings.json            # Hooks, permissions, config
```

#### 5. Hook Equivalents

Implement lifecycle hooks for our agent system:
- `PreToolUse` — Validate tool calls before execution
- `PostToolUse` — Auto-lint, auto-format, feedback injection
- `Stop` — Post-processing, quality checks
- `TaskCompleted` — Trigger downstream agents

#### 6. Key Design Principles from Claude Code

1. **Skills are injected instructions, NOT separate processes** — They expand into the conversation context
2. **Description drives auto-routing** — The description field is the most important part of a skill
3. **Memory has hard limits** — 200 lines for auto-memory index; keep it concise
4. **Instructions are context, not enforcement** — More specific + more concise = better adherence
5. **Progressive disclosure** — Load details on demand, not upfront
6. **Character budget for skills** — 2% of context window for all skill descriptions combined
7. **Supporting files are loaded on demand** — Only SKILL.md loaded initially; references loaded when needed
8. **Hooks for guarantees, skills for guidance** — Different mechanisms for different needs

---

## Source URLs

### Official Documentation (code.claude.com)
- https://code.claude.com/docs/en/skills — Skills system (comprehensive)
- https://code.claude.com/docs/en/memory — Memory system (CLAUDE.md + auto memory)
- https://code.claude.com/docs/en/best-practices — Best practices
- https://code.claude.com/docs/en/interactive-mode — Built-in commands reference
- https://code.claude.com/docs/en/hooks — Hooks reference
- https://code.claude.com/docs/en/tutorials — Common workflows

### Community & Analysis
- https://www.humanlayer.dev/blog/writing-a-good-claude-md — Writing effective CLAUDE.md
- https://claude.com/blog/using-claude-md-files — Official Anthropic blog on CLAUDE.md
- https://mikhail.io/2025/10/claude-code-skills/ — Skills internals deep dive
- https://github.com/ChrisWiles/claude-code-showcase — Comprehensive config example
- https://github.com/hesreallyhim/awesome-claude-code — Curated skills/hooks/commands list
- https://github.com/shanraisshan/claude-code-best-practice — Best practices collection
- https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/ — Skills first principles
- https://dev.classmethod.jp/en/articles/disable-model-invocation-claude-code/ — Manual-only skills
