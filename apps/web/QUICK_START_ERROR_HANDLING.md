# Error Handling Quick Start Guide

Get error handling working in your component in 2 minutes.

## 1. Wrap Component with Error Boundary (1 min)

```tsx
import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary';

// Before:
<MessageListComponent />

// After:
<SectionErrorBoundary sectionName="Messages">
  <MessageListComponent />
</SectionErrorBoundary>
```

**Result**: If component crashes, users see a helpful error UI with retry button instead of white screen.

## 2. Handle Async Errors (1 min)

```tsx
import { useErrorRecovery } from '@/hooks/useErrorRecovery';

const { error, retry, handleError, reset } = useErrorRecovery({
  maxRetries: 3,
  onError: (err) => console.error(err),
});

const handleFetch = async () => {
  try {
    const response = await fetch('/api/data');
    const data = await response.json();
    reset(); // Clear error on success
  } catch (err) {
    handleError(err as Error);
  }
};

return (
  <>
    {error && (
      <div className="error-banner">
        {error.message}
        {error.isRetryable && <button onClick={() => retry(handleFetch)}>Retry</button>}
      </div>
    )}
    <button onClick={handleFetch}>Fetch Data</button>
  </>
);
```

**Result**: Failed requests show retry button, automatically retry with backoff.

## 3. Use Resilient API Fetching (30 sec)

```tsx
import ApiErrorHandler from '@/services/api-error-handler';

// Fetch with automatic retry
const response = await ApiErrorHandler.fetchWithRetry('/api/data', {
  maxRetries: 3,
});

// Parse JSON safely
const data = await ApiErrorHandler.parseJSON(response);
```

**Result**: Network timeouts and 5xx errors automatically retry with exponential backoff.

## 4. Gracefully Degrade Features (30 sec)

```tsx
import { useFeatureAvailability } from '@/hooks/useFeatureAvailability';

const { isAvailable } = useFeatureAvailability();

return (
  <>
    {isAvailable('voice') && <VoiceButton />}
    {/* Text input always available */}
    <TextInput />
    {isAvailable('webSearch') && <SearchButton />}
  </>
);
```

**Result**: Voice/search buttons hidden on unsupported browsers, app still works.

## 5. Recover from Corrupted State (1 min)

```tsx
import StateRecoveryService from '@/services/state-recovery-service';

// After state change
StateRecoveryService.captureSnapshot('chat', messages);

// On initialization
const restored = StateRecoveryService.restoreFromSnapshot('chat', []);

// Validate before use
const valid = StateRecoveryService.validateState(data, (d) => {
  return Array.isArray(d) && d.every((m) => m.id);
});
if (!valid) {
  messages = defaults;
}
```

**Result**: If state corrupts, app automatically restores from last good snapshot.

## Common Patterns

### Pattern 1: Message Sending

```tsx
import { useErrorRecovery } from '@/hooks/useErrorRecovery';
import ApiErrorHandler from '@/services/api-error-handler';

const { error, retry, handleError, reset } = useErrorRecovery();

const sendMessage = async (content: string) => {
  try {
    const response = await ApiErrorHandler.fetchWithRetry('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    const result = await ApiErrorHandler.parseJSON(response);
    reset();
    return result;
  } catch (err) {
    handleError(err as Error);
  }
};
```

### Pattern 2: Data Loading with Recovery

```tsx
import StateRecoveryService from '@/services/state-recovery-service';

const loadData = async () => {
  try {
    const response = await fetch('/api/data');
    const data = await response.json();
    StateRecoveryService.captureSnapshot('data', data);
    setData(data);
  } catch (err) {
    const recovered = StateRecoveryService.restoreFromSnapshot('data', []);
    setData(recovered);
  }
};
```

### Pattern 3: Complete Component

```tsx
import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary';
import { useErrorRecovery } from '@/hooks/useErrorRecovery';
import ApiErrorHandler from '@/services/api-error-handler';

export function DataComponent() {
  const [data, setData] = useState([]);
  const { error, retry, handleError, reset } = useErrorRecovery();

  const loadData = async () => {
    try {
      const response = await ApiErrorHandler.fetchWithRetry('/api/data');
      const result = await ApiErrorHandler.parseJSON(response);
      setData(result);
      reset();
    } catch (err) {
      handleError(err as Error);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <SectionErrorBoundary sectionName="Data">
      {error && (
        <div className="error">
          {error.message}
          {error.isRetryable && <button onClick={() => retry(loadData)}>Retry</button>}
        </div>
      )}
      <div>{data.length} items loaded</div>
    </SectionErrorBoundary>
  );
}
```

## Error Handling Checklist for New Features

- [ ] Wrap critical components with `SectionErrorBoundary`
- [ ] Use `ApiErrorHandler` for all fetch calls
- [ ] Use `useErrorRecovery` for async operations
- [ ] Use `useFeatureAvailability` for optional features
- [ ] Capture state with `StateRecoveryService` on mutations
- [ ] Provide user-friendly error messages
- [ ] Test with network offline (DevTools)
- [ ] Test with component errors (throw Error)
- [ ] Test with feature unavailable (mock features)

## Testing Error Scenarios

### Test Network Error

```tsx
// In DevTools: Offline mode
// Or mock fetch:
vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network'));
```

### Test Component Error

```tsx
// Component throws
const BadComponent = () => {
  throw new Error('Render error');
};

// Wrap in SectionErrorBoundary, should show error UI
<SectionErrorBoundary>
  <BadComponent />
</SectionErrorBoundary>;
```

### Test Feature Unavailable

```tsx
// Mock feature as unavailable
Object.defineProperty(window, 'SpeechRecognition', {
  value: undefined,
  writable: true,
});

// useFeatureAvailability should return false for voice
const { isAvailable } = useFeatureAvailability();
expect(isAvailable('voice')).toBe(false);
```

## Debugging

### Check Recovery Log

```tsx
// In browser console:
import StateRecoveryService from '@/services/state-recovery-service';
StateRecoveryService.getRecoveryLog();
```

### See Error Details

In development, SectionErrorBoundary shows error details in collapsible section.

### Check Feature Availability

```tsx
// In browser console:
import { useFeatureAvailability } from '@/hooks/useFeatureAvailability';
const { features } = useFeatureAvailability();
console.log(features);
```

## Common Issues

**Q: Error boundary not catching errors**
A: Error boundaries only catch render errors, not event handlers. Wrap event handlers in try/catch.

**Q: Retry button not working**
A: Make sure you're passing the async function to `retry()`, not calling it:

```tsx
// ✅ Correct
<button onClick={() => retry(fetchData)}>Retry</button>

// ❌ Wrong
<button onClick={() => retry(fetchData())}>Retry</button>
```

**Q: Feature always shows as available**
A: `useFeatureAvailability` runs on mount. Check browser DevTools to verify API exists.

**Q: State recovery not working**
A: Make sure:

1. localStorage is available (not in private mode)
2. You're calling `captureSnapshot()` after mutations
3. Snapshot name matches in capture and restore

## Next Steps

1. Read full docs: `docs/ERROR_HANDLING_GUIDE.md`
2. Check examples: `examples/error-handling-integration.tsx`
3. Add error monitoring: Wire `onError` callbacks to Sentry
4. Test thoroughly: Use DevTools offline mode, throw errors in dev

## Need Help?

- Check error message (most are user-friendly)
- Look in browser console (detailed logs in development)
- Check recovery log (console: `StateRecoveryService.getRecoveryLog()`)
- Read `ERROR_HANDLING_GUIDE.md` for detailed patterns
