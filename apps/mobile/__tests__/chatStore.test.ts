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
jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
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

jest.mock('../services/remoteChatGate', () => {
  class MockRemoteChatDisabledError extends Error {
    readonly code = 'MOBILE_REMOTE_CHAT_DISABLED';
  }

  return {
    getRemoteChatDisabledReason: jest.fn(() => null),
    RemoteChatDisabledError: MockRemoteChatDisabledError,
  };
});

jest.mock('@agiworkforce/local-llm', () => ({
  localGenerate: jest.fn(),
  getCapabilities: jest.fn().mockResolvedValue({
    totalRAMMB: 8192,
    osVersion: 'test',
    thermalThrottled: false,
    tier1Available: false,
    tier1Runtime: null,
    tier2Available: true,
    tier3Available: true,
  }),
}));

jest.mock('../storage/installedModels', () => ({
  listInstalledModels: jest.fn().mockResolvedValue([]),
  getInstalledModel: jest.fn().mockResolvedValue(null),
  markInstalledModelUsed: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function')
      store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

// Import after mocks are established
import { useChatStore } from '../stores/chatStore';
import { streamChat } from '../services/streaming';
import { getRemoteChatDisabledReason } from '../services/remoteChatGate';
import { localGenerate } from '@agiworkforce/local-llm';
import {
  listInstalledModels,
  getInstalledModel,
  markInstalledModelUsed,
} from '../storage/installedModels';
import type { StreamCallbacks } from '../services/streaming';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;
const mockRemoteDisabledReason = getRemoteChatDisabledReason as jest.MockedFunction<
  typeof getRemoteChatDisabledReason
>;
const mockLocalGenerate = localGenerate as jest.MockedFunction<typeof localGenerate>;
const mockListInstalledModels = listInstalledModels as jest.MockedFunction<
  typeof listInstalledModels
>;
const mockGetInstalledModel = getInstalledModel as jest.MockedFunction<typeof getInstalledModel>;
const mockMarkInstalledModelUsed = markInstalledModelUsed as jest.MockedFunction<
  typeof markInstalledModelUsed
>;
let capturedLocalGenerateOptions: Parameters<typeof localGenerate>[1] | null = null;

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
    chatMode: 'chat',
    chatStyle: 'normal',
    toolAccess: 'auto',
    features: { webSearch: true, imageGen: true, health: false },
  });
}

const CONV_ID = 'test-conv-123';
const MODEL = 'claude-3-5-sonnet';
const LOCAL_MODEL = 'qwen3-4b-instruct-2507';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('chatStore — streaming state', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
    mockRemoteDisabledReason.mockReturnValue(null);
    mockListInstalledModels.mockResolvedValue([]);
    mockGetInstalledModel.mockResolvedValue(null);
    mockMarkInstalledModelUsed.mockResolvedValue(undefined);
    capturedLocalGenerateOptions = null;

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
    it('sends selected chat mode and style context to the remote stream', async () => {
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      useChatStore.setState({ chatMode: 'create', chatStyle: 'detailed' });

      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            setTimeout(() => {
              callbacks.onDelta({ content: 'Draft ready' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'make a launch checklist', MODEL);
      });

      expect(capturedBody?.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('Mode: Create'),
          }),
        ]),
      );
      expect(capturedBody?.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('Style: Detailed'),
          }),
        ]),
      );
    });

    it('uses per-send task options over persisted chat mode', async () => {
      let capturedBody: Parameters<typeof streamChat>[0] | null = null;
      useChatStore.setState({ chatMode: 'chat', chatStyle: 'normal' });

      mockStreamChat.mockImplementation(
        (body, callbacks) =>
          new Promise<void>((resolve) => {
            capturedBody = body;
            setTimeout(() => {
              callbacks.onDelta({ content: 'Code answer' });
              callbacks.onDone();
              resolve();
            }, 0);
          }),
      );

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'fix this function', MODEL, undefined, {
          mode: 'create',
          taskInstruction: 'Task: Code. Write a focused patch.',
        });
      });

      const systemMessages = capturedBody?.messages.filter((m) => m.role === 'system') ?? [];
      expect(systemMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('Mode: Create'),
          }),
        ]),
      );
      expect(systemMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('Task: Code. Write a focused patch.'),
          }),
        ]),
      );
    });

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

  describe('local LLM path', () => {
    it('sends selected chat mode and style context to local generation', async () => {
      useChatStore.setState({ chatMode: 'research', chatStyle: 'concise' });
      mockRemoteDisabledReason.mockReturnValue('mobile-local-only');
      mockListInstalledModels.mockResolvedValue([
        {
          id: LOCAL_MODEL,
          display_name: 'AGI Lite',
          runtime: 'local',
          format: 'pte',
          size_bytes: 1_181_116_006,
          sha256: null,
          local_path: null,
          installed_at: 1,
          last_used_at: null,
          capabilities: null,
        },
      ]);
      mockLocalGenerate.mockImplementation(async (_modelPath, opts) => {
        capturedLocalGenerateOptions = opts;
        opts.onToken?.('Answer');
        return { text: 'Answer', runtime: 'executorch', aborted: false };
      });

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'compare options', LOCAL_MODEL);
      });

      expect(capturedLocalGenerateOptions?.messages).toEqual([
        {
          role: 'system',
          content: expect.stringContaining('helpful assistant running locally'),
        },
        {
          role: 'system',
          content: expect.stringContaining('Mode: Research'),
        },
      ]);
      expect(capturedLocalGenerateOptions?.messages?.[1]?.content).toContain('Style: Concise');
    });

    it('runs the selected installed local model and streams tokens into the assistant message', async () => {
      useChatStore.setState({
        messages: {
          [CONV_ID]: [
            {
              id: 'prev-user',
              conversationId: CONV_ID,
              role: 'user',
              content: 'Earlier context',
              createdAt: new Date().toISOString(),
            },
            {
              id: 'prev-assistant',
              conversationId: CONV_ID,
              role: 'assistant',
              content: 'Earlier response',
              createdAt: new Date().toISOString(),
              isStreaming: false,
            },
          ],
        },
      });
      mockRemoteDisabledReason.mockReturnValue('mobile-local-only');
      mockListInstalledModels.mockResolvedValue([
        {
          id: LOCAL_MODEL,
          display_name: 'AGI Lite',
          runtime: 'local',
          format: 'pte',
          size_bytes: 1_181_116_006,
          sha256: null,
          local_path: null,
          installed_at: 1,
          last_used_at: null,
          capabilities: null,
        },
      ]);
      mockLocalGenerate.mockImplementation(async (_modelPath, opts) => {
        capturedLocalGenerateOptions = opts;
        opts.onToken?.('Hel');
        opts.onToken?.('lo');
        return { text: 'Hello', runtime: 'executorch', aborted: false };
      });

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'Use local model', LOCAL_MODEL);
      });

      expect(mockLocalGenerate).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ modelId: LOCAL_MODEL, prompt: 'Use local model' }),
      );
      expect(capturedLocalGenerateOptions?.messages).toEqual([
        {
          role: 'system',
          content: expect.stringContaining('helpful assistant running locally'),
        },
        { role: 'user', content: 'Earlier context' },
        { role: 'assistant', content: 'Earlier response' },
      ]);
      expect(mockMarkInstalledModelUsed).toHaveBeenCalledWith(LOCAL_MODEL);

      const msgs = getState().messages[CONV_ID] ?? [];
      const assistantMsg = [...msgs].reverse().find((m) => m.role === 'assistant');
      expect(assistantMsg?.content).toBe('Hello');
      expect(assistantMsg?.isStreaming).toBe(false);
      expect(assistantMsg?.metadata).toMatchObject({
        localMode: true,
        localModelId: LOCAL_MODEL,
        localRuntime: 'executorch',
      });
    });

    it('keeps a selected local model on-device even when remote chat is otherwise allowed', async () => {
      mockRemoteDisabledReason.mockReturnValue(null);
      mockListInstalledModels.mockResolvedValue([
        {
          id: LOCAL_MODEL,
          display_name: 'AGI Lite',
          runtime: 'local',
          format: 'pte',
          size_bytes: 1_181_116_006,
          sha256: null,
          local_path: null,
          installed_at: 1,
          last_used_at: null,
          capabilities: null,
        },
      ]);
      mockLocalGenerate.mockImplementation(async (_modelPath, opts) => {
        opts.onToken?.('Local');
        return { text: 'Local answer', runtime: 'executorch', aborted: false };
      });

      await act(async () => {
        await getState().sendMessage(CONV_ID, 'Stay local', LOCAL_MODEL);
      });

      expect(mockLocalGenerate).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ modelId: LOCAL_MODEL, prompt: 'Stay local' }),
      );
      expect(mockStreamChat).not.toHaveBeenCalled();
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
