# Master Fix Plan — AGI Workforce Risk Factor Remediation

**Goal**: Eliminate all risk factors identified in the acquisition valuation memo to increase valuation from $150M-$200M to $200M-$350M+

**Status**: AWAITING CONFIRMATION
**Created**: 2026-03-19
**Estimated Duration**: 3-5 days with 30+ parallel subagents

---

## Risk Factors → Fix Plan

| Risk | Current State | Target State | Impact on Valuation |
|------|--------------|--------------|-------------------|
| Wire ratio | 45.5% (655/1,439) | 80%+ (1,150+/1,439) | -10% → -2% |
| Scheduler naming | _task/_job mismatch | Unified naming | -10% → 0% |
| Agent loop bugs | Potential stability issues | Zero known bugs | -10% → 0% |
| IPC casing | Unknown violations | Zero violations | Part of -10% |
| Stubbed code | Some incomplete modules | Core modules complete | -5% → 0% |

**Combined valuation impact**: Removing these discounts shifts net discount from -30% to -15%, increasing base case from $120M-$250M to $160M-$340M.

---

## Phase 1: IMMEDIATE FIXES (Day 1) — 6 Parallel Agents

### 1.1 Scheduler Naming Fix
- **Agent**: Fix `_task` vs `_job` naming across 6 Tauri commands
- **Files**: `core/scheduler/`, `sys/commands/scheduler.rs`, frontend scheduler stores
- **Scope**: Rename all inconsistent function names, update invoke() calls
- **Risk**: Low (isolated module)
- **Time**: 30 minutes

### 1.2 IPC Casing Audit & Fix
- **Agent**: Find and fix ALL snake_case params in TypeScript invoke() calls
- **Files**: All `apps/desktop/src/api/*.ts`, all stores with invoke()
- **Scope**: Every invoke() call checked for camelCase compliance
- **Risk**: Medium (touching many files, but each change is trivial)
- **Time**: 1 hour

### 1.3 Agent Loop Stability Fix
- **Agent**: Fix all TODO/FIXME/BUG items in `core/agent/`
- **Files**: `autonomous.rs`, `executor.rs`, `planner.rs`, `background_agent.rs`
- **Scope**: Fix potential panics, add missing error handling, tighten loop guards
- **Risk**: Medium (core agent runtime)
- **Time**: 2 hours

### 1.4 Build Verification
- **Agent**: Run `cargo check` + `pnpm typecheck` and fix any errors
- **Files**: Entire codebase
- **Scope**: Zero compile errors
- **Time**: 1 hour

### 1.5 Lint & Format
- **Agent**: Run `cargo clippy --fix` + `pnpm lint --fix` + `pnpm format`
- **Files**: Entire codebase
- **Scope**: Zero warnings
- **Time**: 30 minutes

### 1.6 Test Verification
- **Agent**: Run existing tests to establish baseline
- **Files**: Test files
- **Scope**: Know what passes/fails before making changes
- **Time**: 30 minutes

---

## Phase 2: WIRING BLITZ (Days 2-3) — 28 Parallel Agents

Wire the top 28 unwired command modules. Each agent:
1. Reads the Rust command file to understand params/return types
2. Creates/updates a TypeScript API wrapper in `apps/desktop/src/api/`
3. Creates/updates the Zustand store to use the new API
4. Wires the store into the existing UI component (if one exists)
5. Verifies invoke() param casing is camelCase

### Batch A — High-Value (largest unwired modules)

| # | Module | Commands | Agent Task |
|---|--------|----------|-----------|
| 1 | `database.rs` | 64 | Wire SQL operations → `api/database.ts` → `databaseStore.ts` → DatabaseWorkspace |
| 2 | `browser.rs` | 56 | Wire browser automation → `api/browser.ts` → `browserStore.ts` → BrowserViewer |
| 3 | `voice.rs` | 47 | Wire voice I/O → `api/voice.ts` → `voiceModeStore.ts` → VoiceMode |
| 4 | `memory.rs` | 39 | Wire memory ops → `api/memory.ts` → `memoryStore.ts` → MemoryManager |
| 5 | `marketplace.rs` | 36 | Wire marketplace → `api/marketplace.ts` → `marketplaceStore.ts` → MarketplacePage |
| 6 | `git.rs` | 36 | Wire git ops → `api/git.ts` → `gitStore.ts` → Git component |
| 7 | `agi.rs` | 34 | Wire AGI autonomy → `api/agi.ts` → `agentTaskStore.ts` → AGI components |

### Batch B — Medium-Value

| # | Module | Commands | Agent Task |
|---|--------|----------|-----------|
| 8 | `analytics.rs` | 29 | Wire analytics → `api/analytics.ts` → existing analytics store |
| 9 | `teams.rs` | 26 | Wire teams → `api/teams.ts` → `teamStore.ts` → TeamSettings |
| 10 | `automation_enhanced.rs` | 26 | Wire enhanced automation → `api/automation.ts` → `automationStore.ts` |
| 11 | `mcp.rs` | 25 | Wire MCP commands → `api/mcp.ts` → `mcpStore.ts` → MCPWorkspace |
| 12 | `email.rs` | 24 | Wire email → `api/email.ts` → `emailStore.ts` → EmailWorkspace |
| 13 | `artifacts.rs` | 24 | Wire artifacts → `api/artifacts.ts` → `artifactStore.ts` → ArtifactPanel |
| 14 | `file_ops.rs` | 22 | Wire file ops → `api/fileOps.ts` → `filesystemStore.ts` → FilesystemWorkspace |

### Batch C — Supporting Modules

| # | Module | Commands | Agent Task |
|---|--------|----------|-----------|
| 15 | `cache.rs` | 22 | Wire cache management → `api/cache.ts` → `cacheStore.ts` |
| 16 | `tutorials.rs` | 21 | Wire tutorials → `api/tutorials.ts` → Tutorials component |
| 17 | `onboarding.rs` | 21 | Wire onboarding → `api/onboarding.ts` → `onboardingStore.ts` |
| 18 | `undo.rs` | 18 | Wire undo system → `api/undo.ts` → execution store |
| 19 | `terminal.rs` | 18 | Wire terminal → `api/terminal.ts` → `terminalStore.ts` |
| 20 | `background_tasks.rs` | 18 | Wire bg tasks → `api/backgroundTasks.ts` → `backgroundTaskStore.ts` |
| 21 | `tool_confirmation.rs` | 17 | Wire tool confirm → existing toolStore |
| 22 | `metrics.rs` | 17 | Wire metrics → `api/metrics.ts` → analytics store |
| 23 | `lsp.rs` | 17 | Wire LSP → `api/lsp.ts` → code store |
| 24 | `productivity.rs` | 16 | Wire productivity → `api/productivity.ts` → `productivityStore.ts` |
| 25 | `ocr.rs` | 16 | Wire OCR → `api/ocr.ts` → vision store |
| 26 | `api.rs` | 15 | Wire API management → `api/apiManagement.ts` → `apiStore.ts` |
| 27 | `task_persistence.rs` | 14 | Wire task persistence → existing stores |
| 28 | `orchestration.rs` | 14 | Wire orchestration → `api/orchestrator.ts` → agent stores |

### Expected Outcome
- **Before**: 655 invoke() calls (45.5% wire ratio)
- **After**: 655 + ~500 new = ~1,155 invoke() calls (80%+ wire ratio)
- **New API files created**: ~20
- **Stores updated**: ~25

---

## Phase 3: VERIFICATION (Day 4) — 6 Parallel Agents

### 3.1 Build Check
- `cargo check` — zero errors
- `pnpm typecheck` — zero errors

### 3.2 Lint Check
- `cargo clippy` — zero warnings
- `pnpm lint` — zero warnings

### 3.3 IPC Casing Sweep
- Re-scan all new invoke() calls for camelCase compliance
- Zero snake_case params in TypeScript

### 3.4 Wire Ratio Verification
- Count invoke() calls again
- Verify 80%+ ratio achieved

### 3.5 Integration Test
- Run `pnpm test` on desktop
- Run `cargo test` on Rust

### 3.6 Security Scan
- No hardcoded secrets in new files
- No eval() or dynamic code execution
- All new invoke() calls have try/catch

---

## Phase 4: DOCUMENTATION & CLEANUP (Day 5) — 4 Parallel Agents

### 4.1 Update CLAUDE.md
- Update codebase metrics (LOC, command count, wire ratio)
- Document new API modules

### 4.2 Update Valuation Memo
- Recalculate with fixed risk factors
- Update price range

### 4.3 Git Commit
- Stage all changes
- Commit with proper convention: `fix(wiring): wire 500+ commands, fix scheduler naming, agent loop stability`

### 4.4 Final Inventory
- Re-run full codebase inventory
- Update CODEBASE_INVENTORY.md

---

## Parallel Agent Assignment Summary

| Phase | Agents | Duration | Dependencies |
|-------|--------|----------|-------------|
| Phase 1 | 6 | Day 1 | None |
| Phase 2 | 28 | Days 2-3 | Phase 1 complete |
| Phase 3 | 6 | Day 4 | Phase 2 complete |
| Phase 4 | 4 | Day 5 | Phase 3 complete |
| **Total** | **44 agents** | **5 days** | |

---

## Success Criteria

- [ ] Wire ratio: 80%+ (from 45.5%)
- [ ] Scheduler: zero _task/_job mismatches
- [ ] Agent loop: zero known stability bugs
- [ ] IPC casing: zero violations
- [ ] Build: `cargo check` + `pnpm typecheck` pass
- [ ] Lint: `cargo clippy` + `pnpm lint` pass
- [ ] Tests: no regressions from baseline
- [ ] Security: no new vulnerabilities introduced

---

## Risk Mitigation

- Each wiring agent works in isolation (one module = one agent)
- No agent modifies another agent's files
- API wrappers go in `api/` (new files, no conflicts)
- Store updates are additive (new methods, not changes to existing)
- Phase 3 catches any cross-agent conflicts before commit
