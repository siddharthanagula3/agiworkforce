# AGI Workforce — Full Codebase Audit Manifest

Generated: 2026-03-06
Total source files (excluding tests, dist, .next, target): **2,631**
Rust files: 649 | Desktop TS: 703 | Web TS/TSX: 1,088 | Mobile: 108 | Services: 48 | Extension: 11 | VSCode Ext: 15 | Packages: 14

## Directory Size Summary

| Directory                  | Size |
| -------------------------- | ---- |
| apps/web                   | 157M |
| apps/desktop/src-tauri/src | 12M  |
| apps/desktop/src           | 8.5M |
| services                   | 1.5M |
| apps/mobile                | 1.2M |
| apps/extension-vscode      | 800K |
| apps/extension             | 660K |
| packages                   | 392K |

---

## Wave Structure

- Wave 1 (DISCOVERY): 5 agents, read-only mapping of exports/imports/types
- Wave 2 (WIRING AUDIT): 5 agents, cross-reference Rust commands vs TS invoke(), dead code
- Wave 3 (LOGIC AUDIT): 5 agents, hallucinated logic, broken integrations, naming mismatches
- Wave 4 (TEST WRITING A): 5 agents, write tests for high-priority batches
- Wave 5 (TEST WRITING B): 5 agents, continue test coverage

---

## Batch Assignments

### BATCH-01 — Desktop TS: Stores (49 files)

**Assigned to**: WAVE-1 Agent 1 (explorer-desktop-ts)
**Status**: PENDING
**Est. tokens**: ~35k
**Files**:

- apps/desktop/src/stores/ (all 49 .ts files, excluding test files)

Key files: auth.ts, authOrchestrator.ts, chat/chatStore.ts, chat/toolStore.ts, settingsStore.ts, modelStore.ts, mcpAppStore.ts, memoryStore.ts, schedulerStore.ts, automationStore.ts, connectorsStore.ts, emailStore.ts, logoutCleanup.ts, productivityStore.ts, researchStore.ts, terminalStore.ts, updaterStore.ts

---

### BATCH-02 — Desktop TS: Hooks + Services + API (90 files)

**Assigned to**: WAVE-1 Agent 2 (explorer-desktop-ts)
**Status**: PENDING
**Est. tokens**: ~45k
**Files**:

- apps/desktop/src/hooks/ (46 files)
- apps/desktop/src/services/ (19 files)
- apps/desktop/src/api/ (25 files)

---

### BATCH-03 — Desktop TS: Lib + Utils + Constants + Types + Providers (75 files)

**Assigned to**: WAVE-1 Agent 1 (explorer-desktop-ts) [secondary]
**Status**: PENDING
**Est. tokens**: ~30k
**Files**:

- apps/desktop/src/lib/ (23 files)
- apps/desktop/src/utils/ (16 files)
- apps/desktop/src/constants/ (7 files)
- apps/desktop/src/types/ (29 files)
- apps/desktop/src/providers/ (2 files)

---

### BATCH-04 — Desktop Components A: AGI + Artifacts + Auth + Canvas (50 files)

**Assigned to**: WAVE-1 Agent 2
**Status**: PENDING
**Est. tokens**: ~40k
**Files**:

- apps/desktop/src/components/AGI/ (~10 files)
- apps/desktop/src/components/Artifacts/ (~12 files)
- apps/desktop/src/components/Auth/ (~5 files)
- apps/desktop/src/components/Canvas/ (~8 files)
- apps/desktop/src/components/ComputerUse/ (~8 files)
- apps/desktop/src/components/Documents/ (~7 files)

---

### BATCH-05 — Desktop Components B: Connectors + MCP + Marketplace + Mobile + Research (55 files)

**Assigned to**: WAVE-1 Agent 3
**Status**: PENDING
**Est. tokens**: ~40k
**Files**:

- apps/desktop/src/components/Connectors/ (~5 files)
- apps/desktop/src/components/MCP/ (~5 files)
- apps/desktop/src/components/Marketplace/ (~8 files)
- apps/desktop/src/components/Mobile/ (~6 files)
- apps/desktop/src/components/Research/ (~7 files)
- apps/desktop/src/components/ROIDashboard/ (~3 files)
- apps/desktop/src/components/Scheduler/ (~6 files)
- apps/desktop/src/components/Settings/ (~7 files)
- apps/desktop/src/components/Updates/ (~3 files)

---

### BATCH-06 — Desktop UnifiedAgenticChat (144 files — high priority)

**Assigned to**: WAVE-1 Agent 3 + Agent 4 (split)
**Status**: PENDING
**Est. tokens**: ~80k (split across 2 agents)
**Files**:

- apps/desktop/src/components/UnifiedAgenticChat/ (all 144 files)
  - BATCH-06A (Agent 3): MessageBubble/, hooks/, ToolLabel.tsx, ToolTimeline.tsx, ChatInputArea.tsx, ChatInputToolbar.tsx
  - BATCH-06B (Agent 4): index.tsx, ArtifactRenderer.tsx, DynamicSidecar.tsx, InputToolbar.tsx, remaining files

---

### BATCH-07 — Rust core/llm (LLM routing — critical)

**Assigned to**: WAVE-1 Agent 5 (explorer-rust)
**Status**: PENDING
**Est. tokens**: ~50k
**Files**:

- apps/desktop/src-tauri/src/core/llm/ (~30 .rs files)
  Including: llm_router.rs (2274 lines), sse_parser.rs, provider_adapter.rs, capability_detection.rs, tool_executor.rs, cost_calculator.rs

---

### BATCH-08 — Rust core/agent + core/swarm + core/research (45 files)

**Assigned to**: WAVE-2 Agent 1 (wiring-auditor)
**Status**: PENDING
**Est. tokens**: ~45k
**Files**:

- apps/desktop/src-tauri/src/core/agent/ (~12 files)
- apps/desktop/src-tauri/src/core/swarm/ (~8 files)
- apps/desktop/src-tauri/src/core/research/ (~5 files)

---

### BATCH-09 — Rust core/agi + core/mcp + core/embeddings (50 files)

**Assigned to**: WAVE-2 Agent 2
**Status**: PENDING
**Est. tokens**: ~45k
**Files**:

- apps/desktop/src-tauri/src/core/agi/ (~25 files)
- apps/desktop/src-tauri/src/core/mcp/ (~15 files)
- apps/desktop/src-tauri/src/core/embeddings/ (~10 files)

---

### BATCH-10 — Rust sys/commands A (first 50 command files)

**Assigned to**: WAVE-2 Agent 3 (wiring-auditor)
**Status**: PENDING
**Est. tokens**: ~50k
**Files**: First 50 files from apps/desktop/src-tauri/src/sys/commands/ alphabetically

---

### BATCH-11 — Rust sys/commands B + sys/security + sys/billing (remaining sys files)

**Assigned to**: WAVE-2 Agent 4
**Status**: PENDING
**Est. tokens**: ~45k
**Files**:

- apps/desktop/src-tauri/src/sys/commands/ (remaining ~80 files)
- apps/desktop/src-tauri/src/sys/security/ (~8 files)
- apps/desktop/src-tauri/src/sys/billing/, sys/diagnostics/, sys/telemetry/ (~10 files)

---

### BATCH-12 — Rust automation + features (140 files)

**Assigned to**: WAVE-2 Agent 5 + WAVE-3 Agent 1 (split)
**Status**: PENDING
**Est. tokens**: ~70k
**Files**:

- apps/desktop/src-tauri/src/automation/ (~51 files) — BATCH-12A
- apps/desktop/src-tauri/src/features/ (~89 files) — BATCH-12B

---

### BATCH-13 — Rust data + integrations + models + ui + lib.rs + state.rs (65 files)

**Assigned to**: WAVE-3 Agent 2
**Status**: PENDING
**Est. tokens**: ~40k
**Files**:

- apps/desktop/src-tauri/src/data/ (~40 files)
- apps/desktop/src-tauri/src/integrations/ (~24 files)
- apps/desktop/src-tauri/src/models/ (~2 files)
- apps/desktop/src-tauri/src/ui/ (~21 files)
- apps/desktop/src-tauri/src/lib.rs, state.rs, main.rs

---

### BATCH-14 — Web App Routes + API Routes (147 files)

**Assigned to**: WAVE-3 Agent 3
**Status**: PENDING
**Est. tokens**: ~50k
**Files**:

- apps/web/app/ (all 147 .ts/.tsx files)

---

### BATCH-15 — Web Features: chat + billing (100 files)

**Assigned to**: WAVE-3 Agent 4
**Status**: PENDING
**Est. tokens**: ~50k
**Files**:

- apps/web/features/chat/ (~65 files)
- apps/web/features/billing/ (~20 files)
- apps/web/features/support/ (~5 files)

---

### BATCH-16 — Web Features: vibe + mission-control + pages + settings + media + workforce (80 files)

**Assigned to**: WAVE-3 Agent 5
**Status**: PENDING
**Est. tokens**: ~45k
**Files**:

- apps/web/features/vibe/ (~40 files)
- apps/web/features/mission-control/ (~10 files)
- apps/web/features/pages/ (~8 files)
- apps/web/features/settings/ (~8 files)
- apps/web/features/media/ (~5 files)
- apps/web/features/workforce/ (~9 files)

---

### BATCH-17 — Web Shared (180 files)

**Assigned to**: WAVE-4 Agent 1 + Agent 2 (split)
**Status**: PENDING
**Est. tokens**: ~80k
**Files**:

- apps/web/shared/components/ (~60 files) — BATCH-17A
- apps/web/shared/stores/ (~30 files) — BATCH-17B
- apps/web/shared/hooks/ (~20 files)
- apps/web/shared/services/ (~20 files)
- apps/web/shared/lib/ (~30 files)
- apps/web/shared/ui/ (~20 files)

---

### BATCH-18 — Web Components (209 files)

**Assigned to**: WAVE-4 Agent 3 + Agent 4 (split)
**Status**: PENDING
**Est. tokens**: ~80k
**Files**:

- apps/web/components/ (all 209 files)
  - BATCH-18A: UnifiedAgenticChat/, layout/, marketing/
  - BATCH-18B: remaining

---

### BATCH-19 — Web Core + Stores + Hooks + Utils (125 files)

**Assigned to**: WAVE-4 Agent 5
**Status**: PENDING
**Est. tokens**: ~50k
**Files**:

- apps/web/core/ (~70 files)
- apps/web/stores/ (~34 files)
- apps/web/hooks/ (~21 files)
- apps/web/utils/ (~19 files)
- apps/web/constants/ (~4 files)

---

### BATCH-20 — Mobile + Services + Extension + VSCode Extension + Packages (196 files)

**Assigned to**: WAVE-5 Agent 1
**Status**: PENDING
**Est. tokens**: ~50k
**Files**:

- apps/mobile/ (~108 files)
- services/ (~48 files)
- apps/extension/ (~11 files)
- apps/extension-vscode/src/ (~15 files)
- packages/ (~14 files)

---

## Completion Tracker

| Batch    | Description                       | Wave  | Agent              | Status  |
| -------- | --------------------------------- | ----- | ------------------ | ------- |
| BATCH-01 | Desktop Stores                    | W1    | explorer-desktop-A | PENDING |
| BATCH-02 | Desktop Hooks+Services+API        | W1    | explorer-desktop-B | PENDING |
| BATCH-03 | Desktop Lib+Utils+Constants+Types | W1    | explorer-desktop-A | PENDING |
| BATCH-04 | Desktop Components A              | W1    | explorer-desktop-B | PENDING |
| BATCH-05 | Desktop Components B              | W1    | explorer-desktop-C | PENDING |
| BATCH-06 | Desktop UnifiedAgenticChat        | W1    | explorer-chat-A/B  | PENDING |
| BATCH-07 | Rust core/llm                     | W1    | explorer-rust-A    | PENDING |
| BATCH-08 | Rust core/agent+swarm+research    | W2    | wiring-auditor-A   | PENDING |
| BATCH-09 | Rust core/agi+mcp+embeddings      | W2    | wiring-auditor-B   | PENDING |
| BATCH-10 | Rust sys/commands A               | W2    | wiring-auditor-C   | PENDING |
| BATCH-11 | Rust sys/commands B+security      | W2    | wiring-auditor-D   | PENDING |
| BATCH-12 | Rust automation+features          | W2/W3 | wiring-auditor-E   | PENDING |
| BATCH-13 | Rust data+integrations+models     | W3    | logic-auditor-A    | PENDING |
| BATCH-14 | Web App+API routes                | W3    | logic-auditor-B    | PENDING |
| BATCH-15 | Web features/chat+billing         | W3    | logic-auditor-C    | PENDING |
| BATCH-16 | Web features/vibe+etc             | W3    | logic-auditor-D    | PENDING |
| BATCH-17 | Web shared                        | W4    | test-writer-A/B    | PENDING |
| BATCH-18 | Web components                    | W4    | test-writer-C/D    | PENDING |
| BATCH-19 | Web core+stores+hooks             | W4    | test-writer-E      | PENDING |
| BATCH-20 | Mobile+Services+Extension         | W5    | test-writer-F      | PENDING |
