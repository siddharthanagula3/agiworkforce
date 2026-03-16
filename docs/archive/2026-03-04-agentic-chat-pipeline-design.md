# Agentic Chat Pipeline — Design Document

**Date:** 2026-03-04
**Status:** Approved
**Goal:** Make the agent system work like Claude Code — multi-turn tool loop, real-time status labels derived from actual tool calls, message queuing, reasoning visibility, and local LLM tool compatibility.

---

## Problem Statement

The current agent system has four critical gaps:

1. **Broken agent loop** — Each LLM call in the AutonomousAgent is stateless (single-turn). Tool results are never fed back to the LLM. The agent cannot reason about command output or file contents it just read.
2. **Hardcoded status labels** — ActionTrailEntry uses generic types (`thinking`, `running`, `searching`) instead of real tool names. Users see "Running..." instead of `Read(src/main.rs)`.
3. **No message queuing** — Users cannot send follow-up messages while the agent is mid-loop. No way to redirect or interrupt.
4. **Local LLM tool failures** — Ollama's `supports_function_calling()` always returns `true` even for models that don't support tools. No capability detection. Silent failures.

## Architecture

### Layer 1: Chat-First Agentic Loop (Rust)

Build the agentic tool loop into the existing chat command pipeline (`sys/commands/chat/`).

**Flow:**

```
User message → MessageQueue (async channel)
                    ↓
              Agentic Loop
                    ↓
  ┌──→ Build LLMRequest (full conversation + tools)
  │         ↓
  │    Call LLM (streaming)
  │         ↓
  │    Emit thinking/reasoning tokens → frontend
  │         ↓
  │    Response has tool_calls?
  │      YES → For each tool_call:
  │        │     Emit "tool:started" {name, displayName, args}
  │        │     Execute via McpToolRegistry or provider server tool
  │        │     Emit "tool:progress" (streaming output)
  │        │     Emit "tool:completed" {result, duration_ms}
  │        │
  │        ├─ Append tool results as tool-role messages
  │        ├─ Check MessageQueue for user follow-up
  │        │     → If found: append as user message, continue loop
  │        └─ Continue loop ────────────────────────┘
  │      NO (stop) → Final response, emit "loop:done"
  └──────────────────────────────────────────────────
```

**Key design decisions:**

- The agentic loop lives in a new `agentic_loop.rs` module under `sys/commands/chat/`.
- Uses `tokio::sync::mpsc` channel for the message queue — frontend can push messages anytime.
- Max iterations configurable (default 25, like Claude Code). Cost cap per loop ($10 default).
- The loop maintains full conversation history (`Vec<ChatMessage>`) across all iterations.
- Tool results are proper `ChatMessage { role: "tool", tool_call_id, content }` messages.
- Supports parallel tool execution when the LLM returns multiple tool_calls in one response.

**New Tauri commands:**

- `chat_send_agentic(conversation_id, message, config)` — starts the agentic loop
- `chat_queue_message(conversation_id, message)` — queues a follow-up mid-loop
- `chat_cancel_loop(conversation_id)` — cancels the current agentic loop
- `chat_get_loop_status(conversation_id)` — returns current iteration, tools used, cost

### Layer 2: Structured Tool Events (Rust → Frontend)

Every tool execution emits structured Tauri events with real tool metadata.

**Event schema:**

```rust
enum ToolEvent {
    Started {
        id: String,           // unique execution ID
        tool_name: String,    // raw MCP tool name (e.g., "mcp__filesystem__read_file")
        display_name: String, // short label (e.g., "Read")
        display_args: String, // human-readable args (e.g., "src/main.rs")
        parallel_group: Option<String>, // if part of a parallel batch
    },
    Progress {
        id: String,
        stdout_chunk: Option<String>,
        bytes_processed: Option<u64>,
        progress_pct: Option<f32>,
    },
    Completed {
        id: String,
        success: bool,
        duration_ms: u64,
        result_preview: Option<String>, // first 200 chars of result
        error: Option<String>,
    },
}
```

**Display name mapping:**
A `get_tool_display_info(tool_name, args)` function maps MCP tool names to Claude Code-style labels:

| MCP Tool Name                       | Display            | Example                   |
| ----------------------------------- | ------------------ | ------------------------- |
| `*read_file*`, `*read*`             | `Read(path)`       | `Read(src/main.rs)`       |
| `*write_file*`, `*write*`           | `Write(path)`      | `Write(output.json)`      |
| `*edit_file*`, `*edit*`             | `Edit(path:lines)` | `Edit(lib.rs:42-55)`      |
| `*search*`, `*grep*`, `*find*`      | `Search(query)`    | `Search("error handler")` |
| `*bash*`, `*execute*`, `*terminal*` | `Bash(cmd)`        | `Bash(cargo test)`        |
| `*list_directory*`                  | `LS(path)`         | `LS(src/)`                |
| `*web_search*`                      | `WebSearch(query)` | `WebSearch("rust async")` |
| `*navigate*`, `*fetch*`             | `WebFetch(url)`    | `WebFetch(docs.rs)`       |
| Any other MCP tool                  | `Tool(name)`       | `Tool(custom_mcp_tool)`   |

This is a pattern-match function, not a hardcoded enum. New MCP tools get a reasonable default display.

### Layer 3: Frontend Status Display (React)

Reuse existing components but feed them real tool-derived data.

**Inline tool labels in chat messages:**
Each assistant message that involved tool use shows a collapsible timeline:

```
▼ Used 5 tools (3.2s)
  ✓ Read(src/main.rs)                    45ms
  ✓ Read(src/lib.rs)                     38ms   ← parallel
  ✗ Bash(cargo test)                   3200ms   exit code 1
  ✓ Edit(src/lib.rs:42-55)              12ms
  ✓ Bash(cargo test)                   2800ms
```

While streaming, the current tool shows with a spinner:

```
● Read(src/main.rs)...
```

**Components to modify:**

- `CurrentActionBadge.tsx` — feed real `display_name(display_args)` from ToolEvent.Started
- `StatusTrail.tsx` — show permanent tool timeline per message, not auto-fading
- `MessageBubble.tsx` — add collapsible tool timeline section
- `ChatStream.tsx` — listen to new `tool:*` events and update message state

**New component:**

- `ToolLabel.tsx` — renders a single `Read(src/main.rs) ✓ 45ms` line with icon, status color, duration

**Message queue UI:**

- While the agent is working (agentic loop active), the composer shows "Agent is working... Type to queue a message"
- Queued messages appear as dimmed bubbles below the current agent activity
- When the agent picks up the queued message, it becomes a normal user message

### Layer 4: Local LLM Capability Detection (Rust)

**Ollama capability detection:**

```rust
async fn detect_ollama_capabilities(model: &str, base_url: &str) -> ModelCapabilities {
    // Call GET /api/show with model name
    // Parse response.template and response.parameters
    // Check for "tools" in template format or model family
    ModelCapabilities {
        supports_tools: bool,        // native function calling
        supports_vision: bool,
        supports_streaming: bool,
        context_length: usize,
    }
}
```

**Fallback for non-tool models:**
When `supports_tools == false`:

1. Strip `tools` from `LLMRequest`
2. Inject tool descriptions into the system prompt as structured text
3. Parse the LLM's text output for tool call patterns (JSON blocks)
4. Execute parsed tool calls through the same pipeline

**Provider-specific fixes:**

- Perplexity: Never inject tools (it doesn't support function calling)
- Google: Implement `toolConfig.functionCallingConfig` for `tool_choice` support
- LM Studio: Register as a provider (OpenAI-compatible, like Ollama)

### Layer 5: Reasoning/Thinking Display

The existing `ReasoningAccordion` and `ThinkingMessageBlock` are kept. Enhancement:

- **Interleaved display**: Thinking blocks and tool labels alternate in the timeline, showing the agent's reasoning flow:
  ```
  ▼ Thinking... (1.2s)
    "I need to check the main.rs file to understand the current implementation..."
  ✓ Read(src/main.rs)                    45ms
  ▼ Thinking... (0.8s)
    "The bug is on line 42. The variable name is wrong. Let me fix it..."
  ✓ Edit(src/main.rs:42)                 12ms
  ▼ Thinking... (0.3s)
    "Let me verify the fix compiles..."
  ✓ Bash(cargo check)                  1200ms
  ```
- Reasoning blocks are collapsible but open by default during streaming.

## Files to Create/Modify

### New Files (Rust)

- `apps/desktop/src-tauri/src/sys/commands/chat/agentic_loop.rs` — core loop logic
- `apps/desktop/src-tauri/src/sys/commands/chat/message_queue.rs` — async message queue
- `apps/desktop/src-tauri/src/sys/commands/chat/tool_events.rs` — ToolEvent emission + display name mapping
- `apps/desktop/src-tauri/src/core/llm/capability_detection.rs` — Ollama/local LLM capability probing
- `apps/desktop/src-tauri/src/core/llm/prompt_tool_injection.rs` — fallback tool-in-prompt for non-tool models

### New Files (TypeScript)

- `apps/desktop/src/components/Chat/ToolLabel.tsx` — inline tool label component
- `apps/desktop/src/components/Chat/ToolTimeline.tsx` — per-message collapsible tool timeline
- `apps/desktop/src/components/Chat/AgenticComposer.tsx` — composer with queue indicator

### Modified Files (Rust)

- `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs` — wire agentic_loop, new Tauri commands
- `apps/desktop/src-tauri/src/core/llm/providers/ollama.rs` — capability detection integration
- `apps/desktop/src-tauri/src/core/llm/llm_router.rs` — route through capability check, strip tools for non-capable models
- `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs` — Google tool_choice fix, Perplexity tool stripping
- `apps/desktop/src-tauri/src/lib.rs` — register new commands

### Modified Files (TypeScript)

- `apps/desktop/src/stores/chat/agentStore.ts` — actionTrail entries from real ToolEvents
- `apps/desktop/src/stores/chat/toolStore.ts` — listen to new tool:\* events
- `apps/desktop/src/stores/chat/chatStore.ts` — message queue state, agentic loop status
- `apps/desktop/src/components/Chat/ChatStream.tsx` — render ToolTimeline per message
- `apps/desktop/src/components/Chat/MessageBubble.tsx` — integrate ToolTimeline
- `apps/desktop/src/components/Chat/CurrentActionBadge.tsx` — use real display names
- `apps/desktop/src/components/Chat/StatusTrail.tsx` — permanent timeline, no auto-fade

## Success Criteria

1. User sends "fix the bug in main.rs" → agent reads the file, identifies the bug, edits the file, runs tests, iterates if tests fail — all visible in real-time with Claude Code-style labels
2. User can type a follow-up while agent is working, agent picks it up between tool calls
3. Each message preserves a permanent collapsible timeline of all tools used
4. Ollama with llama3.1 uses native tools; Ollama with phi-2 falls back to prompt-based tools
5. Reasoning/thinking tokens display interleaved with tool labels
6. All 9+ LLM providers can access all MCP tools (with appropriate capability gating)
