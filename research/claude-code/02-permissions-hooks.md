# Claude Code: Permissions, Hooks, and Safety Architecture

> Deep research report for AGI Workforce implementation reference.
> Sources: Official Claude Code docs (code.claude.com), GitHub examples, community tutorials.
> Date: 2026-02-28

---

## Table of Contents

1. [Permission System Overview](#1-permission-system-overview)
2. [Permission Modes (5 Modes)](#2-permission-modes)
3. [Permission Rule Syntax & Evaluation](#3-permission-rule-syntax--evaluation)
4. [Tool-Specific Permission Rules](#4-tool-specific-permission-rules)
5. [Settings File Hierarchy & Layering](#5-settings-file-hierarchy--layering)
6. [Hooks Architecture Overview](#6-hooks-architecture-overview)
7. [All Hook Events (17 Events)](#7-all-hook-events)
8. [Hook Input/Output JSON Schema](#8-hook-inputoutput-json-schema)
9. [Hook Types (4 Types)](#9-hook-types)
10. [Decision Control Patterns](#10-decision-control-patterns)
11. [Real-World Hook Examples](#11-real-world-hook-examples)
12. [Sandboxing Integration](#12-sandboxing-integration)
13. [CLAUDE.md Security Rules](#13-claudemd-security-rules)
14. [Enterprise Managed Settings](#14-enterprise-managed-settings)
15. [Key Takeaways for AGI Workforce](#15-key-takeaways-for-agi-workforce)

---

## 1. Permission System Overview

Claude Code uses a **tiered permission system** to balance power and safety. Every tool call goes through a permission check before execution.

### Permission Tiers

| Tool Type         | Example          | Approval Required | "Yes, don't ask again" Behavior              |
|:------------------|:-----------------|:------------------|:----------------------------------------------|
| Read-only         | File reads, Grep | No                | N/A (always allowed)                          |
| Bash commands     | Shell execution  | Yes               | Permanently per project directory and command |
| File modification | Edit/write files | Yes               | Until session end only                        |

### Core Principles

- **Read-only by default**: Claude can read files without permission
- **Write access restricted**: Can only write to the folder where it was started and subfolders
- **Parent directory protection**: Cannot modify files in parent directories without explicit permission
- **Fail-closed matching**: Unmatched commands default to requiring manual approval
- **Command injection detection**: Suspicious bash commands require manual approval even if previously allowlisted
- **Shell operator awareness**: Claude Code understands `&&`, `||`, `;` etc. -- a prefix match rule like `Bash(safe-cmd *)` won't permit `safe-cmd && other-cmd`

### How Users Manage Permissions

- `/permissions` command: View and manage all tool permission rules, showing which settings.json file sourced each rule
- `Shift+Tab`: Cycle through permission modes during a session
- `/hooks` menu: Interactive hook management
- `/status`: See which settings sources are active and the origin of each setting

---

## 2. Permission Modes

Claude Code supports **5 permission modes** that control how tool execution is approved.

### 2.1 `default` (Standard Mode)

- **Behavior**: Prompts for permission on first use of each tool type
- **File edits**: Require confirmation each time
- **Bash commands**: Require confirmation; "Yes, don't ask again" permanently allows per project+command
- **Read operations**: No prompt needed
- **Use case**: Normal development, maximum safety

### 2.2 `acceptEdits`

- **Behavior**: Automatically accepts file edit permissions (Read + Write) for the session
- **File edits**: Auto-approved without prompting
- **Bash commands**: Still require confirmation (this is the key difference from bypassPermissions)
- **Use case**: Intensive refactoring sessions where repeated edit confirmations slow workflow
- **Note**: Equivalent to approving all Edit/Write tool calls automatically

### 2.3 `plan`

- **Behavior**: Claude can analyze but **cannot modify files or execute commands**
- **Read operations**: Allowed (can read files, grep, glob)
- **Write/Edit/Bash**: All blocked -- Claude presents a structured plan instead
- **Workflow**: Claude analyzes -> proposes plan -> waits for explicit user validation -> then user switches to another mode for execution
- **Permission escalation**: User must explicitly switch modes (e.g., to `acceptEdits` or `default`) to allow execution
- **Use case**: Code review, architecture planning, understanding codebases

### 2.4 `dontAsk`

- **Behavior**: Auto-denies tools unless pre-approved via `/permissions` or `permissions.allow` rules
- **Key distinction**: Does NOT auto-approve everything -- it auto-DENIES everything not explicitly allowed
- **Workflow**: User configures exact allow list, everything else is silently denied
- **Use case**: Locked-down environments where only specific, pre-approved operations are permitted

### 2.5 `bypassPermissions`

- **Behavior**: Disables ALL permission checks -- no prompts whatsoever
- **Activation**: Requires `--dangerously-skip-permissions` CLI flag
- **File edits**: Auto-approved
- **Bash commands**: Auto-approved
- **Network requests**: Auto-approved
- **CRITICAL WARNING**: Only use in isolated environments (containers, VMs, CI/CD)
- **Enterprise control**: Admins can disable this mode entirely with `disableBypassPermissionsMode: "disable"` in managed settings
- **Use case**: Automated pipelines, CI/CD, sandboxed containers

### Configuration

```json
{
  "permissions": {
    "defaultMode": "acceptEdits"
  }
}
```

To disable bypass mode enterprise-wide:
```json
{
  "disableBypassPermissionsMode": "disable"
}
```

---

## 3. Permission Rule Syntax & Evaluation

### Rule Format

Rules follow the pattern `Tool` or `Tool(specifier)`:

| Rule                           | Effect                                              |
|:-------------------------------|:----------------------------------------------------|
| `Bash`                         | Matches ALL Bash commands                           |
| `Bash(npm run *)`              | Matches commands starting with `npm run`            |
| `Bash(npm run build)`          | Matches exact command `npm run build`               |
| `Read(./.env)`                 | Matches reading `.env` in current directory         |
| `WebFetch(domain:example.com)` | Matches fetch requests to example.com               |
| `Edit(src/**/*.ts)`            | Matches editing TypeScript files in src recursively |
| `mcp__puppeteer__*`            | Matches all tools from puppeteer MCP server         |
| `Agent(Explore)`               | Matches the Explore subagent                        |

### Wildcard Behavior

- `*` matches any single path segment (or command arguments)
- `**` matches multiple path segments recursively
- Space before `*` matters: `Bash(ls *)` matches `ls -la` but NOT `lsof`; `Bash(ls*)` matches both
- Wildcards support glob-style patterns

### Three Rule Categories

```json
{
  "permissions": {
    "allow": ["Bash(npm run lint)", "Read(src/**)"],
    "ask": ["Bash(git push *)"],
    "deny": ["Bash(curl *)", "Read(./.env)", "WebFetch"]
  }
}
```

- **allow**: Claude uses the tool without manual approval
- **ask**: Confirmation prompt shown to user
- **deny**: Tool use is prevented entirely

### Evaluation Order (CRITICAL)

1. **Deny rules first** -- explicit denials always take precedence
2. **Ask rules second** -- confirmation-required operations
3. **Allow rules third** -- auto-approved operations
4. **First match wins** -- evaluation stops at the first matching rule

This means: if a tool matches both an `allow` and a `deny` rule, the **deny** wins.

---

## 4. Tool-Specific Permission Rules

### Bash

```json
{
  "permissions": {
    "allow": ["Bash(npm run *)", "Bash(git diff *)", "Bash(git commit *)"],
    "deny": ["Bash(curl *)", "Bash(rm -rf *)"]
  }
}
```

**Limitations of Bash patterns**:
- Cannot distinguish command intent (e.g., `npm run` could execute any script)
- Patterns that try to constrain arguments are fragile (e.g., `Bash(curl http://github.com/ *)` won't catch reordered options, redirects, variable expansion, etc.)
- For URL filtering, use `WebFetch(domain:...)` rules instead + deny `curl`/`wget` in Bash
- Or use PreToolUse hooks for runtime validation

### Read and Edit

Follow the **gitignore specification** with four path types:

| Pattern     | Meaning                    | Example                          |
|:------------|:---------------------------|:---------------------------------|
| `//path`    | Absolute filesystem root   | `Read(//Users/alice/secrets/**)` |
| `~/path`    | Home directory relative    | `Read(~/Documents/*.pdf)`        |
| `/path`     | Project root relative      | `Edit(/src/**/*.ts)`             |
| `path`      | Current directory relative | `Read(*.env)`                    |

**Important**: `/Users/alice/file` is NOT absolute -- it's relative to project root. Use `//Users/alice/file` for absolute.

### WebFetch

```json
{
  "permissions": {
    "allow": ["WebFetch(domain:github.com)", "WebFetch(domain:*.npmjs.org)"],
    "deny": ["WebFetch"]
  }
}
```

### MCP Tools

MCP tools use naming pattern `mcp__<server>__<tool>`:

```json
{
  "permissions": {
    "allow": ["mcp__puppeteer__puppeteer_navigate"],
    "deny": ["mcp__filesystem"]
  }
}
```

- `mcp__puppeteer` matches all tools from the puppeteer server
- `mcp__puppeteer__*` wildcard syntax, same effect
- `mcp__puppeteer__puppeteer_navigate` matches one specific tool

### Agent (Subagents)

```json
{
  "permissions": {
    "deny": ["Agent(Explore)"]
  }
}
```

---

## 5. Settings File Hierarchy & Layering

### Configuration Scopes (Highest to Lowest Priority)

| Priority | Scope           | Location                                                       | Shareable        |
|:---------|:----------------|:---------------------------------------------------------------|:-----------------|
| 1        | Managed         | MDM/registry/`managed-settings.json` (see locations below)     | IT-deployed      |
| 2        | CLI arguments   | `--model`, `--dangerously-skip-permissions`, etc.              | No               |
| 3        | Local project   | `.claude/settings.local.json`                                  | No (gitignored)  |
| 4        | Shared project  | `.claude/settings.json`                                        | Yes (committed)  |
| 5        | User            | `~/.claude/settings.json`                                      | No               |

### Managed Settings File Locations

| Platform   | Location                                                        |
|:-----------|:----------------------------------------------------------------|
| macOS      | `/Library/Application Support/ClaudeCode/managed-settings.json` |
| macOS MDM  | `com.anthropic.claudecode` plist domain                         |
| Linux/WSL  | `/etc/claude-code/managed-settings.json`                        |
| Windows    | `C:\Program Files\ClaudeCode\managed-settings.json`             |
| Win Registry | `HKLM\SOFTWARE\Policies\ClaudeCode`                           |

### Array Merge Behavior

When the same array-valued setting appears in multiple scopes, arrays are **concatenated and deduplicated** (not replaced):

```json
// Managed: { "sandbox.filesystem.allowWrite": ["//opt/company-tools"] }
// User:    { "sandbox.filesystem.allowWrite": ["~/.kube"] }
// Result:  ["//opt/company-tools", "~/.kube"]
```

### Key Implication

If a permission is **allowed** in user settings but **denied** in project settings, the project setting (higher priority) wins and the permission is blocked. Managed settings ALWAYS win over everything.

---

## 6. Hooks Architecture Overview

Hooks are **user-defined shell commands, HTTP endpoints, or LLM prompts** that execute automatically at specific points in Claude Code's lifecycle. They provide **deterministic control** over agent behavior.

### Core Design Principles

1. **Lifecycle-based**: Hooks fire at specific points (before tool use, after tool use, session start/end, etc.)
2. **Matcher filtering**: Each hook has a regex matcher to fire only on specific tools/events
3. **JSON I/O**: Input via stdin (command) or POST body (HTTP); output via stdout/exit codes
4. **Parallel execution**: All matching hooks for an event run in parallel
5. **Deduplication**: Identical hook commands/URLs are automatically deduplicated
6. **Snapshot safety**: Hooks are snapshotted at startup -- mid-session file edits don't take effect without review

### Four Hook Types

| Type      | Description                                      | Default Timeout |
|:----------|:-------------------------------------------------|:----------------|
| `command` | Run a shell command                              | 600s (10 min)   |
| `http`    | POST to an HTTP endpoint                         | 30s             |
| `prompt`  | Single-turn LLM evaluation (Haiku by default)    | 30s             |
| `agent`   | Multi-turn subagent with tool access             | 60s             |

### Configuration Structure (3 Levels)

```json
{
  "hooks": {
    "PreToolUse": [           // 1. Hook event
      {
        "matcher": "Bash",    // 2. Matcher group (regex filter)
        "hooks": [            // 3. Hook handlers (run when matched)
          {
            "type": "command",
            "command": ".claude/hooks/validate-bash.sh"
          }
        ]
      }
    ]
  }
}
```

### Hook Locations (Scope)

| Location                             | Scope                    | Shareable                   |
|:-------------------------------------|:-------------------------|:----------------------------|
| `~/.claude/settings.json`            | All your projects        | No                          |
| `.claude/settings.json`              | Single project           | Yes (git committed)         |
| `.claude/settings.local.json`        | Single project           | No (gitignored)             |
| Managed policy settings              | Organization-wide        | Admin-controlled            |
| Plugin `hooks/hooks.json`            | When plugin is enabled   | Bundled with plugin         |
| Skill/agent frontmatter              | While component is active| Defined in component file   |

---

## 7. All Hook Events

Claude Code has **17 hook events** organized across the session lifecycle:

### Session Lifecycle Events

| Event             | When It Fires                                    | Can Block? | Matcher Values                                                      |
|:------------------|:-------------------------------------------------|:-----------|:--------------------------------------------------------------------|
| `SessionStart`    | Session begins or resumes                        | No         | `startup`, `resume`, `clear`, `compact`                             |
| `SessionEnd`      | Session terminates                               | No         | `clear`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other` |

### User Interaction Events

| Event               | When It Fires                                  | Can Block? | Matcher     |
|:---------------------|:----------------------------------------------|:-----------|:------------|
| `UserPromptSubmit`   | User submits a prompt, before Claude processes | Yes        | No matcher  |

### Tool Execution Events (The Core Loop)

| Event                | When It Fires                                    | Can Block? | Matcher Values                    |
|:---------------------|:-------------------------------------------------|:-----------|:----------------------------------|
| `PreToolUse`         | Before tool call executes                        | Yes        | Tool name: `Bash`, `Edit\|Write`, `mcp__.*` |
| `PermissionRequest`  | When permission dialog appears                   | Yes        | Tool name (same as PreToolUse)    |
| `PostToolUse`        | After tool call succeeds                         | No*        | Tool name                         |
| `PostToolUseFailure` | After tool call fails                            | No         | Tool name                         |

*PostToolUse cannot undo actions (tool already ran), but can provide feedback to Claude via `decision: "block"`.

### Agent/Team Events

| Event             | When It Fires                                    | Can Block? | Matcher Values                          |
|:------------------|:-------------------------------------------------|:-----------|:----------------------------------------|
| `SubagentStart`   | Subagent is spawned                              | No         | Agent type: `Bash`, `Explore`, `Plan`, custom |
| `SubagentStop`    | Subagent finishes                                | Yes        | Agent type (same as SubagentStart)      |
| `TeammateIdle`    | Agent team teammate about to go idle             | Yes        | No matcher                              |
| `TaskCompleted`   | Task being marked as completed                   | Yes        | No matcher                              |
| `Stop`            | Main agent finishes responding                   | Yes        | No matcher                              |

### Infrastructure Events

| Event             | When It Fires                                    | Can Block? | Matcher Values                                          |
|:------------------|:-------------------------------------------------|:-----------|:--------------------------------------------------------|
| `Notification`    | Claude Code sends a notification                 | No         | `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog` |
| `ConfigChange`    | Configuration file changes during session        | Yes*       | `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills` |
| `PreCompact`      | Before context compaction                        | No         | `manual`, `auto`                                        |
| `WorktreeCreate`  | Worktree being created                           | Yes        | No matcher                                              |
| `WorktreeRemove`  | Worktree being removed                           | No         | No matcher                                              |

*ConfigChange can block all sources except `policy_settings` (enterprise managed settings always take effect).

---

## 8. Hook Input/Output JSON Schema

### Common Input Fields (All Events)

Every hook receives these fields as JSON on stdin (command hooks) or POST body (HTTP hooks):

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../transcript.jsonl",
  "cwd": "/Users/user/my-project",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse"
}
```

| Field             | Description                                        |
|:------------------|:---------------------------------------------------|
| `session_id`      | Unique session identifier                          |
| `transcript_path` | Path to conversation JSON file                     |
| `cwd`             | Working directory when hook was invoked            |
| `permission_mode` | Current mode: `default`, `plan`, `acceptEdits`, `dontAsk`, `bypassPermissions` |
| `hook_event_name` | Which event triggered this hook                    |

### Event-Specific Input Fields

#### PreToolUse / PostToolUse / PermissionRequest

```json
{
  "tool_name": "Bash",
  "tool_input": {
    "command": "npm test",
    "description": "Run test suite",
    "timeout": 120000,
    "run_in_background": false
  },
  "tool_use_id": "toolu_01ABC123..."
}
```

Tool input varies by tool:
- **Bash**: `command`, `description`, `timeout`, `run_in_background`
- **Write**: `file_path`, `content`
- **Edit**: `file_path`, `old_string`, `new_string`, `replace_all`
- **Read**: `file_path`, `offset`, `limit`
- **Glob**: `pattern`, `path`
- **Grep**: `pattern`, `path`, `glob`, `output_mode`, `-i`, `multiline`
- **WebFetch**: `url`, `prompt`
- **WebSearch**: `query`, `allowed_domains`, `blocked_domains`
- **Agent**: `prompt`, `description`, `subagent_type`, `model`

PostToolUse additionally includes `tool_response` with the tool's output.

#### SessionStart

```json
{
  "source": "startup",  // startup | resume | clear | compact
  "model": "claude-sonnet-4-6",
  "agent_type": "custom-agent"  // optional, when using --agent
}
```

#### UserPromptSubmit

```json
{
  "prompt": "Write a function to calculate factorial"
}
```

#### Stop / SubagentStop

```json
{
  "stop_hook_active": true,  // true if already continuing from a stop hook
  "last_assistant_message": "I've completed the refactoring..."
}
```

SubagentStop adds: `agent_id`, `agent_type`, `agent_transcript_path`

#### TeammateIdle

```json
{
  "teammate_name": "researcher",
  "team_name": "my-project"
}
```

#### TaskCompleted

```json
{
  "task_id": "task-001",
  "task_subject": "Implement user authentication",
  "task_description": "Add login and signup endpoints",
  "teammate_name": "implementer",
  "team_name": "my-project"
}
```

#### Notification

```json
{
  "message": "Claude needs your permission to use Bash",
  "title": "Permission needed",
  "notification_type": "permission_prompt"
}
```

#### ConfigChange

```json
{
  "source": "project_settings",
  "file_path": "/Users/.../my-project/.claude/settings.json"
}
```

#### PreCompact

```json
{
  "trigger": "manual",  // manual | auto
  "custom_instructions": ""
}
```

#### WorktreeCreate / WorktreeRemove

```json
// WorktreeCreate
{ "name": "feature-auth" }

// WorktreeRemove
{ "worktree_path": "/Users/.../worktrees/feature-auth" }
```

### Exit Code Output

| Exit Code | Meaning              | Behavior                                              |
|:----------|:---------------------|:------------------------------------------------------|
| `0`       | Success              | Action proceeds. Stdout parsed for JSON output        |
| `2`       | Blocking error       | Action blocked. Stderr fed to Claude as feedback      |
| Other     | Non-blocking error   | Action proceeds. Stderr shown in verbose mode only    |

**Critical**: JSON output is ONLY processed on exit 0. If you exit 2, any JSON is ignored -- only stderr matters.

### Structured JSON Output (Exit 0)

Universal fields available to all events:

```json
{
  "continue": true,          // false = Claude stops entirely
  "stopReason": "msg",       // shown to user when continue=false
  "suppressOutput": false,   // hide stdout from verbose mode
  "systemMessage": "warning" // warning shown to user
}
```

---

## 9. Hook Types

### 9.1 Command Hooks (`type: "command"`)

Standard shell command execution. Most common type.

```json
{
  "type": "command",
  "command": ".claude/hooks/validate-bash.sh",
  "timeout": 600,
  "async": false
}
```

- Input via stdin, output via stdout/stderr/exit codes
- `async: true` runs in background without blocking
- Use `$CLAUDE_PROJECT_DIR` for project-relative paths
- Use `${CLAUDE_PLUGIN_ROOT}` for plugin-relative paths
- `$CLAUDE_CODE_REMOTE` is `"true"` in remote web environments

### 9.2 HTTP Hooks (`type: "http"`)

POST event data to an HTTP endpoint.

```json
{
  "type": "http",
  "url": "http://localhost:8080/hooks/pre-tool-use",
  "headers": {
    "Authorization": "Bearer $MY_TOKEN"
  },
  "allowedEnvVars": ["MY_TOKEN"],
  "timeout": 30
}
```

- Same JSON input as command hooks, sent as POST body
- Same JSON output format in response body
- Header values support `$VAR_NAME` interpolation (only for listed `allowedEnvVars`)
- Non-2xx, connection failures, timeouts = non-blocking errors
- To block: return 2xx with `decision: "block"` in JSON body
- **Must be configured by editing settings JSON directly** (not through `/hooks` menu)

### 9.3 Prompt Hooks (`type: "prompt"`)

Single-turn LLM evaluation for judgment-based decisions.

```json
{
  "type": "prompt",
  "prompt": "Check if all tasks are complete. Return {\"ok\": false, \"reason\": \"what remains\"} if not.",
  "model": "haiku",
  "timeout": 30
}
```

- Uses Claude Haiku by default (fast, cheap)
- Model returns `{ "ok": true }` or `{ "ok": false, "reason": "..." }`
- If `ok: false`, the reason is fed back to Claude as instruction
- Use `$ARGUMENTS` placeholder in prompt for hook input JSON

### 9.4 Agent Hooks (`type: "agent"`)

Multi-turn subagent with tool access for complex verification.

```json
{
  "type": "agent",
  "prompt": "Verify that all unit tests pass. Run the test suite. $ARGUMENTS",
  "timeout": 120
}
```

- Spawns a subagent that can Read, Grep, Glob, and use other tools
- Same `ok`/`reason` response format as prompt hooks
- Default timeout 60s, up to 50 tool-use turns
- Use when verification requires inspecting actual codebase state

---

## 10. Decision Control Patterns

### Pattern Summary Table

| Events                                                              | Decision Pattern       | Key Fields                                                       |
|:--------------------------------------------------------------------|:-----------------------|:-----------------------------------------------------------------|
| PreToolUse                                                          | `hookSpecificOutput`   | `permissionDecision` (allow/deny/ask), `permissionDecisionReason`, `updatedInput`, `additionalContext` |
| PermissionRequest                                                   | `hookSpecificOutput`   | `decision.behavior` (allow/deny), `updatedInput`, `updatedPermissions`, `message`, `interrupt` |
| UserPromptSubmit, PostToolUse, PostToolUseFailure, Stop, SubagentStop, ConfigChange | Top-level `decision`   | `decision: "block"`, `reason`                                    |
| TeammateIdle, TaskCompleted                                         | Exit code only         | Exit 2 blocks; stderr is feedback                                |
| WorktreeCreate                                                      | stdout path            | Print absolute path; non-zero exit fails                         |
| WorktreeRemove, Notification, SessionEnd, PreCompact                | None                   | Side effects only (logging, cleanup)                             |

### PreToolUse Decision Control (Most Important)

Three possible decisions:

```json
// ALLOW - bypass permission system entirely
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Pre-approved by security hook"
  }
}

// DENY - prevent tool call, reason shown to Claude
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Database writes are not allowed"
  }
}

// ASK - show normal permission prompt to user
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "ask",
    "permissionDecisionReason": "This command modifies system files"
  }
}
```

### Input Transformation (PreToolUse)

Starting in v2.0.10, PreToolUse hooks can **modify tool inputs** before execution:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "file_path": "/sandbox/path/to/file.txt"
    }
  }
}
```

This intercepts the tool call, modifies the parameters, and lets execution proceed with corrected values. Use cases: sandboxing file paths, rewriting commands, adding flags.

### PermissionRequest Decision Control

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow",
      "updatedInput": { "command": "npm run lint" },
      "updatedPermissions": [
        { "type": "toolAlwaysAllow", "tool": "Bash(npm run lint)" }
      ]
    }
  }
}
```

- `behavior`: `"allow"` or `"deny"`
- `updatedInput`: Modify tool input (allow only)
- `updatedPermissions`: Apply permission rules so user isn't prompted again (allow only)
- `message`: Tell Claude why denied (deny only)
- `interrupt`: Stop Claude entirely (deny only)

### Stop/SubagentStop Decision Control

```json
{
  "decision": "block",
  "reason": "Must run tests before completing"
}
```

**Infinite loop prevention**: Check `stop_hook_active` field:

```bash
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0  # Allow Claude to stop on second pass
fi
# ... verification logic
```

---

## 11. Real-World Hook Examples

### 11.1 Block Destructive Commands (PreToolUse)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/block-rm.sh"
          }
        ]
      }
    ]
  }
}
```

**block-rm.sh**:
```bash
#!/bin/bash
COMMAND=$(jq -r '.tool_input.command')

if echo "$COMMAND" | grep -q 'rm -rf'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Destructive command blocked by hook"
    }
  }'
else
  exit 0
fi
```

### 11.2 Auto-Format Code After Edits (PostToolUse)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write"
          }
        ]
      }
    ]
  }
}
```

### 11.3 Block Edits to Protected Files (PreToolUse)

**protect-files.sh**:
```bash
#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

PROTECTED_PATTERNS=(".env" "package-lock.json" ".git/")

for pattern in "${PROTECTED_PATTERNS[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    echo "Blocked: $FILE_PATH matches protected pattern '$pattern'" >&2
    exit 2
  fi
done
exit 0
```

### 11.4 Desktop Notification on Permission Prompt (Notification)

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude Code needs your attention\" with title \"Claude Code\"'"
          }
        ]
      }
    ]
  }
}
```

### 11.5 Re-inject Context After Compaction (SessionStart)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Reminder: use Bun, not npm. Run bun test before committing. Current sprint: auth refactor.'"
          }
        ]
      }
    ]
  }
}
```

### 11.6 Audit Configuration Changes (ConfigChange)

```json
{
  "hooks": {
    "ConfigChange": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '{timestamp: now | todate, source: .source, file: .file_path}' >> ~/claude-config-audit.log"
          }
        ]
      }
    ]
  }
}
```

### 11.7 Log Every Bash Command (PostToolUse)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.command' >> ~/.claude/command-log.txt"
          }
        ]
      }
    ]
  }
}
```

### 11.8 LLM-Based Task Completion Check (Stop)

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Check if all tasks are complete. If not, respond with {\"ok\": false, \"reason\": \"what remains to be done\"}."
          }
        ]
      }
    ]
  }
}
```

### 11.9 Agent-Based Test Verification (Stop)

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "agent",
            "prompt": "Verify that all unit tests pass. Run the test suite and check the results. $ARGUMENTS",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

### 11.10 Validate MCP Tool Writes (PreToolUse)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__.*__write.*",
        "hooks": [
          {
            "type": "command",
            "command": "/home/user/scripts/validate-mcp-write.py"
          }
        ]
      }
    ]
  }
}
```

### 11.11 Quality Gate for Teammates (TeammateIdle)

```bash
#!/bin/bash
if [ ! -f "./dist/output.js" ]; then
  echo "Build artifact missing. Run the build before stopping." >&2
  exit 2
fi
exit 0
```

### 11.12 Persist Environment Variables (SessionStart)

```bash
#!/bin/bash
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo 'export NODE_ENV=production' >> "$CLAUDE_ENV_FILE"
  echo 'export DEBUG_LOG=true' >> "$CLAUDE_ENV_FILE"
fi
exit 0
```

### 11.13 Path Rewriting / Sandboxing (PreToolUse)

Intercept Write tool calls and redirect to sandbox directory:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "file_path": "/sandbox/path/to/file.txt"
    }
  }
}
```

---

## 12. Sandboxing Integration

Sandboxing and permissions are **complementary security layers**:

### How They Relate

- **Permissions**: Control which tools Claude can use. Apply to ALL tools (Bash, Read, Edit, WebFetch, MCP, etc.)
- **Sandboxing**: OS-level enforcement restricting Bash commands' filesystem and network access. Only applies to Bash and child processes

### Sandbox Modes

1. **Auto-allow mode**: Sandboxed bash commands auto-approved; non-sandboxable commands fall back to permission flow
2. **Regular permissions mode**: All bash commands go through standard permission flow even when sandboxed

### Sandbox Configuration

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "excludedCommands": ["docker", "git"],
    "allowUnsandboxedCommands": true,
    "filesystem": {
      "allowWrite": ["//tmp/build", "~/.kube"],
      "denyWrite": ["//etc", "//usr/local/bin"],
      "denyRead": ["~/.aws/credentials"]
    },
    "network": {
      "allowedDomains": ["github.com", "*.npmjs.org"],
      "allowUnixSockets": ["~/.ssh/agent-socket"],
      "allowLocalBinding": true,
      "allowManagedDomainsOnly": false
    }
  }
}
```

### OS-Level Enforcement

- **macOS**: Seatbelt (built-in, works out of box)
- **Linux/WSL2**: bubblewrap + socat (must install)
- **All child processes** inherit the same sandbox restrictions

### Defense in Depth

- Permission deny rules block Claude from even attempting access
- Sandbox restrictions prevent Bash commands from reaching resources outside boundaries, even if prompt injection bypasses Claude's decision-making
- Filesystem restrictions in sandbox use Read and Edit deny rules
- Network restrictions combine WebFetch permission rules with sandbox's `allowedDomains`

---

## 13. CLAUDE.md Security Rules

CLAUDE.md files serve as project-level instruction files that Claude loads into context. They can contain security rules that Claude follows.

### How CLAUDE.md Works for Security

- Loaded automatically at session start
- Can contain rules like "never modify files in /production/"
- Claude treats these as high-priority instructions
- Not enforceable at OS level -- relies on Claude following instructions
- For hard enforcement, use permission rules + hooks + sandboxing instead

### Best Practices for CLAUDE.md Security

```markdown
# Security Rules
- NEVER hardcode API keys, secrets, or credentials
- All secrets go through SecretManager
- Validate all user input before processing
- Sanitize data before rendering in UI (XSS prevention)
- No eval(), no dynamic code execution from user input
- Do NOT modify Rust/Tauri files directly
```

### Trust Hierarchy

1. **Managed settings** (IT-enforced, OS-level) -- highest trust
2. **Permission rules** (deny/ask/allow) -- enforced by tool
3. **Sandbox** (OS-level enforcement) -- enforced by OS
4. **Hooks** (programmable enforcement) -- enforced by scripts
5. **CLAUDE.md** (instruction-based) -- relies on LLM compliance
6. **Prompt instructions** -- lowest trust, easily overridden

---

## 14. Enterprise Managed Settings

### Managed-Only Settings (Cannot Be Overridden)

| Setting                              | Purpose                                              |
|:-------------------------------------|:-----------------------------------------------------|
| `allowManagedHooksOnly`              | Block user/project/plugin hooks; only managed hooks  |
| `allowManagedPermissionRulesOnly`    | Block user/project permission rules; only managed    |
| `allowManagedMcpServersOnly`         | Only allowlisted MCP servers from managed settings   |
| `allowedMcpServers`                  | Allowlist of MCP servers users can configure         |
| `deniedMcpServers`                   | Blocklist of blocked MCP servers                     |
| `disableBypassPermissionsMode`       | Prevent `--dangerously-skip-permissions` flag        |
| `strictKnownMarketplaces`            | Allowlist of plugin marketplaces                     |
| `blockedMarketplaces`                | Blocklist of marketplace sources                     |
| `sandbox.network.allowManagedDomainsOnly` | Only managed domain allowlist for network access|
| `allow_remote_sessions`              | Control Remote Control / web session access           |

### Example Managed Settings

```json
{
  "allowManagedPermissionRulesOnly": true,
  "permissions": {
    "allow": ["Bash(npm run *)"],
    "deny": ["Bash(curl *)", "WebFetch"]
  },
  "allowManagedMcpServersOnly": true,
  "allowedMcpServers": [
    { "serverName": "github" },
    { "serverName": "memory" }
  ],
  "deniedMcpServers": [
    { "serverName": "filesystem" }
  ],
  "disableBypassPermissionsMode": "disable",
  "allowManagedHooksOnly": true
}
```

---

## 15. Key Takeaways for AGI Workforce

### Architecture Patterns to Adopt

1. **Tiered Permission System**: Read-only default, escalating approval for writes and commands
2. **Rule-Based Permissions**: `allow`/`ask`/`deny` arrays with glob patterns and deny-first evaluation
3. **Lifecycle Hooks**: Pre/Post tool use hooks for validation, transformation, and audit
4. **Settings Hierarchy**: Managed > Project > User with array merge behavior
5. **Sandbox Layer**: OS-level filesystem + network isolation as defense-in-depth
6. **Input Transformation**: Hooks can modify tool parameters before execution (sandboxing, path rewriting)

### Implementation Priorities for AGI Workforce

| Priority | Feature                          | Why                                                   |
|:---------|:---------------------------------|:------------------------------------------------------|
| P0       | PreToolUse hooks                 | Core security gate -- block/allow/transform all tool calls |
| P0       | Permission modes (5 modes)       | User control over autonomy level                      |
| P0       | Deny-first rule evaluation       | Security foundation                                   |
| P1       | PostToolUse hooks                | Auto-formatting, linting, test running                |
| P1       | Sandbox (filesystem + network)   | OS-level enforcement for bash commands                |
| P1       | Settings hierarchy               | Enterprise manageability                              |
| P2       | Stop hooks                       | Quality gates before task completion                  |
| P2       | Prompt/Agent hooks               | LLM-based judgment for complex decisions              |
| P2       | SessionStart hooks               | Context injection, environment setup                  |
| P3       | HTTP hooks                       | External service integration for audit/compliance     |
| P3       | ConfigChange hooks               | Security audit trail                                  |
| P3       | TeammateIdle/TaskCompleted hooks  | Multi-agent quality gates                            |

### Key Design Decisions from Claude Code

1. **Exit code 2 = block**: Simple, universal convention for all blocking hooks
2. **JSON output on exit 0 only**: Clean separation between success/block paths
3. **Matcher regex on tool name**: Simple, powerful filtering
4. **Hooks snapshotted at startup**: Prevents mid-session tampering
5. **Parallel execution**: All matching hooks run concurrently
6. **Deduplication**: Identical hooks auto-deduplicated
7. **Fail-closed**: Unmatched commands default to requiring approval
8. **Shell operator awareness**: Permission patterns understand `&&`, `||`, etc.

### Security Model Summary

```
User Request
    |
    v
[Permission Mode Check] -- plan mode? -> Block writes/commands
    |
    v
[Permission Rules] -- deny/ask/allow evaluation
    |
    v
[PreToolUse Hooks] -- allow/deny/ask/transform
    |
    v
[PermissionRequest Hooks] -- auto-approve/deny permission dialogs
    |
    v
[Sandbox Check] -- OS-level filesystem + network enforcement
    |
    v
[Tool Execution]
    |
    v
[PostToolUse Hooks] -- format, lint, test, log
    |
    v
[Stop Hooks] -- quality gates before completion
```

---

## Sources

- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) -- Official full reference
- [Claude Code Hooks Guide](https://code.claude.com/docs/en/hooks-guide) -- Getting started with examples
- [Claude Code Permissions](https://code.claude.com/docs/en/permissions) -- Permission system documentation
- [Claude Code Settings](https://code.claude.com/docs/en/settings) -- Full settings reference
- [Claude Code Security](https://code.claude.com/docs/en/security) -- Security architecture
- [Claude Code Sandboxing](https://code.claude.com/docs/en/sandboxing) -- Sandbox configuration
- [claude-code-hooks-mastery (GitHub)](https://github.com/disler/claude-code-hooks-mastery) -- Community examples
- [johnlindquist/claude-hooks (GitHub)](https://github.com/johnlindquist/claude-hooks) -- TypeScript hook library
