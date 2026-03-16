# Offline Support & Queue Management

## Overview

This module provides comprehensive offline-first capabilities for the web chat application:

- Queue messages sent while offline
- Queue tool execution requests
- Auto-sync when connectivity restored
- Persist offline state across app reloads
- Display user-friendly offline status UI

## Architecture

### Core Modules

#### `offlineQueue.ts`

Low-level offline queue management. Handles:

- Queueing messages while offline
- Queueing tool execution requests
- Persistence to localStorage
- Retry logic with exponential backoff
- Syncing with custom callbacks

**Key Functions:**

- `queueMessage(sessionId, content)` - Queue a user message
- `queueToolExecution(sessionId, toolName, input)` - Queue a tool call
- `getQueuedItems()` - Get all pending items
- `syncOfflineQueue(callbacks)` - Perform sync operation
- `clearQueuedMessage(id)` / `clearQueuedToolExecution(id)` - Remove synced items
- `getMessageRetryStatus(id)` - Check retry attempts

**Storage Key:**

- `agi_offline_queue` - Persistent queue state

#### `offlineSync.ts`

High-level sync manager. Orchestrates:

- Online/offline detection
- Automatic sync triggering
- Debounced retry logic
- Global sync state management
- User-friendly status messages

**Key Functions:**

- `initializeSyncManager()` - Setup (call once on app mount)
- `getSyncState()` - Get current sync state
- `subscribeSyncState(callback)` - Listen for changes
- `triggerSync()` - Manually trigger sync
- `getStatusMessage()` - Get user-friendly message
- `getStatusSeverity()` - Get indicator color

**Sync States:**

- `IDLE` - No activity
- `ONLINE` - Connected, no pending items
- `OFFLINE` - Disconnected
- `SYNCING` - Sync in progress
- `ERROR` - Sync failed, will retry

## Data Format

### Queued Message Structure

```typescript
interface QueuedMessage {
  id: string; // msg_<timestamp>_<random>
  sessionId: string;
  content: string;
  timestamp: string; // ISO 8601 when sent
  retryCount: number; // 0-3
  addedAt: string; // ISO 8601 when queued
}
```

### Queued Tool Execution Structure

```typescript
interface QueuedToolExecution {
  id: string; // tool_<timestamp>_<random>
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  timestamp: string; // ISO 8601 when requested
  retryCount: number; // 0-3
  addedAt: string; // ISO 8601 when queued
}
```

## Retry Logic

### Exponential Backoff

```
Attempt 1: 1 second
Attempt 2: 2 seconds
Attempt 3: 4 seconds
Max:       30 seconds
```

### Max Retries: 3

Items with 3 failed attempts are removed from queue.

## Integration with Chat Store

### Step 1: Initialize Sync Manager

```tsx
// In root component or store
useEffect(() => {
  initializeSyncManager();
  return () => cleanupSyncManager();
}, []);
```

### Step 2: Subscribe to Status Changes

```tsx
const [syncState, setSyncState] = useState(getSyncState());

useEffect(() => {
  const unsubscribe = subscribeSyncState((newState) => {
    setSyncState(newState);
  });
  return unsubscribe;
}, []);
```

### Step 3: Queue When Offline

```tsx
const handleSendMessage = async (content: string) => {
  if (!isOnline()) {
    // Queue instead of sending
    const queueId = queueMessage(sessionId, content);

    // Show optimistic UI
    addMessageToUI({
      id: queueId,
      content,
      status: 'pending',
    });
  } else {
    // Send directly
    await sendMessage(sessionId, content);
  }
};
```

### Step 4: Provide Sync Callbacks

```tsx
const syncCallbacks = {
  onMessageSync: async (message: QueuedMessage) => {
    const response = await api.sendMessage({
      sessionId: message.sessionId,
      content: message.content,
    });

    // Update message ID if server-generated
    updateMessageId(message.id, response.id);
  },

  onToolSync: async (tool: QueuedToolExecution) => {
    const result = await api.executeTool({
      sessionId: tool.sessionId,
      tool: tool.toolName,
      input: tool.toolInput,
    });

    // Add result to messages
    addToolResult(result);
  },

  onSyncComplete: (success: boolean, summary: SyncSummary) => {
    if (success) {
      showToast('Synced offline messages');
    } else {
      showToast('Some messages failed to sync', 'error');
    }
  },
};

// Perform sync
await syncOfflineQueue(syncCallbacks);
```

## UI Integration

### Using OfflineIndicator Component

```tsx
import { OfflineIndicator } from '@/components/OfflineIndicator';

function ChatApp() {
  return (
    <>
      <ChatInterface />
      <OfflineIndicator position="bottom" alwaysShow={false} />
    </>
  );
}
```

### Customizing Status Display

```tsx
const { state, queuedCount, error } = getSyncState();
const message = getStatusMessage();
const severity = getStatusSeverity();

// Render custom UI
{
  severity === 'warning' && <Alert>Offline - {queuedCount} messages pending</Alert>;
}
```

## Online Detection Strategy

### Primary: `navigator.onLine`

- Instant, browser-provided
- Can be unreliable (uses cached DNS)

### Secondary: Health Check

- Makes lightweight HEAD request to `/api/health`
- Confirms actual server connectivity
- 5-second timeout

### Fallback: Network Events

- Listens for `online` / `offline` events
- Triggers automatic retry on `online`

## Testing

### Test Coverage: 80%+ (39 tests for queue + 38 for sync manager)

**Queue Tests:**

- Queueing operations
- Message/tool persistence
- Retry status tracking
- Concurrent operations
- Error handling

**Sync Manager Tests:**

- Initialization
- State transitions
- Status messages
- Retry scheduling
- Subscription handling

**Running Tests:**

```bash
cd apps/web
pnpm test lib/offline/__tests__/
```

## Error Handling

### Sync Failure Scenarios

1. **Network Error** → Retry with backoff
2. **Server Error (5xx)** → Retry with backoff
3. **Auth Error (401)** → Stop and alert user
4. **Max Retries Exceeded** → Remove item and log

### Callback Errors

```typescript
try {
  await onMessageSync(message);
} catch (error) {
  // Increment retry count
  // Reschedule for later
  // Log error details
}
```

## Storage Limits

- **Queue Size:** Unbounded but practical limit ~100 items
- **Per-Item:** Message + metadata ~500B-5KB each
- **Max localStorage:** ~5-10MB per domain

## Performance

- **Queue Operations:** O(1) for append, O(n) for sync
- **Storage Lookup:** O(n) during sync
- **Memory:** Minimal (queue persisted in localStorage)
- **Network:** Exponential backoff prevents retry storms

## Security

- **No encryption** - Uses localStorage plaintext
- **No sensitive data** - Never queue API keys or tokens
- **User control** - Can manually clear queue
- **Error logging** - Detailed retry info stored locally

## Debugging

### Enable Comprehensive Logging

```typescript
import * as offlineQueue from '@/lib/offline/offlineQueue';

const items = offlineQueue.getQueuedItems();
console.log('Queued messages:', items.messages.length);
console.log('Queued tools:', items.toolExecutions.length);

const lastSync = offlineQueue.getLastSyncTime();
console.log('Last sync:', lastSync?.toLocaleString());
```

### Clear Queue for Testing

```typescript
import { clearAllQueued } from '@/lib/offline/offlineQueue';

clearAllQueued(); // Nuclear reset
```

### Monitor Sync State

```typescript
const { subscribeSyncState } = '@/lib/offline/offlineSync';

subscribeSyncState((state) => {
  console.log('Sync state:', state);
  console.log('Status:', getStatusMessage());
});
```

## Future Enhancements

- [ ] **IndexedDB Fallback** - Use for large queues
- [ ] **Compression** - GZip queue data
- [ ] **Analytics** - Track sync success rates
- [ ] **Manual Retry UI** - Let users retry failed items
- [ ] **Conflict Resolution** - Handle duplicate message IDs
- [ ] **Priority Queue** - Sync important items first
- [ ] **Service Worker** - Background sync support

## References

- [Network Information API](https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API)
- [Background Sync API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Sync_API)
- [Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Offline Cookbook](https://jakearchibald.com/2014/offline-cookbook/)
