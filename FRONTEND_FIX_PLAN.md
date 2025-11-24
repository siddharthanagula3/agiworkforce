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
- [ ] **1.5** Fix `DatabaseWorkspace.tsx` - LinkOff import error (Line 12)
- [ ] **1.6** Fix `EmailWorkspace.tsx` - ConnectAccountPayload type mismatch (Line 133)

### Phase 2: Store Type Errors (Priority: HIGH)

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
- [ ] **3.8** Clean `DatabaseWorkspace.tsx` - Remove unused `DatabaseConnection`, `Trash2`
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
// Line 12 - LinkOff doesn't exist in lucide-react
// Change to:
import { Link2Off } from 'lucide-react';
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
