/**
 * VibeMessageService Tests
 *
 * Full coverage of all public methods in vibe-message-service.ts
 * Mocks: @shared/lib/supabase-client, @shared/stores/model-store, global fetch
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Build chainable supabase mock
function createChainMock(terminal: Record<string, unknown> = {}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    'select',
    'insert',
    'update',
    'delete',
    'upsert',
    'eq',
    'order',
    'limit',
    'maybeSingle',
    'single',
  ]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  // Apply terminal overrides
  for (const [k, v] of Object.entries(terminal)) {
    chain[k] = vi.fn().mockReturnValue(v);
  }
  return chain;
}

let mockChain = createChainMock();
const mockFrom = vi.fn(() => mockChain);
const mockGetSession = vi.fn();
const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn();

vi.mock('@shared/lib/supabase-client', () => ({
  supabase: {
    from: mockFrom,
    auth: {
      getSession: mockGetSession,
    },
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

vi.mock('@shared/stores/model-store', () => ({
  useModelStore: {
    getState: vi.fn(() => ({ selectedModelId: 'gpt-4' })),
  },
}));

import { VibeMessageService, type VibeMessage } from './vibe-message-service';

describe('VibeMessageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain = createChainMock();
    mockFrom.mockReturnValue(mockChain);
  });

  // ==========================================================================
  // getMessages
  // ==========================================================================

  describe('getMessages', () => {
    it('returns messages for a session in ascending order', async () => {
      const fakeMessages: VibeMessage[] = [
        { id: '1', session_id: 's1', role: 'user', content: 'hi' },
        { id: '2', session_id: 's1', role: 'assistant', content: 'hello' },
      ];

      mockChain['order'] = vi.fn().mockResolvedValue({ data: fakeMessages, error: null });

      const result = await VibeMessageService.getMessages('s1');

      expect(mockFrom).toHaveBeenCalledWith('vibe_messages');
      expect(mockChain['select']).toHaveBeenCalledWith('*');
      expect(mockChain['eq']).toHaveBeenCalledWith('session_id', 's1');
      expect(mockChain['order']).toHaveBeenCalledWith('timestamp', { ascending: true });
      expect(result).toEqual(fakeMessages);
    });

    it('returns empty array when data is null', async () => {
      mockChain['order'] = vi.fn().mockResolvedValue({ data: null, error: null });

      const result = await VibeMessageService.getMessages('s1');
      expect(result).toEqual([]);
    });

    it('throws on supabase error', async () => {
      mockChain['order'] = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'DB error' },
      });

      await expect(VibeMessageService.getMessages('s1')).rejects.toThrow(
        'Failed to fetch messages: DB error',
      );
    });
  });

  // ==========================================================================
  // createMessage
  // ==========================================================================

  describe('createMessage', () => {
    it('inserts a message and returns it', async () => {
      const created: VibeMessage = {
        id: 'msg-1',
        session_id: 's1',
        role: 'user',
        content: 'hello',
        user_id: 'u1',
      };

      mockChain['maybeSingle'] = vi.fn().mockResolvedValue({ data: created, error: null });

      const result = await VibeMessageService.createMessage({
        sessionId: 's1',
        userId: 'u1',
        role: 'user',
        content: 'hello',
      });

      expect(mockFrom).toHaveBeenCalledWith('vibe_messages');
      expect(mockChain['insert']).toHaveBeenCalled();
      expect(result).toEqual(created);
    });

    it('uses provided id when given', async () => {
      mockChain['maybeSingle'] = vi.fn().mockResolvedValue({
        data: { id: 'custom-id', session_id: 's1', role: 'user', content: 'x' },
        error: null,
      });

      const result = await VibeMessageService.createMessage({
        id: 'custom-id',
        sessionId: 's1',
        userId: 'u1',
        role: 'user',
        content: 'x',
      });

      const insertArg = mockChain!['insert']!.mock.calls[0]![0]!;
      expect(insertArg.id).toBe('custom-id');
      expect(result.id).toBe('custom-id');
    });

    it('throws on supabase error', async () => {
      mockChain['maybeSingle'] = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Insert failed' },
      });

      await expect(
        VibeMessageService.createMessage({
          sessionId: 's1',
          userId: 'u1',
          role: 'user',
          content: 'x',
        }),
      ).rejects.toThrow('Failed to create message: Insert failed');
    });

    it('throws when no data is returned', async () => {
      mockChain['maybeSingle'] = vi.fn().mockResolvedValue({ data: null, error: null });

      await expect(
        VibeMessageService.createMessage({
          sessionId: 's1',
          userId: 'u1',
          role: 'user',
          content: 'x',
        }),
      ).rejects.toThrow('Failed to create message: No data returned');
    });
  });

  // ==========================================================================
  // updateMessage
  // ==========================================================================

  describe('updateMessage', () => {
    it('updates a message and returns the updated version', async () => {
      const updated: VibeMessage = {
        id: 'msg-1',
        session_id: 's1',
        role: 'assistant',
        content: 'updated content',
      };

      mockChain['maybeSingle'] = vi.fn().mockResolvedValue({ data: updated, error: null });

      const result = await VibeMessageService.updateMessage('msg-1', {
        content: 'updated content',
      });

      expect(mockChain['update']).toHaveBeenCalledWith({ content: 'updated content' });
      expect(mockChain['eq']).toHaveBeenCalledWith('id', 'msg-1');
      expect(result).toEqual(updated);
    });

    it('throws on supabase error', async () => {
      mockChain['maybeSingle'] = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Update failed' },
      });

      await expect(VibeMessageService.updateMessage('msg-1', { content: 'x' })).rejects.toThrow(
        'Failed to update message: Update failed',
      );
    });

    it('throws when message not found', async () => {
      mockChain['maybeSingle'] = vi.fn().mockResolvedValue({ data: null, error: null });

      await expect(
        VibeMessageService.updateMessage('nonexistent', { content: 'x' }),
      ).rejects.toThrow('Message not found');
    });
  });

  // ==========================================================================
  // deleteMessage
  // ==========================================================================

  describe('deleteMessage', () => {
    it('deletes a message by id', async () => {
      mockChain['eq'] = vi.fn().mockResolvedValue({ error: null });

      await VibeMessageService.deleteMessage('msg-1');

      expect(mockFrom).toHaveBeenCalledWith('vibe_messages');
      expect(mockChain['delete']).toHaveBeenCalled();
      expect(mockChain['eq']).toHaveBeenCalledWith('id', 'msg-1');
    });

    it('throws on supabase error', async () => {
      mockChain['eq'] = vi.fn().mockResolvedValue({ error: { message: 'Delete failed' } });

      await expect(VibeMessageService.deleteMessage('msg-1')).rejects.toThrow(
        'Failed to delete message: Delete failed',
      );
    });
  });

  // ==========================================================================
  // processUserMessage
  // ==========================================================================

  describe('processUserMessage', () => {
    const baseParams = {
      sessionId: 's1',
      userId: 'u1',
      content: 'Tell me a joke',
      conversationHistory: [{ role: 'user', content: 'previous msg' }],
    };

    beforeEach(() => {
      // Default: createMessage succeeds
      let callCount = 0;
      mockChain['maybeSingle'] = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // User message create
          return Promise.resolve({
            data: { id: 'user-msg', session_id: 's1', role: 'user', content: 'Tell me a joke' },
            error: null,
          });
        }
        if (callCount === 2) {
          // Assistant message create
          return Promise.resolve({
            data: {
              id: 'asst-msg',
              session_id: 's1',
              role: 'assistant',
              content: '',
              is_streaming: true,
            },
            error: null,
          });
        }
        // Update (final)
        return Promise.resolve({
          data: {
            id: 'asst-msg',
            session_id: 's1',
            role: 'assistant',
            content: 'A joke!',
            is_streaming: false,
          },
          error: null,
        });
      });

      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });
    });

    it('streams a response and returns final message', async () => {
      // Mock a streaming fetch response
      const encoder = new TextEncoder();
      const chunks = [
        encoder.encode('data: {"choices":[{"delta":{"content":"A "}}]}\n\n'),
        encoder.encode('data: {"choices":[{"delta":{"content":"joke!"}}]}\n\n'),
        encoder.encode('data: [DONE]\n\n'),
      ];
      let chunkIndex = 0;

      const mockReader = {
        read: vi.fn().mockImplementation(() => {
          if (chunkIndex < chunks.length) {
            return Promise.resolve({ done: false, value: chunks[chunkIndex++] });
          }
          return Promise.resolve({ done: true, value: undefined });
        }),
      };

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const onChunk = vi.fn();
      const onComplete = vi.fn();

      const result = await VibeMessageService.processUserMessage({
        ...baseParams,
        onChunk,
        onComplete,
      });

      expect(onChunk).toHaveBeenCalledWith('A ');
      expect(onChunk).toHaveBeenCalledWith('joke!');
      expect(onComplete).toHaveBeenCalledWith('A joke!');
      expect(result.id).toBe('asst-msg');
    });

    it('handles non-streaming response (no body)', async () => {
      const mockResponse = {
        ok: true,
        body: null,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Non-streaming response' } }],
        }),
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const onChunk = vi.fn();

      const result = await VibeMessageService.processUserMessage({
        ...baseParams,
        onChunk,
      });

      expect(onChunk).toHaveBeenCalledWith('Non-streaming response');
      expect(result).toBeDefined();
    });

    it('throws when API response is not ok', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ error: 'Server error' }),
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const onError = vi.fn();

      await expect(
        VibeMessageService.processUserMessage({ ...baseParams, onError }),
      ).rejects.toThrow('Server error');

      expect(onError).toHaveBeenCalled();
    });

    it('throws when response body is empty (no AI response)', async () => {
      // Empty SSE stream
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
      };

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      await expect(VibeMessageService.processUserMessage(baseParams)).rejects.toThrow(
        'No response received from AI',
      );
    });

    it('calls onError and resets streaming state on failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));

      const onError = vi.fn();

      await expect(
        VibeMessageService.processUserMessage({ ...baseParams, onError }),
      ).rejects.toThrow('Network failure');

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('handles API error response with no JSON body', async () => {
      const mockResponse = {
        ok: false,
        status: 502,
        json: vi.fn().mockRejectedValue(new Error('Not JSON')),
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      await expect(VibeMessageService.processUserMessage(baseParams)).rejects.toThrow(
        'Request failed',
      );
    });
  });

  // ==========================================================================
  // subscribeToMessages
  // ==========================================================================

  describe('subscribeToMessages', () => {
    it('subscribes to realtime changes and forwards INSERT/UPDATE events', () => {
      let payloadHandler: ((payload: Record<string, unknown>) => void) | undefined;
      let statusCallback: ((status: string) => void) | undefined;

      const channelObj = {
        on: vi
          .fn()
          .mockImplementation(
            (
              _event: string,
              _filter: unknown,
              handler: (payload: Record<string, unknown>) => void,
            ) => {
              payloadHandler = handler;
              return channelObj;
            },
          ),
        subscribe: vi.fn().mockImplementation((cb: (status: string) => void) => {
          statusCallback = cb;
          return channelObj;
        }),
      };

      mockChannel.mockReturnValue(channelObj);

      const onMessage = vi.fn();
      const onError = vi.fn();

      const unsubscribe = VibeMessageService.subscribeToMessages('s1', onMessage, onError);

      expect(mockChannel).toHaveBeenCalledWith('vibe-messages-s1');

      // Simulate INSERT event
      payloadHandler!({ eventType: 'INSERT', new: { id: '1', content: 'new msg' } });
      expect(onMessage).toHaveBeenCalledWith({ id: '1', content: 'new msg' });

      // Simulate DELETE event (should NOT forward)
      onMessage.mockClear();
      payloadHandler!({ eventType: 'DELETE', new: null });
      expect(onMessage).not.toHaveBeenCalled();

      // Simulate CHANNEL_ERROR
      statusCallback!('CHANNEL_ERROR');
      expect(onError).toHaveBeenCalledWith(expect.any(Error));

      // Unsubscribe
      unsubscribe();
      expect(mockRemoveChannel).toHaveBeenCalledWith(channelObj);
    });

    it('does not call onError when status is not CHANNEL_ERROR', () => {
      const channelObj = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockImplementation((cb: (status: string) => void) => {
          cb('SUBSCRIBED');
          return channelObj;
        }),
      };

      mockChannel.mockReturnValue(channelObj);

      const onError = vi.fn();
      VibeMessageService.subscribeToMessages('s1', vi.fn(), onError);

      expect(onError).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // getRecentMessages
  // ==========================================================================

  describe('getRecentMessages', () => {
    it('returns recent messages in chronological order (reversed)', async () => {
      const data = [
        { id: '3', session_id: 's1', role: 'assistant', content: 'newest' },
        { id: '2', session_id: 's1', role: 'user', content: 'middle' },
        { id: '1', session_id: 's1', role: 'user', content: 'oldest' },
      ];

      mockChain['limit'] = vi.fn().mockResolvedValue({ data, error: null });

      const result = await VibeMessageService.getRecentMessages('s1', 10);

      expect(mockChain['order']).toHaveBeenCalledWith('timestamp', { ascending: false });
      expect(mockChain['limit']).toHaveBeenCalledWith(10);
      expect(result![0]!.id!).toBe('1');
      expect(result![2]!.id!).toBe('3');
    });

    it('uses default limit of 50', async () => {
      mockChain['limit'] = vi.fn().mockResolvedValue({ data: [], error: null });

      await VibeMessageService.getRecentMessages('s1');

      expect(mockChain['limit']).toHaveBeenCalledWith(50);
    });

    it('returns empty array when data is null', async () => {
      mockChain['limit'] = vi.fn().mockResolvedValue({ data: null, error: null });

      const result = await VibeMessageService.getRecentMessages('s1');
      expect(result).toEqual([]);
    });

    it('throws on supabase error', async () => {
      mockChain['limit'] = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Fetch error' },
      });

      await expect(VibeMessageService.getRecentMessages('s1')).rejects.toThrow(
        'Failed to fetch recent messages: Fetch error',
      );
    });
  });

  // ==========================================================================
  // clearSessionMessages
  // ==========================================================================

  describe('clearSessionMessages', () => {
    it('deletes all messages for a session', async () => {
      mockChain['eq'] = vi.fn().mockResolvedValue({ error: null });

      await VibeMessageService.clearSessionMessages('s1');

      expect(mockFrom).toHaveBeenCalledWith('vibe_messages');
      expect(mockChain['delete']).toHaveBeenCalled();
      expect(mockChain['eq']).toHaveBeenCalledWith('session_id', 's1');
    });

    it('throws on supabase error', async () => {
      mockChain['eq'] = vi.fn().mockResolvedValue({ error: { message: 'Clear failed' } });

      await expect(VibeMessageService.clearSessionMessages('s1')).rejects.toThrow(
        'Failed to clear messages: Clear failed',
      );
    });
  });
});
