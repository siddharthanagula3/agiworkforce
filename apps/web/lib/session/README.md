# Session Persistence Layer

## Overview

This module provides session persistence functionality for the web chat application, enabling users to:

- Close the app and reopen it with their chat history intact
- Resume from their last position with all messages preserved
- Maintain model selection, theme preferences, and UI state across sessions

## Architecture

### Core Modules

#### `sessionStorage.ts`

Low-level storage operations for session data. Handles:

- Chat history persistence (messages with metadata)
- Model selection tracking
- Sidebar and theme preference storage
- Session organization and cleanup

**Key Functions:**

- `saveSession()` - Save a chat session with all messages
- `loadSession(id)` - Restore a specific session
- `loadAllSessions()` - Get all saved sessions
- `deleteSession(id)` - Remove a session
- `exportSessions()` - Export all data as JSON
- `importSessions(json)` - Import from backup

**Storage Keys:**

- `agi_chat_sessions` - Array of chat sessions
- `agi_current_session_id` - ID of active session
- `agi_selected_model` - Current model selection
- `agi_sidebar_collapsed` - Sidebar state
- `agi_theme_preference` - Theme setting
- `agi_chat_sessions_metadata` - Storage metadata

#### `useSessionPersistence.ts`

React hook for integrating session persistence into chat store.

**Usage:**

```tsx
const { restoreSession, saveSession, loadSession, getAllSessions, clearAll, isLoading, error } =
  useSessionPersistence();

useEffect(() => {
  // Restore session on mount
  const session = restoreSession();
  if (session) {
    // Populate store with restored session
  }
}, []);

// Save when session changes
useEffect(() => {
  saveSession({
    id: currentSession.id,
    title: currentSession.title,
    messages: messages,
    // ... other props
  });
}, [currentSession, messages]);
```

## Data Format

### Stored Session Structure

```typescript
interface StoredSession {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  messages: StoredMessage[];
  selectedModel?: string;
  selectedProvider?: string;
}

interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string; // ISO 8601
  metadata?: {
    model?: string;
    provider?: string;
    cost?: number;
    tokenCount?: number;
  };
}
```

## Storage Limits

- **Maximum Sessions:** 50 (automatically trimmed on save)
- **Session Size:** Varies by message count and content length
- **localStorage Quota:** ~5-10MB per domain (varies by browser)

## Integration with Chat Store

### Step 1: Initialize on App Mount

```tsx
// In your root chat component or store initialization
useEffect(() => {
  const sessionPersistence = useSessionPersistence();
  const session = sessionPersistence.restoreSession();

  if (session) {
    // Set store state from restored session
    setChatState({
      messages: session.messages,
      title: session.title,
      // ...
    });
  }
}, []);
```

### Step 2: Save on Changes

```tsx
useEffect(() => {
  // Debounced save when messages change
  const timer = setTimeout(() => {
    sessionPersistence.saveSession({
      id: currentSessionId,
      title: title,
      messages: messages,
      messageCount: messages.length,
      createdAt: createdAt,
      updatedAt: new Date(),
      selectedModel,
      selectedProvider,
    });
  }, 1000);

  return () => clearTimeout(timer);
}, [messages, title]);
```

### Step 3: Clean Up on Delete

```tsx
const handleDeleteSession = (sessionId: string) => {
  sessionPersistence.deleteSession(sessionId);
  // Notify store to remove from UI
};
```

## Error Handling

All functions handle errors gracefully:

```typescript
try {
  sessionStorage.saveSession(session);
} catch (error) {
  console.error('[SessionStorage]', error);
  // Gracefully degrade - continue without persistence
}
```

**Common Error Cases:**

- localStorage quota exceeded → Function throws, caller handles
- Corrupted JSON in storage → Returns empty/default value
- Missing data → Returns null
- Missing version metadata → Auto-migrates

## Testing

### Test Coverage: 80%+ (33 tests)

**Test Categories:**

1. **Save/Load Operations** - Session persistence integrity
2. **Multiple Sessions** - Handling session collections
3. **Data Serialization** - Date/JSON conversion
4. **Preferences** - Model, theme, sidebar storage
5. **Export/Import** - Backup and restore functionality
6. **Error Handling** - Quota, corruption, missing data
7. **Edge Cases** - Large messages, special characters, etc.

**Running Tests:**

```bash
cd apps/web
pnpm test lib/session/__tests__/sessionStorage.test.ts
```

## Migration & Versioning

Storage uses versioning for safe migrations:

```typescript
SESSION_STORAGE_VERSION = 1;
```

On import, version mismatches are logged with warnings but proceed. This allows:

- Adding new fields without losing old sessions
- Renaming fields with compatibility shims
- Deprecating old data formats

## Performance Considerations

- **Session trimming:** Keeps latest 50 sessions to prevent unbounded growth
- **Lazy loading:** Sessions loaded on-demand, not all at once
- **No background sync:** Persistence is synchronous during app usage
- **JSON serialization:** Efficient for small-to-medium sessions

## Security

- **Plaintext storage:** Uses localStorage (not encrypted)
- **Sensitive data:** API keys, tokens never stored
- **Export format:** Human-readable JSON (backup-friendly)
- **Import validation:** Basic JSON schema checking

**Recommendation:** For sensitive applications, consider encrypting localStorage or using server-side session storage.

## Future Enhancements

- [ ] **Incremental saves** - Only persist changed messages
- [ ] **Compression** - GZip session data for larger histories
- [ ] **Server sync** - Replicate to backend for cloud sync
- [ ] **Encryption** - Encrypt sensitive session data
- [ ] **Quotas** - Enforce per-session size limits
- [ ] **Analytics** - Track session sizes and restore rates

## Debugging

### Enable Debug Logging

```tsx
const { restoreSession } = useSessionPersistence({ debug: true });
```

### Check Storage Size

```typescript
import { getSessionStorageSize } from '@/lib/session/sessionStorage';

const sizeInBytes = getSessionStorageSize();
console.log(`Using ${sizeInBytes / 1024}KB of localStorage`);
```

### Export for Inspection

```typescript
import { exportSessions } from '@/lib/session/sessionStorage';

const backup = exportSessions();
console.log(JSON.parse(backup)); // Inspect structure
```

### Manual Cleanup

```typescript
import { clearAllSessions } from '@/lib/session/sessionStorage';

clearAllSessions(); // Nuclear option for testing
```

## References

- [Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [IndexedDB Alternative](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) (for larger data)
- [localStorage Limits](https://stackoverflow.com/questions/2989284/what-is-the-max-size-of-localstorage-values)
