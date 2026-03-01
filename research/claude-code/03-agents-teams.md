# Claude Code: Sub-Agents, Teams, and Parallel Execution Architecture

> Research report for AGI Workforce agent runtime design.
> Sources: Official Claude Code docs (code.claude.com), Claude Agent SDK docs (platform.claude.com), reverse-engineering analyses, community documentation.

---

## Table of Contents

1. [Agent Types](#1-agent-types)
2. [Task Tool (Agent Tool) Parameters](#2-task-tool-agent-tool-parameters)
3. [Subagent Configuration System](#3-subagent-configuration-system)
4. [Agent Teams Protocol](#4-agent-teams-protocol)
5. [Task Management System](#5-task-management-system)
6. [SendMessage / Communication Protocol](#6-sendmessage--communication-protocol)
7. [Session Resumption](#7-session-resumption)
8. [Worktree Isolation](#8-worktree-isolation)
9. [Background Execution](#9-background-execution)
10. [Tool Access by Agent Type](#10-tool-access-by-agent-type)
11. [Claude Agent SDK](#11-claude-agent-sdk)
12. [File System Architecture](#12-file-system-architecture)
13. [Implications for AGI Workforce](#13-implications-for-agi-workforce)

---

## 1. Agent Types

Claude Code provides several built-in agent types plus a system for defining custom agents.

### Built-in Agent Types

| Agent Type | Model | Tools | Purpose | Notes |
|---|---|---|---|---|
| **Explore** | Haiku (fast) | Read-only (no Write, Edit, NotebookEdit, Task) | File discovery, code search, codebase exploration | Supports thoroughness levels: `quick`, `medium`, `very thorough` |
| **Plan** | Inherits from parent | Read-only (no Write, Edit) | Codebase research for planning | Used in plan mode; cannot spawn sub-subagents |
| **general-purpose** | Inherits from parent | All tools | Complex research, multi-step operations, code modifications | Default for complex tasks requiring both read and write |
| **Bash** | Inherits | Bash only | Running terminal commands in separate context | Automatically invoked for shell operations |
| **statusline-setup** | Sonnet | Read, Edit | Status line configuration | Invoked via `/statusline` command |
| **Claude Code Guide** | Haiku | Read-only | Answering questions about Claude Code features | Documentation-backed Q&A |

### Custom Agent Types

Users can define custom agents as Markdown files with YAML frontmatter. These are stored at:

- **Session scope**: `--agents` CLI flag (JSON, highest priority)
- **Project scope**: `.claude/agents/` (priority 2)
- **User scope**: `~/.claude/agents/` (priority 3)
- **Plugin scope**: Plugin's `agents/` directory (priority 4, lowest)

When multiple agents share the same name, higher-priority location wins.

### Key Constraint

**Subagents cannot spawn other subagents.** This prevents infinite nesting. If nested delegation is needed, use Skills or chain subagents from the main conversation.

---

## 2. Task Tool (Agent Tool) Parameters

> Note: In version 2.1.63, the `Task` tool was renamed to `Agent`. Existing `Task(...)` references still work as aliases.

The Task/Agent tool is the primary mechanism for spawning subagents.

### Core Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `subagent_type` | string | No | Which agent type to invoke (`Explore`, `Plan`, `general-purpose`, or custom agent name) |
| `description` | string | Yes | What the subagent should accomplish |
| `prompt` | string | Yes | Detailed instructions for the subagent |
| `model` | string | No | Model override: `sonnet`, `opus`, `haiku`, or `inherit` |
| `run_in_background` | boolean | No | Whether to run as background task (default: false) |
| `team_name` | string | No | Team to associate with (for teammate spawning) |
| `name` | string | No | Agent name within team (for teammate spawning) |

### Spawning Methods

**Method 1: Subagent (short-lived)**
```
Task({
  subagent_type: "Explore",
  description: "Find all API endpoints",
  prompt: "Search the codebase for route definitions..."
})
```
Runs until completion, returns result directly. No team membership needed.

**Method 2: Teammate (persistent, team-bound)**
```
// First create team
Teammate({ operation: "spawnTeam", team_name: "my-project" })

// Then spawn teammate
Task({
  team_name: "my-project",
  name: "worker-1",
  subagent_type: "general-purpose",
  prompt: "...",
  run_in_background: true
})
```
Joins team, accesses shared task list, communicates via inbox, persists until shutdown.

### Agent Tool Restriction Syntax

When an agent runs as the main thread with `claude --agent`, you can restrict which subagent types it can spawn:

```yaml
# Allow only specific subagents
tools: Agent(worker, researcher), Read, Bash

# Allow any subagent
tools: Agent, Read, Bash

# No Agent = cannot spawn subagents at all
tools: Read, Bash
```

---

## 3. Subagent Configuration System

### Frontmatter Fields (Complete)

| Field | Required | Type | Description |
|---|---|---|---|
| `name` | Yes | string | Unique identifier (lowercase, hyphens) |
| `description` | Yes | string | When Claude should delegate to this subagent |
| `tools` | No | string[] | Tools the subagent can use (inherits all if omitted) |
| `disallowedTools` | No | string[] | Tools to deny (removed from inherited/specified list) |
| `model` | No | string | `sonnet`, `opus`, `haiku`, or `inherit` (default: `inherit`) |
| `permissionMode` | No | string | `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan` |
| `maxTurns` | No | number | Maximum agentic turns before stopping |
| `skills` | No | string[] | Skills to preload into context at startup |
| `mcpServers` | No | object | MCP servers available to this subagent |
| `hooks` | No | object | Lifecycle hooks scoped to this subagent |
| `memory` | No | string | Persistent memory scope: `user`, `project`, or `local` |
| `background` | No | boolean | Always run as background task (default: false) |
| `isolation` | No | string | Set to `worktree` for git worktree isolation |

### Permission Modes

| Mode | Behavior |
|---|---|
| `default` | Standard permission checking with prompts |
| `acceptEdits` | Auto-accept file edits |
| `dontAsk` | Auto-deny permission prompts (explicitly allowed tools still work) |
| `bypassPermissions` | Skip all permission checks (dangerous) |
| `plan` | Plan mode (read-only exploration) |

If the parent uses `bypassPermissions`, it takes precedence and cannot be overridden.

### Persistent Memory for Subagents

Memory directories by scope:

| Scope | Location | Use Case |
|---|---|---|
| `user` | `~/.claude/agent-memory/<agent-name>/` | Cross-project learnings (recommended default) |
| `project` | `.claude/agent-memory/<agent-name>/` | Project-specific, shareable via VCS |
| `local` | `.claude/agent-memory-local/<agent-name>/` | Project-specific, not checked in |

When memory is enabled:
- System prompt includes instructions for reading/writing to memory directory
- First 200 lines of `MEMORY.md` are injected into context
- Read, Write, Edit tools are auto-enabled for memory management

### CLI-Defined Subagents (Ephemeral)

```bash
claude --agents '{
  "code-reviewer": {
    "description": "Expert code reviewer. Use proactively after code changes.",
    "prompt": "You are a senior code reviewer...",
    "tools": ["Read", "Grep", "Glob", "Bash"],
    "model": "sonnet"
  }
}'
```

### Hooks in Subagent Frontmatter

```yaml
---
name: code-reviewer
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-command.sh"
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "./scripts/run-linter.sh"
---
```

Supported events in frontmatter: `PreToolUse`, `PostToolUse`, `Stop` (converted to `SubagentStop` at runtime).

Project-level hooks in `settings.json` support `SubagentStart` and `SubagentStop` events with matchers for specific agent types.

---

## 4. Agent Teams Protocol

### Overview

Agent teams coordinate multiple Claude Code instances. One session is the team lead, others are teammates. Each has its own independent context window. Communication is via file-based messaging protocol.

**Experimental feature**: Enable with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

### Architecture Components

| Component | Role |
|---|---|
| **Team lead** | Main session that creates team, spawns teammates, coordinates work |
| **Teammates** | Separate Claude Code instances working on assigned tasks |
| **Task list** | Shared list of work items (DAG with dependencies) |
| **Mailbox** | File-based messaging system for inter-agent communication |

### File System Layout

```
~/.claude/
  teams/{team-name}/
    config.json              # Team membership and metadata
    inboxes/
      team-lead.json         # Lead's inbox
      worker-1.json          # Worker's inbox
      worker-2.json          # Worker's inbox
  tasks/{team-name}/
    .lock                    # flock() for concurrent task claiming
    .highwatermark           # Next available task ID (integer)
    1.json                   # Individual task files
    2.json
    3.json
```

### Team Config Format

```json
{
  "name": "my-project",
  "description": "Feature authentication team",
  "leadAgentId": "team-lead@my-project",
  "createdAt": 1706000000000,
  "members": [
    {
      "agentId": "team-lead@my-project",
      "name": "team-lead",
      "agentType": "team-lead",
      "color": "#4A90D9",
      "joinedAt": 1706000000000,
      "backendType": "in-process"
    },
    {
      "agentId": "worker-1@my-project",
      "name": "worker-1",
      "agentType": "general-purpose",
      "color": "#50C878",
      "joinedAt": 1706000001000,
      "backendType": "in-process"
    }
  ]
}
```

### TeammateTool Operations

| Operation | Actor | Description |
|---|---|---|
| `spawnTeam` | Leader | Creates team, config, and task directory |
| `discoverTeams` | Any | Lists available teams |
| `requestJoin` | Agent | Request team membership |
| `approveJoin` | Leader | Accept join request |
| `rejectJoin` | Leader | Decline join request |
| `write` | Any | Send message to specific teammate |
| `broadcast` | Any | Send message to all teammates |
| `requestShutdown` | Leader | Ask teammate to exit gracefully |
| `approveShutdown` | Teammate | Accept shutdown request |
| `rejectShutdown` | Teammate | Decline shutdown with reason |
| `approvePlan` | Leader | Approve teammate's plan |
| `rejectPlan` | Leader | Reject plan with feedback |
| `cleanup` | Leader | Remove team resources (fails if teammates active) |

### Display Modes

| Mode | Description | Requirement |
|---|---|---|
| `in-process` | All teammates in main terminal; Shift+Down to cycle | Any terminal |
| `tmux` | Split panes per teammate | tmux installed |
| `iterm2` | iTerm2 split panes | iTerm2 + `it2` CLI |
| `auto` (default) | Tmux if in tmux session, in-process otherwise | - |

Configure via `teammateMode` in settings.json or `--teammate-mode` CLI flag.

### Spawn Backends

Teammates are spawned as separate `claude` CLI processes with environment variables:

```
CLAUDE_CODE_TEAM_NAME="my-project"
CLAUDE_CODE_AGENT_ID="worker-1@my-project"
CLAUDE_CODE_AGENT_NAME="worker-1"
CLAUDE_CODE_AGENT_TYPE="general-purpose"
CLAUDE_CODE_AGENT_COLOR="#4A90D9"
CLAUDE_CODE_PLAN_MODE_REQUIRED="false"
CLAUDE_CODE_PARENT_SESSION_ID="session-xyz"
```

### Permissions in Teams

- Teammates start with the lead's permission settings
- If lead runs with `--dangerously-skip-permissions`, all teammates do too
- Can change individual teammate modes after spawning
- Cannot set per-teammate modes at spawn time

### Limitations (Current)

- No session resumption with in-process teammates (`/resume` and `/rewind` don't restore them)
- Task status can lag (teammates sometimes fail to mark tasks complete)
- Shutdown can be slow (teammates finish current request first)
- One team per session
- No nested teams (teammates cannot spawn their own teams)
- Lead is fixed for team lifetime
- Permissions set at spawn
- Split panes require tmux or iTerm2

---

## 5. Task Management System

### Task Schema

```json
{
  "id": "1",
  "subject": "Implement authentication module",
  "description": "Detailed requirements...",
  "activeForm": "Implementing authentication module",
  "status": "pending",
  "owner": "",
  "blocks": ["3"],
  "blockedBy": ["2"],
  "metadata": {}
}
```

### Task States

```
pending --> in_progress --> completed
                       \-> deleted (permanent removal)
```

### Task Tools

#### TaskCreate

```
TaskCreate({
  subject: "Brief imperative title",
  description: "Detailed description with context",
  activeForm: "Present continuous form for spinner display"
})
```

All tasks created with status `pending` and no owner.

#### TaskUpdate

```
TaskUpdate({
  taskId: "1",
  status: "in_progress",         // or "completed", "deleted"
  owner: "worker-name",          // Claim the task
  subject: "New title",          // Optional: change title
  description: "New desc",       // Optional: change description
  activeForm: "New active form", // Optional: change spinner text
  addBlocks: ["3"],              // Tasks this blocks
  addBlockedBy: ["2"],           // Tasks blocking this
  metadata: { key: "value" }     // Arbitrary metadata
})
```

#### TaskList

```
TaskList()
```

Returns summary of all tasks: id, subject, status, owner, blockedBy.

#### TaskGet

```
TaskGet({ taskId: "1" })
```

Returns full task details including description, blocks, blockedBy.

### Task Dependencies (DAG)

- Tasks with non-empty `blockedBy` cannot be claimed until all blocking tasks reach terminal states
- When a blocking task is completed, dependent tasks are automatically unblocked
- Dependencies form a directed acyclic graph (DAG)
- Task claiming uses file locking (`.lock` file with `flock()`) for concurrent access

### Task Claiming Protocol

1. Teammate calls `TaskList()` to see available tasks
2. Looks for tasks with status `pending`, no owner, empty `blockedBy`
3. Prefers lowest-ID-first ordering
4. Claims via `TaskUpdate({ taskId, owner: "my-name", status: "in_progress" })`
5. File lock prevents race conditions on concurrent claims

### Shared Task Lists

Task lists can be shared across sessions:
```bash
CLAUDE_CODE_TASK_LIST_ID=my-project claude
```
This uses a named directory in `~/.claude/tasks/`.

### Quality Gates

- **TeammateIdle hook**: Fires when teammate prepares to idle; exit code 2 prevents idling and returns feedback
- **TaskCompleted hook**: Fires when task marked complete; exit code 2 blocks completion and returns feedback

---

## 6. SendMessage / Communication Protocol

### Message Types

| Type | Direction | Purpose |
|---|---|---|
| `message` | Any -> Specific teammate | Direct peer-to-peer communication |
| `broadcast` | Any -> All teammates | Team-wide announcement (expensive, use sparingly) |
| `shutdown_request` | Leader -> Teammate | Request graceful termination |
| `shutdown_response` | Teammate -> Leader | Approve or reject shutdown |
| `plan_approval_request` | Teammate -> Leader | Submit plan for review |
| `plan_approval_response` | Leader -> Teammate | Approve or reject plan |
| `idle_notification` | Teammate -> Leader | Auto-sent when work cycle ends |
| `task_completed` | Teammate -> Leader | Notification of task completion |
| `join_request` | Agent -> Leader | Request to join team |

### SendMessage Tool Parameters

```
SendMessage({
  type: "message",              // Required: message type
  recipient: "worker-1",        // Required for message, shutdown_request, plan_approval_response
  content: "message text",      // Message body
  summary: "5-10 word preview", // Required for message, broadcast (UI preview)
  request_id: "abc-123",        // Required for shutdown_response, plan_approval_response
  approve: true                 // Required for shutdown_response, plan_approval_response
})
```

### Inbox File Format

Each agent has an inbox at `inboxes/{agent-name}.json`:

```json
[
  {
    "from": "team-lead",
    "text": "{\"type\":\"task_assignment\",\"taskId\":\"1\",...}",
    "timestamp": "2026-02-18T02:37:16.890Z",
    "read": false
  }
]
```

The `text` field contains JSON-stringified message objects with an embedded `type` field.

### Delivery Mechanism

- **Write path**: Sender appends entry to recipient's inbox JSON array
- **Read path**: Recipient polls their inbox file; new messages inject as synthetic conversation turns
- **Broadcast scaling**: Writes to every teammate's inbox (N teammates = N messages)
- **Latency**: Depends on recipient's polling interval between work cycles
- **No background process**: Coordination emerges from shared file access

### Shutdown Protocol (Complete Sequence)

1. Leader calls `requestShutdown` for each teammate
2. Teammate receives shutdown request
3. Teammate responds with `approveShutdown` (exits) or `rejectShutdown` (continues with reason)
4. After all teammates shut down, leader calls `cleanup`
5. Cleanup removes `~/.claude/teams/{team-name}/` and `~/.claude/tasks/{team-name}/`
6. Cleanup fails if any teammates remain active

### Plan Approval Protocol

1. Teammate works in read-only plan mode (set via `CLAUDE_CODE_PLAN_MODE_REQUIRED`)
2. When plan is ready, teammate sends `plan_approval_request` to leader
3. Leader reviews plan
4. Leader sends `plan_approval_response` with `approve: true` or `approve: false, content: "feedback"`
5. If rejected: teammate stays in plan mode, revises, resubmits
6. If approved: teammate exits plan mode, begins implementation

---

## 7. Session Resumption

### CLI Resume

```bash
claude --continue              # Continue most recent conversation
claude --resume                # Open session picker
claude --resume session-name   # Resume specific named session
claude --from-pr 123           # Resume session linked to PR
```

### In-Session Resume

```
/resume                        # Open session picker
/resume session-name           # Resume specific session
/rename auth-refactor          # Name current session
```

### SDK Resume

```typescript
// First query - capture session ID
let sessionId: string;
for await (const message of query({ prompt: "Read auth module", options: { ... } })) {
  if (message.type === "system" && message.subtype === "init") {
    sessionId = message.session_id;
  }
}

// Resume with full context
for await (const message of query({
  prompt: "Now find all callers",
  options: { resume: sessionId }
})) { ... }
```

### Subagent Resume

Subagents can be resumed by their agent ID:

1. During first query, extract `agentId` from message content (appears in Task tool results)
2. Resume the same session with `resume: sessionId`
3. Reference the agent: `"Resume agent ${agentId} and continue the analysis"`

Subagent transcripts persist independently:
- Stored in `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`
- Unaffected by main conversation compaction
- Persist within their session
- Auto-cleaned after `cleanupPeriodDays` (default: 30 days)

### Session Picker Features

| Shortcut | Action |
|---|---|
| Up/Down | Navigate sessions |
| Right/Left | Expand/collapse grouped sessions |
| Enter | Resume selected |
| P | Preview session |
| R | Rename session |
| / | Search/filter |
| A | Toggle current dir / all projects |
| B | Filter by current git branch |

### Limitations

- `/resume` and `/rewind` do NOT restore in-process agent team teammates
- After resuming a team session, lead may try to message non-existent teammates
- Workaround: tell lead to spawn new teammates after resume

---

## 8. Worktree Isolation

### Purpose

Git worktrees give each Claude session its own isolated copy of the codebase so changes don't collide between parallel sessions.

### CLI Usage

```bash
# Named worktree
claude --worktree feature-auth
# Creates: <repo>/.claude/worktrees/feature-auth/
# Branch: worktree-feature-auth

# Auto-named worktree
claude --worktree
# Creates: <repo>/.claude/worktrees/<random-name>/

# Another session
claude --worktree bugfix-123
```

### In-Session Usage

Ask Claude to "work in a worktree" or "start a worktree" during a session.

### Subagent Worktrees

Configure in custom agent frontmatter:
```yaml
---
name: worker
isolation: worktree
---
```

Each subagent gets its own worktree, automatically cleaned up if no changes made.

### Worktree Cleanup

On session exit:
- **No changes**: Worktree and branch removed automatically
- **Changes exist**: Prompt to keep or remove
  - Keep: preserves directory and branch
  - Remove: deletes worktree directory and branch (all uncommitted changes lost)

### Non-Git VCS

Configure `WorktreeCreate` and `WorktreeRemove` hooks for custom VCS-agnostic isolation logic.

### Best Practice

Add `.claude/worktrees/` to `.gitignore`.

---

## 9. Background Execution

### Background Subagents

- Set `background: true` in agent frontmatter to always run as background
- Or ask Claude to "run this in the background"
- Or press `Ctrl+B` to background a running task (tmux users press twice)
- Background subagents auto-deny any permission prompts not pre-approved
- If a background subagent fails due to missing permissions, resume it in foreground

### Background Bash Commands

- Claude Code runs bash commands asynchronously, returns background task ID immediately
- Output buffered and retrievable via `TaskOutput` tool
- Background tasks have unique IDs for tracking
- Auto-cleaned when Claude Code exits

### Common Backgrounded Commands

- Build tools (webpack, vite, make)
- Package managers (npm, yarn, pnpm)
- Test runners (jest, pytest)
- Development servers
- Long-running processes (docker, terraform)

### Notification System

When background tasks need attention:
- `Notification` hook event fires when Claude is waiting for permission, idle, or completing auth
- Matchers: `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`
- Desktop notifications via `osascript` (macOS), `notify-send` (Linux), or PowerShell (Windows)

### Killing Background Agents

Press `Ctrl+F` to kill all background agents (press twice within 3 seconds to confirm).

### Disabling Background Tasks

```bash
export CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1
```

---

## 10. Tool Access by Agent Type

### Complete Internal Tool List

| Tool | Purpose |
|---|---|
| `Read` | Read file contents |
| `Write` | Create new files |
| `Edit` | Modify existing files |
| `Bash` | Execute shell commands |
| `Glob` | Find files by pattern |
| `Grep` | Search file contents with regex |
| `WebSearch` | Search the web |
| `WebFetch` | Fetch and parse web content |
| `Agent` (formerly `Task`) | Invoke subagents |
| `NotebookEdit` | Edit Jupyter notebooks |
| `AskUserQuestion` | Ask user clarifying questions |
| `TaskCreate` | Create task items |
| `TaskUpdate` | Update task status/details |
| `TaskList` | List all tasks |
| `TaskGet` | Get task details |
| `TaskOutput` | Read background task output |
| `SendMessage` | Send messages to teammates |
| `EnterWorktree` | Create git worktree isolation |
| `Skill` | Execute skills/slash commands |
| MCP tools | Dynamic, from connected MCP servers |

### Tool Access by Built-in Agent Type

| Agent Type | Tool Access |
|---|---|
| Explore | Read, Glob, Grep, Bash (read-only), WebSearch, WebFetch. **Denied**: Write, Edit, NotebookEdit, Task |
| Plan | Read, Glob, Grep, Bash (read-only), WebSearch, WebFetch. **Denied**: Write, Edit |
| general-purpose | All tools |
| Bash | Bash only |
| statusline-setup | Read, Edit |
| Claude Code Guide | Read-only tools |

### Common Tool Combinations for Custom Agents

| Use Case | Tools |
|---|---|
| Read-only analysis | Read, Grep, Glob |
| Test execution | Bash, Read, Grep |
| Code modification | Read, Edit, Write, Grep, Glob |
| Full access | All tools (omit tools field) |

---

## 11. Claude Agent SDK

### Overview

The Claude Code SDK was renamed to the **Claude Agent SDK**. It gives programmatic access to the same tools, agent loop, and context management that power Claude Code.

Available in **Python** (`pip install claude-agent-sdk`) and **TypeScript** (`npm install @anthropic-ai/claude-agent-sdk`).

### Basic Usage

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Find and fix the bug in auth.py",
  options: { allowedTools: ["Read", "Edit", "Bash"] }
})) {
  console.log(message);
}
```

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions

async def main():
    async for message in query(
        prompt="Find and fix the bug in auth.py",
        options=ClaudeAgentOptions(allowed_tools=["Read", "Edit", "Bash"]),
    ):
        print(message)

asyncio.run(main())
```

### Key SDK Capabilities

| Feature | Description |
|---|---|
| Built-in tools | Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, AskUserQuestion |
| Hooks | Callback functions for PreToolUse, PostToolUse, Stop, SessionStart, SessionEnd |
| Subagents | Define via `agents` parameter with AgentDefinition objects |
| MCP | Connect external tools via mcpServers config |
| Permissions | Control tool access with allowedTools and permissionMode |
| Sessions | Resume with session_id, fork sessions |
| Streaming | Real-time token streaming via stream-json output |
| Structured output | JSON schema output via `--json-schema` |

### AgentDefinition in SDK

```typescript
{
  "code-reviewer": {
    description: "Expert code review specialist",
    prompt: "You are a code review specialist...",
    tools: ["Read", "Grep", "Glob"],  // Restricted tools
    model: "sonnet"                    // Model override
  }
}
```

Fields: `description` (required), `prompt` (required), `tools` (optional), `model` (optional: `sonnet`/`opus`/`haiku`/`inherit`).

### Authentication

- **Anthropic API**: `ANTHROPIC_API_KEY` environment variable
- **Amazon Bedrock**: `CLAUDE_CODE_USE_BEDROCK=1` + AWS credentials
- **Google Vertex AI**: `CLAUDE_CODE_USE_VERTEX=1` + GCP credentials
- **Azure AI Foundry**: `CLAUDE_CODE_USE_FOUNDRY=1` + Azure credentials

### SDK vs Client SDK

The Client SDK requires you to implement the tool loop yourself. The Agent SDK handles it autonomously:

```python
# Client SDK: manual tool loop
response = client.messages.create(...)
while response.stop_reason == "tool_use":
    result = your_tool_executor(response.tool_use)
    response = client.messages.create(tool_result=result, **params)

# Agent SDK: autonomous tool execution
async for message in query(prompt="Fix the bug in auth.py"):
    print(message)
```

### SDK GitHub Repos

- TypeScript: `github.com/anthropics/claude-agent-sdk-typescript`
- Python: `github.com/anthropics/claude-agent-sdk-python`
- Demo agents: `github.com/anthropics/claude-agent-sdk-demos`

---

## 12. File System Architecture

### Complete Directory Structure

```
~/.claude/
  agents/                              # User-level custom agents
    code-reviewer.md
    debugger.md
  agent-memory/                        # User-scope agent persistent memory
    code-reviewer/
      MEMORY.md
  teams/{team-name}/                   # Agent team coordination
    config.json
    inboxes/
      team-lead.json
      worker-1.json
  tasks/{team-name}/                   # Shared task lists
    .lock
    .highwatermark
    1.json
    2.json
  projects/{project}/{sessionId}/      # Session transcripts
    subagents/
      agent-{agentId}.jsonl            # Subagent transcripts
  settings.json                        # User settings
  CLAUDE.md                            # User-level memory

<project>/
  .claude/
    agents/                            # Project-level custom agents
    agent-memory/                      # Project-scope agent memory
    agent-memory-local/                # Local-scope agent memory
    worktrees/                         # Git worktree isolation
      feature-auth/
      bugfix-123/
    settings.json                      # Project settings
    CLAUDE.md                          # Project-level memory
```

### Key Environment Variables

| Variable | Purpose |
|---|---|
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | Enable agent teams (set to `1`) |
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` | Disable all background task functionality |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | Context auto-compaction threshold (default ~95%) |
| `CLAUDE_CODE_TEAM_NAME` | Auto-set: team name for teammate |
| `CLAUDE_CODE_AGENT_ID` | Auto-set: agent ID within team |
| `CLAUDE_CODE_AGENT_NAME` | Auto-set: agent name within team |
| `CLAUDE_CODE_AGENT_TYPE` | Auto-set: agent type |
| `CLAUDE_CODE_AGENT_COLOR` | Auto-set: agent display color |
| `CLAUDE_CODE_PLAN_MODE_REQUIRED` | Auto-set: whether plan approval needed |
| `CLAUDE_CODE_PARENT_SESSION_ID` | Auto-set: parent session for teammates |
| `CLAUDE_CODE_SPAWN_BACKEND` | Force spawn backend (in-process/tmux/iterm2) |
| `CLAUDE_CODE_SUBAGENT_MODEL` | Override model for subagent calls |
| `CLAUDE_CODE_TASK_LIST_ID` | Named task list for cross-session sharing |
| `CLAUDE_CODE_ENABLE_TASKS` | Enable/disable task list (set false for legacy TODO) |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | Disable auto memory creation |

---

## 13. Implications for AGI Workforce

### Architecture Patterns to Adopt

1. **File-based coordination is elegant for desktop apps**: Claude Code's entire team coordination uses JSON files + file locking. No background daemon, no database. This is surprisingly robust and debuggable. For AGI Workforce's Tauri app, we could use a similar approach with the filesystem as coordination substrate, but enhanced with SQLite for durability.

2. **DAG-based task dependencies**: The `blocks`/`blockedBy` system creates a proper directed acyclic graph. Tasks auto-unblock when dependencies complete. We should implement this in our `core/swarm/task_decomposer.rs`.

3. **Agent type hierarchy**: Built-in types (Explore, Plan, general-purpose) + custom user-defined agents is the right pattern. Map to our skill system: 140 .md employee files already have system prompts, just need the frontmatter config format.

4. **Isolation via worktrees**: Subagent worktree isolation prevents file conflicts in parallel work. Our multi-agent executor should automatically create worktrees when agents edit files in parallel.

5. **Memory persistence per agent**: The `user`/`project`/`local` memory scopes let agents build institutional knowledge. Our skills should each have their own MEMORY.md that accumulates across conversations.

### Key Differences for Our Implementation

| Claude Code | AGI Workforce Equivalent |
|---|---|
| File-based JSON messaging | Tauri event system + SQLite persistence |
| CLI process spawning | Rust-managed agent threads with `core/agent/` |
| `flock()` file locking | SQLite transactions for task claiming |
| Separate context windows | LLM context management in `core/llm/llm_router.rs` |
| `settings.json` config | `data/settings/` store + UI configuration |
| Markdown agent definitions | `.agi/employees/` YAML+MD files (already have 140) |
| Agent SDK (Python/TS) | Our own SDK wrapping Tauri commands |

### Features to Build

1. **Agent spawn API**: Rust command that creates agent instances with isolated contexts, tool restrictions, and model selection
2. **Team coordination**: Implement the TeammateTool pattern with SQLite-backed messaging instead of JSON files
3. **Task DAG engine**: Port the blocks/blockedBy dependency system into `core/swarm/`
4. **Worktree manager**: Automatic git worktree creation/cleanup for parallel agent work
5. **Agent SDK**: TypeScript SDK for programmatic agent creation from our web app / extensions
6. **Quality gate hooks**: PreToolUse/PostToolUse/SubagentStart/SubagentStop event system
7. **Background agent dashboard**: Mobile app (QR pair) to monitor background agents, approve/deny actions

### Critical Design Decisions

- **No nested agents**: Claude Code prevents subagents from spawning sub-subagents. This avoids runaway recursion. We should enforce this too.
- **Pull-based messaging**: Recipients poll their inbox. Push would be better for our real-time Tauri app.
- **Permission inheritance**: Teammates inherit leader's permissions. We should allow per-agent permission profiles from the start.
- **One team per session**: Simplifies coordination. We should support multiple concurrent teams since our app persists across sessions.

---

## Sources

- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/agent-teams
- https://code.claude.com/docs/en/common-workflows
- https://code.claude.com/docs/en/interactive-mode
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/settings
- https://platform.claude.com/docs/en/agent-sdk/overview
- https://platform.claude.com/docs/en/agent-sdk/subagents
- https://nwyin.com/blogs/claude-code-agent-teams-reverse-engineered.html
- https://gist.github.com/kieranklaassen/4f2aba89594a4aea4ad64d753984b2ea
- https://github.com/Piebald-AI/claude-code-system-prompts
