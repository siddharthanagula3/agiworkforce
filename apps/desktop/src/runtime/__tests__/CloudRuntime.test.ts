/**
 * CloudRuntime unit tests — mock-only, no live backend.
 *
 * Live E2E verification requires a signed Tauri build + real Clerk
 * credentials + the PA-3 gate lifted (DCL-4) — none obtainable in this
 * sandbox. See docs/strategy/PUBLIC-ALPHA-CUTOVER.md and
 * docs/agent-context/known-flaws.md (DESKTOP-CLOUD-MODE-SPEC-VS-REALITY-01).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StreamEvent } from '@agiworkforce/unified-chat';
import { CloudRuntime } from '../CloudRuntime';

const saveMessage = vi.fn();
const createConversation = vi.fn();
const deleteConversation = vi.fn();
const updateConversationTitle = vi.fn();
const listConversations = vi.fn();
const getConversation = vi.fn();

vi.mock('../../lib/cloudChatPersistence', () => ({
  getDesktopCloudChatPersistenceClient: () => ({
    saveMessage,
    createConversation,
    deleteConversation,
    updateConversationTitle,
    listConversations,
    getConversation,
  }),
}));

const sendCloudMessage = vi.fn();
vi.mock('../../api/cloudApi', () => ({
  sendCloudMessage: (...args: unknown[]) => sendCloudMessage(...args),
}));

function collectEvents(runtime: CloudRuntime): StreamEvent[] {
  const events: StreamEvent[] = [];
  runtime.onStream((event) => events.push(event));
  return events;
}

describe('CloudRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveMessage.mockResolvedValue({ id: 'saved-id' });
  });

  describe('sendMessage', () => {
    it('persists the user message before streaming, then the assistant message on done', async () => {
      const runtime = new CloudRuntime();
      const events = collectEvents(runtime);

      sendCloudMessage.mockImplementation(
        async (
          _conversationId: string,
          _content: string,
          _model: string,
          onChunk: (text: string) => void,
          onDone: () => void,
        ) => {
          onChunk('Hello');
          onChunk(' world');
          onDone();
        },
      );

      await runtime.sendMessage('conv_1', 'Hi there');

      // User message saved before the stream call.
      expect(saveMessage).toHaveBeenNthCalledWith(
        1,
        'conv_1',
        expect.objectContaining({ role: 'user', content: 'Hi there' }),
      );
      expect(sendCloudMessage).toHaveBeenCalledTimes(1);

      // Content events forwarded, done emitted.
      expect(events.filter((e) => e.type === 'content')).toHaveLength(2);
      expect(events.some((e) => e.type === 'done')).toBe(true);

      // Assistant message saved with the accumulated content — fired async
      // after 'done', so wait a tick.
      await vi.waitFor(() => {
        expect(saveMessage).toHaveBeenCalledTimes(2);
      });
      expect(saveMessage).toHaveBeenNthCalledWith(
        2,
        'conv_1',
        expect.objectContaining({ role: 'assistant', content: 'Hello world' }),
      );
    });

    it('emits an error and does not call sendCloudMessage when the user-message save fails', async () => {
      saveMessage.mockRejectedValueOnce(new Error('network down'));
      const runtime = new CloudRuntime();
      const events = collectEvents(runtime);

      await runtime.sendMessage('conv_1', 'Hi there');

      expect(sendCloudMessage).not.toHaveBeenCalled();
      expect(events).toEqual([{ type: 'error', error: 'network down' }]);
    });

    it('surfaces a save failure for the assistant turn as a follow-up error event without hiding done', async () => {
      const runtime = new CloudRuntime();
      const events = collectEvents(runtime);

      sendCloudMessage.mockImplementation(
        async (
          _conversationId: string,
          _content: string,
          _model: string,
          onChunk: (text: string) => void,
          onDone: () => void,
        ) => {
          onChunk('Reply');
          onDone();
        },
      );
      saveMessage.mockResolvedValueOnce({ id: 'user-saved' }); // user save ok
      saveMessage.mockRejectedValueOnce(new Error('save failed')); // assistant save fails

      await runtime.sendMessage('conv_1', 'Hi');

      expect(events.some((e) => e.type === 'done')).toBe(true);
      await vi.waitFor(() => {
        expect(events.some((e) => e.type === 'error' && e.error.includes('save failed'))).toBe(
          true,
        );
      });
    });

    it('forwards onError from the stream as an error event', async () => {
      const runtime = new CloudRuntime();
      const events = collectEvents(runtime);

      sendCloudMessage.mockImplementation(
        async (
          _conversationId: string,
          _content: string,
          _model: string,
          _onChunk: (text: string) => void,
          _onDone: () => void,
          onError: (err: Error) => void,
        ) => {
          onError(new Error('stream broke'));
        },
      );

      await runtime.sendMessage('conv_1', 'Hi');

      expect(events).toContainEqual({ type: 'error', error: 'stream broke' });
    });
  });

  describe('stopGeneration', () => {
    it('aborts the in-flight controller passed to sendCloudMessage', async () => {
      const runtime = new CloudRuntime();
      let capturedSignal: AbortSignal | undefined;

      sendCloudMessage.mockImplementation(
        async (
          _conversationId: string,
          _content: string,
          _model: string,
          _onChunk: (text: string) => void,
          _onDone: () => void,
          _onError: (err: Error) => void,
          signal: AbortSignal,
        ) => {
          capturedSignal = signal;
          // Simulate a long-running stream that never resolves within the test.
          await new Promise(() => {});
        },
      );

      void runtime.sendMessage('conv_1', 'Hi');
      await vi.waitFor(() => expect(capturedSignal).toBeDefined());

      runtime.stopGeneration('conv_1');

      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  describe('conversation CRUD', () => {
    it('createConversation sends a client-supplied UUID and maps the response', async () => {
      createConversation.mockResolvedValue({
        id: 'conv_1',
        userId: 'user_1',
        title: 'New Conversation',
        mode: 'chat',
        model: 'claude-sonnet-5',
        projectId: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        metadata: { messageCount: 0, agentsInvolved: [], lastActivity: new Date() },
      });

      const runtime = new CloudRuntime();
      const result = await runtime.createConversation('New Conversation');

      expect(createConversation).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New Conversation', id: expect.any(String) }),
      );
      const callArg = createConversation.mock.calls[0]?.[0] as { id: string };
      expect(callArg.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(result.id).toBe('conv_1');
      expect(result.title).toBe('New Conversation');
    });

    it('deleteConversation delegates to the persistence client', async () => {
      const runtime = new CloudRuntime();
      await runtime.deleteConversation('conv_1');
      expect(deleteConversation).toHaveBeenCalledWith('conv_1');
    });

    it('renameConversation delegates to updateConversationTitle', async () => {
      const runtime = new CloudRuntime();
      await runtime.renameConversation('conv_1', 'New title');
      expect(updateConversationTitle).toHaveBeenCalledWith('conv_1', 'New title');
    });

    it('listConversations maps the normalized DTO to the lightweight shape', async () => {
      listConversations.mockResolvedValue([
        {
          id: 'conv_1',
          userId: 'user_1',
          title: 'Chat 1',
          mode: 'chat',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
          metadata: { messageCount: 0, agentsInvolved: [], lastActivity: new Date() },
        },
      ]);

      const runtime = new CloudRuntime();
      const result = await runtime.listConversations();

      expect(result).toEqual([
        { id: 'conv_1', title: 'Chat 1', updatedAt: '2026-01-02T00:00:00.000Z' },
      ]);
    });
  });

  describe('message loading', () => {
    it('getMessages maps raw messages with a conversationId and generated id fallback', async () => {
      getConversation.mockResolvedValue({
        conversation: {
          id: 'conv_1',
          userId: 'user_1',
          title: 'Chat 1',
          mode: 'chat',
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: { messageCount: 1, agentsInvolved: [], lastActivity: new Date() },
        },
        messages: [
          { id: 'm1', role: 'user', content: 'hi', created_at: '2026-01-01T00:00:00.000Z' },
          { role: 'assistant', content: 'hello' },
        ],
      });

      const runtime = new CloudRuntime();
      const messages = await runtime.getMessages('conv_1');

      expect(messages[0]).toEqual({
        id: 'm1',
        conversationId: 'conv_1',
        role: 'user',
        content: 'hi',
        createdAt: '2026-01-01T00:00:00.000Z',
        model: undefined,
      });
      expect(messages[1]?.conversationId).toBe('conv_1');
      expect(messages[1]?.role).toBe('assistant');
      expect(messages[1]?.id).toEqual(expect.any(String));
    });

    it('loadMessages is an alias for getMessages', async () => {
      getConversation.mockResolvedValue({
        conversation: {
          id: 'conv_1',
          userId: 'user_1',
          title: 'Chat 1',
          mode: 'chat',
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: { messageCount: 0, agentsInvolved: [], lastActivity: new Date() },
        },
        messages: [],
      });

      const runtime = new CloudRuntime();
      await expect(runtime.loadMessages('conv_1')).resolves.toEqual([]);
    });
  });

  describe('getPlatform', () => {
    it('returns desktop', () => {
      expect(new CloudRuntime().getPlatform()).toBe('desktop');
    });
  });
});
