# Implementation Plan: Enable Tool Use in Chat

## Objective

Enable the LLM to use tools directly in chat, similar to Claude Desktop/Code, so users can say "read this file" and the LLM actually reads it.

## Current State ✅ IMPLEMENTED

- `chat/mod.rs` now passes tools to LLM when `enable_tools` is true (default: true)
- LLM can call tools: file_read, file_write, file_list, terminal_execute, browser_navigate, search_web, ui_screenshot
- Tool results are fed back to LLM in a multi-turn loop
- Non-streaming mode fully supports tool calls

## Target State ✅ ACHIEVED

- ✅ LLM receives available tools with each chat request
- ✅ LLM can call tools (file read, screenshot, web search, etc.)
- ✅ Tool results are fed back to LLM
- ✅ Multi-turn tool use supported (tool → result → more tools → final response)

---

## Architecture Design

### Tool Flow (Implemented)

```
User Message
     ↓
Build Tool Definitions (from tools.rs)
     ↓
Send to LLM with tools
     ↓
LLM Response (may contain tool_calls)
     ↓
If tool_calls:
  ├── Execute each tool via execute_chat_tool()
  ├── Collect results as ChatToolResult
  ├── Add tool results to conversation
  ├── Send results back to LLM
  └── Repeat until no more tool_calls (max 10 iterations)
     ↓
Final Response to User
```

### Safety Measures

- Max 10 tool iterations per message (prevents infinite loops)
- Command sanitization for terminal_execute
- 30-second timeout for shell commands
- File content truncation (50KB max) to prevent context overflow
- UI events emitted for all tool calls (transparency)

---

## Implementation Status

### Phase 1: Core Infrastructure ✅ COMPLETE

- [x] 1.1 Create `ToolDefinition` builder for LLM format (`tools.rs`)
- [x] 1.2 Create tool executor that handles tool calls (`execute_chat_tool`)
- [x] 1.3 Add tool result message type handling (`ChatToolResult`)

### Phase 2: Tool Registration ✅ COMPLETE

- [x] 2.1 Build core tools (file_read, file_write, file_list)
- [x] 2.2 Build browser tools (browser_navigate - basic)
- [x] 2.3 Build shell tools (terminal_execute)
- [x] 2.4 Build web search tools (placeholder - needs API)
- [x] 2.5 Integrate MCP tools dynamically (mcp**server**tool format)

### Phase 3: Chat Integration ✅ COMPLETE (Non-Streaming)

- [x] 3.1 Modify `send_chat_message` to include tools
- [x] 3.2 Add tool call detection in response
- [x] 3.3 Implement tool execution loop
- [x] 3.4 Add multi-turn tool use support
- [ ] 3.5 Handle streaming with tool calls (requires SSE parser changes)

### Phase 4: Safety & Undo (Future)

- [ ] 4.1 Implement tool safety tiers
- [ ] 4.2 Track tool executions for undo
- [ ] 4.3 Add confirmation flow for dangerous tools

### Phase 5: Testing & Polish

- [ ] 5.1 Test file operations
- [ ] 5.2 Test browser automation
- [ ] 5.3 Test MCP tools
- [ ] 5.4 Test multi-turn conversations
- [ ] 5.5 Test streaming mode

---

## Files Modified/Created

### New Files

1. `src-tauri/src/sys/commands/chat/tools.rs` - Tool definitions and execution

### Modified Files

1. `src-tauri/src/sys/commands/chat/mod.rs` - Main chat with tool support
   - Added `pub mod tools;` import
   - Added tool building logic before LLM request
   - Added tool call handling loop in non-streaming path
   - Emits events for tool calls/results

---

## Known Limitations

1. **Streaming Mode**: Tool calls in streaming mode are not yet supported. The StreamChunk type needs to be extended to include tool_calls data. Non-streaming mode is recommended when tools are enabled.

2. **Web Search**: The `search_web` tool is a placeholder and returns a message indicating it's not implemented. Actual web search requires API integration.

---

## Status: ✅ CORE IMPLEMENTATION COMPLETE

Started: 2026-01-31
Completed: 2026-01-31
