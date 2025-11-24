# AGI Workforce Desktop: MASTER TODO LIST

## Updated: November 24, 2025

> **IMPORTANT**: This is the single source of truth for all refactoring tasks.
> ✅ = Completed | 🔄 = In Progress | ❌ = Not Started

---

## 📊 PROGRESS TRACKER

| Phase                      | Status         | Progress | Notes                     |
| -------------------------- | -------------- | -------- | ------------------------- |
| Phase 1: Critical Fixes    | 🔄 In Progress | 0/15     | TypeScript errors remain  |
| Phase 2: Chat Migration    | ❌ Not Started | 0/8      | Chat/ folder still exists |
| Phase 3: Store Fixes       | ❌ Not Started | 0/7      | All store errors present  |
| Phase 4: UI/UX Cleanup     | ❌ Not Started | 0/6      | Unused imports remain     |
| Phase 5: Advanced Features | ❌ Not Started | 0/5      | Enhancement phase         |

---

## 🔴 PHASE 1: Critical TypeScript Errors (HIGH PRIORITY)

These errors BLOCK the application from building.

### Component Type Errors

- [ ] **1.1** `CalendarWorkspace.tsx:263` - CalendarProvider cannot be found
  - **File:** `apps/desktop/src/components/Calendar/CalendarWorkspace.tsx`
  - **Error:** `TS2304: Cannot find name 'CalendarProvider'`
  - **Fix:** Ensure CalendarProvider is exported from `types/calendar.ts` or change to inline type

- [ ] **1.2** `CodeWorkspace.tsx:157` - FileTree props type mismatch (selectedFile)
  - **File:** `apps/desktop/src/components/Code/CodeWorkspace.tsx`
  - **Error:** `TS2375: Type 'string | undefined' not assignable to 'string'`
  - **Fix:** Update FileTreeProps to allow `selectedFile?: string` OR use `selectedFile ?? ''`

- [ ] **1.3** `CodeWorkspace.tsx:278` - FileTree missing required props
  - **File:** `apps/desktop/src/components/Code/CodeWorkspace.tsx`
  - **Error:** `TS2739: Missing properties rootPath, onFileSelect`
  - **Fix:** Add required props `rootPath` and `onFileSelect` to FileTree component

- [ ] **1.4** `FileTree.tsx:53,109` - FileNode children type mismatch
  - **File:** `apps/desktop/src/components/Code/FileTree.tsx`
  - **Error:** `TS2322: Type 'never[] | undefined' not assignable to 'FileNode[]'`
  - **Fix:** Update interface: `children?: FileNode[]` AND ensure `children: []` not `children: undefined`

- [ ] **1.5** `DiffViewer.tsx:83` - renderSideBySide not valid property
  - **File:** `apps/desktop/src/components/Code/DiffViewer.tsx`
  - **Error:** `TS2353: 'renderSideBySide' does not exist in type 'IEditorOptions'`
  - **Fix:** Use `DiffEditor`'s built-in side-by-side mode via component props not updateOptions

- [ ] **1.6** `DatabaseWorkspace.tsx:12` - LinkOff import error
  - **File:** `apps/desktop/src/components/Database/DatabaseWorkspace.tsx`
  - **Error:** `TS2724: 'lucide-react' has no exported member named 'LinkOff'`
  - **Fix:** Change import from `LinkOff` to `Link2Off` (already renamed in some places)

- [ ] **1.7** `EmailWorkspace.tsx:133` - ConnectAccountPayload type mismatch
  - **File:** `apps/desktop/src/components/Communications/EmailWorkspace.tsx`
  - **Error:** `TS2375: Type 'string | undefined' not assignable to type 'string'`
  - **Fix:** Update `display_name` to use `?? undefined` OR update ConnectAccountPayload type

### Unused Variable Cleanup (TS6133 Errors)

- [ ] **1.8** `APIWorkspace.tsx:34` - Remove unused `put` variable
- [ ] **1.9** `BrowserWorkspace.tsx:9,36` - Remove unused `X`, `closeTab`
- [ ] **1.10** `CalendarWorkspace.tsx:13,54` - Remove unused `CalendarAccount`, `CalendarSummary`, `clearError`
- [ ] **1.11** `CodeEditor.tsx:1,7` - Remove unused `useEffect`, `Upload`
- [ ] **1.12** `CodeWorkspace.tsx:11,12,41,115` - Remove unused `Split`, `Maximize2`, `setSidebarWidth`, `handleRevert`
- [ ] **1.13** `DiffViewer.tsx:3,74` - Remove unused `editor` import and `monaco` parameter
- [ ] **1.14** `EmailWorkspace.tsx:79,109` - Remove unused `clearError`, `currentAccount`
- [ ] **1.15** `DatabaseWorkspace.tsx:2,10` - Remove unused `DatabaseConnection`, `Trash2`

---

## 🔴 PHASE 2: Chat Component Migration & Cleanup

### Migration Tasks (Chat/ → UnifiedAgenticChat/)

- [ ] **2.1** Migrate `ArtifactRenderer.tsx` (CRITICAL - handles code, charts, tables)
  - **From:** `apps/desktop/src/components/Chat/ArtifactRenderer.tsx`
  - **To:** `apps/desktop/src/components/UnifiedAgenticChat/ArtifactRenderer.tsx`

- [ ] **2.2** Migrate `CheckpointManager.tsx` (Git-like conversation checkpoints)
  - **From:** `apps/desktop/src/components/Chat/CheckpointManager.tsx`
  - **To:** `apps/desktop/src/components/UnifiedAgenticChat/CheckpointManager.tsx`

- [ ] **2.3** Migrate `AgentChatInterface.tsx` (Cursor-style agent timeline)
  - **From:** `apps/desktop/src/components/Chat/AgentChatInterface.tsx`
  - **To:** `apps/desktop/src/components/UnifiedAgenticChat/AgentChatInterface.tsx`

- [ ] **2.4** Migrate `DesktopAgentChat.tsx` (AGI system integration)
  - **From:** `apps/desktop/src/components/Chat/DesktopAgentChat.tsx`
  - **To:** `apps/desktop/src/components/UnifiedAgenticChat/DesktopAgentChat.tsx`

- [ ] **2.5** Migrate `TokenCounter.tsx` (Token usage display)
  - **From:** `apps/desktop/src/components/Chat/TokenCounter.tsx`
  - **To:** `apps/desktop/src/components/UnifiedAgenticChat/TokenCounter.tsx`

### Delete After Migration

- [ ] **2.6** Delete `Chat/QuickModelSelector.tsx` (keep UnifiedAgenticChat version)
- [ ] **2.7** Update `Chat/index.ts` exports to point to UnifiedAgenticChat
- [ ] **2.8** DELETE entire `apps/desktop/src/components/Chat/` directory

---

## 🔴 PHASE 3: Store Type Fixes (HIGH PRIORITY)

- [ ] **3.1** `browserStore.ts:40,91` - Unused `get`, Object possibly undefined
  - **Fix:** Remove unused `get` parameter, add null check before accessing properties

- [ ] **3.2** `calendarStore.ts:106,112,192,197` - Multiple undefined errors
  - **Fix:** Add null checks: `accounts[0]?.account_id` instead of `accounts[0].account_id`

- [ ] **3.3** `codeStore.ts:131,132,166,169,187,189,191,236,238` - OpenFile type mismatches
  - **Error:** Property 'path' is optional but required in type 'OpenFile'
  - **Fix:** Add proper type guards, use `file!` assertions, or update spread patterns

- [ ] **3.4** `emailStore.ts:98,104,149,211,212` - EmailMessage type mismatch
  - **Error:** Type 'undefined' not assignable to 'EmailMessage | null'
  - **Fix:** Use `?? null` instead of leaving undefined, or change type to include `undefined`

- [ ] **3.5** `filesystemStore.ts:111,132` - currentPath type mismatch
  - **Error:** Type 'string | undefined' not assignable to type 'string'
  - **Fix:** Update FilesystemState type to `currentPath: string | undefined` OR provide default

- [ ] **3.6** `terminalStore.ts:69,104` - TerminalSession cwd type mismatch
  - **Error:** Type 'string | undefined' not assignable to type 'string'
  - **Fix:** Provide default cwd: `cwd: options?.cwd ?? process.cwd()` or update type

- [ ] **3.7** `productivityStore.ts:96` - Remove unused `response` variable

---

## 🟡 PHASE 4: UI/UX Consistency (MEDIUM PRIORITY)

- [ ] **4.1** Fix Tauri import in `MCPServerManager.tsx`
  - **File:** `apps/desktop/src/components/MCP/MCPServerManager.tsx`
  - **Fix:** Use `import { invoke } from '../../lib/tauri-mock'`

- [ ] **4.2** `FilesystemWorkspace.tsx` - Remove unused imports (Lines 18,19,27,58,63)
  - Remove: `Copy`, `Scissors`, entire unused import declaration, `copyFile`, `selectPath`

- [ ] **4.3** `ProductivityWorkspace.tsx` - Remove unused imports (Lines 44,55)
  - Remove: `clearError`, `asanaListProjects`

- [ ] **4.4** Ensure all components use tauri-mock wrapper
  - Search for `from '@tauri-apps/api/core'` and replace with mock

- [ ] **4.5** Review and unify Button variants across workspace components

- [ ] **4.6** Verify ErrorBoundary coverage for all major components

---

## 🟢 PHASE 5: Advanced Features Integration (ENHANCEMENT)

### Hybrid Intelligence Engine

- [ ] **5.1** Create `ollama.rs` provider with health check
  - **File:** `apps/desktop/src-tauri/src/router/providers/ollama.rs`
  - **Features:** Connection check, timeout handling

- [ ] **5.2** Create `managed_cloud.rs` for API gateway routing
  - **File:** `apps/desktop/src-tauri/src/router/providers/managed_cloud.rs`

### Cursor-Style Billing

- [ ] **5.3** Add credit check in `chat.rs` before cloud requests
  - **File:** `apps/desktop/src-tauri/src/commands/chat.rs`
  - **Logic:** Check subscription tier, enforce limits

- [ ] **5.4** Create `PricingPage.tsx` with Hobby/Pro/Max tiers
  - **File:** `apps/desktop/src/pages/PricingPage.tsx`
  - **Features:** Monthly/Yearly toggle, credit display

- [ ] **5.5** Update `lib.rs` with billing command handler
  - **File:** `apps/desktop/src-tauri/src/lib.rs`
  - **Add:** `commands::billing::get_user_credits`

---

## 📁 FILES TO DELETE (After Migration)

```
apps/desktop/src/components/Chat/
├── AgentChatInterface.tsx     → MIGRATE FIRST
├── ArtifactRenderer.tsx       → MIGRATE FIRST
├── AutoCorrectionIndicator.tsx → DELETE (not used)
├── CheckpointManager.tsx      → MIGRATE FIRST
├── CommandAutocomplete.tsx    → DELETE (not used)
├── ConversationSidebar.tsx    → DELETE (Sidebar.tsx in UnifiedAgenticChat)
├── DesktopAgentChat.tsx       → MIGRATE FIRST
├── FileAttachmentPreview.tsx  → KEEP (exported in index.ts)
├── FileDropZone.tsx           → KEEP (exported in index.ts)
├── index.ts                   → UPDATE EXPORTS THEN DELETE
├── InputComposer.tsx          → DELETE (ChatInputArea.tsx exists)
├── Message.tsx                → DELETE (MessageBubble.tsx exists)
├── MessageList.tsx            → DELETE (ChatMessageList.tsx exists)
├── MessageWithTools.tsx       → DELETE (handled in MessageBubble)
├── QuickModelSelector.tsx     → DELETE (use UnifiedAgenticChat version)
├── TokenCounter.tsx           → MIGRATE FIRST
└── __tests__/                 → UPDATE PATHS THEN DELETE
```

---

## ⚠️ IGNORED ERRORS (services/api-gateway)

The following errors in `services/api-gateway/` are IGNORED for now as this is a separate backend service with missing dependencies:

- ~40 errors related to missing `express`, `cors`, `helmet`, `ws`, `dotenv`, `jsonwebtoken`, `bcryptjs`, `zod`
- These require `cd services/api-gateway && npm install` to resolve

---

## ✅ VERIFICATION CHECKLIST

Run these after completing all phases:

- [ ] `pnpm run lint` - No errors
- [ ] `pnpm run typecheck` or `tsc --noEmit` - No TypeScript errors (excluding api-gateway)
- [ ] `pnpm run build:web` - Successful build
- [ ] `pnpm tauri dev` - Application starts
- [ ] Test: Create new conversation
- [ ] Test: Send message and receive response
- [ ] Test: Sidecar opens when code/terminal content detected
- [ ] Test: Tool approval modal works
- [ ] Test: File attachments work
- [ ] Test: Checkpoint save/restore works

---

## 📝 NOTES

1. **QuickModelSelector Difference:**
   - `Chat/` version: Single active provider focus
   - `UnifiedAgenticChat/` version: All providers in groups (KEEP THIS)

2. **MessageBubble vs Message:**
   - `MessageBubble.tsx` is more advanced with StatusTrail, ReasoningAccordion, CitationBadge
   - Delete `Message.tsx` after migration

3. **Chat/ index.ts exports these (need to preserve or migrate):**
   - Message, MessageList, InputComposer, ConversationSidebar
   - ArtifactRenderer, FileAttachmentPreview, FileDropZone

4. **ExactOptionalPropertyTypes:**
   - Many errors are due to `exactOptionalPropertyTypes: true` in tsconfig
   - Use `?? undefined` or `?? null` explicitly instead of leaving undefined

---

## 🚀 EXECUTION ORDER

1. **First:** Fix all Phase 1 TypeScript errors (blocks build)
2. **Second:** Fix store type errors (Phase 3) - they cascade to components
3. **Third:** Migrate unique components from Chat/ (Phase 2.1-2.5)
4. **Fourth:** Update imports and delete Chat/ folder (Phase 2.6-2.8)
5. **Fifth:** UI/UX cleanup (Phase 4)
6. **Last:** Advanced features (Phase 5)

---

## 🔧 QUICK FIX COMMANDS

```bash
# Check current TypeScript errors
pnpm run typecheck 2>&1 | grep -E "error TS" | head -50

# Count errors by file
pnpm run typecheck 2>&1 | grep -E "\.tsx?\(" | cut -d'(' -f1 | sort | uniq -c | sort -rn

# Run lint to find unused imports
pnpm run lint --fix 2>&1 | grep "unused"
```

---

_Last Updated: November 24, 2025_
_Status: Phase 1 - TypeScript Errors Need Resolution_
_Total Errors: ~55 in apps/desktop (excluding api-gateway)_
