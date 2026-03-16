# Claude Code Parity — Design Spec (v2, post-review)

**Date:** 2026-03-16
**Sprint:** 2 weeks (Sprint 1 of 2)
**Approach:** A — Enhance existing tool executor
**Goal:** 70% Claude Code parity in the AGI Workforce desktop app
**Review status:** 4 critical conflicts resolved, 4 high issues fixed

---

## 1. Overview

Add Claude Code-equivalent coding agent capabilities to AGI Workforce. When a user selects a folder via the folder icon in the chat input area, the app auto-detects whether it's a code project and activates coding mode with file editing, code search, terminal execution, tiered permissions, checkpoints, and project-specific instructions.

### What Ships in Sprint 1

- **Expose existing tools to LLM**: Register `glob_search` and `grep_search` (already in `code_search.rs`) as LLM-callable tools in the tool executor dispatch table
- **1 new tool**: `edit_exact_replace` (Claude Code's Edit model — exact string match)
- **Upgrade existing tools**: Add `.gitignore` awareness to `file_list`, add context lines to `grep_search`, add `output_mode` to `grep_search`
- **Tiered permissions**: Extend existing `ToolConfirmationState` + `ToolSafetyTier` with Claude Code tiers
- **Checkpoint/undo**: Extend existing `UndoState`/`ChangeTracker` with rewind UI
- **Project instructions**: `.agi/instructions.md` loaded per-project
- **Agent system prompt**: Claude Code-style orchestration prompt for all 22 providers
- **Auto-format on edit**: Extend existing `try_auto_format()` to also run after `edit_exact_replace`
- **Folder selection UX**: folder icon in chat input area with auto-detect
- **Collapsible tool cards**: enhanced ToolLabel.tsx for code operations

### What Ships in Sprint 2 (Deferred)

- LSP integration (type errors, go-to-definition, find-references)
- Document creation skills (PPTX, DOCX, XLSX)
- Subagent spawning with isolated context
- Deferred tool loading (ToolSearch)
- Background agent execution with live status bar

---

## 2. Architecture

### 2.1 Approach: Enhance Existing Tool Executor

No new Rust files for tools — register existing `code_search.rs` functions as LLM-callable tools. Add `edit_exact_replace` to existing `edit_tools.rs`. New orchestration files are minimal and focused.

### 2.2 Key Insight: Most Tools Already Exist

The spec review revealed that `glob_search`, `grep_search`, `file_list` (LS), and `try_auto_format` are already fully implemented in the codebase. They are registered as Tauri commands but NOT in the `ToolExecutor::execute()` dispatch table — meaning the LLM cannot call them during agentic tool loops. The primary task is **wiring**, not **building**.

### 2.3 Files to Create

```
apps/desktop/src-tauri/src/core/llm/
  project_instructions.rs  # NEW — .agi/instructions.md loader + project type detection
  coding_system_prompt.rs  # NEW — Agent system prompt builder

apps/desktop/src/components/UnifiedAgenticChat/
  RewindTimeline.tsx    # NEW — Checkpoint rewind UI sidebar panel
  FolderSelector.tsx    # NEW — Folder icon in input area
```

### 2.4 Files to Modify

```
apps/desktop/src-tauri/src/core/llm/tool_executor/mod.rs
  — Register glob_search, grep_search, file_list as LLM-callable tools in execute() dispatch
  — Add edit_exact_replace dispatch entry
  — Add checkpoint call (via existing UndoState) before file-modifying tools

apps/desktop/src-tauri/src/core/llm/tool_executor/edit_tools.rs
  — Add edit_exact_replace() as thin wrapper around multi_edit logic
  — Add replace_all parameter, diff output, read-file precondition check

apps/desktop/src-tauri/src/sys/commands/code_search.rs
  — Extend grep_search() with: output_mode (files/content/count), context_before/after, multiline
  — Extend glob_search() with: mtime sorting (already exists), output format alignment
  — Add .gitignore awareness to file_list via `ignore` crate

apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs
  — Extend ToolConfirmationState with session_approved and command_approved tracking
  — Map tools to existing ToolSafetyTier (Safe=Free, RequiresNotification=SessionOnce, etc.)
  — Add AgentMode mapping: Safe→Default, Plan→PlanOnly, Build→AcceptEdits, Autopilot→AutoApprove

apps/desktop/src-tauri/src/core/agent/undo_manager.rs
  — Extend ChangeTracker to support named checkpoints with timestamps
  — Add list_checkpoints() and rewind_to_checkpoint() methods
  — Add conversation_index tracking per checkpoint

apps/desktop/src-tauri/src/sys/commands/chat/send_message_execution.rs
  — Inject project instructions into system prompt via PreparedSendMessage construction
  — Inject coding system prompt when code project detected (before provider adapter)
  — Apply tiered permission checks using extended ToolConfirmationState

apps/desktop/src-tauri/src/sys/commands/chat/tool_events.rs
  — Add display name mappings: glob_search→"Glob", grep_search→"Grep", edit_exact_replace→"Edit"

apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx
  — Add folder icon button (left of text input)
  — Show selected workspace path as breadcrumb

apps/desktop/src/components/UnifiedAgenticChat/ToolLabel.tsx
  — Enhanced collapsible cards for edit operations
  — Syntax-highlighted diff (green/red) for Edit tool results
  — "Undo" button per edit that triggers ChangeTracker rewind

apps/desktop/src/stores/settingsStore.ts
  — Add workspacePath, workspaceType to state (persist migration v10→v11)
  — Add recentWorkspaces array

apps/desktop/src-tauri/src/lib.rs
  — NO new managed state — reuse existing UndoState, ToolConfirmationState, WorkspaceIndexState
  — Register new Tauri commands: edit_exact_replace, load_project_instructions, detect_project_type
```

---

## 3. Tool Changes — Detailed Specs

### 3.1 Wire Existing `glob_search` into LLM Tool Executor

**Already implemented in:** `sys/commands/code_search.rs` (line ~307)
**What exists:** Glob pattern matching, .gitignore-aware via `walkdir`, up to 1000 matches, sorted by mtime
**What's missing:** Not registered in `ToolExecutor::execute()` dispatch table

**Action:** Add dispatch entry in `mod.rs`:
```rust
"glob" | "glob_search" => {
    let pattern = args.get("pattern").and_then(|v| v.as_str()).unwrap_or("*");
    let path = args.get("path").and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| self.project_folder.clone());
    // Call existing glob_search logic from code_search.rs
}
```

**Permission tier:** `Safe` (no prompt needed — read-only)

### 3.2 Wire Existing `grep_search` + Extend Parameters

**Already implemented in:** `sys/commands/code_search.rs` (line ~175)
**What exists:** Regex search, .gitignore-aware via `walkdir`, up to 500 matches
**What's missing:**
1. Not in `ToolExecutor::execute()` dispatch
2. No `output_mode` (files_with_matches / content / count)
3. No context lines (before/after)
4. No multiline mode

**Action — Extend `grep_search`:**
```rust
// Add to existing GrepSearchParams (or equivalent):
pub output_mode: Option<String>,      // "files_with_matches" | "content" | "count"
pub context_before: Option<u32>,      // lines before match
pub context_after: Option<u32>,       // lines after match
pub context: Option<u32>,             // shorthand for both
pub case_insensitive: Option<bool>,
pub multiline: Option<bool>,
pub head_limit: Option<u32>,
```

Implementation uses pure Rust (`walkdir` + `regex`), NOT shelling out to `rg`. This matches the existing codebase pattern and avoids binary dependency issues.

**Permission tier:** `Safe` (no prompt needed — read-only)

### 3.3 Upgrade Existing `file_list` (LS equivalent)

**Already implemented in:** `file_tools.rs` (lines 434–629)
**What exists:** File/dir/symlink detection, configurable excludes, 2000 limit, pagination, 30s timeout
**What's missing:** `.gitignore` awareness (currently uses hardcoded exclude list)

**Action:** Add `ignore` crate integration to `execute_file_list_tool`:
```rust
// Replace hardcoded excludes with ignore::WalkBuilder
use ignore::WalkBuilder;
let walker = WalkBuilder::new(&dir_path)
    .git_ignore(true)
    .hidden(false)
    .build();
```

**Permission tier:** `Safe` (no prompt needed — read-only)

### 3.4 New Tool: `edit_exact_replace`

Added to existing `edit_tools.rs` as a thin wrapper around `multi_edit` logic.

**Parameters:**
```rust
struct EditExactInput {
    file_path: String,          // absolute path
    old_string: String,         // exact text to find
    new_string: String,         // replacement text (must differ)
    replace_all: Option<bool>,  // default false
}
```

**Behavior:**
- Reads file content via existing `canonicalize_validated_path()`
- Searches for exact `old_string` match
- If `replace_all: false`: `old_string` must be unique — fails with error if multiple matches
- If `replace_all: true`: `replacen` with `usize::MAX`
- Creates checkpoint via existing `ChangeTracker` BEFORE applying edit
- Calls existing `try_auto_format()` AFTER applying edit
- Returns unified diff showing changes (for ToolLabel display)
- Requires permission: `RequiresConfirmation` tier (prompt once per session via extended `ToolConfirmationState`)

**Pre-condition enforcement:**
Track read files in `ToolExecutor` struct (which is created per-invocation, naturally conversation-scoped):
```rust
// Add to ToolExecutor struct:
pub read_files: HashSet<PathBuf>,

// In file_read handler, after reading:
self.read_files.insert(canonical_path);

// In edit_exact_replace, before editing:
if !self.read_files.contains(&canonical_path) {
    return Err("Must read file before editing. Use file_read first.");
}
```

**Output:**
```json
{
  "success": true,
  "file": "src/main.rs",
  "replacements": 1,
  "diff": "- old line content\n+ new line content",
  "formatted": true
}
```

---

## 4. Tiered Permissions — Extend Existing System

### 4.1 Existing Infrastructure (DO NOT DUPLICATE)

- `ToolConfirmationState` in `sys/commands/tool_confirmation.rs` (line 38)
- `AgentMode` enum (line 29): `Safe`, `Plan`, `Build`, `Autopilot`
- `ToolSafetyTier` in `tool_guard.rs` (line 13): `Safe`, `RequiresNotification`, `RequiresConfirmation`, `RequiresExplicitApproval`
- `request_tool_confirmation()` (line 596): full async confirmation flow
- `is_tool_permitted_for_mode()` (line 120): per-tool gating

### 4.2 Claude Code Tier Mapping to Existing Enums

| Claude Code Tier | Existing `ToolSafetyTier` | Existing `AgentMode` |
|---|---|---|
| Free (read-only, no prompt) | `Safe` | All modes |
| SessionOnce (prompt once) | `RequiresConfirmation` | `Build` auto-approves, others prompt |
| PerCommand (prompt per command) | `RequiresNotification` | `Autopilot` auto-approves, others prompt |
| AlwaysAsk (destructive) | `RequiresExplicitApproval` | Always prompts, even `Autopilot` |

### 4.3 Extensions to `ToolConfirmationState`

Add these fields to the existing struct:

```rust
// Add to ToolConfirmationState:
/// Tools approved for this session (RequiresConfirmation tier, Build mode)
pub session_approved_tools: parking_lot::Mutex<HashSet<String>>,
/// Bash commands approved per-project (RequiresNotification tier)
pub project_approved_commands: parking_lot::Mutex<HashMap<PathBuf, HashSet<String>>>,
```

### 4.4 Tool-to-Tier Registration

Add new tool registrations to `tool_guard.rs`'s risk-level map:

```rust
// Read-only tools → Safe
register_tool("glob_search", ToolSafetyTier::Safe);
register_tool("grep_search", ToolSafetyTier::Safe);
register_tool("file_list", ToolSafetyTier::Safe);

// File modification → RequiresConfirmation
register_tool("edit_exact_replace", ToolSafetyTier::RequiresConfirmation);

// Already registered in existing system:
// file_write → RequiresConfirmation
// terminal_execute → RequiresNotification
// file_delete → RequiresExplicitApproval
```

### 4.5 Frontend: Enhanced Approval Dialog

Reuse existing approval UI from `ApprovalRequestCard.tsx` but add:
- "Don't ask again this session" checkbox (maps to `session_approved_tools`)
- "Always allow this command in this project" checkbox (maps to `project_approved_commands`)

---

## 5. Checkpoint/Undo — Extend Existing System

### 5.1 Existing Infrastructure (DO NOT DUPLICATE)

- `UndoState` in `core/agent/undo_manager.rs` via `ChangeTracker`
- Already used inside `file_write` and `file_delete` (file_tools.rs lines 301-317)
- Records file snapshots for rollback
- `AGICheckpointState` in `sys/commands/agi_checkpoint.rs` — 9 Tauri commands already registered
- Existing `checkpoints.rs` — conversation-level checkpoints, SQLite-backed

### 5.2 Extensions to `ChangeTracker`

Add named checkpoint support to existing `ChangeTracker`:

```rust
// Add to ChangeTracker or create wrapper:
struct NamedCheckpoint {
    id: String,                    // UUID
    name: String,                  // e.g. "Edit on main.rs"
    timestamp: DateTime<Utc>,
    tool_name: String,
    change_ids: Vec<String>,       // references to existing ChangeTracker entries
}

// Add methods:
fn create_named_checkpoint(&self, name: &str, tool: &str) -> String;
fn list_named_checkpoints(&self) -> Vec<NamedCheckpoint>;
fn rewind_to_named(&self, checkpoint_id: &str) -> Result<Vec<PathBuf>>;
```

### 5.3 Integration

Before every file-modifying tool in `mod.rs` dispatch:
```rust
// Before edit/write/delete:
let checkpoint_id = undo_state.create_named_checkpoint(
    &format!("{} on {}", tool_name, file_path),
    &tool_name,
);
// ... execute tool ...
// Checkpoint auto-associates with the ChangeTracker entries created during execution
```

### 5.4 New Tauri Commands (prefixed to avoid collision)

```rust
// Use "coding_" prefix to avoid collision with existing checkpoint_list:
coding_checkpoint_list,      // list named checkpoints
coding_checkpoint_rewind,    // rewind to a named checkpoint
coding_checkpoint_preview,   // preview diff at checkpoint
```

### 5.5 Frontend: RewindTimeline.tsx

Sidebar panel triggered by Ctrl+Z or rewind button:
- List of named checkpoints with timestamps, tool names, file paths
- Click any checkpoint → preview the diff
- "Rewind to here" → calls `coding_checkpoint_rewind`
- Visual timeline with dots for each checkpoint

---

## 6. Project Instructions (`project_instructions.rs`)

### 6.1 File Format

Users create `.agi/instructions.md` in their project root:

```markdown
# Project Instructions

## Tech Stack
- Rust backend with Tauri v2
- React 19 + TypeScript frontend
- Tailwind CSS 4 for styling

## Conventions
- Use snake_case for Rust, camelCase for TypeScript
- All API calls use invoke() with camelCase params
- Prefer functional components with hooks

## Testing
- Vitest for frontend, cargo test for Rust
- Run tests only when explicitly asked
```

### 6.2 Loading Logic

```rust
struct ProjectInstructions {
    workspace_path: PathBuf,
    instructions: Option<String>,
    detected_project_type: ProjectType,
}

enum ProjectType {
    Rust, Node, Python, Go, Mixed, Unknown,
}

fn load_instructions(workspace: &Path) -> ProjectInstructions {
    let instructions_path = workspace.join(".agi").join("instructions.md");
    let mut instructions = std::fs::read_to_string(&instructions_path).ok();

    // Cap at 4K tokens (~16K chars) to prevent context bloat
    if let Some(ref mut text) = instructions {
        if text.len() > 16_000 {
            text.truncate(16_000);
            text.push_str("\n\n[Instructions truncated at 4K token limit]");
        }
    }

    ProjectInstructions {
        workspace_path: workspace.to_path_buf(),
        instructions,
        detected_project_type: detect_project_type(workspace),
    }
}
```

### 6.3 System Prompt Injection Point

Inject during `PreparedSendMessage` construction (BEFORE provider adapter and token counting):

```rust
// In send_message_execution.rs, during system prompt assembly:
if let Some(workspace) = &workspace_state.current_path {
    let project = load_instructions(workspace);
    let coding_prompt = build_coding_system_prompt(&project);
    prepared.system_prompt = format!("{}\n\n{}", coding_prompt, prepared.system_prompt);
}
```

This ensures the coding prompt is included in token counting and formatted correctly per provider by `provider_adapter.rs`.

---

## 7. Agent System Prompt (`coding_system_prompt.rs`)

The coding system prompt teaches the LLM how to use tools effectively. Kept under 2K tokens.

```rust
fn build_coding_system_prompt(project: &ProjectInstructions) -> String {
    format!(r#"You are an AI coding assistant with direct access to the user's project files.
You help with software engineering tasks: writing code, finding bugs, refactoring, explaining code, running tests, and more.

# Working Directory
{workspace_path}
Project type: {project_type}

# Tools — Use Dedicated Tools, Not Shell
- Read files: file_read (not cat/head/tail)
- Edit files: edit_exact_replace (not sed/awk) — ALWAYS read first
- Search by filename: glob_search (not find)
- Search file contents: grep_search (not grep/rg via terminal)
- List directories: file_list (not ls via terminal)
- Create new files: file_write (not echo/cat heredoc)
- Run tests/builds: terminal_execute

# Editing Workflow
1. ALWAYS file_read before editing
2. Use edit_exact_replace for targeted changes (preferred)
3. Use file_write only for new files or complete rewrites
4. Edits create automatic checkpoints — user can rewind

# Search Workflow
1. glob_search to find files by pattern
2. grep_search to find content (supports regex, context lines)
3. file_read to examine specific files in detail

# Safety
- Read-only tools run without prompting
- File edits prompt once per session
- Terminal commands prompt per unique command
- Never modify files outside the working directory
- Never run destructive commands without explicit request

{project_instructions}"#,
        workspace_path = project.workspace_path.display(),
        project_type = format!("{:?}", project.detected_project_type),
        project_instructions = project.instructions.as_deref().unwrap_or(""),
    )
}
```

---

## 8. Auto-Format on Edit

### 8.1 Existing Infrastructure (DO NOT DUPLICATE)

- `try_auto_format()` at `file_tools.rs` line 638 — already called after `file_write()`
- Delegates to `code_search::format_file()` (line 639)
- `detect_project_root()` at line 706

### 8.2 Only Change Needed

Add `try_auto_format()` call inside `edit_exact_replace()` after the edit is applied:

```rust
// In edit_tools.rs, after edit_exact_replace writes the file:
if let Some(workspace) = &self.project_folder {
    let _ = try_auto_format(&file_path, workspace).await;
}
```

No new formatter detection code needed — reuse existing `format_file()`.

---

## 9. Folder Selection UX

### 9.1 FolderSelector Component

Folder icon button in `ChatInputArea.tsx`, positioned left of the text input:

```
[folder-icon] [                    Type a message...                    ] [send]
```

When clicked:
1. Opens native OS folder picker via Tauri `dialog.open({ directory: true })`
2. Calls `detect_project_type()` Tauri command
3. Loads `.agi/instructions.md` if present
4. Shows breadcrumb below input: `~/Desktop/agiworkforce (Rust+Node)`
5. Stores in `settingsStore` (triggers coding system prompt on next message)

### 9.2 Auto-Detection

```typescript
const PROJECT_MARKERS: Record<string, string> = {
  'Cargo.toml': 'Rust',
  'package.json': 'Node',
  'pyproject.toml': 'Python',
  'go.mod': 'Go',
  '.git': 'Git',
  'Makefile': 'Make',
  'CMakeLists.txt': 'C++',
  'pom.xml': 'Java',
  'build.gradle': 'Java/Kotlin',
};
```

### 9.3 Workspace Persistence (settingsStore v10→v11 migration)

```typescript
// Add to settingsStore.ts with persist migration:
interface SettingsState {
  // ... existing fields ...
  workspacePath: string | null;        // NEW in v11
  workspaceType: 'code' | 'general' | null;  // NEW in v11
  recentWorkspaces: { path: string; type: string; lastUsed: string }[];  // NEW in v11
}

// Migration v10 → v11:
migrate: (state: any) => {
  if (state.version < 11) {
    state.workspacePath = null;
    state.workspaceType = null;
    state.recentWorkspaces = [];
    state.version = 11;
  }
  return state;
},
```

**IPC rule reminder:** All `invoke()` calls from frontend must use camelCase param keys per CLAUDE.md.

---

## 10. Collapsible Tool Cards (Enhanced ToolLabel.tsx)

### 10.1 Display Name Additions to `tool_events.rs`

```rust
"glob_search" => ("Glob", format!("({})", pattern)),
"grep_search" => ("Grep", format!("({})", pattern)),
"edit_exact_replace" => ("Edit", format!("({})", file_path.file_name())),
"file_list" => ("LS", format!("({})", path.file_name())),
```

### 10.2 Enhanced ToolLabel for Edit Operations

For `edit_exact_replace` results, show:
- File path as header
- Collapsed by default, expand to show syntax-highlighted diff
- Green lines for additions, red for deletions
- "Undo" button that calls `invoke('codingCheckpointRewind', { checkpointId })` (camelCase!)
- Duration indicator

---

## 11. Implementation Order

### Day 0-1: Conflict Resolution (Critical)

- Audit `mod.rs` dispatch table for existing tool names
- Map existing tools to `ToolSafetyTier` entries in `tool_guard.rs`
- Verify `ChangeTracker` API surface for checkpoint extensions
- Verify no naming collisions in Tauri command registration

### Week 1: Core Tools + Permissions (Days 2-5)

| Day | Task | Files |
|-----|------|-------|
| 2 | Wire `glob_search` + `grep_search` into tool executor dispatch | `mod.rs`, `code_search.rs` |
| 3 | Extend `grep_search` with output_mode, context lines, multiline | `code_search.rs` |
| 4 | Add `edit_exact_replace` with diff output, read precondition | `edit_tools.rs`, `mod.rs` |
| 5 | Extend `ToolConfirmationState` with session/command tracking | `tool_confirmation.rs`, `tool_guard.rs` |

### Week 2: Orchestration + UX (Days 6-10)

| Day | Task | Files |
|-----|------|-------|
| 6 | Extend `ChangeTracker` with named checkpoints + rewind | `undo_manager.rs` |
| 7 | Project instructions loader + coding system prompt | `project_instructions.rs`, `coding_system_prompt.rs` |
| 8 | Folder selector + auto-detect + settings migration | `FolderSelector.tsx`, `ChatInputArea.tsx`, `settingsStore.ts` |
| 9 | Enhanced tool cards + rewind UI | `ToolLabel.tsx`, `RewindTimeline.tsx` |
| 10 | Wire `try_auto_format` to edit + integration testing | `edit_tools.rs`, end-to-end |

---

## 12. Success Criteria

After Sprint 1, a user should be able to:

1. Click the folder icon → select `Desktop/agiworkforce`
2. App detects Rust+Node project, loads `.agi/instructions.md`
3. "Find all TODO comments" → agent uses `grep_search` with context
4. "Show me all test files" → agent uses `glob_search` with `**/*test*`
5. "Fix the typo in src/main.rs line 42" → agent uses `file_read` then `edit_exact_replace`
6. Agent prompts for permission on first file edit → user approves once for session
7. "Run the tests" → agent uses `terminal_execute` → prompts per unique command
8. If edit was wrong → user clicks rewind → files restored via `ChangeTracker`
9. All tool executions appear as collapsible cards in the chat
10. Auto-format runs after every edit (if project formatter configured)

---

## 13. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `mod.rs` growing too large (88KB) | Extract tool dispatch into `tool_registry.rs` if it exceeds 100KB |
| `grep_search` context lines add complexity | Start with pure Rust regex + walkdir (existing pattern), add context via line buffer |
| Checkpoint memory usage | Cap at 100 named checkpoints, reuse existing ChangeTracker storage |
| Permission fatigue | Claude Code's tiered model reduces prompts by 84% |
| System prompt too large | Coding prompt capped at 2K tokens; project instructions capped at 4K tokens |
| `settingsStore` migration failure | Explicit v10→v11 migration with defaults for new fields |
| Async lock contention | Use `parking_lot::Mutex` consistently (matches existing `ToolConfirmationState`) |

---

## 14. Non-Goals (Explicitly Out of Scope)

- No VM/sandbox (AGI Workforce runs natively — safety via existing ToolGuard)
- No LSP integration (Sprint 2)
- No subagent spawning (Sprint 2)
- No background agent execution (Sprint 2)
- No document creation skills (Sprint 2)
- No deferred tool loading / ToolSearch (Sprint 2)
- No new `PermissionState` — extend existing `ToolConfirmationState`
- No new `CheckpointState` — extend existing `UndoState`/`ChangeTracker`
- No new `glob_tool.rs` or `grep_tool.rs` — wire existing `code_search.rs`
- No new `ls_tool.rs` — upgrade existing `file_list` in `file_tools.rs`
- No shelling out to `rg` binary — use existing pure Rust search
