# AGI Workforce - Task Tracker

## Active Session: 2026-01-31 (Session 2)

---

## 🔴 IN PROGRESS

### Task 1: Folder Selector Feature

**Priority:** HIGH | **Track:** A | **Assignee:** Frontend Agent

**Description:** Add a folder/project selector to the chat input area, similar to Claude Code and Windsurf. This allows users to scope their session to a specific directory for security and context.

**Subtasks:**

- [ ] A1: Explore ChatInputArea.tsx structure
- [ ] A2: Design folder selector UI component
- [ ] A3: Create projectStore.ts for folder state
- [ ] A4: Add Tauri command for native folder picker
- [ ] A5: Modify chat handler to include folder context
- [ ] A6: Update tool executor to respect folder scope
- [ ] A7: Add folder path to LLM system prompt

**Files to modify:**

- `apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx`
- `apps/desktop/src/stores/` (new projectStore.ts)
- `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs`
- `apps/desktop/src-tauri/src/core/llm/tool_executor.rs`

---

### Task 2: Fix ExtensionBridge Communication

**Priority:** HIGH | **Track:** B | **Assignee:** Rust Agent

**Description:** The ExtensionBridge.send_message() currently returns hardcoded mock data. Implement real native messaging communication with the browser extension.

**Subtasks:**

- [ ] B1: Explore current extension_bridge.rs implementation
- [ ] B2: Understand native messaging protocol from extension side
- [ ] B3: Implement real message passing via native messaging
- [ ] B4: Add connection validation
- [ ] B5: Test desktop ↔ extension communication

**Files to modify:**

- `apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs`
- `apps/desktop/src-tauri/src/sys/commands/native_messaging.rs`

---

### Task 3: Fix Database Query Tool

**Priority:** MEDIUM | **Track:** C | **Assignee:** Rust Agent

**Description:** The db_query tool returns simulated data. Connect it to the actual SQLite database.

**Subtasks:**

- [ ] C1: Review current db_query placeholder code
- [ ] C2: Implement real SQLite query execution
- [ ] C3: Add SQL injection prevention
- [ ] C4: Add query result formatting

**Files to modify:**

- `apps/desktop/src-tauri/src/core/llm/tool_executor.rs` (lines 1645-1667)

---

## ✅ COMPLETED (Session 1)

- [x] Implemented 9 missing tool handlers (file*list, memory*_, browser\__, api_download)
- [x] Updated README.md to v1.0.9
- [x] Fixed React Hook dependency warning in RiskConfirmationDialog.tsx
- [x] All 1407 tests passing
- [x] Pushed to GitHub main

---

## 📋 BACKLOG

- [ ] E2E testing for folder scope feature
- [ ] Update user documentation
- [ ] Add folder history/recent folders
- [ ] Extension integration tests

---

## Agent Assignments

| Agent Type       | Task                    | Status |
| ---------------- | ----------------------- | ------ |
| Explore Agent    | ChatInputArea structure | 🔄     |
| Explore Agent    | Extension messaging     | 🔄     |
| React Specialist | Folder selector UI      | ⬜     |
| Rust Engineer    | ExtensionBridge         | ⬜     |
| Rust Engineer    | db_query fix            | ⬜     |

---

_Last Updated: 2026-01-31 Session 2_
