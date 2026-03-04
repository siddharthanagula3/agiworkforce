# Agentic Chat Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the agent system work like Claude Code — multi-turn tool loop with real tool result feedback, real-time status labels derived from actual tool calls, message queuing for follow-ups, and local LLM tool compatibility.

**Architecture:** Enhance the existing streaming agentic loop in `sys/commands/chat/mod.rs` (lines 4119-4500) with structured tool events, integrate the pending message queue (already exists as `PENDING_MESSAGES` static) into the loop for follow-up handling, and build a `ToolTimeline` React component that renders Claude Code-style inline labels from real Tauri events.

**Tech Stack:** Rust (Tauri v2 commands, tokio async), TypeScript/React 19, Zustand stores, Framer Motion, Tauri event system (`app_handle.emit` / `listen`)

---

## Task 1: Structured Tool Events (Rust)

Create the tool event emission layer that maps MCP tool names to human-readable display labels.

**Files:**

- Create: `apps/desktop/src-tauri/src/sys/commands/chat/tool_events.rs`
- Modify: `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs` (add `mod tool_events;`)

**Step 1: Create `tool_events.rs` with display name mapping and event emission**

```rust
// apps/desktop/src-tauri/src/sys/commands/chat/tool_events.rs

use serde::Serialize;
use tauri::Emitter;

/// Structured tool event emitted to the frontend during agentic loop execution.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ToolEvent {
    Started {
        id: String,
        conversation_id: i64,
        message_id: String,
        tool_name: String,
        display_name: String,
        display_args: String,
        iteration: usize,
    },
    Progress {
        id: String,
        conversation_id: i64,
        message_id: String,
        stdout_chunk: Option<String>,
        progress_pct: Option<f32>,
    },
    Completed {
        id: String,
        conversation_id: i64,
        message_id: String,
        success: bool,
        duration_ms: u64,
        result_preview: Option<String>,
        error: Option<String>,
    },
}

/// Human-readable display info for a tool call.
pub struct ToolDisplayInfo {
    pub display_name: String,
    pub display_args: String,
}

/// Maps a raw MCP tool name + JSON arguments to a Claude Code-style display label.
///
/// Examples:
///   mcp__filesystem__read_file + {"path":"src/main.rs"} → Read(src/main.rs)
///   mcp__bash__execute + {"command":"cargo test"} → Bash(cargo test)
pub fn get_tool_display_info(tool_name: &str, arguments_json: &str) -> ToolDisplayInfo {
    let args: serde_json::Value = serde_json::from_str(arguments_json).unwrap_or_default();
    let lower = tool_name.to_lowercase();

    // Extract common argument fields
    let path = args.get("path")
        .or_else(|| args.get("file_path"))
        .or_else(|| args.get("filename"))
        .and_then(|v| v.as_str())
        .map(shorten_path);
    let command = args.get("command")
        .or_else(|| args.get("cmd"))
        .and_then(|v| v.as_str())
        .map(|s| truncate(s, 60));
    let query = args.get("query")
        .or_else(|| args.get("pattern"))
        .or_else(|| args.get("search"))
        .and_then(|v| v.as_str())
        .map(|s| truncate(s, 50));
    let url = args.get("url")
        .or_else(|| args.get("uri"))
        .and_then(|v| v.as_str())
        .map(|s| truncate(s, 60));

    let (name, arg_display) = if contains_any(&lower, &["read_file", "read_text", "read_media"]) {
        ("Read", path.unwrap_or_default())
    } else if contains_any(&lower, &["write_file", "write_text"]) {
        ("Write", path.unwrap_or_default())
    } else if contains_any(&lower, &["edit_file", "edit", "patch"]) {
        ("Edit", path.unwrap_or_default())
    } else if contains_any(&lower, &["list_directory", "directory_tree", "list_dir"]) {
        ("LS", path.unwrap_or_else(|| ".".to_string()))
    } else if contains_any(&lower, &["search_files", "grep", "find_files", "glob"]) {
        ("Search", query.unwrap_or_default())
    } else if contains_any(&lower, &["bash", "execute", "terminal", "shell", "run_command"]) {
        ("Bash", command.unwrap_or_default())
    } else if contains_any(&lower, &["web_search", "search_web"]) {
        ("WebSearch", query.unwrap_or_default())
    } else if contains_any(&lower, &["navigate", "web_fetch", "fetch_url", "browse"]) {
        ("WebFetch", url.unwrap_or_default())
    } else if contains_any(&lower, &["create_entities", "create_relations", "add_observations", "memory"]) {
        ("Memory", query.or(path).unwrap_or_default())
    } else if contains_any(&lower, &["git_status", "git_diff", "git_log", "git_commit", "git_"]) {
        let git_cmd = lower.rsplit("__").next().unwrap_or("git").replace('_', " ");
        ("Git", truncate(&git_cmd, 30))
    } else if contains_any(&lower, &["image_generate", "dalle", "generate_image"]) {
        let prompt = args.get("prompt").and_then(|v| v.as_str()).map(|s| truncate(s, 40));
        ("ImageGen", prompt.unwrap_or_default())
    } else {
        // Fallback: extract the last segment of the MCP tool name
        let short_name = tool_name
            .rsplit("__")
            .next()
            .unwrap_or(tool_name);
        let display = path.or(command).or(query).or(url).unwrap_or_default();
        (short_name, display)
    };

    ToolDisplayInfo {
        display_name: name.to_string(),
        display_args: arg_display,
    }
}

/// Emit a ToolEvent to the frontend via Tauri event system.
pub fn emit_tool_event(app_handle: &tauri::AppHandle, event: &ToolEvent) {
    let _ = app_handle.emit("tool:event", event);
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| haystack.contains(n))
}

fn shorten_path(p: &str) -> String {
    // Show only filename or last 2 path segments
    let parts: Vec<&str> = p.split('/').filter(|s| !s.is_empty()).collect();
    if parts.len() <= 2 {
        p.to_string()
    } else {
        parts[parts.len()-2..].join("/")
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max.saturating_sub(3)])
    }
}
```

**Step 2: Register the module in `mod.rs`**

Add at the top of `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs` (near `mod tools;`):

```rust
pub mod tool_events;
```

**Step 3: Commit**

```bash
git add apps/desktop/src-tauri/src/sys/commands/chat/tool_events.rs apps/desktop/src-tauri/src/sys/commands/chat/mod.rs
git commit -m "feat(rust): add structured tool event emission with display name mapping"
```

---

## Task 2: Wire Tool Events into Existing Agentic Loop (Rust)

Modify the existing `execute_tool_calls_batch` and the streaming agentic loop to emit structured `ToolEvent`s.

**Files:**

- Modify: `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs` (lines 733-846 `execute_tool_calls_batch`, lines 4119-4500 agentic loop)

**Step 1: Enhance `execute_tool_calls_batch` to emit ToolEvents**

In `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`, find the `execute_tool_calls_batch` function (line 733). Wrap each tool execution with `ToolEvent::Started` and `ToolEvent::Completed`:

Before the existing `execute_chat_tool_with_timeout` call (around line 782), add:

```rust
use crate::sys::commands::chat::tool_events::{emit_tool_event, get_tool_display_info, ToolEvent};

// Inside the for-loop over tool_calls, before execute_chat_tool_with_timeout:
let display_info = get_tool_display_info(&tc.name, &tc.arguments);
let tool_exec_id = format!("{}_{}", tc.id, uuid::Uuid::new_v4().as_simple());
let tool_started_at = std::time::Instant::now();

emit_tool_event(app_handle, &ToolEvent::Started {
    id: tool_exec_id.clone(),
    conversation_id,
    message_id: frontend_message_id.to_string(),
    tool_name: tc.name.clone(),
    display_name: display_info.display_name.clone(),
    display_args: display_info.display_args.clone(),
    iteration: 0, // Will be parameterized in step 2
});

// ... existing execute_chat_tool_with_timeout call ...

let tool_duration_ms = tool_started_at.elapsed().as_millis() as u64;
emit_tool_event(app_handle, &ToolEvent::Completed {
    id: tool_exec_id,
    conversation_id,
    message_id: frontend_message_id.to_string(),
    success: result.success,
    duration_ms: tool_duration_ms,
    result_preview: Some(result.content.chars().take(200).collect()),
    error: if result.success { None } else { Some(result.content.clone()) },
});
```

**Step 2: Add `iteration` parameter to `execute_tool_calls_batch`**

Change the function signature to accept an `iteration: usize` parameter:

```rust
async fn execute_tool_calls_batch(
    tool_calls: &[crate::core::llm::sse_parser::StreamingToolCall],
    app_handle: &tauri::AppHandle,
    conversation_id: i64,
    frontend_message_id: &str,
    project_folder: Option<String>,
    conversation_mode: Option<String>,
    iteration: usize,  // NEW
) -> (Vec<tools::ChatToolResult>, Vec<String>)
```

Update all call sites (search for `execute_tool_calls_batch(` in the file) to pass `0` for the initial call and `streaming_tool_iteration` for the loop calls.

**Step 3: Emit loop progress events with iteration context**

In the agentic loop (line 4137), after the existing `"chat:agent-progress"` emit, also emit a structured loop status:

```rust
let _ = app_handle_clone.emit("agentic:loop-status", serde_json::json!({
    "conversation_id": conversation_id_clone,
    "message_id": frontend_message_id_clone,
    "iteration": streaming_tool_iteration,
    "max_iterations": max_streaming_tool_iterations,
    "status": "executing",
    "has_pending_messages": has_pending_messages_for_conversation(conversation_id_clone),
}));
```

**Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/sys/commands/chat/mod.rs
git commit -m "feat(rust): wire structured tool events into agentic loop"
```

---

## Task 3: Integrate Pending Message Queue into Agentic Loop (Rust)

The pending message system already exists (`PENDING_MESSAGES` static, `chat_add_pending_message` command). Wire it into the agentic loop so the agent picks up follow-up messages between tool iterations.

**Files:**

- Modify: `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs` (agentic loop at line 4137)

**Step 1: Check for pending messages between loop iterations**

In the agentic loop, after tool results are processed and before the followup LLM request is built (around line 4200), add:

```rust
// Check for queued follow-up messages from the user
if has_pending_messages_for_conversation(conversation_id_clone) {
    if let Some(pending) = pop_pending_message_for_conversation(conversation_id_clone) {
        info!(
            "[Chat] Injecting pending user message into agentic loop: {}...",
            pending.content.chars().take(50).collect::<String>()
        );
        // Append the user's follow-up as a new user message in the conversation
        followup_messages.push(crate::core::llm::ChatMessage {
            role: "user".to_string(),
            content: pending.content.clone(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        });

        // Emit event so frontend shows the queued message was consumed
        let _ = app_handle_clone.emit("agentic:message-consumed", serde_json::json!({
            "conversation_id": conversation_id_clone,
            "message_id": frontend_message_id_clone,
            "pending_message": pending,
        }));
    }
}
```

**Step 2: Add `pop_pending_message_for_conversation` helper**

Below the existing `peek_pending_messages_for_conversation` function (around line 5632), add:

```rust
/// Pop the first pending message for a specific conversation (used by agentic loop).
pub fn pop_pending_message_for_conversation(conversation_id: i64) -> Option<PendingUserMessage> {
    PENDING_MESSAGES
        .lock()
        .ok()
        .and_then(|mut q| {
            let idx = q.iter().position(|m| m.conversation_id == Some(conversation_id))?;
            Some(q.remove(idx))
        })
}
```

**Step 3: Commit**

```bash
git add apps/desktop/src-tauri/src/sys/commands/chat/mod.rs
git commit -m "feat(rust): integrate pending message queue into agentic loop for follow-ups"
```

---

## Task 4: Frontend Tool Event Listener (TypeScript)

Wire the new `tool:event` Tauri events into the existing `toolStore` and `agentStore`.

**Files:**

- Modify: `apps/desktop/src/stores/chat/toolStore.ts` (add Tauri event listener)
- Modify: `apps/desktop/src/stores/chat/agentStore.ts` (update actionTrail from real events)

**Step 1: Add ToolEvent type and listener in `toolStore.ts`**

At the top of `apps/desktop/src/stores/chat/toolStore.ts`, add the ToolEvent type:

```typescript
// Structured tool event from Rust agentic loop
export interface ToolEventPayload {
  type: 'started' | 'progress' | 'completed';
  id: string;
  conversation_id: number;
  message_id: string;
  // started-specific
  tool_name?: string;
  display_name?: string;
  display_args?: string;
  iteration?: number;
  // progress-specific
  stdout_chunk?: string;
  progress_pct?: number;
  // completed-specific
  success?: boolean;
  duration_ms?: number;
  result_preview?: string;
  error?: string;
}
```

Add a new initializer function at the bottom of the file:

```typescript
let toolEventListenerInitialized = false;

export async function initializeToolEventListener() {
  if (toolEventListenerInitialized || !isTauri) return;
  toolEventListenerInitialized = true;

  try {
    const { listen } = await import('@tauri-apps/api/event');

    await listen<ToolEventPayload>('tool:event', (event) => {
      const payload = event.payload;
      const store = useToolStore.getState();

      switch (payload.type) {
        case 'started':
          store.updateToolStream(payload.id, {
            tool_name: payload.display_name
              ? `${payload.display_name}(${payload.display_args || ''})`
              : payload.tool_name || 'Unknown',
            status: 'running',
            progress: 0,
            progressMessage: payload.display_args
              ? `${payload.display_name}(${payload.display_args})`
              : undefined,
            startedAt: new Date(),
            parameters: {
              raw_tool_name: payload.tool_name,
              display_name: payload.display_name,
              display_args: payload.display_args,
              message_id: payload.message_id,
              iteration: payload.iteration,
            },
          });
          break;

        case 'progress':
          store.updateToolStream(payload.id, {
            progress: payload.progress_pct ?? undefined,
            outputChunks: payload.stdout_chunk ? [payload.stdout_chunk] : undefined,
            outputBuffer: payload.stdout_chunk || undefined,
          });
          break;

        case 'completed':
          store.updateToolStream(payload.id, {
            status: payload.success ? 'completed' : 'error',
            progress: 1,
            duration_ms: payload.duration_ms,
            completedAt: new Date(),
            result: payload.result_preview,
            error: payload.error || undefined,
          });
          // Auto-remove after 5 seconds for completed tools
          setTimeout(() => {
            store.removeToolStream(payload.id);
          }, 5000);
          break;
      }
    });
  } catch (error) {
    toolEventListenerInitialized = false;
    console.error('[ToolStore] Failed to initialize tool event listener:', error);
  }
}
```

**Step 2: Update `agentStore.ts` to create actionTrail entries from tool events**

In the same `tool:event` listener (or a separate listener in `agentStore.ts`), add entries to the `actionTrail`:

```typescript
// In initializeToolEventListener, inside the 'started' case:
import { useAgentStore } from './agentStore';

// After updateToolStream call in 'started' case:
useAgentStore.getState().addActionTrailEntry({
  type: 'running',
  message: `${payload.display_name}(${payload.display_args || ''})`,
  metadata: {
    messageId: payload.message_id,
    toolEventId: payload.id,
    toolName: payload.tool_name,
    iteration: payload.iteration,
  },
});

// In 'completed' case, after updateToolStream:
useAgentStore.getState().addActionTrailEntry({
  type: payload.success ? 'completed' : 'error',
  message: `${payload.display_name || 'Tool'}${payload.success ? '' : ' failed'}`,
  fadeAfter: 3000,
  metadata: {
    messageId: payload.message_id,
    toolEventId: payload.id,
    duration_ms: payload.duration_ms,
  },
});
```

**Step 3: Initialize the listener in the app bootstrap**

Find where `initializeAgentStatusListener()` is called (likely in the main app component or a bootstrap hook) and add `initializeToolEventListener()` next to it.

**Step 4: Commit**

```bash
git add apps/desktop/src/stores/chat/toolStore.ts apps/desktop/src/stores/chat/agentStore.ts
git commit -m "feat(frontend): wire tool:event Tauri listener into stores for real-time status"
```

---

## Task 5: ToolLabel Component (React)

Build the inline tool label component that renders Claude Code-style `Read(src/main.rs) ✓ 45ms`.

**Files:**

- Create: `apps/desktop/src/components/UnifiedAgenticChat/ToolLabel.tsx`

**Step 1: Create `ToolLabel.tsx`**

```tsx
// apps/desktop/src/components/UnifiedAgenticChat/ToolLabel.tsx
import { motion } from 'framer-motion';
import {
  FileText,
  Terminal,
  Search,
  Globe,
  Edit3,
  FolderOpen,
  GitBranch,
  Image,
  Database,
  Loader2,
  Check,
  X,
  Wrench,
} from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ToolLabelEntry {
  id: string;
  displayName: string;
  displayArgs: string;
  status: 'running' | 'completed' | 'error';
  durationMs?: number;
  error?: string;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Read: FileText,
  Write: FileText,
  Edit: Edit3,
  LS: FolderOpen,
  Search: Search,
  Bash: Terminal,
  WebSearch: Globe,
  WebFetch: Globe,
  Memory: Database,
  Git: GitBranch,
  ImageGen: Image,
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ToolLabel({ entry }: { entry: ToolLabelEntry }) {
  const Icon = ICON_MAP[entry.displayName] || Wrench;
  const isRunning = entry.status === 'running';
  const isError = entry.status === 'error';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'flex items-center gap-2 py-0.5 text-xs font-mono',
        isError ? 'text-red-400' : 'text-muted-foreground',
      )}
    >
      {/* Status indicator */}
      {isRunning ? (
        <Loader2 className="w-3 h-3 animate-spin text-violet-400 shrink-0" />
      ) : isError ? (
        <X className="w-3 h-3 text-red-400 shrink-0" />
      ) : (
        <Check className="w-3 h-3 text-emerald-400 shrink-0" />
      )}

      {/* Tool icon */}
      <Icon className="w-3 h-3 shrink-0" />

      {/* Tool label: Name(args) */}
      <span className="truncate max-w-[300px]">
        <span className="text-foreground/80">{entry.displayName}</span>
        {entry.displayArgs && <span className="text-muted-foreground">({entry.displayArgs})</span>}
        {isRunning && <span className="text-violet-400">...</span>}
      </span>

      {/* Duration */}
      {entry.durationMs != null && !isRunning && (
        <span className="text-muted-foreground/60 ml-auto tabular-nums shrink-0">
          {formatDuration(entry.durationMs)}
        </span>
      )}
    </motion.div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/desktop/src/components/UnifiedAgenticChat/ToolLabel.tsx
git commit -m "feat(frontend): add ToolLabel component for Claude Code-style tool display"
```

---

## Task 6: ToolTimeline Component (React)

Build the per-message collapsible tool timeline that shows all tools used.

**Files:**

- Create: `apps/desktop/src/components/UnifiedAgenticChat/ToolTimeline.tsx`

**Step 1: Create `ToolTimeline.tsx`**

```tsx
// apps/desktop/src/components/UnifiedAgenticChat/ToolTimeline.tsx
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Wrench } from 'lucide-react';
import { ToolLabel, type ToolLabelEntry } from './ToolLabel';
import { cn } from '../../lib/utils';

interface ToolTimelineProps {
  entries: ToolLabelEntry[];
  className?: string;
}

export function ToolTimeline({ entries, className }: ToolTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasRunning = entries.some((e) => e.status === 'running');

  // Auto-expand while tools are running
  const isOpen = hasRunning || isExpanded;

  if (entries.length === 0) return null;

  const totalDuration = entries.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
  const completedCount = entries.filter((e) => e.status === 'completed').length;
  const errorCount = entries.filter((e) => e.status === 'error').length;

  return (
    <div className={cn('border border-border/30 rounded-lg overflow-hidden', className)}>
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-3 h-3" />
        </motion.div>
        <Wrench className="w-3 h-3" />
        <span>
          {hasRunning ? (
            <span className="text-violet-400">Running tools...</span>
          ) : (
            <>
              Used {entries.length} tool{entries.length !== 1 ? 's' : ''}
              {errorCount > 0 && <span className="text-red-400 ml-1">({errorCount} failed)</span>}
              {totalDuration > 0 && (
                <span className="text-muted-foreground/60 ml-1">
                  (
                  {totalDuration < 1000
                    ? `${totalDuration}ms`
                    : `${(totalDuration / 1000).toFixed(1)}s`}
                  )
                </span>
              )}
            </>
          )}
        </span>
      </button>

      {/* Expandable tool list */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 space-y-0.5 border-t border-border/20">
              {entries.map((entry) => (
                <ToolLabel key={entry.id} entry={entry} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/desktop/src/components/UnifiedAgenticChat/ToolTimeline.tsx
git commit -m "feat(frontend): add ToolTimeline component for per-message tool history"
```

---

## Task 7: Wire ToolTimeline into Chat Messages (React)

Connect the ToolTimeline to actual messages in the chat stream by tracking tool events per message.

**Files:**

- Modify: `apps/desktop/src/stores/chat/chatStore.ts` (add per-message tool timeline state)
- Modify: `apps/desktop/src/components/UnifiedAgenticChat/ChatStream.tsx` (render ToolTimeline)

**Step 1: Add tool timeline state to chatStore**

In `apps/desktop/src/stores/chat/chatStore.ts`, add to the state interface:

```typescript
// Add to ChatState interface:
toolTimelineByMessage: Record<string, ToolLabelEntry[]>;

// Add to initial state:
toolTimelineByMessage: {},

// Add actions:
addToolTimelineEntry: (messageId: string, entry: ToolLabelEntry) => void;
updateToolTimelineEntry: (messageId: string, entryId: string, updates: Partial<ToolLabelEntry>) => void;
```

Implement the actions:

```typescript
addToolTimelineEntry: (messageId, entry) =>
  set((state) => {
    if (!state.toolTimelineByMessage[messageId]) {
      state.toolTimelineByMessage[messageId] = [];
    }
    state.toolTimelineByMessage[messageId].push(entry);
  }, undefined, 'chat/addToolTimelineEntry'),

updateToolTimelineEntry: (messageId, entryId, updates) =>
  set((state) => {
    const timeline = state.toolTimelineByMessage[messageId];
    if (!timeline) return;
    const entry = timeline.find((e) => e.id === entryId);
    if (entry) {
      Object.assign(entry, updates);
    }
  }, undefined, 'chat/updateToolTimelineEntry'),
```

**Step 2: Update the tool event listener to populate timeline**

In `toolStore.ts`'s `initializeToolEventListener`, inside the `started` case, also add:

```typescript
import { useChatStore } from './chatStore';

// In 'started' case:
useChatStore.getState().addToolTimelineEntry(payload.message_id, {
  id: payload.id,
  displayName: payload.display_name || 'Tool',
  displayArgs: payload.display_args || '',
  status: 'running',
});

// In 'completed' case:
useChatStore.getState().updateToolTimelineEntry(payload.message_id, payload.id, {
  status: payload.success ? 'completed' : 'error',
  durationMs: payload.duration_ms,
  error: payload.error || undefined,
});
```

**Step 3: Render ToolTimeline in ChatStream**

In `apps/desktop/src/components/UnifiedAgenticChat/ChatStream.tsx`, inside the message rendering loop (around line 726 where `ChatMessageItem` is rendered), add the ToolTimeline above each assistant message that has tool entries:

```tsx
import { ToolTimeline } from './ToolTimeline';
import { useChatStore } from '../../stores/chat/chatStore';

// Inside the component, read the timeline state:
const toolTimelineByMessage = useChatStore((state) => state.toolTimelineByMessage);

// In the message rendering, before or above <ChatMessageItem>:
{
  message.role === 'assistant' && toolTimelineByMessage[message.id]?.length > 0 && (
    <ToolTimeline entries={toolTimelineByMessage[message.id]} className="mx-4 mb-1" />
  );
}
```

**Step 4: Commit**

```bash
git add apps/desktop/src/stores/chat/chatStore.ts apps/desktop/src/stores/chat/toolStore.ts apps/desktop/src/components/UnifiedAgenticChat/ChatStream.tsx
git commit -m "feat(frontend): wire ToolTimeline into chat messages with per-message tracking"
```

---

## Task 8: Update CurrentActionBadge with Real Tool Names (React)

Replace the generic type-based icon/label logic with real tool display names.

**Files:**

- Modify: `apps/desktop/src/components/UnifiedAgenticChat/CurrentActionBadge.tsx`

**Step 1: Update icon/color selection to use tool metadata**

In `CurrentActionBadge.tsx`, the `getIcon` function (lines 19-57) currently does keyword matching on the `message` string. Update it to also check `entry.metadata?.displayName`:

```typescript
function getIcon(entry: ActionTrailEntry) {
  const displayName = entry.metadata?.['displayName'] as string | undefined;
  // Prefer display name from tool events
  if (displayName) {
    const iconMap: Record<string, LucideIcon> = {
      Read: FileText,
      Write: FileText,
      Edit: FileEdit,
      LS: FolderOpen,
      Search: SearchIcon,
      Bash: Terminal,
      WebSearch: Globe,
      WebFetch: Globe,
      Git: GitBranch,
      Memory: Database,
      ImageGen: Image,
    };
    return iconMap[displayName] || Wrench;
  }
  // ... existing keyword-based fallback
}
```

**Step 2: Commit**

```bash
git add apps/desktop/src/components/UnifiedAgenticChat/CurrentActionBadge.tsx
git commit -m "feat(frontend): update CurrentActionBadge to use real tool display names"
```

---

## Task 9: Agentic Loop Status in Composer (React)

Show the user when the agentic loop is active and allow queuing follow-up messages.

**Files:**

- Modify: `apps/desktop/src/stores/chat/chatStore.ts` (add loop status state)
- Modify: the chat composer component (find via `chat_send_message` call site in `UnifiedAgenticChat/index.tsx`)

**Step 1: Add agentic loop status to chatStore**

```typescript
// Add to ChatState interface:
agenticLoopStatus: {
  active: boolean;
  conversationId: number | null;
  iteration: number;
  maxIterations: number;
} | null;

// Add to initial state:
agenticLoopStatus: null,

// Add action:
setAgenticLoopStatus: (status: ChatState['agenticLoopStatus']) => void;
```

**Step 2: Listen to `agentic:loop-status` event**

In the tool event listener initialization:

```typescript
await listen<{
  conversation_id: number;
  message_id: string;
  iteration: number;
  max_iterations: number;
  status: string;
  has_pending_messages: boolean;
}>('agentic:loop-status', (event) => {
  const p = event.payload;
  useChatStore.getState().setAgenticLoopStatus({
    active: p.status === 'executing',
    conversationId: p.conversation_id,
    iteration: p.iteration,
    maxIterations: p.max_iterations,
  });
});

// Also listen for stream-end to clear loop status
await listen('chat:stream-end', () => {
  useChatStore.getState().setAgenticLoopStatus(null);
});
```

**Step 3: Update composer UI**

In the chat composer (inside `UnifiedAgenticChat/index.tsx` or wherever the input area is), read the loop status and show a queue indicator:

```tsx
const agenticLoopStatus = useChatStore((state) => state.agenticLoopStatus);

// In the composer area, above or replacing the input placeholder:
{
  agenticLoopStatus?.active && (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-violet-400 bg-violet-500/5 border-t border-violet-500/20">
      <Loader2 className="w-3 h-3 animate-spin" />
      <span>
        Agent working (step {agenticLoopStatus.iteration}/{agenticLoopStatus.maxIterations}) — type
        to queue a follow-up
      </span>
    </div>
  );
}
```

The existing `chat_add_pending_message` invoke already handles queuing — the composer just needs to call it instead of `chat_send_message` when the loop is active.

**Step 4: Commit**

```bash
git add apps/desktop/src/stores/chat/chatStore.ts apps/desktop/src/components/UnifiedAgenticChat/index.tsx
git commit -m "feat(frontend): show agentic loop status in composer with queue indicator"
```

---

## Task 10: Ollama Capability Detection (Rust)

Add per-model capability detection for Ollama to prevent tool injection for non-capable models.

**Files:**

- Create: `apps/desktop/src-tauri/src/core/llm/capability_detection.rs`
- Modify: `apps/desktop/src-tauri/src/core/llm/providers/ollama.rs`
- Modify: `apps/desktop/src-tauri/src/core/llm/mod.rs` (add `pub mod capability_detection;`)

**Step 1: Create `capability_detection.rs`**

```rust
// apps/desktop/src-tauri/src/core/llm/capability_detection.rs

use serde::Deserialize;
use std::collections::HashMap;
use std::sync::LazyLock;
use tokio::sync::RwLock;

/// Cached model capabilities to avoid repeated /api/show calls.
static CAPABILITY_CACHE: LazyLock<RwLock<HashMap<String, ModelCapabilities>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

#[derive(Debug, Clone)]
pub struct ModelCapabilities {
    pub supports_tools: bool,
    pub supports_vision: bool,
    pub context_length: usize,
}

#[derive(Deserialize)]
struct OllamaShowResponse {
    template: Option<String>,
    modelfile: Option<String>,
    details: Option<OllamaModelDetails>,
    model_info: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct OllamaModelDetails {
    family: Option<String>,
    parameter_size: Option<String>,
}

/// Known model families that support native function calling in Ollama.
const TOOL_CAPABLE_FAMILIES: &[&str] = &[
    "llama3.1", "llama3.2", "llama3.3", "llama4",
    "qwen2.5", "qwen3",
    "mistral", "mixtral", "mistral-nemo",
    "command-r", "command-r-plus",
    "deepseek-v2", "deepseek-v3", "deepseek-r1",
    "phi-3", "phi-4",
    "gemma2", "gemma3",
    "hermes3",
    "firefunction",
    "nemotron",
];

/// Detect capabilities of an Ollama model by querying /api/show.
pub async fn detect_ollama_capabilities(
    client: &reqwest::Client,
    base_url: &str,
    model: &str,
) -> ModelCapabilities {
    // Check cache first
    {
        let cache = CAPABILITY_CACHE.read().await;
        if let Some(cached) = cache.get(model) {
            return cached.clone();
        }
    }

    let caps = detect_uncached(client, base_url, model).await;

    // Cache the result
    {
        let mut cache = CAPABILITY_CACHE.write().await;
        cache.insert(model.to_string(), caps.clone());
    }

    caps
}

async fn detect_uncached(
    client: &reqwest::Client,
    base_url: &str,
    model: &str,
) -> ModelCapabilities {
    let url = format!("{}/api/show", base_url.trim_end_matches('/'));

    let response = match client
        .post(&url)
        .json(&serde_json::json!({"name": model}))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!("[CapDetect] Failed to query /api/show for {model}: {e}");
            return default_capabilities(model);
        }
    };

    let show: OllamaShowResponse = match response.json().await {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("[CapDetect] Failed to parse /api/show response for {model}: {e}");
            return default_capabilities(model);
        }
    };

    // Check if the template contains tool-related tokens
    let template_has_tools = show
        .template
        .as_deref()
        .map(|t| {
            t.contains("tool_call") || t.contains("<tool>") || t.contains("{{.ToolCalls}}")
                || t.contains("<|tool_calls|>") || t.contains("function_call")
        })
        .unwrap_or(false);

    // Check model family
    let family = show.details.as_ref().and_then(|d| d.family.as_deref()).unwrap_or("");
    let family_supports_tools = TOOL_CAPABLE_FAMILIES.iter().any(|f| {
        family.to_lowercase().contains(&f.to_lowercase())
            || model.to_lowercase().contains(&f.to_lowercase())
    });

    // Check for vision support
    let supports_vision = model.contains("vision")
        || model.contains("llava")
        || model.contains("bakllava")
        || model.contains("moondream")
        || (model.contains("llama3.2") && model.contains("vision"));

    // Context length from model_info or default
    let context_length = show
        .model_info
        .as_ref()
        .and_then(|info| {
            info.get("general.context_length")
                .or_else(|| info.get("llama.context_length"))
                .and_then(|v| v.as_u64())
        })
        .unwrap_or(4096) as usize;

    ModelCapabilities {
        supports_tools: template_has_tools || family_supports_tools,
        supports_vision,
        context_length,
    }
}

fn default_capabilities(model: &str) -> ModelCapabilities {
    let lower = model.to_lowercase();
    ModelCapabilities {
        supports_tools: TOOL_CAPABLE_FAMILIES.iter().any(|f| lower.contains(f)),
        supports_vision: lower.contains("vision") || lower.contains("llava"),
        context_length: 4096,
    }
}

/// Clear the capability cache (e.g., when models are pulled/removed).
pub async fn clear_capability_cache() {
    let mut cache = CAPABILITY_CACHE.write().await;
    cache.clear();
}
```

**Step 2: Register module in `mod.rs`**

In `apps/desktop/src-tauri/src/core/llm/mod.rs`, add:

```rust
pub mod capability_detection;
```

**Step 3: Integrate into `ollama.rs`**

In `apps/desktop/src-tauri/src/core/llm/providers/ollama.rs`, modify `send_message` (line 132) to check capabilities before injecting tools:

```rust
// At the top of send_message, after building the request body:
let tools_to_inject = if let Some(tools) = &request.tools {
    if !tools.is_empty() {
        let caps = crate::core::llm::capability_detection::detect_ollama_capabilities(
            &self.client, &self.base_url, &request.model
        ).await;
        if caps.supports_tools {
            Some(tools)
        } else {
            tracing::info!(
                "[Ollama] Model {} does not support native tools, stripping tool definitions",
                request.model
            );
            None
        }
    } else {
        None
    }
} else {
    None
};

// Then use tools_to_inject instead of request.tools when building the JSON body
```

Also update `supports_function_calling` to be model-aware (though this is sync, so use a cached check):

```rust
fn supports_function_calling(&self) -> bool {
    // Still return true as a default; actual gating happens in send_message
    true
}
```

**Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/core/llm/capability_detection.rs apps/desktop/src-tauri/src/core/llm/mod.rs apps/desktop/src-tauri/src/core/llm/providers/ollama.rs
git commit -m "feat(rust): add Ollama model capability detection for tool support gating"
```

---

## Task 11: Provider-Specific Tool Fixes (Rust)

Fix Google tool_choice and Perplexity tool stripping.

**Files:**

- Modify: `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`

**Step 1: Add Google `toolConfig.functionCallingConfig`**

In `GoogleAdapter::adapt_request` (around line 1753, after tool declarations are set), add:

```rust
// Add tool_choice support for Google (toolConfig.functionCallingConfig)
if let Some(ref tool_choice) = request.tool_choice {
    let mode = match tool_choice {
        ToolChoice::Auto => "AUTO",
        ToolChoice::Required => "ANY",
        ToolChoice::None => "NONE",
        ToolChoice::Specific(name) => {
            // Google supports specific function: use allowedFunctionNames
            google_request["toolConfig"] = serde_json::json!({
                "functionCallingConfig": {
                    "mode": "ANY",
                    "allowedFunctionNames": [name]
                }
            });
            return Ok(serde_json::to_string(&google_request)?);
            // early return for specific case
        }
    };
    google_request["toolConfig"] = serde_json::json!({
        "functionCallingConfig": { "mode": mode }
    });
}
```

Note: The early return pattern for `Specific` is because it needs a different JSON shape. Adjust based on how the method returns.

**Step 2: Strip tools from Perplexity requests**

In `OpenAIAdapter::adapt_request`, Perplexity goes through the same path as OpenAI. Add a check at the top of `adapt_to_chat_completions_api` (or in the caller) to strip tools when the provider is Perplexity:

In `ProviderAdapterFactory::create_adapter`, create a `PerplexityAdapter` that wraps `OpenAIAdapter` but strips tools:

```rust
pub struct PerplexityAdapter;

impl ProviderAdapter for PerplexityAdapter {
    fn adapt_request(&self, request: &LLMRequest) -> Result<String, Box<dyn Error + Send + Sync>> {
        // Clone request and strip tools — Perplexity doesn't support function calling
        let mut stripped = request.clone();
        stripped.tools = None;
        stripped.tool_choice = None;
        OpenAIAdapter.adapt_request(&stripped)
    }

    fn parse_response(&self, response: &str) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        OpenAIAdapter.parse_response(response)
    }
}
```

Update the factory:

```rust
Provider::Perplexity => Box::new(PerplexityAdapter),
```

**Step 3: Commit**

```bash
git add apps/desktop/src-tauri/src/core/llm/provider_adapter.rs
git commit -m "fix(rust): add Google tool_choice support and strip tools from Perplexity"
```

---

## Task 12: Make Agentic Loop Use Streaming for Follow-ups (Rust)

Currently the agentic loop uses `stream: false` for follow-up requests (line 4292). Change to streaming so the user sees tokens arrive in real-time during multi-turn tool use.

**Files:**

- Modify: `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs` (agentic loop follow-up path)

**Step 1: Switch follow-up requests to streaming**

In the agentic loop (around line 4287), change the follow-up request to use streaming:

```rust
let followup_request = crate::core::llm::LLMRequest {
    messages: followup_messages,
    model: model_clone.clone(),
    temperature: Some(DEFAULT_TEMPERATURE),
    max_tokens: Some(DEFAULT_MAX_TOKENS),
    stream: true,  // Changed from false to true
    tools: llm_request_clone.tools.clone(),
    tool_choice: llm_request_clone.tool_choice.clone(),
    thinking_mode: llm_request_clone.thinking_mode,
    thinking: llm_request_clone.thinking.clone(),
    ..Default::default()
};
```

Then replace the `invoke_candidate` call with `invoke_streaming_with_retry` and process the stream the same way as the initial streaming path — accumulating content, emitting `chat:stream-chunk` events, and collecting tool calls from deltas.

This is the most complex change. Extract the streaming consumption logic (lines 3884-4044) into a reusable helper function:

```rust
/// Consume an SSE stream, emitting chunks to the frontend and accumulating content + tool calls.
async fn consume_stream(
    stream: Pin<Box<dyn Stream<Item = Result<StreamChunk, ...>> + Send>>,
    app_handle: &tauri::AppHandle,
    conversation_id: i64,
    message_id: &str,
    full_content: &mut String,
) -> (Vec<StreamingToolCall>, u32 /* token_count */) {
    // ... extracted streaming logic
}
```

**Step 2: Commit**

```bash
git add apps/desktop/src-tauri/src/sys/commands/chat/mod.rs
git commit -m "feat(rust): switch agentic loop follow-ups to streaming for real-time token display"
```

---

## Task 13: Agentic Loop Status Events for Frontend (Rust)

Add clear lifecycle events for the agentic loop so the frontend knows exactly when the loop starts, iterates, and ends.

**Files:**

- Modify: `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`

**Step 1: Emit loop lifecycle events**

At the start of the agentic loop (line 4137):

```rust
let _ = app_handle_clone.emit("agentic:loop-started", serde_json::json!({
    "conversation_id": conversation_id_clone,
    "message_id": frontend_message_id_clone,
    "max_iterations": max_streaming_tool_iterations,
}));
```

When the loop ends (all break points):

```rust
let _ = app_handle_clone.emit("agentic:loop-ended", serde_json::json!({
    "conversation_id": conversation_id_clone,
    "message_id": frontend_message_id_clone,
    "iterations_used": streaming_tool_iteration,
    "reason": "completed" // or "limit_reached", "timeout", "stopped"
}));
```

**Step 2: Listen in frontend**

In the tool event listener initialization:

```typescript
await listen('agentic:loop-started', (event) => {
  useChatStore.getState().setAgenticLoopStatus({
    active: true,
    conversationId: event.payload.conversation_id,
    iteration: 0,
    maxIterations: event.payload.max_iterations,
  });
});

await listen('agentic:loop-ended', () => {
  useChatStore.getState().setAgenticLoopStatus(null);
});
```

**Step 3: Commit**

```bash
git add apps/desktop/src-tauri/src/sys/commands/chat/mod.rs apps/desktop/src/stores/chat/toolStore.ts
git commit -m "feat: add agentic loop lifecycle events for frontend status tracking"
```

---

## Task 14: Integration Testing

Verify the full end-to-end flow works.

**Step 1: Manual test with a cloud provider (Anthropic/OpenAI)**

1. Start the app: `cd apps/desktop && pnpm dev`
2. Connect an Anthropic or OpenAI API key
3. Send: "Read the file apps/desktop/src/App.tsx and tell me what it does"
4. Verify:
   - `tool:event` Started event fires with `display_name: "Read"`, `display_args: "App.tsx"`
   - ToolTimeline appears on the assistant message with `Read(App.tsx) ✓ Xms`
   - CurrentActionBadge shows `Read(App.tsx)` during execution
   - Tool result feeds back to LLM, which responds with analysis

**Step 2: Test multi-turn agentic loop**

1. Send: "Find all TODO comments in the src directory and create a summary"
2. Verify the agent:
   - Uses Search/Grep tool, sees results
   - Makes multiple tool calls across iterations
   - ToolTimeline accumulates all entries
   - `agentic:loop-status` events fire with iteration counts

**Step 3: Test message queuing**

1. Send a complex request that triggers multiple tool calls
2. While the agent is working, type a follow-up like "also check the tests directory"
3. Verify the pending message is consumed between iterations

**Step 4: Test with Ollama (local LLM)**

1. Pull a tool-capable model: `ollama pull llama3.1`
2. Pull a non-tool model: `ollama pull tinyllama`
3. With llama3.1: verify tools are injected and function calling works
4. With tinyllama: verify tools are stripped (no injection)

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes for agentic chat pipeline"
```
