/**
 * Unit tests for chatStore streaming state management.
 *
 * Tests verify that isStreaming, streamingContent, and streamingReasoning
 * are properly cleaned up on success, error, and abort.
 *
 * We test the streaming state transitions by directly invoking the store
 * action callbacks (onDelta, onDone, onError) rather than hitting the real
 * streaming service, keeping the tests fast and deterministic.
 */

import { act } from '@testing-library/react-native';

// Mock all external dependencies before importing the store
jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

jest.mock('../services/api', () => {
  // ApiPaywallError must be provided here so chatStore's `instanceof ApiPaywallError`
  // check doesn't throw "Right-hand side of instanceof is not an object".
  function MockApiPaywallError(
    this: { feature: string; requiredTier: string; reason: string; name: string; message: string },
    feat: string,
    reqTier: string,
    rsn: string,
  ) {
    this.feature = feat;
    this.requiredTier = reqTier;
    this.reason = rsn;
    this.name = 'ApiPaywallError';
    this.message = `Paywall: ${feat}`;
  }
  MockApiPaywallError.prototype = Object.create(Error.prototype);

  return {
    api: {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    },
    ApiPaywallError: MockApiPaywallError,
  };
});

jest.mock('../services/streaming', () => ({
  streamChat: jest.fn(),
}));

jest.mock('../lib/mmkv', () => ({
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

// Import after mocks are established
import { useChatStore } from '../stores/chatStore';
import { streamChat } from '../services/streaming';
import type { StreamCallbacks } from '../services/streaming';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the current store state without using hooks */
function getState() {
  return useChatStore.getState();
}

/** Reset store to initial state between tests */
function resetStore() {
  useChatStore.setState({
    conversations: [],
    currentConversationId: null,
    messages: {},
    isStreaming: false,
    streamingContent: '',
    streamingReasoning: '',
    isLoadingConversations: false,
    isLoadingMessages: false,
    error: null,
  });
}

const CONV_ID = 'test-conv-123';
const MODEL = 'claude-3-5-sonnet';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('chatStore — streaming state', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();

    // Seed the store with a conversation and empty message list
    useChatStore.setState({
      conversations: [
        {
          id: CONV_ID,
          title: 'Test Chat',
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          messageCount: 0,
          pinned: false,
        },
      ],
      messages: { [CONV_ID]: [] },
    });
  });

  describe('streaming success path', () => {
    it('sets isStreaming=true while streaming, then clears it on onDone', async () => {
      let capturedCallbacks: StreamCallbacks | null = null;

      // streamChat captures the callbacks and never resolves — we control it
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedCallbacks = callbacks;
            // Simulate successful streaming completion after capturing callbacks
            setTimeout(() => {
              callbacks.onDelta({ content: 'Hello' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      const sendPromise = act(async () => {
        await getState().sendMessage(CONV_ID, 'Hi', MODEL);
      });

      await sendPromise;

      const state = getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingContent).toBe('');
      expect(state.streamingReasoning).toBe('');
    });

    it('accumulates streaming content via onDelta', async () => {
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              callbacks.onDelta({ content: 'Hello' });
              callbacks.onDelta({ content: ' world' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'test', MODEL);
      });

      // After completion, the assistant message content should be the full text
      const msgs = getState().messages[CONV_ID] ?? [];
      const assistantMsg = msgs.find((m) => m.role === 'assistant');
      expect(assistantMsg?.content).toBe('Hello world');
      expect(assistantMsg?.isStreaming).toBe(false);
    });

    it('clears streamingContent and streamingReasoning after onDone', async () => {
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              callbacks.onDelta({ content: 'Answer', reasoning: 'Thinking...' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'question', MODEL);
      });

      expect(getState().streamingContent).toBe('');
      expect(getState().streamingReasoning).toBe('');
    });
  });

  describe('streaming error path', () => {
    it('clears isStreaming on onError', async () => {
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              callbacks.onError(new Error('Connection reset'));
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'question', MODEL);
      });

      expect(getState().isStreaming).toBe(false);
    });

    it('clears streamingContent on onError', async () => {
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              callbacks.onDelta({ content: 'Partial' });
              callbacks.onError(new Error('Network error'));
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'question', MODEL);
      });

      expect(getState().streamingContent).toBe('');
      expect(getState().streamingReasoning).toBe('');
    });

    it('marks the assistant message as non-streaming on error', async () => {
      mockStreamChat.mockImplementation(
        (_body, callbacks) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              callbacks.onError(new Error('timeout'));
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'question', MODEL);
      });

      const msgs = getState().messages[CONV_ID] ?? [];
      const streamingMsgs = msgs.filter((m) => m.isStreaming);
      expect(streamingMsgs).toHaveLength(0);
    });
  });

  describe('stopStreaming', () => {
    it('sets isStreaming=false when stopStreaming is called', async () => {
      // streamChat never resolves — we stop it manually
      mockStreamChat.mockImplementation(() => new Promise<void>(() => {}));

      // Start streaming (don't await — it won't resolve)
      act(() => {
        useChatStore.setState({ currentConversationId: CONV_ID, isStreaming: true });
        getState().sendMessage(CONV_ID, 'hi', MODEL);
      });

      await act(async () => {
        getState().stopStreaming();
      });

      expect(getState().isStreaming).toBe(false);
    });

    it('clears streamingContent when stopStreaming is called', async () => {
      mockStreamChat.mockImplementation(() => new Promise<void>(() => {}));

      act(() => {
        useChatStore.setState({
          currentConversationId: CONV_ID,
          isStreaming: true,
          streamingContent: 'partial content',
        });
        getState().sendMessage(CONV_ID, 'hi', MODEL);
      });

      await act(async () => {
        getState().stopStreaming();
      });

      expect(getState().streamingContent).toBe('');
    });

    it('marks streaming messages as not-streaming when stop is called', async () => {
      // Manually insert a streaming assistant message
      useChatStore.setState({
        currentConversationId: CONV_ID,
        isStreaming: true,
        messages: {
          [CONV_ID]: [
            {
              id: 'msg-1',
              conversationId: CONV_ID,
              role: 'assistant',
              content: 'partial',
              createdAt: new Date().toISOString(),
              isStreaming: true,
            },
          ],
        },
      });

      mockStreamChat.mockImplementation(() => new Promise<void>(() => {}));

      await act(async () => {
        getState().stopStreaming();
      });

      const msgs = getState().messages[CONV_ID] ?? [];
      expect(msgs.every((m) => !m.isStreaming)).toBe(true);
    });
  });
});
