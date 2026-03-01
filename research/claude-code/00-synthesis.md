# Claude Code → AGI Workforce: What to Build

*Synthesized from 5-agent research team, 2026-02-28*
*Sources: 01-official-docs.md, 02-permissions-hooks.md, 03-agents-teams.md, 04-skills-memory.md, 05-community-competitive.md*

---

## TL;DR

Claude Code is the gold standard CLI agent. AGI Workforce can **surpass it** by taking every architectural pattern and adding: multi-model, GUI, mobile companion, local desktop control, and no model lock-in. Here's exactly what to build.

---

## 1. Skills System → Map Our 140 Employees

**What Claude Code does:**
- `SKILL.md` files at `.claude/skills/<name>/` with YAML frontmatter
- Follows `agentskills.io` open standard — cross-tool compatible
- 10 frontmatter fields: `name`, `description`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `model`, `context`, `agent`, `hooks`, `argument-hint`
- `description` field drives auto-routing — Claude matches requests against all skill descriptions
- `context: fork` runs skill in isolated subagent
- Dynamic context injection: `` !`command` `` shell preprocessing
- Character budget: 2% of context window (~16K chars) for all skill descriptions combined

**What we build:**
- Convert our 140 `.agi/employees/*.md` to `agentskills.io` format
- Add YAML frontmatter to every employee file (model, tools, context, description)
- The `description` field is the router — write it to match natural language requests
- Expose as `/skill-name` slash commands in the chat composer
- Add skill autocomplete with `@` mention in composer (already partially built)
- Surface in Skills marketplace as installable cards
- Bundled skills to ship immediately: `/research`, `/code-review`, `/write`, `/analyze`

**Two bundled skills to clone:**
1. **`/simplify`** → 3 parallel review agents (logic + security + quality) — maps to our code-reviewer team
2. **`/batch`** → decomposes into 5–30 worktree workers for parallel codebase changes — maps to our swarm

---

## 2. Hooks System → Desktop-Native Security Gates

**What Claude Code does:**
- 17 hook events: `PreToolUse`, `PostToolUse`, `PermissionRequest`, `UserPromptSubmit`, `SessionStart/End`, `SubagentStart/Stop`, `Stop`, `TeammateIdle`, `TaskCompleted`, `WorktreeCreate/Remove`, `Notification`, `ConfigChange`, `PreCompact`
- **Exit code 2 = block** — universal convention, stderr becomes agent's feedback
- 4 hook types: `command` (shell), `http` (POST endpoint), `prompt` (single LLM call), `agent` (multi-turn)
- Hooks snapshot at startup — prevents mid-session tampering
- **Deny-first rule evaluation**: deny → ask → allow, first match wins
- **PreToolUse is the core security gate** — can modify tool inputs before execution
- Enterprise: `allowManagedHooksOnly`, `disableBypassPermissionsMode`

**What we build for desktop app:**
- Port ToolGuard to follow the same PreToolUse/PostToolUse pattern
- Expose hooks as user-configurable rules in Settings → Automation
- Mobile companion = the world's best PostToolUse hook: every action → phone notification → approve/deny
- Ship default hooks: auto-format on file edit, git commit on save, lint on bash
- Hook builder UI: select event → choose action type (shell/HTTP/LLM) → add regex filter
- **Our advantage**: hooks can control the actual OS (show dialogs, send notifications, trigger automations) — Claude Code hooks are shell-only

**Permission modes to implement (5):**
| Mode | Behavior |
|------|----------|
| `default` | Prompt for each tool call |
| `acceptEdits` | Auto-approve file edits, still prompt bash |
| `plan` | Read-only analysis mode, no writes |
| `dontAsk` | Auto-deny unless pre-allowed |
| `bypassPermissions` | No checks (power user mode) |

**Rule syntax to implement:**
```
Bash(npm run *)          # allow any npm run command
Edit(src/**/*.ts)        # allow edits to TypeScript files
WebFetch(domain:github.com)  # allow GitHub fetches only
mcp__filesystem__*       # allow all filesystem MCP tools
Agent(Explore)           # allow spawning Explore agents
```

---

## 3. Agent Teams → Native Multi-Agent Runtime

**What Claude Code does:**
- Experimental: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- File-based JSON inboxes at `~/.claude/teams/<name>/`
- File locking (`flock`) for concurrent task claiming
- **DAG task system**: blocks/blockedBy dependencies, pending→in_progress→completed
- SendMessage types: `message`, `broadcast`, `shutdown_request/response`, `plan_approval_request/response`, `idle_notification`, `task_completed`, `join_request`
- Worktree isolation: `.claude/worktrees/<name>/` per agent
- **No nested subagents** — prevents runaway recursion
- Display modes: in-process, tmux, iterm2

**What we build in Tauri:**
- Replace file-based JSON with SQLite (already have it in `core/data/`)
- Port DAG task system to `core/swarm/task_decomposer.rs` (already exists — enhance it)
- Our 140 `.agi/employees/` = agent roster, each has a role, tools, model
- Implement the same SendMessage protocol but over SQLite + Tauri events
- **Worktree isolation**: for code tasks, create git worktrees; for other tasks, use temp dirs
- **Task tree UI**: show live sub-agent execution graph (what Perplexity Computer shows visually)
- **No nested agents**: enforce depth limit of 2 (orchestrator → worker only)

**DAG task schema:**
```sql
CREATE TABLE agent_tasks (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending', -- pending|in_progress|completed|deleted
  owner TEXT,                     -- agent name claiming this task
  blocks TEXT,                    -- JSON array of task IDs this blocks
  blocked_by TEXT,                -- JSON array of task IDs that block this
  created_at INTEGER,
  updated_at INTEGER
);
```

---

## 4. CLAUDE.md → Workspace Agent Instructions

**What Claude Code does:**
- 5 scope levels: Managed > Project > User > Local > Child directories
- Loads by walking up directory tree from working directory
- `.claude/rules/` directory for modular path-scoped instructions
- Import syntax: `@path/to/file` (max 5 hops)
- **Instruction limit**: ~150-200 max for reliable following
- **Target**: under 200 lines per file; ideally under 60 lines
- Survives `/compact` — re-read from disk and re-injected fresh

**What we build:**
- Per-workspace "Agent Instructions" file: `~/.agi/workspaces/<name>/INSTRUCTIONS.md`
- Editable in Settings → Workspace → Instructions
- Loaded fresh at every agent session start
- Support `@import` syntax for modular rule files
- Default instructions template per use case (coding, research, writing, etc.)
- Auto-save to instructions when user says "always do X" or "never do Y"
- Show active instructions in agent panel sidebar

---

## 5. Memory System → Persistent Agent Intelligence

**What Claude Code does:**
- Two systems: CLAUDE.md (user writes) + Auto Memory (agent writes to `~/.claude/projects/<project>/memory/MEMORY.md`)
- **Hard limit**: first 200 lines of MEMORY.md loaded per session
- MEMORY.md as index → topic files loaded on demand
- All worktrees in same git repo share one auto-memory directory
- `/memory` command to browse, toggle, edit memories

**What we build:**
- Auto-memory per workspace: `~/.agi/memory/<workspace>/MEMORY.md`
- Agent automatically writes learnings after each session
- 200-line index with links to topic files (`debugging.md`, `patterns.md`, etc.)
- Memory browser in sidebar: list all memories, toggle on/off, edit
- "Remember this" button in chat → agent writes to memory immediately
- Cross-session continuity: agent reads memory at start, writes at end
- **Our advantage**: memory can include learned UI preferences, API patterns, codebase knowledge — much richer than Claude Code's text-only MEMORY.md

---

## 6. Usage Dashboard → #1 Community Pain Point

**What Claude Code lacks:**
- No built-in usage tracking (community built CCFlare and CCUsage themselves)
- No per-task cost preview before running
- No spend limits per session or task
- Unpredictable consumption → "context anxiety" is a real community term

**What we build (our biggest differentiator from Claude Code):**
- Per-session token counter + cost estimate (live, in real-time)
- Per-task cost before execution: "This task will use ~$0.45"
- Spend limit per session: stop agents when limit reached
- Usage history dashboard: by day, model, task type
- Model cost comparison: "GPT-4o would cost $0.12, Claude Sonnet $0.08, Gemini Flash $0.02"
- Budget mode: automatically route to cheapest model for simple tasks
- Already have `TokenUsageDisplay.tsx` and `TokenAnalyticsDashboard.tsx` — wire to real data

---

## 7. Multi-Surface Parity → Claude Code's 8 Surfaces

**What Claude Code has:**
Terminal CLI, VS Code extension, JetBrains plugin, Desktop App, Web (claude.ai/code), Chrome extension, Slack integration, iOS app

**What we build (our surface plan):**
| Surface | Status | Priority |
|---------|--------|----------|
| Desktop App (Tauri) | ✅ Done | — |
| Web App (Next.js) | ✅ Done | — |
| Chrome Extension | ✅ Built | Ship |
| VS Code Extension | ✅ Phases 1-4 | Complete phases 5-9 |
| Mobile App (iOS/Android) | ✅ Phases 0-4 | Complete phases 5-6 (mobile companion) |
| Slack integration | ❌ Not built | Phase 9 |

**Mobile companion is our killer surface** — Claude Code has an iOS reader app. We have a live agent approval dashboard with QR pairing. Zero competitors have this.

---

## 8. Plan Mode → Show Your Work

**What Claude Code does:**
- `plan` permission mode = read-only analysis, Claude shows plan before acting
- User reviews plan, approves, then execution starts
- EnterPlanMode / ExitPlanMode tools for the agent

**What we build:**
- "Plan before execute" toggle in composer (default ON for complex tasks)
- Agent shows task decomposition as editable DAG before running
- User can drag/reorder, delete nodes, change model assignments
- "Approve Plan" button starts execution
- Intermediate checkpoints: agent pauses at pre-defined gates, shows progress
- This is what Perplexity Computer also does — but we show it as an interactive graph

---

## 9. MCP → Already Ahead

**What Claude Code does:**
- HTTP (streamable) as recommended transport
- OAuth 2.0 auth for remote servers
- 3 scopes: local, project, user
- Tool Search for on-demand loading
- **Claude Code can itself serve as MCP server**
- MCP resources via @-mentions

**Our advantage:**
- Already support stdio + SSE + HTTP (Claude Code only recently added HTTP)
- Our connector plan covers 105+ services (Claude Code has no built-in connectors)
- **Bidirectional**: our desktop app can serve as MCP server to Claude Code users
- Add: Claude Code MCP server that exposes AGI Workforce tools to Claude Code → growth hack

---

## Implementation Priority

### P0 — Build These First (1-2 weeks)
1. **Usage dashboard** — wire TokenAnalyticsDashboard to real API cost data, add per-task estimates
2. **Skills YAML frontmatter** — add to all 140 employees, enable `/skill-name` slash routing
3. **5 permission modes** — implement in agent settings, Shift+Tab to cycle
4. **PreToolUse hooks** — port ToolGuard to hook-based pattern, expose in Settings UI

### P1 — Core Agent Intelligence (2-4 weeks)
5. **Plan mode** — task graph shown before execution, editable, approve button
6. **Memory system** — auto-write MEMORY.md per workspace, 200-line index
7. **DAG task system** — enhance core/swarm/ with blocks/blockedBy, file-locking → SQLite
8. **Workspace instructions** — per-workspace INSTRUCTIONS.md, loaded at session start

### P2 — Power Features (4-8 weeks)
9. **Worktree isolation** — git worktrees for parallel code agents
10. **Hook builder UI** — visual rule editor in Settings → Automation
11. **Task tree visualization** — live sub-agent execution graph in chat panel
12. **Mobile companion** — QR pairing + agent approval (Phase 6 of mobile plan)

### P3 — Platform (8+ weeks)
13. **AGI Workforce as MCP server** — expose our tools to Claude Code users
14. **/batch equivalent** — decompose into N parallel worktree workers automatically
15. **Slack integration** — @agi bot in Slack channels

---

## Our Competitive Position

```
Claude Code:    Agent power ✅ | Multi-model ❌ | GUI ❌ | Mobile ❌ | Local control ✅
Cursor:         Agent power ❌ | Multi-model ❌ | GUI ✅ | Mobile ❌ | Local control ✅
Devin:          Agent power ✅ | Multi-model ❌ | GUI ✅ | Mobile ❌ | Local control ❌
Perplexity:     Agent power ✅ | Multi-model ✅ | GUI ✅ | Mobile ❌ | Local control ❌

AGI Workforce:  Agent power ✅ | Multi-model ✅ | GUI ✅ | Mobile ✅ | Local control ✅
```

No competitor has all five. That's the moat.

---

*Files: 01-official-docs.md | 02-permissions-hooks.md | 03-agents-teams.md | 04-skills-memory.md | 05-community-competitive.md*
