# AGI Workforce Frontend Fix Plan

## Project Overview

- **Framework**: Tauri 2.0 + React 18 + TypeScript 5.4
- **Styling**: Tailwind CSS + Radix UI
- **State Management**: Zustand with Immer
- **Main Entry**: `apps/desktop/src/App.tsx`
- **Main Chat Interface**: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`

## Architecture Summary

The application follows Claude Desktop's architecture with:

1. **Sidebar** (conversation list)
2. **Main Chat Area** (UnifiedAgenticChat)
3. **Dynamic Sidecar** (code/terminal/browser panels that appear when relevant)

---

## TODO LIST

### Phase 1: Critical TypeScript Errors (Priority: HIGH)

These errors will prevent the application from building successfully.

- [ ] **1.1** Fix `CalendarWorkspace.tsx` - CalendarProvider undefined (Line 263)
- [ ] **1.2** Fix `CodeWorkspace.tsx` - FileTree props type mismatch (Lines 157, 278)
- [ ] **1.3** Fix `FileTree.tsx` - FileNode children type mismatch (Lines 53, 109)
- [ ] **1.4** Fix `DiffViewer.tsx` - renderSideBySide property error (Line 83)
- [x] **1.5** Fix `DatabaseWorkspace.tsx` - Linting errors (Lines 567, 582)
  - ✅ Fixed unused `loading` prop in SchemaExplorer component
  - ✅ Fixed missing `loadTables` dependency in useEffect by using `useCallback`
- [ ] **1.6** Fix `EmailWorkspace.tsx` - ConnectAccountPayload type mismatch (Line 133)

### Phase 2: Store Type Errors (Priority: HIGH)

#### Chat Streaming & Routing Fixes (Completed)

- [x] **2.0a** Fix `unifiedChatStore.ts` - Chat streaming message ID synchronization
  - ✅ Updated `addMessage` to accept optional `id` parameter and return assigned ID
  - ✅ Fixed issue where streaming messages stuck on "Streaming..." due to ID mismatch
  - **File:** `apps/desktop/src/stores/unifiedChatStore.ts`

- [x] **2.0b** Fix `UnifiedAgenticChat/index.tsx` - Stream event handling
  - ✅ Updated to use returned message ID from `addMessage` for proper stream tracking
  - ✅ Fixed `currentStreamingMessageId` state management
  - **File:** `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`

- [x] **2.0c** Fix `settingsStore.ts` - Task routing defaults
  - ✅ Changed default `taskRouting.chat` from OpenAI to Anthropic (Claude)
  - ✅ Prevents 401 errors when Claude is selected but routing overrides to OpenAI
  - **File:** `apps/desktop/src/stores/settingsStore.ts`

#### Remaining Store Type Errors

- [ ] **2.1** Fix `browserStore.ts` - Object possibly undefined (Line 91)
- [ ] **2.2** Fix `calendarStore.ts` - Multiple undefined object errors (Lines 106, 112, 192, 197)
- [ ] **2.3** Fix `codeStore.ts` - OpenFile type mismatches (Lines 131, 132, 166, 169, 187, 189, 191, 236, 238)
- [ ] **2.4** Fix `emailStore.ts` - EmailMessage type mismatch (Lines 98, 104, 149, 211, 212)
- [ ] **2.5** Fix `filesystemStore.ts` - currentPath type mismatch (Lines 111, 132)
- [ ] **2.6** Fix `terminalStore.ts` - TerminalSession cwd type mismatch (Lines 69, 104)

### Phase 3: Unused Variable Cleanup (Priority: MEDIUM)

Remove or use declared variables to eliminate warnings.

- [ ] **3.1** Clean `APIWorkspace.tsx` - Remove unused `put`
- [ ] **3.2** Clean `BrowserWorkspace.tsx` - Remove unused `X`, `closeTab`
- [ ] **3.3** Clean `CalendarWorkspace.tsx` - Remove unused `CalendarAccount`, `CalendarSummary`, `clearError`
- [ ] **3.4** Clean `CodeEditor.tsx` - Remove unused `useEffect`, `Upload`
- [ ] **3.5** Clean `CodeWorkspace.tsx` - Remove unused `Split`, `Maximize2`, `setSidebarWidth`, `handleRevert`
- [ ] **3.6** Clean `DiffViewer.tsx` - Remove unused `editor`, `monaco`
- [ ] **3.7** Clean `EmailWorkspace.tsx` - Remove unused `clearError`, `currentAccount`
- [x] **3.8** Clean `DatabaseWorkspace.tsx` - Remove unused variables and fix dependencies
  - ✅ Fixed unused `loading` prop in SchemaExplorer component
  - ✅ Fixed missing `loadTables` dependency in useEffect using `useCallback`
- [ ] **3.9** Clean `FilesystemWorkspace.tsx` - Remove unused `Copy`, `Scissors`, `copyFile`, `selectPath`
- [ ] **3.10** Clean `ProductivityWorkspace.tsx` - Remove unused `clearError`, `asanaListProjects`
- [ ] **3.11** Clean `productivityStore.ts` - Remove unused `response`

### Phase 4: Component Architecture Improvements (Priority: MEDIUM)

- [ ] **4.1** Review and unify Chat components (Chat/ vs UnifiedAgenticChat/)
- [ ] **4.2** Remove deprecated components from Chat/ folder (keep only shared utilities)
- [ ] **4.3** Ensure consistent export patterns across all components
- [ ] **4.4** Add proper barrel exports (index.ts) to component directories missing them

### Phase 5: UI/UX Consistency (Priority: MEDIUM)

- [ ] **5.1** Audit all Button component usage for consistent variants
- [ ] **5.2** Review dialog/modal implementations for consistency
- [ ] **5.3** Check loading states across all workspace components
- [ ] **5.4** Verify error boundary coverage for all major components

### Phase 6: Services Cleanup (Priority: LOW)

API Gateway service has dependency issues.

- [ ] **6.1** Install missing dependencies in `services/api-gateway/`
- [ ] **6.2** Add proper TypeScript types for express, cors, helmet, ws, etc.
- [ ] **6.3** Fix implicit any types in route handlers

---

## Detailed Fix Instructions

### Fix 1.1: CalendarWorkspace.tsx - CalendarProvider

```typescript
// Line 263 - CalendarProvider is not imported
// Add import at top of file:
import { CalendarProvider } from '../../providers/CalendarProvider';
// Or if CalendarProvider doesn't exist, define it or use a different component
```

### Fix 1.2 & 1.3: FileTree Props

```typescript
// In FileTree.tsx, update FileNode interface:
interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[]; // Make optional OR ensure always array
  expanded?: boolean;
}

// In CodeWorkspace.tsx Line 157, handle undefined:
<FileTree
  rootPath={rootPath}
  onFileSelect={handleFileSelect}
  selectedFile={selectedFile ?? ''} // Provide default
  className="h-full"
/>
```

### Fix 1.4: DiffViewer.tsx

```typescript
// Line 83 - renderSideBySide is not a valid Monaco editor option
// Remove or replace with correct option:
// Change from:
options={{ renderSideBySide: true }}
// To (use DiffEditor from @monaco-editor/react):
import { DiffEditor } from '@monaco-editor/react';
// DiffEditor has different API
```

### Fix 1.5: DatabaseWorkspace.tsx

```typescript
// Lines 567, 582 - Fixed linting errors:
// 1. Unused 'loading' prop in SchemaExplorer component
// 2. Missing 'loadTables' dependency in useEffect

// Solution: Use useCallback to memoize loadTables function
import { useCallback } from 'react';

function SchemaExplorer({ activeConnection }: { activeConnection: any }) {
  const loadTables = useCallback(async () => {
    if (!activeConnection) return;
    // ... load tables logic
  }, [activeConnection]);

  useEffect(() => {
    if (activeConnection && activeConnection.type === 'SQL') {
      loadTables();
    }
  }, [activeConnection, loadTables]); // Now includes loadTables dependency
}
```

### Fix 2.0a-2.0c: Chat Streaming & Routing Fixes

#### Fix 2.0a: unifiedChatStore.ts - Message ID Synchronization

```typescript
// Problem: Streaming messages stuck on "Streaming..." because IDs didn't match
// Solution: Make addMessage accept optional id and return the assigned ID

// In unifiedChatStore.ts:
addMessage: (message) => {
  const assignedId = message.id ?? crypto.randomUUID();
  set((state) => {
    // ... create message with assignedId
    const newMessage: EnhancedMessage = {
      ...message,
      id: assignedId,
      timestamp: new Date(),
    };
    // ... add to state
  });
  return assignedId; // Return ID so caller can track it
};
```

#### Fix 2.0b: UnifiedAgenticChat/index.tsx - Stream Event Handling

```typescript
// Problem: Stream chunk events couldn't find correct message to update
// Solution: Use returned ID from addMessage and set currentStreamingMessageId

const assistantMessageId = addMessage({
  role: 'assistant',
  content: '',
  metadata: { streaming: true },
});
setStreamingMessage(assistantMessageId); // Now uses correct ID

// Stream chunk listener can now find the message:
listen('chat:stream-chunk', ({ payload }) => {
  const currentStreamingId = useUnifiedChatStore.getState().currentStreamingMessageId;
  if (currentStreamingId) {
    useUnifiedChatStore.getState().updateMessage(currentStreamingId, {
      content: payload.content,
      metadata: { streaming: true },
    });
  }
});
```

#### Fix 2.0c: settingsStore.ts - Task Routing Defaults

```typescript
// Problem: Chat tasks defaulted to OpenAI even when Claude selected, causing 401 errors
// Solution: Update default taskRouting.chat to use Anthropic

// In settingsStore.ts defaultSettings:
llmConfig: {
  defaultProvider: 'anthropic',
  taskRouting: {
    search: { provider: 'openai', model: 'gpt-5.1' },
    code: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
    docs: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
    chat: { provider: 'anthropic', model: 'claude-sonnet-4-5' }, // Changed from openai
    // ... other routes
  },
}
```

### Fix 2.1-2.6: Store Type Fixes Pattern

```typescript
// General pattern - add null checks or update types:

// Before:
state.items[index].property = value;

// After:
const item = state.items[index];
if (item) {
  item.property = value;
}

// Or update interface to allow undefined:
interface State {
  currentPath: string | null; // Instead of just string
}
```

---

## Files to Potentially Delete (Duplicates Review)

After review, the following are NOT duplicates but have different purposes:

- `Chat/` - Legacy components, some still exported and used
- `UnifiedAgenticChat/` - Main chat interface (keep all)

**Action**: Keep both directories but ensure Chat/index.ts only exports what's actually used.

---

## Verification Checklist

After all fixes:

- [ ] Run `pnpm run lint` - No errors
- [ ] Run `tsc --noEmit` - No TypeScript errors
- [ ] Run `pnpm run build:web` - Successful build
- [ ] Run `pnpm tauri dev` - Application starts
- [ ] Test: Create new conversation
- [ ] Test: Send message and receive response
- [ ] Test: Sidecar opens when relevant content detected
- [ ] Test: Tool approval modal works

---

## Notes

1. The Chat/ folder has a comment saying ChatInterface is deprecated - use UnifiedAgenticChat
2. BudgetAlertsPanel.tsx exists in both Chat/ and UnifiedAgenticChat/ - verify if duplicate
3. QuickModelSelector.tsx exists in both folders - verify if duplicate
4. services/api-gateway has many type errors but is separate from desktop app

## Recent Progress (November 24, 2025)

### ✅ Completed Fixes

1. **Chat Streaming Fixes** (Phase 2.0a-2.0c)
   - Fixed message ID synchronization between frontend and backend
   - Resolved "Streaming..." stuck state issue
   - Updated task routing defaults to prevent OpenAI 401 errors when Claude is selected

2. **DatabaseWorkspace Linting** (Phase 1.5, 3.8)
   - Fixed unused `loading` prop in SchemaExplorer component
   - Fixed missing `loadTables` dependency in useEffect using `useCallback`

3. **Code Quality**
   - Formatted Rust codebase with `cargo fmt`
   - Fixed ESLint errors in DatabaseWorkspace.tsx
   - All changes committed and pushed to main branch

### Impact

- Chat messages now stream properly without getting stuck
- Task routing respects user's model selection
- Reduced linting errors and improved code quality
