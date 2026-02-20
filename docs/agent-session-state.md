# AGI Workforce Audit Session State

## Session Start: 2026-02-18

## Project: AGI Workforce Desktop Application

---

## WAVE 1 COMPLETED ✓

### Agent 1: Lock & Orchestration Auditor

**Status**: COMPLETED

**Issues Found & Fixed:**

1. `tab_manager.rs` - Lock ordering inconsistency (get_active_tab vs register_tab/close_tab)
2. `tab_manager.rs` - Lock held across await in navigate() method
3. `tab_manager.rs` - Lock held across await in reload() method
4. `tab_manager.rs` - Nested lock acquisition in register_tab/close_tab
5. `playwright_bridge.rs` - Lock ordering inconsistency
6. `tool_executor.rs` - Nested lock issue in browser_navigate tool handler

### Agent 2: Security Auditor

**Status**: COMPLETED

**Issues Found & Fixed:**

1. **tauri.conf.json** - Removed `unsafe-inline` from CSP script-src and style-src
2. **query_builder.rs** - Added SQL value escaping to prevent injection

**Already Secured (No Action Needed):**

- Shell execution already has protection via command_validator.rs
- Hardcoded secrets already in .gitignore
- test.db already in .gitignore

### Agent 3: Command Registry Validator

**Status**: COMPLETED

**Issues Found & Fixed:**

1. **ipc.ts** - Fixed `write_file` → `file_write` command name mismatch

---

## WAVE 2 COMPLETED ✓

### Agent 4: Tool Execution Viewer Fixer

**Status**: COMPLETED (No changes needed)

**Finding**: The frontend already correctly listens to `agi:tool_stream` at line 918-919, which matches what the Rust backend emits. Both error states and progress updates are properly handled. No changes needed.

### Agent 5: Image Generation Viewer Fixer

**Status**: COMPLETED

**Issues Found & Fixed:**

- Fixed state handling order in InlineMediaGeneration.tsx
- Loading state now shows properly when status is "running" (was returning null before data check)
- Error state now shows when status is "failed" or "error"
- Success state displays images when data is available

### Agent 6: Video Generation Viewer Fixer

**Status**: COMPLETED

**Issues Found & Fixed:**

- Added field aliases: `durationSecs`, `cost_estimate`, `costEstimate`
- Updated field resolution to handle all variants
- Added cost display in info footer
- All states already handled correctly

---

## WAVE 3 COMPLETED ✓

### Agent 7: Document Generation Viewer Fixer

**Status**: COMPLETED

**Issues Found & Fixed:**

- Added `filePath` (camelCase) alongside `file_path` for frontend compatibility
- Added `format` field for each document type (pdf/docx/xlsx)
- Added explicit `success: true` in response data

### Agent 8: File Upload Viewer Fixer

**Status**: COMPLETED

**Issues Found & Fixed:**

- Added error toast notifications for rejected files
- Added loading state with spinner
- Added format validation against accept prop
- Changed fake progress to real chunked file reading (1MB chunks, avoids blocking main thread)
- Fixed FileDropZone toast import to use sonner

### Agent 9: Allowed Directories & GitHub Fixer

**Status**: COMPLETED

**Issues Found & Fixed:**

- Changed `allowed_paths` to `RwLock` for thread-safe interior mutability
- Added `set_allowed_paths()` method that now takes `&self`
- Added new Tauri commands: `update_allowed_directories`, `get_allowed_directories`
- Updated settingsStore to call update_allowed_directories after load/save
- Fixed missing `cn` import in InlineGitHub.tsx

---

## WAVE 4 COMPLETED ✓

### Agent 10: Orchestration Layer Fixer

**Status**: COMPLETED

**Issues Found & Fixed:**

- Added `WaitingApproval` state to WorkflowStatus enum
- Fixed `resume_execution()` to properly restore state
- Fixed `cancel_execution()` to check state before cancelling
- Added `approve_execution()` and `reject_execution()` methods
- Added `pause_for_approval()` method
- Added `execute_workflow_with_timeout()` method
- Added `cleanup_old_executions()` method
- Added `get_stuck_executions()` method

### Agent 11: Frontend Error Handler Fixer

**Status**: COMPLETED

**Issues Found & Fixed:**

- InlineGitHubPR/Issue/Commit: Added loading and error states
- InlineDirectoryList: Added loading and error states
- InlineCodeDiff: Added loading and error states
- InlineScreenshot: Added loading and error states
- InlineDatabaseResults: Added loading and error states
- InlineAPIResponse: Added loading and error states

---

## AUDIT COMPLETE ✓

---

## ISSUE TRACKER - Active Investigation

### Issue 1: Approval Modal Bug

**Status**: INVESTIGATING
**Priority**: HIGH

- **Files Involved**:
  - `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/index.tsx` (modal rendering)
  - `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/orchestration/workflow_executor.rs` (approval logic)
  - `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs` (confirmation commands)

- **Root Cause Hypothesis**: Modal state management issue - double close icons suggest duplicate modal rendering, Approve button likely not wired to actual approval action, timeout errors may stem from missing state transitions after approval

- **Agent Responsible**: TBD

---

### Issue 2: Tool Runner Timeout Spam

**Status**: INVESTIGATING
**Priority**: HIGH

- **Files Involved**:
  - `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/tool_executor.rs` (tool execution)
  - `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/ChatStream.tsx` (timeout display)

- **Root Cause Hypothesis**: Default timeout not properly set or handled, possibly 30-second default triggering repeatedly for long-running tools

- **Agent Responsible**: TBD

---

### Issue 3: Filesystem Tools Fail

**Status**: INVESTIGATING
**Priority**: HIGH

- **Files Involved**:
  - `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/agi/tools/mod.rs` (filesystem tools)
  - `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/InlineToolResults/InlineDirectoryList.tsx` (directory listing UI)
  - `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/InlineToolResults/InlineDocumentGeneration.tsx` (PDF reading)

- **Root Cause Hypothesis**: Either backend filesystem commands not returning expected format, or frontend not handling response correctly. May be related to allowed directories configuration

- **Agent Responsible**: TBD

---

### Issue 4: Inconsistent Status Rendering

**Status**: INVESTIGATING
**Priority**: MEDIUM

- **Files Involved**:
  - `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/ChatStream.tsx` (status updates)
  - `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/StatusTrail.tsx` (status display)
  - `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/chat/types.ts` (status types)

- **Root Cause Hypothesis**: Race condition between multiple status updates arriving out of order, or React state batching causing stale renders

- **Agent Responsible**: TBD

---

### Issue 5: UI Layout/Scroll Bugs

**Status**: INVESTIGATING
**Priority**: MEDIUM

- **Files Involved**:
  - `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/AppLayout.tsx` (main layout)
  - `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/UnifiedAgenticChat/index.tsx` (composer positioning)
  - `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/styles/globals.css` (CSS)

- **Root Cause Hypothesis**: CSS z-index or positioning issues causing composer to overlap content, mode chips overflow due to fixed-width containers

- **Agent Responsible**: TBD

---

## KEY FINDINGS SUMMARY

### Critical Bugs Found

1. **Event name mismatch**: Backend emits `agi:tool_stream`, frontend listens on `agi:tool_execution`
2. **Deadlocks**: Multiple locks held across await points in browser automation
3. **Security**: CSP had unsafe-inline, SQL injection possible via query builder

### Fixes Applied

1. Removed unsafe-inline from CSP
2. Added SQL value escaping
3. Fixed lock ordering in tab_manager.rs, playwright_bridge.rs, tool_executor.rs
4. Fixed command name mismatch in ipc.ts

---

## ACTIVE MEMORY SNAPSHOT (2026-02-20)

### User-Priority Objectives (Do Not Lose During Compaction)

1. Keep a single inline chat-centric agent experience (Claude Desktop / ChatGPT Desktop style) with continuous reasoning, status, and tool actions.
2. Connect all major tool domains to chat timeline/status/action flow (including MCP, automation, calendar, browser, cloud, files, terminal).
3. Ensure image and video generation happen inside the chat interface (inline results/cards), not only in separate panels.
4. Fix issues immediately end-to-end when found; do not defer fixes until audit completion.
5. Prefer latest official docs and current OSS implementations; verify behavior against internet sources before/while editing.

### Current Implementation Queue

- Add `calendar:*` event bridge into `useAgenticEvents` action log + sidecar focus.
- Add `automation:*` event bridge into `useAgenticEvents` action log + sidecar focus.
- Harden media tool result normalization in `UnifiedAgenticChat/index.tsx` to always render inline image/video cards from backend payload variants.
- Keep media generation chat-native via normal prompts (no dedicated `/image` or `/video` slash commands).
- Run `cargo check` + desktop `typecheck` after each significant patch.

### New Requirement Added (2026-02-20)

- User goal: build a true autonomous "Super Intelligence / AGI Mode" (Auto/Agent mode) that can continuously operate across desktop, browser, files, code, and software-development workflows without manual intervention, while still exposing clear reasoning/status/action updates in chat.
- Benchmark inspiration: OpenClaw-style agent loop with per-session serialization, streaming lifecycle/tool events, compaction + pruning, model/profile failover, and security-first sandbox/tool policy boundaries.

### Update (2026-02-20, Later Pass)

- Implemented registry-driven chat tool schema in `/apps/desktop/src-tauri/src/sys/commands/chat/tools.rs`:
  - Replaced brittle static default list with automatic `ToolRegistry::list_tools()` conversion.
  - Added dedupe and deterministic sort for stable tool schema ordering.
  - Excluded legacy media aliases (`media_generate_image`, `media_generate_video`) from schema to reduce duplicate choices.
- Patched media tool compatibility in `/apps/desktop/src-tauri/src/core/llm/tool_executor.rs` and `/apps/desktop/src-tauri/src/core/agi/executors/media_executor.rs`:
  - `image_generate` + `media_generate_image` aliases now both execute.
  - `video_generate` + `media_generate_video` aliases now both execute.
  - Duration parameter now accepts `duration_seconds`, `duration_secs`, or `duration`.
- Extended sidecar domain routing for tool/status visibility:
  - `/apps/desktop/src/stores/ui.ts` now maps `cloud*` -> `files`, `gmail/email/inbox*` -> `tasks`.
  - `/apps/desktop/src/hooks/useAgenticEvents.ts` now classifies `cloud` as `filesystem`, and `gmail/email` as `terminal` action types.
- Added Media Lab entitlement gate (user request):
  - `MediaLab` access restricted to `Pro`, `Max`, `Enterprise` in `/apps/desktop/src/components/UnifiedAgenticChat/AppLayout.tsx`.
  - Sidebar now shows `Pro+` badge in `/apps/desktop/src/components/UnifiedAgenticChat/Sidebar.tsx` when plan is not eligible.
  - `MediaLab` self-guards image/video actions with the same entitlement in `/apps/desktop/src/components/UnifiedAgenticChat/MediaLab.tsx`.

### OpenClaw-Inspired Direction Confirmed

- Keep one continuous chat loop with transparent lifecycle events (reasoning/status/action/tool outputs).
- Keep compactable/persistent memory snapshots to survive context compaction.
- Keep model/provider profile routing + retries/fallbacks per task class (code/web/desktop/long-run tasks).
- Keep explicit security/approval boundaries for dangerous tools while allowing uninterrupted autonomous execution for safe scopes.
