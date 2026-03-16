/**
 * Complete Error Handling Integration Example
 *
 * This file demonstrates how to integrate all error handling utilities
 * together in a real-world chat component scenario.
 */

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary';
import { useErrorRecovery } from '@/hooks/useErrorRecovery';
import { useFeatureAvailability } from '@/hooks/useFeatureAvailability';
import ApiErrorHandler from '@/services/api-error-handler';
import StateRecoveryService from '@/services/state-recovery-service';

/**
 * Example 1: Chat Composer with Graceful Degradation
 *
 * This component demonstrates:
 * - Feature availability checking
 * - Graceful feature degradation
 * - Error recovery for async operations
 */
export function ChatComposerExample() {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Check feature availability
  const { features, isAvailable } = useFeatureAvailability();

  // Handle errors for sending
  const { error, isRecovering, retry, handleError, reset } = useErrorRecovery({
    maxRetries: 2,
    onError: (error) => {
      // Custom error handling
      console.error('Failed to send message:', error);
    },
  });

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    setIsSending(true);
    reset();

    try {
      // Fetch with timeout and potential retry
      const response = await ApiErrorHandler.fetchWithTimeout('/api/chat/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
        timeout: 30000,
      });

      if (!response.ok) {
        throw ApiErrorHandler.handleHttpError(response.status);
      }

      const data = await ApiErrorHandler.parseJSON(response);
      setMessage('');
      reset();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      handleError(error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          disabled={isSending || isRecovering}
          className="flex-1"
        />

        {/* Voice button only shown if available */}
        {isAvailable('voice') && (
          <button onClick={handleVoiceInput} disabled={isSending} aria-label="Voice input">
            🎤
          </button>
        )}

        <button onClick={handleSendMessage} disabled={isSending || isRecovering || !message.trim()}>
          {isSending ? 'Sending...' : isRecovering ? 'Retrying...' : 'Send'}
        </button>
      </div>

      {/* Error recovery UI */}
      {error && (
        <div className="rounded border border-red-500 bg-red-50 p-3">
          <p className="text-sm text-red-900">{error.message}</p>
          {error.isRetryable && (
            <button
              onClick={() => retry(handleSendMessage)}
              className="mt-2 text-sm text-red-600 hover:underline"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {/* Web search only shown if available */}
      {isAvailable('webSearch') && (
        <label className="flex items-center gap-2">
          <input type="checkbox" />
          Search web for context
        </label>
      )}
    </div>
  );
}

/**
 * Example 2: Message List with Error Boundary
 *
 * Demonstrates:
 * - SectionErrorBoundary wrapping critical component
 * - State recovery for corrupted message list
 * - Network error handling with retry
 */
export function MessageListExample() {
  const [messages, setMessages] = useState<Array<{ id: string; text: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  const {
    error: fetchError,
    retry,
    handleError,
  } = useErrorRecovery({
    maxRetries: 3,
    showToast: true,
  });

  useEffect(() => {
    loadMessages();
  }, []);

  const loadMessages = async () => {
    setIsLoading(true);

    try {
      // Use API error handler for resilient fetching
      const response = await ApiErrorHandler.fetchWithRetry('/api/messages', {
        maxRetries: 2,
      });

      const data = await ApiErrorHandler.parseJSON(response);

      // Validate state before setting
      const isValid = StateRecoveryService.validateState(data, (state: any) => {
        return Array.isArray(state) && state.every((m) => m.id && m.text);
      });

      if (!isValid) {
        throw new Error('Invalid message data received');
      }

      setMessages(data);

      // Capture snapshot for recovery
      StateRecoveryService.captureSnapshot('messages', data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      handleError(error);

      // Try to recover from last known good state
      const recovered = StateRecoveryService.restoreFromSnapshot('messages', []);
      setMessages(recovered);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SectionErrorBoundary
      sectionName="Message List"
      onError={(error, info) => {
        // Send to error tracking
        console.error('Message list error:', error, info);
      }}
    >
      {fetchError && (
        <div className="mb-4 rounded border border-yellow-500 bg-yellow-50 p-3">
          <p className="text-sm text-yellow-900">{fetchError.message}</p>
          {fetchError.isRetryable && (
            <button
              onClick={() => retry(loadMessages)}
              className="mt-2 text-sm text-yellow-600 hover:underline"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="text-center text-gray-500">Loading...</div>
      ) : messages.length === 0 ? (
        <div className="text-center text-gray-500">No messages</div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => (
            <div key={msg.id} className="rounded border p-3">
              {msg.text}
            </div>
          ))}
        </div>
      )}
    </SectionErrorBoundary>
  );
}

/**
 * Example 3: Complete Chat Layout with All Error Handling
 *
 * Demonstrates:
 * - Wrapping multiple components with error boundaries
 * - Graceful degradation of optional features
 * - Network resilience
 * - State recovery
 */
export function ChatLayoutExample() {
  return (
    <div className="flex h-screen flex-col">
      {/* Sidebar with error boundary */}
      <aside className="w-64 border-r">
        <SectionErrorBoundary sectionName="Sidebar" compact>
          <Sidebar />
        </SectionErrorBoundary>
      </aside>

      {/* Main chat area */}
      <main className="flex flex-1 flex-col">
        {/* Message list with error recovery */}
        <div className="flex-1 overflow-auto">
          <SectionErrorBoundary sectionName="Messages">
            <MessageListExample />
          </SectionErrorBoundary>
        </div>

        {/* Composer with graceful degradation */}
        <div className="border-t p-4">
          <SectionErrorBoundary sectionName="Composer">
            <ChatComposerExample />
          </SectionErrorBoundary>
        </div>
      </main>
    </div>
  );
}

/**
 * Example 4: Error Recovery in State Management
 *
 * Shows how to integrate error recovery in a Zustand-like store
 */
export interface ChatState {
  messages: Array<{ id: string; text: string }>;
  isLoading: boolean;
  error: Error | null;
  addMessage: (message: { id: string; text: string }) => void;
  loadMessages: () => Promise<void>;
}

export function createChatStore(): ChatState {
  const state: ChatState = {
    messages: [],
    isLoading: false,
    error: null,

    addMessage(message) {
      state.messages.push(message);

      // Capture snapshot after mutation
      StateRecoveryService.captureSnapshot('chat-messages', state.messages);
    },

    async loadMessages() {
      state.isLoading = true;
      state.error = null;

      try {
        // Fetch with resilience
        const response = await ApiErrorHandler.fetchWithRetry('/api/messages');
        const data = await ApiErrorHandler.parseJSON(response);

        // Validate before applying to state
        const isValid = StateRecoveryService.validateState(data, (d: any) => {
          return Array.isArray(d) && d.every((m: any) => m.id && m.text);
        });

        if (!isValid) {
          throw new Error('Invalid message format');
        }

        state.messages = data;

        // Capture good state
        StateRecoveryService.captureSnapshot('chat-messages', state.messages);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        state.error = error;

        // Recover from last known good state
        const recovered = StateRecoveryService.restoreFromSnapshot('chat-messages', []);
        state.messages = recovered;

        toast.error(error.message);
      } finally {
        state.isLoading = false;
      }
    },
  };

  return state;
}

/**
 * Example 5: Testing Error Scenarios
 */
export const testExamples = {
  // Test 1: Simulate network error and retry
  async testNetworkErrorRetry() {
    const mockFetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useErrorRecovery());

    await act(async () => {
      await result.current.retry(() => mockFetch());
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.retryCount).toBe(1);
  },

  // Test 2: Simulate feature unavailability
  async testFeatureUnavailable() {
    const { result } = renderHook(() => useFeatureAvailability());

    // Mock voice as unavailable
    Object.defineProperty(window, 'SpeechRecognition', {
      value: undefined,
      writable: true,
    });

    expect(result.current.isAvailable('voice')).toBe(false);
  },

  // Test 3: State recovery from corrupted data
  async testStateRecovery() {
    const original = { count: 5, name: 'test' };

    // Capture good state
    StateRecoveryService.captureSnapshot('test', original);

    // Restore should work
    const restored = StateRecoveryService.restoreFromSnapshot('test', {});
    expect(restored).toEqual(original);

    // Corrupted data should return fallback
    localStorage.setItem('state_snapshot_corrupted', 'bad data');
    const fallback = { count: 0 };
    const result = StateRecoveryService.restoreFromSnapshot('corrupted', fallback);
    expect(result).toEqual(fallback);
  },
};

// Placeholder functions
function Sidebar() {
  return <div>Sidebar</div>;
}

function handleVoiceInput() {
  console.log('Voice input triggered');
}
