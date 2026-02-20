# Specification: Multi-Issue Bug Fixes Wave Plan
Generated: 2026-02-19T10:30:00.000Z

## Task Overview

This specification defines the team plan for fixing 6 critical bugs in the AGI Workforce desktop application. The fixes span frontend UI components, Rust backend configuration, and MCP server integration. The work is organized into 3 waves with clear ownership boundaries.

## Team Composition

- **frontend-engineer**: UI fixes (ApprovalModal, layout/scroll, status rendering)
- **rust-tauri-engineer**: Tauri commands, MCP filesystem, timeout configuration
- **mcp-integration-engineer**: Tool argument mapping, schema wiring
- **agent-runtime-engineer**: Tool execution state machine, approval handshake
- **test-writer**: Regression tests for all fixes

## File Allocation

### Wave 1 - Critical (Unblocks Others)

#### frontend-engineer
**Allowed Files:**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/ApprovalModal.tsx`

**Current State:**
- Lines 191-198: Custom close button that calls `handleReject()`
- Dialog.tsx (Radix) also provides built-in close button at lines 54-57
- Both render, causing duplicate UI at different positions (custom: `right-0`, Radix: `right-4`)

**Will Produce:**
- Remove custom close button OR disable Radix close button
- Fix Approve button to properly call `resolveApproval(currentApproval, 'approve', { trust: alwaysAllow })`

**DO NOT TOUCH:**
- Dialog.tsx - Only modify if removing Radix close button creates accessibility issues

#### mcp-integration-engineer
**Allowed Files:**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/provider_adapter.rs` (lines 1253-1256)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/tool_executor.rs` (lines 1195-1197)

**Current State:**
- provider_adapter.rs:1253-1256 uses `.unwrap_or("{}")` which handles `null` but NOT empty string `""`
- tool_executor.rs:1195-1197 does `serde_json::from_str(&tool_call.arguments)` which fails on empty string

**Will Produce:**
- Handle empty string `""` by converting to `"{}"` before JSON parsing
- Example fix: `.unwrap_or("{}").trim().if_empty(|| "{}").to_string()`

#### rust-tauri-engineer
**Allowed Files:**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/mcp.rs` (lines 48-119, `update_filesystem_root` function)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs` (lines 302-312, `update_allowed_directories` command)

**Current State:**
- `update_filesystem_root(new_root)` function exists in mcp.rs but is only called from project_context.rs
- `update_allowed_directories(paths)` in tool_confirmation.rs updates tool guard but NOT MCP server
- MCP server config at `~/Library/Application Support/agiworkforce/mcp-servers-config.json` has "." as root

**Will Produce:**
- Modify `update_allowed_directories` command to also call `update_filesystem_root` for the first allowed directory
- Or add a new command that updates both tool guard and MCP server

**DO NOT TOUCH:**
- project_context.rs - MCP root update logic there is intentional for project switching

---

### Wave 2 - High Priority

#### rust-tauri-engineer
**Allowed Files:**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/hooks/config.rs` (line 16: DEFAULT_TIMEOUT_MS)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/executors/terminal_executor.rs` (line 42: default timeout)

**Current State:**
- config.rs line 16: `const DEFAULT_TIMEOUT_MS: u64 = 30_000;` (30 seconds)
- terminal_executor.rs line 42: `const DEFAULT_TIMEOUT_MS: u64 = 60_000;` (60 seconds)
- Frontend toolTimeoutPolicy.ts: 10s (metadata), 120s (default), 300s (long-running)

**Will Produce:**
- Document the timeout mismatch OR align timeouts across layers
- Consider adding tool-type-specific timeout configuration

#### frontend-engineer
**Allowed Files:**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/ChatStream.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/StatusTrail.tsx`

**Current State:**
- StatusTrail uses `variant === 'absolute'` positioning at `top-20` (line 156)
- ChatStream and StatusTrail have separate scroll containers
- Race condition: backend events and frontend state can show conflicting statuses

**Will Produce:**
- Coordinate status state between components
- Ensure "completed" and "failed" states are mutually exclusive in the UI

---

### Wave 3 - Medium Priority

#### frontend-engineer
**Allowed Files:**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/AppLayout.tsx` (line 178, pb-32)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx` (lines 577-595)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/FocusModeButtons.tsx`

**Current State:**
- AppLayout.tsx line 178: `pb-32` padding may be insufficient for ChatInputArea
- ChatInputArea uses fixed positioning at bottom
- FocusModeButtons may overlap content

**Will Produce:**
- Increase bottom padding or adjust fixed positioning
- Ensure mode chips don't overlap content with proper z-index

---

### test-writer
**Allowed Files:**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/__tests__/` (create new test files)

**Will Produce:**
- Regression tests for approval handshake (approve/reject actions)
- Timeout configuration tests
- Scroll overlap tests

---

## Interface Contracts

### Approval Flow
```
Frontend: ApprovalModal.tsx
  -> resolveApproval(approval, 'approve'|'reject', {trust?, reason?})
  -> useApprovalActions hook
  -> Tauri command: respond_tool_confirmation
  -> Rust: tool_confirmation.rs respond_tool_confirmation()

Backend Event: tool:confirmation_required
  -> Frontend: pendingApprovals store
  -> Timeout: 120 seconds (DEFAULT_TIMEOUT_SECONDS)
```

### Tool Execution
```
LLM Response -> provider_adapter.rs
  -> ToolCall { id, name, arguments: JSON string }
  -> tool_executor.rs: serde_json::from_str(arguments)
  -> Execute tool via MCP or direct

MCP Filesystem:
  -> settingsStore.ts: allowedDirectories
  -> update_allowed_directories Tauri command
  -> tool_confirmation.rs: ToolGuard update
  -> SHOULD ALSO: mcp.rs: update_filesystem_root()
```

### Status Rendering
```
Backend: Emits tool events (tool:start, tool:complete, tool:error)
Frontend:
  -> unifiedChatStore: actionTrail state
  -> StatusTrail: Displays actionTrail entries
  -> ChatStream: Displays messages and tool results
```

---

## DO NOT TOUCH Sections

**CRITICAL - DO NOT MODIFY:**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/main.rs` - Core Tauri entry point
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/lib.rs` - Library root, exports
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/ui/Dialog.tsx` - Shared dialog component (except for close button accessibility fix)

**HIGH RISK - CONSULT BEFORE CHANGES:**
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/unifiedChatStore.ts` - Global state, may affect multiple components
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/orchestration/` - Workflow execution logic

---

## Verification Checklist

Before marking tasks complete:

- [ ] Approval modal shows only ONE close button (test by opening approval modal)
- [ ] Approve button successfully commits approval (check resolveApproval is called)
- [ ] Directory listing works for Documents folder (test file_list tool)
- [ ] PDF/text extraction works for files in allowed directories
- [ ] Tools don't timeout after 30 seconds (test with terminal_execute)
- [ ] Status shows consistent states (no "completed" + "failed" together)
- [ ] Composer doesn't overlap message cards (scroll to bottom)
- [ ] Mode chips don't overlap content (toggle focus modes)
- [ ] Empty query doesn't cause "No results found for ''" (test search with empty input)
- [ ] All regression tests pass

---

## Known Risks

1. **MCP Server Restart**: When updating filesystem root, server disconnects/reconnects - brief unavailability
2. **Timeout Cascade**: Changing timeout values affects all tool executions - test thoroughly
3. **Radix Dialog API**: Modifying Dialog.tsx affects all dialogs in app
4. **Zustand Store**: Approval state changes must be carefully coordinated
5. **Race Conditions**: Status rendering depends on event ordering - may need debouncing
