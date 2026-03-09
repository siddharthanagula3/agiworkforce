# AGI Workforce — Stabilization Roadmap

**Generated**: 2026-03-08 | **Fact-checked**: 2026-03-09
**Methodology**: Full codebase read-only audit (8 parallel agents + direct verification + fact-check pass)
**Scope**: All 8 applications, Rust backend, shared packages, migrations, CI/CD
**Previous audit**: 2026-03-06 (Production Readiness Sprint P1-P10)

---

## 1. Executive Summary

### Post-Sprint State

The codebase has undergone **6 sprints (65 tasks)** since the last major audit. All 63 issues from the Master Plan issue registry are resolved. All 8 critical path items from the Master Plan are FIXED. The Production Readiness Sprint (P1-P10) + 5 additional sprints systematically eliminated every P0/P1 issue.

**Current metrics:**

- **0** web TypeScript errors
- **0** desktop TypeScript errors
- **0** Rust clippy warnings
- **0** ESLint warnings
- **0** snake_case IPC parameter bugs (64 were fixed)
- **1,233** Tauri command definitions, **~683** registered in `generate_handler![]`
- **137** Zustand store files, **75** component directories
- **10** Supabase migrations (conversations + messages + workforce tables added)
- **38** non-test files still bypassing tauri-mock wrapper
- **5** confirmed dead components already DELETED

### Biggest Risk

**God-object decomposition incomplete.** `auth.ts` (1,545 lines) and `useAgenticEvents.ts` (2,580 lines) remain monolithic despite partial decomposition (`authCoreStore.ts` 311 lines + `billingStore.ts` 500 lines exist but aren't primary consumers). These files are the #1 source of merge conflicts and cognitive overhead.

### Biggest Opportunity

**Feature surface is 90% wired.** Research panel, canvas/artifacts, and workflow builder all have frontend components AND Rust backends. Skills are invoked via slash commands. The gap is polish and discoverability — not wiring. Shipping a "Featured Tools" panel on the chat sidebar would surface these capabilities immediately.

---

## 2. P0 Critical Bugs

**NONE.**

All P0 issues from previous audits are resolved:

- Snake_case IPC parameter bugs: **FIXED** (verified 0 matches)
- Hardcoded `gpt-5.2` fallback: **FIXED** (0 matches)
- JSON-RPC notifications with `null` id: **FIXED** (`transport.rs:655-659`)
- Tool result feedback loop: **IMPLEMENTED** (`autonomous.rs:1041-1117`)
- Budget enforcement: **TWO-STAGE GATES** (pre-step + post-step)
- Scheduler `run_job_now` stub: **FIXED** (dispatches all 6 `JobAction` types)
- Web auth stub: **FIXED** (real Supabase store, 302 lines)
- Web billing usage stub: **FIXED** (real store, 220 lines, token tracking + budget alerts)
- Chrome `alert()` blocking automation: **FIXED** (replaced with non-blocking)
- Chrome side panel persistence: **FIXED** (conversation history persisted)
- VS Code telemetry no-op: **FIXED** (real HTTP POST)
- Mobile EAS credentials: **FIXED** (Apple Team ID + Expo projectId filled)
- Cross-surface conversation sync: **FIXED** (6 new Supabase migrations)
- Agent approval safety gate: **FIXED** (secondary gate for dangerous ops with auto_approve)
- Task/scheduler store consolidation: **FIXED** (`scheduledTaskStore` merged into `schedulerStore`)

---

## 3. P1 Broken Wiring

### 3.1 — 38 Direct @tauri-apps Imports (Web-Mode Breakage)

**Impact**: Components crash when running in web mode; desktop/web parity testing fails.
**Root cause**: 38 non-test files import `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`, etc. directly instead of through the `tauri-mock` wrapper module.

| Category                          | Count | Example Files                                                                  |
| --------------------------------- | ----- | ------------------------------------------------------------------------------ |
| Plugin imports (dialog, fs, path) | ~15   | `SettingsPanel.tsx`, `AllowedDirectoriesSettings.tsx`, `DocumentGenerator.tsx` |
| API event imports (listen)        | ~8    | `ArtifactRenderer.tsx`, `PlusMenu.tsx`, `screenWatcher.ts`                     |
| API core imports (invoke)         | ~6    | `ChatInputArea.tsx`, `Sidebar.tsx`, `ShareConversationDialog.tsx`              |
| Hooks/stores                      | ~5    | `calendarStore.ts`, `useEmail.ts`, `useGit.ts`                                 |
| Other (navigation, utils)         | ~4    | `navigation.ts`, `ipc.ts`, `browserAutomation.ts`                              |

**Fix**: Wrap each import through `src/lib/tauri-mock.ts`. Test files (5 additional) can use direct imports if properly mocked.
**Effort**: 4-6 hours (mechanical)
**Sprint**: S1

### 3.2 — ~200 Dead Rust Commands

**Impact**: ~1,233 `#[tauri::command]` annotations exist, ~683 are registered in `generate_handler![]`. After accounting for internal tool executor calls (verified in DEAD_COMMANDS_AUDIT), approximately ~200 commands are truly dead — defined but never called from frontend invoke() or internal Rust tool dispatch.

**Fix**: Remove unused `#[tauri::command]` annotations and their function bodies. Keep functions used internally by Rust code (remove just the annotation).
**Effort**: 6-8 hours
**Sprint**: S2

---

## 4. P2 Architecture Gaps

### 4.1 — God-Store: `auth.ts` (1,545 lines)

**Current state**: Handles auth identity, subscription/plan, feature flags, account profile, billing/credits, and device linking — all in one file. Contains a 50-line TODO comment (lines 23-70) proposing decomposition into 7 stores.

**Partial decomposition exists**:

- `authCoreStore.ts` (311 lines) — created but not primary consumer
- `billingStore.ts` (500 lines) — created but `auth.ts` still holds billing state

**What should be split**:

| Concern           | Target Store               | Lines to Extract |
| ----------------- | -------------------------- | ---------------- |
| Subscription/Plan | `subscriptionPlanStore.ts` | ~150             |
| Device Linking    | `deviceLinkStore.ts`       | ~80              |
| Feature Flags     | `featureFlagStore.ts`      | ~60              |

**Sprint**: S2

### 4.2 — God-Hook: `useAgenticEvents.ts` (2,580 lines)

**Current state**: Handles 39+ distinct Tauri event types in a single hook.

**Sub-hooks exist but don't reduce the god-hook**:

- `useAgentLoopEvents.ts` (676 lines)
- `useToolEvents.ts` (593 lines)
- `useNotificationEvents.ts` (680 lines)
- Total sub-hooks: 1,949 lines — but `useAgenticEvents.ts` remains at 2,580 lines (logic not migrated)

**Fix**: Migrate remaining logic to sub-hooks and reduce `useAgenticEvents.ts` to a thin composition layer.
**Sprint**: S2

### 4.3 — MCP Health Tracking Exists but No Circuit Breaker

**Current state**: MCP has health monitoring with `consecutive_failures` tracking (`core/mcp/health.rs:27`). Tool execution has timeout support (`tool_executor.rs:167-180`). However, there is no fail-fast circuit breaker that prevents retrying a consistently-failing MCP server.

**Fix**: Add circuit breaker logic in health.rs — mark server as `CircuitOpen` after 5 consecutive failures, auto-reset after 60s cooldown.
**Effort**: 3 hours
**Sprint**: S3

### 4.4 — Feature UI Polish Gaps

Features have both backend AND frontend components but need polish:

| Feature           | Backend                                     | Frontend                                                                | Gap                                               |
| ----------------- | ------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| Workflow Builder  | 7 node types, async executor, DB tracking   | `WorkflowBuilder.tsx`, `execute_workflow` wired via `useWorkflows.ts`   | Polish: node editor UX, error visualization       |
| Research Pipeline | `research_start`, `research_quick` commands | `ResearchPanel.tsx`, `ResearchReport.tsx`, `researchStore.ts` all wired | Polish: progress visualization, source cards      |
| Canvas/Artifacts  | Full A2UI protocol, 13+ canvas commands     | `CanvasWorkspace.tsx`, `ArtifactPreview.tsx`, `artifactStore.ts` wired  | Polish: inline rendering in chat, element editing |
| Skills            | 140 skills, `skill_list/get/invoke`         | Invoked via `slashCommandHandlers.ts`, listed in Settings               | Gap: dedicated browsable skill marketplace panel  |

**Sprint**: S3-S4

### 4.5 — Optional Feature Commands Not Gated

Only `shell` and `updater` have `#[cfg(feature)]` guards in lib.rs (7 total). Commands for `ocr`, `local-llm`, `local-whisper`, `webrtc-support` are unconditionally registered.

**Fix**: Add `#[cfg(feature)]` guards or use runtime `capabilities::get_capabilities` detection.
**Sprint**: S2

---

## 5. Quick Wins (Under 4 Hours Each)

| #     | Item                                                                              | Effort     | Impact             | Status                                             |
| ----- | --------------------------------------------------------------------------------- | ---------- | ------------------ | -------------------------------------------------- |
| ~~1~~ | ~~Update CLAUDE.md command count~~                                                | ~~15 min~~ | ~~Docs~~           | **DONE** (updated to ~683)                         |
| ~~2~~ | ~~Export Task-based scheduler components from barrel file~~                       | ~~30 min~~ | ~~Imports~~        | **DONE** (Scheduler/index.ts exports both systems) |
| ~~3~~ | ~~Remove dead components~~                                                        | ~~1 hr~~   | ~~Bundle~~         | **DONE** (all 5 deleted)                           |
| 4     | Add `ComputerUse/index.ts` barrel export                                          | 15 min     | Import consistency | Open                                               |
| 5     | Add `set_mistral()` convenience method to LLM router                              | 30 min     | API consistency    | Open                                               |
| 6     | Fill empty test module in `function_executor.rs`                                  | 2 hr       | Test coverage      | Open                                               |
| 7     | Standardize scheduler parameter naming (`jobId` vs `id` inconsistency in 3 calls) | 1 hr       | Consistency        | Open                                               |
| 8     | Document model ID format (hyphens internally, `apiModelId` for wire)              | 30 min     | Onboarding         | Open                                               |

---

## 6. Product Surface Health

| Surface               | Score  | Strengths                                                                                                      | Top Gap                                                                  |
| --------------------- | ------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Desktop App**       | 8.5/10 | Zero TS errors, LLM routing (12 providers), tool event pipeline, ToolGuard, research/canvas/workflow all wired | God-store/god-hook decomposition; 38 tauri-mock bypasses                 |
| **Web App**           | 8.5/10 | Nonce-based CSP, 72 API routes, real Supabase auth + billing, 9+ LLM providers, VIBE IDE                       | `style-src 'unsafe-inline'` for Tailwind v4; marketplace/workforce stubs |
| **Chrome Extension**  | 8/10   | Clean MV3, native messaging, job autofill (LinkedIn+Lever+generic), side panel with persistence                | No reconnection UI for native messaging failures                         |
| **VS Code Extension** | 8.5/10 | 18 commands, ghost-text, agent mode, chat participant, real telemetry, full test suite                         | Inline completions require separate API key                              |
| **Mobile App**        | 8/10   | WebRTC desktop pairing, QR scanner, 9 Zustand stores, all 6 screens functional, EAS configured                 | Agent execution visibility; memory management UX                         |

**Combined Score: 8.3/10** — Production-ready

---

## 7. Competitive Gap Table

| Capability                    | AGI Workforce                      | ChatGPT Desktop | Claude Desktop         | Gemini          | Perplexity       |
| ----------------------------- | ---------------------------------- | --------------- | ---------------------- | --------------- | ---------------- |
| Multi-LLM (9+ providers)      | **YES**                            | No              | No                     | No              | No               |
| BYOK + Local LLMs             | **YES** (Ollama+LM Studio)         | No              | No                     | No              | No               |
| Native Desktop Control        | **YES** (screen, keyboard, apps)   | Limited         | **YES** (Computer Use) | No              | No               |
| MCP Tools (unlimited)         | **YES** (stdio+SSE+HTTP)           | No              | **YES** (40 cap)       | No              | No               |
| Mobile Companion              | **YES** (QR pair, live dashboard)  | No desktop link | No                     | No desktop link | No desktop link  |
| Workflow Engine               | **YES** (7 node types)             | No              | No                     | No              | No               |
| 140+ Non-Coding Skills        | **YES**                            | No              | No                     | No              | No               |
| Browser Extension + Autofill  | **YES**                            | No              | No                     | No              | No               |
| VS Code Extension             | **YES** (ghost-text, agent mode)   | No              | No                     | No              | No               |
| Voice Input (PTT + Wake Word) | **YES** (Deepgram, Whisper, Piper) | **YES**         | No                     | **YES**         | No               |
| Research Mode                 | **YES** (UI + backend wired)       | No              | No                     | No              | **YES** (native) |
| Real-time Collaboration       | Partial (WebSocket presence)       | No              | No                     | No              | No               |
| Cross-Surface Sync            | **YES** (Supabase Realtime)        | No              | No                     | No              | No               |

**Key Gaps vs Competition**:

1. **Research polish** — Perplexity's UX is polished; ours has full pipeline but needs progress visualization and source card refinement
2. **Artifact/Canvas polish** — Claude's artifacts are polished; ours has full A2UI protocol but needs inline chat rendering
3. **Agent replay** — Devin-style step-by-step execution logs; we have `ToolTimeline` but no full agent execution replay

---

## 8. Sprint Plan

### Sprint S1: Polish (1 week)

**Goal**: Fix remaining wiring issues, ship remaining quick wins

| #   | Task                                                          | Effort | Priority |
| --- | ------------------------------------------------------------- | ------ | -------- |
| 1   | Fix 38 direct @tauri-apps imports → tauri-mock wrapper        | 4-6 hr | P1       |
| 2   | Remaining 5 Quick Wins from Section 5                         | 4 hr   | P1       |
| 3   | Add `#[cfg(feature)]` guards for optional commands            | 3 hr   | P2       |
| 4   | Standardize scheduler parameter naming (3 inconsistent calls) | 1 hr   | P2       |

**Exit criteria**: Zero web-mode crashes, all Quick Wins merged

### Sprint S2: Decomposition (1 week)

**Goal**: Decompose god-objects; clean dead code

| #   | Task                                                                                        | Effort | Priority |
| --- | ------------------------------------------------------------------------------------------- | ------ | -------- |
| 1   | Split `auth.ts` → `subscriptionPlanStore.ts` + `deviceLinkStore.ts` + `featureFlagStore.ts` | 8 hr   | P1       |
| 2   | Reduce `useAgenticEvents.ts` to composition layer over sub-hooks                            | 6 hr   | P1       |
| 3   | Remove ~200 dead Rust command annotations                                                   | 6 hr   | P2       |

**Exit criteria**: `auth.ts` < 400 lines, `useAgenticEvents.ts` < 200 lines

### Sprint S3: Competitive Polish (1 week)

**Goal**: Polish existing features to competitive parity

| #   | Task                                                                    | Effort | Priority |
| --- | ----------------------------------------------------------------------- | ------ | -------- |
| 1   | MCP circuit breaker (fail-fast on health.rs consecutive_failures)       | 3 hr   | P1       |
| 2   | Research panel polish (progress visualization, source card refinement)  | 6 hr   | P2       |
| 3   | Canvas/Artifact polish (inline chat rendering, element editing)         | 8 hr   | P2       |
| 4   | Build Skill Marketplace browser panel (wire to `skill_list/get/invoke`) | 6 hr   | P2       |
| 5   | VS Code: Inherit desktop session for inline completions                 | 3 hr   | P2       |

**Exit criteria**: MCP circuit breaker active, research and canvas polished

### Sprint S4: Differentiation (1 week)

**Goal**: Ship unique features no competitor has

| #   | Task                                                                  | Effort | Priority |
| --- | --------------------------------------------------------------------- | ------ | -------- |
| 1   | Agent execution replay (full step-by-step timeline with tool results) | 10 hr  | P2       |
| 2   | Real-time collaboration (wire WebSocket presence to team workspace)   | 8 hr   | P2       |
| 3   | Mobile: Agent execution real-time logs view                           | 6 hr   | P2       |
| 4   | Mobile: Memory/knowledge management UI                                | 6 hr   | P2       |

**Exit criteria**: Agent replay polished, collaboration sessions working

---

## 9. Technical Debt Register

| #   | Item                                         | Location                                                       | Impact                            | Sprint  |
| --- | -------------------------------------------- | -------------------------------------------------------------- | --------------------------------- | ------- |
| 1   | `auth.ts` monolith (1,545 lines)             | `stores/auth.ts`                                               | Merge conflicts, cognitive load   | S2      |
| 2   | `useAgenticEvents.ts` monolith (2,580 lines) | `hooks/useAgenticEvents.ts`                                    | Same                              | S2      |
| 3   | 38 tauri-mock bypasses                       | 38 non-test files                                              | Web-mode breakage                 | S1      |
| 4   | ~200 dead Rust commands                      | `src-tauri/src/`                                               | Binary bloat                      | S2      |
| 5   | MCP health tracking without circuit breaker  | `core/mcp/health.rs`                                           | No fail-fast on broken servers    | S3      |
| 6   | Optional feature commands not gated          | `lib.rs` (only shell+updater gated)                            | Runtime errors vs compile errors  | S1      |
| 7   | 3 memory systems coexist                     | `MemoryState`, `ProjectMemoryState`, `chat_memory_integration` | Unclear ownership                 | S3      |
| 8   | 2 task systems coexist                       | `TaskManagerState` + `bg_submit_task` vs `task_create`         | Unclear routing                   | S3      |
| 9   | `style-src 'unsafe-inline'` in web CSP       | `apps/web/proxy.ts`                                            | CSP relaxation for Tailwind/Radix | Backlog |
| 10  | Empty `@webcontainer/api` stub               | `apps/web/next.config.ts:15-18`                                | Sandpack feature incomplete       | Backlog |

---

## 10. Moat — Architectural Advantages to Protect

These are structural advantages that would take competitors 6+ months to replicate. **Do not break these.**

| #   | Advantage                                          | Key Files                                                  | Why It Matters                                                                                                                         |
| --- | -------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Multi-LLM routing with 12 provider adapters**    | `llm_router.rs`, `provider_adapter.rs`, `models_config.rs` | No competitor routes across OpenAI, Anthropic, Google, Ollama, Perplexity, XAI, DeepSeek, Qwen, Moonshot, Zhipu, Mistral, ManagedCloud |
| 2   | **SSE parser with graceful partial-JSON handling** | `sse_parser.rs:142-175`                                    | Robust across all 12 providers — partial JSON non-terminal, provider errors terminal                                                   |
| 3   | **ToolGuard security sandbox**                     | `tool_guard.rs` (1,778 lines)                              | Per-tool rate limits, safety tiers, path traversal + command injection detection. No bypass paths                                      |
| 4   | **Three-tier agent error recovery**                | `autonomous.rs:603-668`                                    | Blind retry → LLM replanning → task failure. Budget gates before AND after each tool call                                              |
| 5   | **Local LLM capability detection**                 | `capability_detection.rs`                                  | Ollama `/api/show` probing with session cache. 21 tool-capable model families                                                          |
| 6   | **Native desktop automation**                      | `automation/`, `computer_use/`                             | Screen capture, input simulation, browser control, OCR, accessibility tree                                                             |
| 7   | **Mobile WebRTC companion**                        | `apps/mobile/stores/connectionStore.ts`                    | QR pair → signaling → RTCPeerConnection → data channel. Zero competitors                                                               |
| 8   | **Cross-surface conversation sync**                | `supabase/migrations/20260308120001-2`                     | Desktop ↔ Web ↔ Mobile ↔ Extension conversation continuity via Supabase Realtime                                                       |

---

## 11. Appendix A — Resolved Issues Registry

All 8 critical path items from the Master Plan are FIXED (Sprint 1):

| #   | Issue                                  | Fix                                               | Sprint Task |
| --- | -------------------------------------- | ------------------------------------------------- | ----------- |
| 1   | `scheduler_run_job_now` was a stub     | Now dispatches all 6 `JobAction` types            | 1.1         |
| 2   | Web auth store was a stub              | Real Supabase store (302 lines)                   | 1.6         |
| 3   | Chrome `alert()` blocked automation    | Replaced with non-blocking                        | 1.4         |
| 4   | Three competing task/scheduler systems | `scheduledTaskStore` merged into `schedulerStore` | 1.3         |
| 5   | No scheduler history endpoint          | `scheduler_get_history` command created           | 1.2         |
| 6   | Agent approval bypass                  | Secondary safety gate for dangerous ops           | 1.14        |
| 7   | Mobile EAS credentials empty           | Apple Team ID + Expo projectId filled             | 1.8         |
| 8   | No cross-surface conversation sync     | 6 new Supabase migrations                         | Sprint 3    |

Previously deleted stale audit documents (superseded by this roadmap):

- `SESSION_STATE.md`, `AUDIT_MANIFEST.md`, `LOGIC_REPORT.md`, `WIRING_REPORT.md`
- `CODERABBIT_REVIEW.md`, `DEAD_COMMANDS_AUDIT.md`, `MIGRATION_AUDIT.md`, `PACKAGES_AUDIT.md`

---

## 12. Appendix B — Verified Facts (Confidence: HIGH)

- **0 snake_case IPC bugs**: Grep for snake_case params in invoke() returns 0 matches
- **38 tauri-mock bypasses**: Non-test files with direct `@tauri-apps` imports (46 total, 38 excluding tests)
- **auth.ts**: 1,545 lines (confirmed via `wc -l`)
- **useAgenticEvents.ts**: 2,580 lines, 3 sub-hooks totaling 1,949 lines
- **Tool result feedback loop**: Implemented at `autonomous.rs:1041-1117`
- **Budget enforcement**: Two-stage gates at `autonomous.rs:509-539` and `767-797`
- **Workflow engine**: 7 node types fully implemented in `workflow_engine.rs` (26KB) + `workflow_executor.rs` (38KB)
- **Research panel**: Full component set (`ResearchPanel.tsx`, `ResearchReport.tsx`, `ResearchHistory.tsx`) + `researchStore.ts` with invoke() calls
- **Canvas/Artifacts**: `CanvasWorkspace.tsx`, `ArtifactPreview.tsx` + `artifactStore.ts` with invoke() calls
- **Scheduler barrel exports**: Task-based AND Job-based components both exported from `Scheduler/index.ts`
- **Dead components**: All 5 confirmed dead components deleted (BrowserActivityBadge, PendingMessagesIndicator, ConnectorsDialog, MobileCompanionWorkspace, ROIDashboardPage)
- **MCP health**: `health.rs:27` tracks `consecutive_failures` per server
- **ToolGuard**: No bypass paths detected
- **SSE parser**: Graceful partial-JSON handling at `sse_parser.rs:142-175`

---

_Last updated: 2026-03-09. Next audit recommended after Sprint S2 completion._
