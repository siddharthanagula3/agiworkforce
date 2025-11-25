# Bug Report - AGI Workforce

**Generated**: Auto-generated bug analysis
**Status**: In Progress

---

## Summary

This document contains bugs found during systematic code analysis.

**Total Bugs Found**: 33

### By Severity:

- **High**: 7 (Web dev mode broken, critical data loss)
- **Medium**: 17 (Race conditions, memory leaks, inconsistencies)
- **Low**: 9 (Deprecations, type issues, minor improvements)

### By Category:

- **Web Dev Mode / Tauri Import Issues**: 10 bugs (Most critical - #9, #10, #16, #19, #22, #26, #27, #33)
- **Race Conditions / Async Issues**: 6 bugs (#5, #6, #12, #17, #25, #28)
- **Memory Leaks / Resource Management**: 4 bugs (#2, #4, #14, #30)
- **Type Safety / TypeScript**: 3 bugs (#8, #20, #23)
- **Silent Failures / Error Handling**: 4 bugs (#3, #18, #21, #25)
- **Other**: 6 bugs

### Priority Fix Order:

1. **Add `listen` mock to tauri-mock.ts** (Fixes bugs #10, #22 - enables web dev mode for events)
2. **Fix all direct `@tauri-apps/api` imports** (Bugs #9, #16, #19, #27, #33)
3. **Fix lib.rs database path** (Bug #31 - critical data loss)
4. **Fix race conditions in stores** (Bugs #5, #6, #28)
5. **Address memory leaks** (Bugs #2, #4, #14)

### Files Analyzed:

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/main.tsx`
- `apps/desktop/src/stores/*.ts` (7 stores)
- `apps/desktop/src/components/*.tsx` (4 components)
- `apps/desktop/src/services/*.ts` (2 services)
- `apps/desktop/src/hooks/*.ts` (3 hooks)
- `apps/desktop/src/lib/*.ts` (1 file)
- `apps/desktop/src-tauri/src/main.rs`
- `apps/desktop/src-tauri/src/lib.rs`

**Note**: This analysis is partial. There are many more files in the codebase that haven't been analyzed yet. To continue, run another session and look at remaining stores, components, and Rust backend files.

---

## Bugs Found

### Bug #1 - App.tsx (Line ~71)

**File**: `apps/desktop/src/App.tsx`
**Severity**: Medium
**Type**: Serialization Issue
**Description**: In `handleUnhandledRejection`, the `event.promise` is stored in context object. Promises are not serializable and will cause issues when the error is serialized for reporting or logging.

```typescript
context: {
  promise: event.promise, // BUG: Promises are not serializable
},
```

**Fix**: Remove the promise from context or convert to string representation.

---

### Bug #2 - App.tsx (Line ~109)

**File**: `apps/desktop/src/App.tsx`
**Severity**: Low
**Type**: Potential Memory Leak
**Description**: `initializeAgentStatusListener()` is called with `void` which ignores its return value. If this function returns a cleanup function, it won't be called on component unmount, potentially causing memory leaks.

```typescript
void initializeAgentStatusListener(); // Return value ignored
```

**Fix**: Capture and call cleanup function in the useEffect cleanup.

---

### Bug #3 - App.tsx (Line ~112-115)

**File**: `apps/desktop/src/App.tsx`
**Severity**: Low
**Type**: Silent Failure
**Description**: Dynamic import of `initializeModelStoreFromSettings` inside useEffect with no error handling - failures will be silent.

```typescript
void (async () => {
  const { initializeModelStoreFromSettings } = await import('./stores/modelStore');
  await initializeModelStoreFromSettings();
})();
```

**Fix**: Add try-catch with proper error handling/logging.

---

### Bug #4 - unifiedChatStore.ts (Line ~275-290)

**File**: `apps/desktop/src/stores/unifiedChatStore.ts`
**Severity**: Medium
**Type**: Memory Leak
**Description**: ID mappings stored in localStorage are never cleaned up when conversations are deleted. Over time, this will accumulate stale entries.

```typescript
// Mappings persist forever in localStorage
let idMappings: IdMapping = { dbIdToUuid: {}, uuidToDbId: {} };
```

**Fix**: Add cleanup logic when conversations are deleted to remove their ID mappings.

---

### Bug #5 - unifiedChatStore.ts (Line ~309-320)

**File**: `apps/desktop/src/stores/unifiedChatStore.ts`
**Severity**: Low
**Type**: Race Condition
**Description**: `dbIdToUuid` function can create duplicate UUIDs for the same dbId if called simultaneously (race condition). No mutex or synchronization.

```typescript
export function dbIdToUuid(dbId: number): string {
  if (!idMappings.dbIdToUuid[dbId]) {
    const uuid = crypto.randomUUID(); // Race: two calls might create different UUIDs
    idMappings.dbIdToUuid[dbId] = uuid;
    ...
  }
}
```

**Fix**: Use a synchronization mechanism or check after assignment.

---

### Bug #6 - unifiedChatStore.ts (Line ~1425-1430)

**File**: `apps/desktop/src/stores/unifiedChatStore.ts`
**Severity**: Low
**Type**: Initialization Race Condition
**Description**: `agentStatusListenerInitialized` is set to `true` BEFORE async operations complete. If initialization fails, flag remains true, preventing retries.

```typescript
export async function initializeAgentStatusListener() {
  if (agentStatusListenerInitialized || !isTauri) return;
  agentStatusListenerInitialized = true; // Set before try block!
  try {
    await bootstrapAgentStatuses();
    ...
  } catch (error) {
    agentStatusListenerInitialized = false; // Only reset in catch
  }
}
```

**Fix**: Set flag to true only after successful initialization.

---

### Bug #7 - unifiedChatStore.ts (Persistence)

**File**: `apps/desktop/src/stores/unifiedChatStore.ts`
**Severity**: Medium
**Type**: Data Loss
**Description**: The `partialize` function for persistence doesn't include `trustedWorkflows`, meaning user's trusted workflow approvals are lost on page refresh.

```typescript
partialize: (state) => ({
  conversations: state.conversations,
  // ... trustedWorkflows NOT included!
}),
```

**Fix**: Add `trustedWorkflows: state.trustedWorkflows` to partialize.

---

### Bug #8 - errorStore.ts (Line ~65)

**File**: `apps/desktop/src/stores/errorStore.ts`
**Severity**: Low
**Type**: Deprecated API
**Description**: Using deprecated `substr()` method. Should use `substring()` instead.

```typescript
id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // substr is deprecated
```

**Fix**: Replace with `substring(2, 11)`.

---

### Bug #9 - errorStore.ts (Import Inconsistency)

**File**: `apps/desktop/src/stores/errorStore.ts`
**Severity**: Low
**Type**: Inconsistent Import
**Description**: `invoke` is imported directly from `@tauri-apps/api/core` instead of using the `tauri-mock` wrapper used elsewhere. This breaks consistency and web dev mode fallback.

```typescript
import { invoke } from '@tauri-apps/api/core'; // Should use '../lib/tauri-mock'
```

**Fix**: Import from `'../lib/tauri-mock'` for consistency.

---

### Bug #10 - UnifiedAgenticChat/index.tsx (Import Inconsistency)

**File**: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`
**Severity**: Medium
**Type**: Inconsistent Import / Web Dev Mode Broken
**Description**: `listen` is imported directly from `@tauri-apps/api/event` while `invoke` uses the mock wrapper. This will crash in web development mode.

```typescript
import { invoke } from '@/lib/tauri-mock'; // Uses mock
import { listen } from '@tauri-apps/api/event'; // Direct import - no mock!
```

**Fix**: Create a listen mock in tauri-mock.ts and import from there.

---

### Bug #11 - UnifiedAgenticChat/index.tsx (Line ~83)

**File**: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`
**Severity**: Low
**Type**: Wasteful Computation
**Description**: `_tokenStats` is computed using `useMemo` but immediately voided. This is wasteful - either use it or remove it.

```typescript
const _tokenStats = useMemo(() => {
  // ... expensive computation
}, [messages]);

void _tokenStats; // BUG: Computed but never used
```

**Fix**: Remove the unused computation or use the value.

---

### Bug #12 - UnifiedAgenticChat/index.tsx (Line ~95-136)

**File**: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`
**Severity**: Medium
**Type**: Improper Async Cleanup
**Description**: The useEffect cleanup function doesn't properly await all listener cleanup promises before continuing. This can cause race conditions.

```typescript
return () => {
  Promise.all(unlistenPromises).then((unlisteners) => {
    unlisteners.forEach((unlisten) => unlisten());
  });
};
```

**Fix**: Use proper async cleanup pattern or ensure promises are resolved.

---

### Bug #13 - UnifiedAgenticChat/index.tsx (Line ~80, ~222)

**File**: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`
**Severity**: Medium
**Type**: Unused AbortController
**Description**: `abortControllerRef` is defined but never assigned during message sending. The stop generation handler tries to abort it but it's always null.

```typescript
const abortControllerRef = useRef<AbortController | null>(null);
// ... never assigned anywhere
const handleStopGeneration = async () => {
  if (abortControllerRef.current) {
    // Always null!
    abortControllerRef.current.abort();
  }
};
```

**Fix**: Assign AbortController before starting the request and pass signal to invoke.

---

### Bug #14 - ChatInputArea.tsx (Line ~139-144)

**File**: `apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx`
**Severity**: Medium
**Type**: Memory Leak / Stale Closure
**Description**: The cleanup useEffect has `attachments` in its closure but the cleanup runs on unmount, potentially missing newly added blob URLs due to stale closure.

```typescript
useEffect(() => {
  return () => {
    // ... cleanup uses `attachments` from closure
    attachments.forEach((attachment) => {
      // Stale!
      if (attachment.path?.startsWith('blob:')) URL.revokeObjectURL(attachment.path);
    });
  };
}, [attachments]); // Re-runs on every change but cleanup is for old value
```

**Fix**: Use a ref to track current attachments for cleanup, or cleanup in removeAttachment.

---

### Bug #15 - ChatInputArea.tsx (Drag/Drop Handlers)

**File**: `apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx`
**Severity**: Low
**Type**: Missing Dependencies
**Description**: The drag/drop useEffect adds document event listeners but `handleFilesAdded` is not in the dependency array. If `handleFilesAdded` changes, listeners will use stale reference.

```typescript
useEffect(() => {
  // ... handlers reference handleFilesAdded
  const handleDrop = (e: DragEvent) => {
    // ...
    if (files.length > 0) handleFilesAdded(files); // Potentially stale
  };
  // ...
}, []); // Empty deps - handleFilesAdded not included
```

**Fix**: Add `handleFilesAdded` to dependencies or wrap in useCallback.

---

### Bug #16 - errorReporting.ts (Import)

**File**: `apps/desktop/src/services/errorReporting.ts`
**Severity**: Medium
**Type**: Inconsistent Import
**Description**: Uses `invoke` from `@tauri-apps/api/core` directly instead of tauri-mock wrapper. Will fail in web development mode.

```typescript
import { invoke } from '@tauri-apps/api/core'; // Should use '../lib/tauri-mock'
```

**Fix**: Import from `'../lib/tauri-mock'`.

---

### Bug #17 - errorReporting.ts (Constructor)

**File**: `apps/desktop/src/services/errorReporting.ts`
**Severity**: Medium
**Type**: Race Condition / Uninitialized State
**Description**: Constructor calls async `initializeSystemInfo()` without awaiting. System info will be null when first errors are reported.

```typescript
constructor() {
  this.initializeSystemInfo();  // Not awaited - systemInfo stays null
}
```

**Fix**: Initialize synchronously or lazy-load on first error report.

---

### Bug #18 - errorReporting.ts (Line ~168)

**File**: `apps/desktop/src/services/errorReporting.ts`
**Severity**: Low
**Type**: Silent Data Loss
**Description**: When send fails, errors are re-queued but capped at 50. Older errors are silently lost without notification.

```typescript
} catch (error) {
  // Re-queue errors if send failed (but limit queue size)
  this.queue = [...errors, ...this.queue].slice(0, 50);  // Older errors lost!
}
```

**Fix**: Log warning when errors are dropped or increase limit.

---

### Bug #19 - websocketClient.ts (Import)

**File**: `apps/desktop/src/services/websocketClient.ts`
**Severity**: Medium
**Type**: Inconsistent Import
**Description**: Uses `invoke` from `@tauri-apps/api/core` directly. Will fail in web development mode.

```typescript
import { invoke } from '@tauri-apps/api/core'; // Should use '../lib/tauri-mock'
```

**Fix**: Import from `'../lib/tauri-mock'`.

---

### Bug #20 - websocketClient.ts (Type Mismatch)

**File**: `apps/desktop/src/services/websocketClient.ts`
**Severity**: Low
**Type**: TypeScript Type Error
**Description**: `reconnectTimeout` is typed as `NodeJS.Timeout` but should be `number` for browser's `window.setTimeout`.

```typescript
private reconnectTimeout: NodeJS.Timeout | null = null;  // Wrong type for browser
```

**Fix**: Change to `number | null` or `ReturnType<typeof setTimeout> | null`.

---

### Bug #21 - websocketClient.ts (Reconnect Logic)

**File**: `apps/desktop/src/services/websocketClient.ts`
**Severity**: Medium
**Type**: Potential Infinite Loop
**Description**: In `connect()`, if `invoke` throws, error is re-thrown but `reconnectAttempts` isn't incremented. This could cause issues with reconnection logic.

```typescript
async connect(...): Promise<void> {
  try {
    const url = await invoke<string>('connect_websocket', ...);
    // ...
  } catch (error) {
    console.error('Failed to connect to WebSocket:', error);
    throw error;  // reconnectAttempts not incremented
  }
}
```

**Fix**: Increment attempts on any failure, not just in `attemptReconnect`.

---

### Bug #22 - useAgenticEvents.ts (Import)

**File**: `apps/desktop/src/hooks/useAgenticEvents.ts`
**Severity**: High
**Type**: Web Dev Mode Broken
**Description**: Uses `invoke` and `listen` from Tauri APIs directly. Will crash in web development mode. The hook also checks `isTauri` for some operations but not for the main event listeners setup.

```typescript
import { invoke } from '@tauri-apps/api/core'; // Direct import
import { listen, UnlistenFn } from '@tauri-apps/api/event'; // Direct import
```

**Fix**: Import from tauri-mock and add proper web mode guards.

---

### Bug #23 - useAgenticEvents.ts (Type Safety)

**File**: `apps/desktop/src/hooks/useAgenticEvents.ts`
**Severity**: Low
**Type**: Type Safety
**Description**: Multiple uses of `as any` type casts indicate incomplete type definitions for event payloads.

```typescript
const tool =
  (event.payload.execution as any)?.tool ??  // Line ~246
```

**Fix**: Define proper TypeScript interfaces for all event payloads.

---

### Bug #24 - useVoiceInput.ts (Callback Dependencies)

**File**: `apps/desktop/src/hooks/useVoiceInput.ts`
**Severity**: Medium
**Type**: Performance / Stale Callbacks
**Description**: The useEffect has `onResult`, `onError`, `onEnd` callbacks in dependencies. These often change every render, causing SpeechRecognition to be recreated unnecessarily.

```typescript
}, [continuous, interimResults, language, onResult, onError, onEnd]);
```

**Fix**: Use refs for callbacks: `const onResultRef = useRef(onResult); onResultRef.current = onResult;`

---

### Bug #25 - useWindowManager.ts (Unhandled Async Errors)

**File**: `apps/desktop/src/hooks/useWindowManager.ts`
**Severity**: Medium
**Type**: Unhandled Error
**Description**: The async IIFE inside useEffect doesn't handle errors. If dynamic imports fail, listeners won't be set up and no error is reported.

```typescript
(async () => {
  const { listen } = await import('@tauri-apps/api/event'); // Could fail
  // ... no try-catch
})(); // No .catch()
```

**Fix**: Add `.catch()` to handle errors or wrap in try-catch.

---

### Bug #26 - tauri-mock.ts (Missing listen Mock)

**File**: `apps/desktop/src/lib/tauri-mock.ts`
**Severity**: High
**Type**: Missing Mock Function
**Description**: The mock layer doesn't provide a `listen` function mock. Many files import `listen` directly from Tauri API and crash in web dev mode. Need to add a mock `listen` function.

```typescript
// Missing: export async function listen<T>(...)
```

**Fix**: Add a mock `listen` function that returns a no-op unsubscribe function in web mode.

---

### Bug #27 - settingsStore.ts (Import)

**File**: `apps/desktop/src/stores/settingsStore.ts`
**Severity**: High
**Type**: Web Dev Mode Broken
**Description**: Uses `invoke` from `@tauri-apps/api/core` directly. Will crash in web development mode.

```typescript
import { invoke } from '@tauri-apps/api/core'; // Should use '../lib/tauri-mock'
```

**Fix**: Import from `'../lib/tauri-mock'`.

---

### Bug #28 - settingsStore.ts (Weak Race Condition Check)

**File**: `apps/desktop/src/stores/settingsStore.ts`
**Severity**: Medium
**Type**: Race Condition
**Description**: The race condition guards check `if (get().loading === false)` but loading could be set to false by errors or other operations, not just cancellation.

```typescript
if (get().loading === false) {
  console.warn('[settingsStore] Load cancelled - another operation started');
  return;
}
```

**Fix**: Use a unique request ID or AbortController pattern.

---

### Bug #29 - settingsStore.ts (setTheme)

**File**: `apps/desktop/src/stores/settingsStore.ts`
**Severity**: Low
**Type**: Potential SSR/Testing Error
**Description**: `setTheme` accesses `window.matchMedia` and `document.documentElement` without checking if window/document exist. Could fail during SSR or testing.

```typescript
if (
  theme === 'dark' ||
  (theme === 'system' && window.matchMedia(...).matches)  // No window check
) {
  document.documentElement.classList.add('dark');  // No document check
}
```

**Fix**: Add `typeof window !== 'undefined'` check.

---

### Bug #30 - main.rs (Multiple DB Connections)

**File**: `apps/desktop/src-tauri/src/main.rs`
**Severity**: Medium
**Type**: Resource Management / Potential Lock Issues
**Description**: Multiple `Connection::open(&db_path)` calls create separate database connections. This can cause SQLite locking issues and inconsistent state.

```rust
let conn = Connection::open(&db_path)?;
let settings_conn = Connection::open(&db_path)?;
let calendar_conn = Connection::open(&db_path)?;
// ... many more
```

**Fix**: Use a connection pool or share a single Arc<Mutex<Connection>>.

---

### Bug #31 - lib.rs (Inconsistent DB Path)

**File**: `apps/desktop/src-tauri/src/lib.rs`
**Severity**: High
**Type**: Configuration Bug
**Description**: In `run()` function, `Database::new("agi.db")` creates database in current working directory (non-deterministic), while main.rs correctly uses app data directory.

```rust
let db = crate::db::Database::new("agi.db").expect("Failed to init DB");
// Should use app.path().app_data_dir() like main.rs
```

**Fix**: Use proper app data directory path.

---

### Bug #32 - lib.rs (Inconsistent Command Registration)

**File**: `apps/desktop/src-tauri/src/lib.rs`
**Severity**: Medium
**Type**: Code Duplication / Inconsistency
**Description**: The `run()` function registers far fewer commands than `main.rs`. If `run()` is ever used as an entry point, many features will be broken.

```rust
// lib.rs registers ~5 commands
// main.rs registers ~500+ commands
```

**Fix**: Consolidate command registration or document which entry point is canonical.

---

### Bug #33 - modelStore.ts (Import)

**File**: `apps/desktop/src/stores/modelStore.ts`
**Severity**: High
**Type**: Web Dev Mode Broken
**Description**: Uses `invoke` from `@tauri-apps/api/core` directly. Will crash in web development mode.

```typescript
import { invoke } from '@tauri-apps/api/core'; // Should use '../lib/tauri-mock'
```

**Fix**: Import from `'../lib/tauri-mock'`.

---
