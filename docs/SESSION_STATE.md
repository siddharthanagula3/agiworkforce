# AGI Workforce — Audit Session State

Last updated: 2026-03-06 (Wave 1 start)

## Current Wave: WAVE 1 — Discovery (read-only)

### Active Agents

| Agent                       | Batch                                  | Status  |
| --------------------------- | -------------------------------------- | ------- |
| explorer-desktop-stores     | BATCH-01 (Desktop Stores)              | RUNNING |
| explorer-desktop-services   | BATCH-02 (Desktop Hooks+Services+API)  | RUNNING |
| explorer-desktop-components | BATCH-03+04+05 (Desktop Components)    | RUNNING |
| explorer-rust-core          | BATCH-07 (Rust core/llm)               | RUNNING |
| explorer-rust-sys           | BATCH-08+09 (Rust agent+swarm+agi+mcp) | RUNNING |

### Wave 1 Goals

- Map all exported functions and their signatures
- Identify all `invoke()` calls in TS and their parameter names
- Identify all `#[tauri::command]` handlers in Rust
- Find all store action names and their call sites
- Find broken import references

### Key Known Issues (Pre-Audit)

1. `@desktop-constants` tsconfig alias — FIXED (models.json copied locally)
2. 7 missing npm packages (cmdk, dompurify, embla-carousel-react, events, input-otp, unified, vaul) — FIXED
3. Stale eslint-disable directives (72 files) — FIXED
4. DynamicSidecar.test.tsx display-name lint error — FIXED
5. Scheduler store naming mismatch (\_task vs \_job) — DOCUMENTED in MEMORY.md, needs fix

### Codebase Quick Facts (from MEMORY.md)

- 296 UI components, 41 Zustand stores, **1,324 registered Tauri commands** (across 90 command files + 8 additional modules)
- Critical files: core/llm/llm_router.rs, core/llm/sse_parser.rs, src/constants/llm.ts
- Security: Argon2id + SQLCipher + HKDF
- Model catalog: src/constants/llm.ts (TS) vs core/llm/provider_adapter.rs (Rust) — must stay in sync
- Rust denies: unsafe_code, dead_code, unused_imports, unused_variables, unused_mut

---

## Findings Log

### Wave 1 Findings

#### BATCH-01+02+03: Desktop Stores/Hooks/Services/API (Agent 1) -- COMPLETE

**Status**: DONE. Audited 141 files across stores (49), hooks (46), services (21), API (25).

**Summary**:

- ~280+ invoke() calls cataloged
- 64 snake_case parameter bugs found across 14 files (params arrive as None/undefined in Rust)
- 3 duplicate implementations with inconsistent casing (terminal, ollama, scheduler)
- 6 files with direct @tauri-apps/api/core imports (crash in web dev mode)

**Bug files (snake_case params)**:

- hooks/useTerminal.ts (11 bugs — all `session_id` instead of `sessionId`)
- api/automation.ts (10+ bugs via builder functions — `element_id`, `parent_id`, etc.)
- api/agi_checkpoint.ts (8 bugs — `task_id`, `checkpoint_id`, `resumed_steps`, `keep_count`)
- api/memory.ts (8 bugs — `max_memories`, `min_importance`, `memory_id`, etc.)
- api/automationEnhanced.ts (6 bugs — `element_id`, `script_id`, `duration_ms`)
- api/mcp.ts (5 bugs — `tool_id`, `new_config`, `server_name`, `callback_state`, `client_id`)
- api/reflection.ts (5 bugs — all `goal_id` instead of `goalId`)
- api/workflow.ts (4 bugs — `user_id`, `workflow_id`, `cron_expr`, `event_type`)
- api/accountApi.ts (4 bugs — `device_id`, `amount_cents`, `input_tokens`, `output_tokens`)
- api/ollama.ts (3 bugs — all `model_name` instead of `modelName`)
- hooks/useApprovalActions.ts (1 bug — `approval_id`)
- api/privacy.ts (1 bug — `user_id`)
- stores/productivityStore.ts (1 bug — `workspace_id`)

**Structural issues**:

- WIRE-01 (HIGH): 64 snake_case params across 14 files — silent data loss in Rust handlers
- WIRE-02 (MEDIUM): 3 duplicate store/API implementations with inconsistent casing
- WIRE-03 (MEDIUM): 6 files import @tauri-apps/api/core directly instead of tauri-mock

**Full report**: See WIRING_REPORT.md (Wave 1 Agent 1 section)

#### BATCH-04+05: Desktop Components A+B (wave1-components-auditor) -- COMPLETE

**Status**: DONE. Audited 15 component directories (96 files), excluding UnifiedAgenticChat.

**Summary**:

- Full inventory of all exported components and props interfaces across 15 directories
- 11 files with 13 direct @tauri-apps imports (should use tauri-mock wrapper)
- Scheduler dual-naming confirmed: Job system (old, exported) vs Task system (new, actively used, NOT exported)
- 3 potentially dead components: ConnectorsDialog, MobileCompanionWorkspace, ROIDashboardPage
- ComputerUse/ missing barrel export (index.ts)
- Artifacts and Scheduler index.ts have incomplete exports

**Issues found**:

- COMP-01 (MEDIUM): 13 direct @tauri-apps imports in 11 files break web-mode
- COMP-02 (MEDIUM): Scheduler index.ts only exports old Job system, not active Task system
- COMP-03 (LOW): ComputerUse/ has no index.ts
- COMP-04 (LOW): 3 potentially dead components
- COMP-05 (INFO): Artifacts index.ts intentionally omits internal components

**Full report**: See LOGIC_REPORT.md (BATCH-04 + BATCH-05 section)

#### BATCH-07: Rust LLM Core (explorer-rust-core) -- COMPLETE

**Status**: DONE. Full audit of all 37 files in `core/llm/`.

**Summary**:

- 12 LLM providers fully supported (OpenAI, Anthropic, Google, Ollama, Perplexity, XAI, DeepSeek, Qwen, Moonshot, Zhipu, Mistral, ManagedCloud)
- ALL providers have complete SSE parsing (4 dedicated + 8 reuse OpenAI-compatible)
- ALL providers have complete request/response adapters
- Zero `#[tauri::command]` in this module (pure library, consumed by sys/commands/)
- Zero `panic!()` in production code (all instances in test code)
- Zero TODO/FIXME/HACK in production code
- Zero `unimplemented!()` in production code
- Ollama capability detection FULLY FUNCTIONAL (real /api/show probing, 21 model families, cached)
- Tool executor FULLY FUNCTIONAL (40+ tools, result feedback loop works, ToolEvent emission)
- Session cost safety cap ($50) enforced on both streaming and non-streaming paths
- Model catalog is single-source-of-truth from models.json (compile-time embedded)

**Issues found** (all LOW/INFO severity):

- LLM-01: Hardcoded "gpt-5.2" fallback for auto model (should use catalog)
- LLM-02: Same hardcoded fallback duplicated in streaming path
- LLM-03: No set_mistral() convenience method (minor inconsistency)
- LLM-04: Empty test module in function_executor.rs
- LLM-05: BackgroundManager unused webhook params, no async processing

**Full report**: See LOGIC_REPORT.md (BATCH-07 section) and WIRING_REPORT.md (BATCH-07 section)

#### BATCH-06: UnifiedAgenticChat (explorer-chat-auditor) -- COMPLETE

**Status**: DONE. Deep audit of all 144 files in `components/UnifiedAgenticChat/`.

**Summary**:

- Complete data flow mapped: user input → useChatSubmit → index.tsx handleSendMessage → ipcInvoke('chat_send_message', {request}) → Rust → SSE stream → toolStore/chatStore/agentStore → UI render
- Tool event chain VERIFIED: Rust emits `tool:event` → `toolStore.initializeToolEventListener()` dispatches to 3 stores (useToolStore, useChatStore, useAgentStore) → ToolLabel + ToolTimeline render
- Tool results flow through `upsertToolArtifact()` → `message.artifacts` → `ChatStream.tsx` → `InlineToolResults/` (ToolCallCard intentionally shows status only — by design)
- Dual pending-message paths confirmed CORRECT: `useChatSubmit.ts:99` (queue mode from ChatInputArea) vs `index.tsx:2016` (agentic loop active) — different scenarios, not a bug
- IPC parameter casing VERIFIED: `chat_send_message` uses `{request}` wrapper with serde deserialization, so snake_case fields inside request body are correct
- Stream batching uses RequestAnimationFrame to prevent React saturation
- 5-priority `resolveStreamTargetMessageId()` for correct message targeting
- 120-second inactivity watchdog for stuck loading states

**Issues found**:

- CHAT-01 (MEDIUM): 2 orphaned components never imported anywhere: `BrowserActivityBadge.tsx`, `PendingMessagesIndicator.tsx`
- CHAT-02 (MEDIUM): `conversation_id: null` in queue mode invoke (line 103 of useChatSubmit.ts) — snake_case inside `{request}` wrapper is correct for serde, but hardcoded null means queued messages are never associated with a conversation
- CHAT-03 (VERIFIED CLEAN): All 23 props on MessageActions are used
- CHAT-04 (VERIFIED CLEAN): Zero TODO/FIXME/HACK in production code
- CHAT-05 (VERIFIED CLEAN): All imports resolve correctly
- CHAT-06 (VERIFIED CLEAN): All Tauri event listeners properly cleaned up in useEffect return
- CHAT-07 (VERIFIED CLEAN): DynamicSidecar 26 panel types all have lazy-loaded components
- CHAT-08 (VERIFIED CLEAN): ToolTimeline parallel group support works correctly
- CHAT-09 (VERIFIED CLEAN): Thinking block parser supports 6 provider formats

**Full report**: See LOGIC_REPORT.md (BATCH-06 section)

#### BATCH-10+11: Rust sys/commands/ (wave1-rust-sys-auditor) -- COMPLETE

**Status**: DONE. Full audit of all 90 files with `#[tauri::command]` in `sys/commands/`, plus 8 additional command modules.

**Summary**:

- **1,324 total registered Tauri commands** (documentation said "60+" — vastly understated)
- **0 dead commands**: Every declared `#[tauri::command]` function is registered in `generate_handler![]`
- **Scheduler naming CONSISTENT**: All 10 scheduler commands use `_job` suffix. No `_task` mismatch in Rust backend. Frontend `schedulerStore.ts` calls match.
- **90 command files** in sys/commands/ covering 40+ domains
- **54 additional commands** in sys/account (10), sys/billing (19), sys/diagnostics (6), sys/error (7), sys/filesystem (2), features/updater (5), features/search (1), core/codebase (4)
- **5 cfg-gated commands** (updater, excluded in App Store builds)
- **Largest modules**: sys::commands flat (1,013), voice (42), browser (50+), automation (48), marketplace/workflows (52)

**Issues found**:

- SYS-01 (INFO): Command count documentation is stale — "60+ Tauri commands" should be "1,324 Tauri commands"
- SYS-02 (RESOLVED): Scheduler _task vs \_job naming mismatch — DOES NOT EXIST in Rust. All 10 commands are `scheduler_\*\_job`. If there was a mismatch, it was on a different store or already fixed.
- SYS-03 (INFO): Several scheduler commands accept dual params (`job_id` OR `id`) for backward compat — intentional per code comments.

**Full report**: See WIRING_REPORT.md (BATCH-10+11 section)

---

## Wave 2 Plan (pre-filled by state-manager after Wave 1)

- Focus: Rust `#[tauri::command]` cross-reference with TS `invoke()` calls
- Focus: Store actions that are defined but never called
- Focus: Broken import chains

## Wave 3 Plan

- Deep logic audit on core/llm, core/agent, core/agi

## Wave 4+ Plan

- Test writing starting with stores and critical services
