# Error Handling & Graceful Degradation Guide

This guide documents the error handling patterns, boundaries, and recovery mechanisms implemented in the AGI Workforce web application.

## Overview

The error handling system is built on three pillars:

1. **Error Boundaries** — React component-level error containment
2. **Graceful Degradation** — Feature availability detection and fallback
3. **State Recovery** — Automatic recovery from corrupted or invalid state

## Error Boundaries

### SectionErrorBoundary Component

A reusable React Error Boundary component that catches errors in child components and displays a fallback UI.

**Location**: `apps/web/components/ui/SectionErrorBoundary.tsx`

**Basic Usage**:

```tsx
import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary';

export function ChatSection() {
  return (
    <SectionErrorBoundary sectionName="Chat">
      <ChatComponent />
    </SectionErrorBoundary>
  );
}
```

**API**:

```tsx
interface SectionErrorBoundaryProps {
  children: ReactNode;
  /** Name of the section for error reporting */
  sectionName?: string;
  /** Custom fallback UI */
  fallback?: ReactNode;
  /** Custom fallback render function */
  fallbackRender?: (props: {
    error: Error;
    errorInfo: ErrorInfo | null;
    resetError: () => void;
  }) => ReactNode;
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Compact error UI (for non-critical sections) */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}
```

**Examples**:

```tsx
// Compact error UI for sidebar
<SectionErrorBoundary sectionName="Sidebar" compact>
  <ChatSidebarNew {...props} />
</SectionErrorBoundary>

// Custom fallback
<SectionErrorBoundary
  sectionName="Message List"
  fallbackRender={({ error, resetError }) => (
    <div className="p-4">
      <p>Failed to load messages: {error.message}</p>
      <button onClick={resetError}>Retry</button>
    </div>
  )}
>
  <MessageListNew />
</SectionErrorBoundary>

// With error callback
<SectionErrorBoundary
  sectionName="Composer"
  onError={(error, info) => {
    // Send to error tracking service
    logErrorToService(error, info);
  }}
>
  <ChatComposerNew />
</SectionErrorBoundary>
```

### Best Practices

1. **Wrap Critical Components**: Always wrap major UI sections
   - Message list
   - Composer
   - Sidebar
   - Tool execution UI

2. **Use Compact Mode**: For non-critical sections use `compact={true}`
   - Sidebar errors shouldn't break the entire chat
   - Tool execution errors shouldn't stop message sending

3. **Custom Fallback UI**: Provide meaningful recovery actions
   - Retry button with exponential backoff
   - Alternative UI that maintains functionality
   - Clear error messaging for users

4. **Error Logging**: Implement `onError` callback to track errors
   - Send to error tracking service (Sentry, LogRocket, etc.)
   - Include context (user ID, session, component stack)
   - Sample rate to avoid overwhelming the service

## Graceful Feature Degradation

### useFeatureAvailability Hook

Detects browser capabilities and provides fallback values when features are unavailable.

**Location**: `apps/web/hooks/useFeatureAvailability.ts`

**Usage**:

```tsx
import { useFeatureAvailability } from '@/hooks/useFeatureAvailability';

export function ChatComposerNew() {
  const { features, isAvailable, getFallback } = useFeatureAvailability({
    onFeatureUnavailable: (feature) => {
      console.warn(`Feature ${feature} is unavailable`);
    },
  });

  // Hide voice button if unavailable
  if (!isAvailable('voice')) {
    return <InputFieldOnly />;
  }

  return <ComposerWithVoice />;
}
```

**Available Features**:

- `voice` — Speech recognition API
- `darkMode` — Dark mode preference detection
- `modelSelection` — Model selection persistence
- `streaming` — WebSocket support
- `webSearch` — Web search capability
- `imageGeneration` — Image generation API

### Implementation Pattern

```tsx
// Check availability
const { features, isAvailable } = useFeatureAvailability();

// Graceful degradation
const voiceEnabled = isAvailable('voice');
const searchEnabled = isAvailable('webSearch');

return (
  <>
    {voiceEnabled && <VoiceButton />}
    {/* Always show text input, it's the fallback */}
    <TextInput />
    {searchEnabled && <WebSearchButton />}
  </>
);
```

### Feature-Specific Degradation

**Voice Input**:

- Unavailable → Hide voice button, allow text-only input
- No impact on chat functionality

**Dark Mode**:

- Unavailable → Fallback to light theme
- No error shown, graceful stylesheet fallback

**Model Selection**:

- Unavailable → Use default/last-known-good model
- Show persistent storage error toast

**Streaming**:

- Unavailable → Use polling or fallback to complete responses
- Display latency warning

**Web Search**:

- Unavailable → Show web search toggle as disabled
- Provide context about requirement (browser API)

## Network Error Handling

### ApiErrorHandler Service

Comprehensive error handling for network requests with automatic retry logic.

**Location**: `apps/web/services/api-error-handler.ts`

**Usage**:

```tsx
import ApiErrorHandler from '@/services/api-error-handler';

// Fetch with timeout
const response = await ApiErrorHandler.fetchWithTimeout(url, {
  timeout: 30000,
});

// Fetch with automatic retry
const response = await ApiErrorHandler.fetchWithRetry(url, {
  maxRetries: 3,
  retryDelay: 1000,
});

// Parse JSON safely
const data = await ApiErrorHandler.parseJSON(response);

// Handle HTTP errors
const error = ApiErrorHandler.handleHttpError(500);
ApiErrorHandler.showErrorToast(error, 'Retry');
```

**Error Status Codes**:

| Status        | Behavior                | Retryable                 |
| ------------- | ----------------------- | ------------------------- |
| 400           | Bad request             | No                        |
| 401           | Unauthorized (re-login) | No                        |
| 403           | Access denied           | No                        |
| 404           | Not found               | No                        |
| 408           | Request timeout         | Yes (exponential backoff) |
| 429           | Rate limited            | Yes (with longer backoff) |
| 5xx           | Server error            | Yes (exponential backoff) |
| Network error | Connection failed       | Yes                       |

**Retry Strategy**:

- Exponential backoff: `delay = baseDelay * 2^attempt`
- Default delays: 1s, 2s, 4s
- Max retries: 3 (configurable)
- Timeout: 30s per request (configurable)

**Example: Fetch with Retry UI**:

```tsx
const { error, isRecovering, retry } = useErrorRecovery({
  maxRetries: 3,
  onError: (err) => {
    if (err.code === 'NETWORK_ERROR') {
      showOfflineUI();
    } else if (err.status === 429) {
      showRateLimitUI();
    }
  },
});

return (
  <>
    {error && (
      <div className="error-banner">
        {error.message}
        {error.isRetryable && (
          <button onClick={() => retry(fetchData)}>{isRecovering ? 'Retrying...' : 'Retry'}</button>
        )}
      </div>
    )}
  </>
);
```

## State Recovery

### StateRecoveryService

Automatic recovery from corrupted or invalid state using snapshots.

**Location**: `apps/web/services/state-recovery-service.ts`

**Usage**:

```tsx
import StateRecoveryService from '@/services/state-recovery-service';

// Capture state snapshot
StateRecoveryService.captureSnapshot('chat-state', currentState);

// Restore from snapshot
const state = StateRecoveryService.restoreFromSnapshot('chat-state', defaults);

// Validate state
const isValid = StateRecoveryService.validateState(state, (s) => {
  return s.messages && Array.isArray(s.messages);
});

// Merge updates safely
const merged = StateRecoveryService.mergeState(current, updates, defaults);

// Reset to defaults
StateRecoveryService.resetState('chat-state', defaults);
```

**Recovery Log**:

```tsx
// Get recovery history for debugging
const log = StateRecoveryService.getRecoveryLog();
// [
//   { timestamp, key, action, success, error? }
// ]

// Clear log
StateRecoveryService.clearRecoveryLog();
```

### Integration with Zustand

```tsx
// In your Zustand store
export const useChatStore = create<ChatStore>((set, get) => ({
  // ... store definition

  // Capture snapshot on important changes
  sendMessage: (message) => {
    set((state) => {
      const newState = { ...state, messages: [...state.messages, message] };
      StateRecoveryService.captureSnapshot('chat-store', newState);
      return newState;
    });
  },

  // Restore from snapshot on initialization
  init: () => {
    const stored = localStorage.getItem('chat-store');
    const defaults = { messages: [] };

    if (stored) {
      try {
        const state = JSON.parse(stored);
        const isValid = StateRecoveryService.validateState(state, (s) => {
          return Array.isArray(s.messages);
        });

        if (!isValid) {
          return StateRecoveryService.restoreFromSnapshot('chat-store', defaults);
        }
        return state;
      } catch (e) {
        return StateRecoveryService.restoreFromSnapshot('chat-store', defaults);
      }
    }
    return defaults;
  },
}));
```

## useErrorRecovery Hook

Provides error state management and retry logic for async operations.

**Location**: `apps/web/hooks/useErrorRecovery.ts`

**Usage**:

```tsx
import { useErrorRecovery } from '@/hooks/useErrorRecovery';

export function DataFetcher() {
  const { error, isRecovering, retryCount, handleError, retry, reset } = useErrorRecovery({
    maxRetries: 3,
    retryDelay: 1000,
    onError: (error) => {
      logToSentry(error);
    },
  });

  const fetchData = async () => {
    try {
      const response = await fetch('/api/data');
      const data = await response.json();
      setData(data);
      reset(); // Clear error on success
    } catch (err) {
      handleError(err as Error);
    }
  };

  return (
    <>
      {error && (
        <ErrorAlert>
          {error.message}
          {error.isRetryable && (
            <button onClick={() => retry(fetchData)}>Retry ({retryCount}/3)</button>
          )}
        </ErrorAlert>
      )}
      <button onClick={fetchData} disabled={isRecovering}>
        {isRecovering ? 'Loading...' : 'Fetch'}
      </button>
    </>
  );
}
```

## Implementation Checklist

When adding error handling to a component:

- [ ] Wrap critical components with `SectionErrorBoundary`
- [ ] Use compact mode for non-critical sections
- [ ] Implement `onError` callback for error tracking
- [ ] Use `useFeatureAvailability` for optional features
- [ ] Use `useErrorRecovery` for async operations
- [ ] Handle network errors with `ApiErrorHandler`
- [ ] Implement state validation and recovery
- [ ] Provide user-friendly error messages
- [ ] Test error scenarios with mocked failures
- [ ] Log errors with sufficient context

## Testing Error Scenarios

### Testing Error Boundaries

```tsx
import { render, screen } from '@testing-library/react';
import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary';

// Component that throws
const ThrowingComponent = () => {
  throw new Error('Test error');
};

it('should catch and display error', () => {
  render(
    <SectionErrorBoundary sectionName="Test">
      <ThrowingComponent />
    </SectionErrorBoundary>,
  );

  expect(screen.getByText(/Test Error/i)).toBeInTheDocument();
});
```

### Testing Feature Degradation

```tsx
it('should hide voice button when unavailable', () => {
  const { rerender } = render(<ChatComposer />);

  // Mock speech recognition as unavailable
  Object.defineProperty(window, 'SpeechRecognition', {
    value: undefined,
    writable: true,
  });

  rerender(<ChatComposer />);
  expect(screen.queryByRole('button', { name: /voice/i })).not.toBeInTheDocument();
});
```

### Testing Error Recovery

```tsx
it('should retry failed operation', async () => {
  const { result } = renderHook(() => useErrorRecovery());
  const failingFn = vi.fn().mockRejectedValue(new Error('Fail'));

  await act(async () => {
    await result.current.retry(failingFn);
  });

  expect(result.current.retryCount).toBe(1);
  expect(result.current.error).toBeTruthy();
});
```

## Monitoring & Debugging

### Enable Development Logging

```tsx
// In development, detailed error logs are shown in SectionErrorBoundary
if (process.env.NODE_ENV === 'development') {
  // Error details displayed in a collapsible section
}
```

### Check Recovery Log

```tsx
// In browser console
import StateRecoveryService from '@/services/state-recovery-service';
StateRecoveryService.getRecoveryLog().forEach((entry) => {
  console.log(`[${entry.action}] ${entry.key}: ${entry.success}`);
});
```

### Common Error Codes

| Code            | Meaning                    | Retryable |
| --------------- | -------------------------- | --------- |
| `TIMEOUT`       | Request exceeded timeout   | Yes       |
| `NETWORK_ERROR` | Network connectivity issue | Yes       |
| `UNKNOWN_ERROR` | Unexpected error           | No        |

## Performance Considerations

1. **Snapshot Size**: Keep state snapshots under 100KB
2. **Retry Backoff**: Don't retry more than 3-5 times
3. **Error Logging**: Sample errors in production (avoid log spam)
4. **Recovery Log**: Limit to 50 entries, old entries are pruned

## Future Enhancements

- [ ] Error recovery service integration with Sentry
- [ ] Automatic error recovery workflows
- [ ] User-initiated bug reports with context
- [ ] A/B testing of error UIs
- [ ] Error analytics dashboard
- [ ] Offline-first recovery strategies
