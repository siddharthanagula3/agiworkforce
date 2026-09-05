import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore, type Message } from '@shared/stores/web-chat-store';
import { useThinkingStore } from '@shared/stores/thinking-store';
import { useFreeTrialStore } from '@/features/chat/stores/freeTrialStore';
import { useChatStream } from './useChatStream';

const authMocks = vi.hoisted(() => ({ getToken: vi.fn() }));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: authMocks.getToken }),
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: async () => 'csrf-token',
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

const CONVERSATION = {
  id: '3fbd1b2c-6f57-4a0e-9c2f-0f5b7a2e4c11',
  title: 'Variants',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  isTemporary: false,
};

const USER_ONE = '11111111-1111-4111-8111-111111111111';
const ANSWER_ONE = '22222222-2222-4222-8222-222222222222';
const ANSWER_TWO = '33333333-3333-4333-8333-333333333333';
const USER_TWO = '44444444-4444-4444-8444-444444444444';
const NEW_ASSISTANT = '55555555-5555-4555-8555-555555555555';

const BASE_TIME = Date.parse('2026-09-01T10:00:00.000Z');

function message(
  id: string,
  content: string,
  options: { parentId?: string | null; minute?: number; role?: Message['role'] } = {},
): Message {
  return {
    id,
    role: options.role ?? 'user',
    content,
    createdAt: new Date(BASE_TIME + (options.minute ?? 0) * 60_000).toISOString(),
    ...(options.parentId === undefined ? {} : { parentId: options.parentId }),
  };
}

/**
 * A question with two answers, the reader looking at the first, and a follow-up
 * hanging off it. The second answer is off-path and must be invisible to every
 * prompt this hook builds.
 */
function branchedTranscript(): Message[] {
  return [
    message(USER_ONE, 'what is the capital of france', { parentId: null, minute: 0 }),
    message(ANSWER_ONE, 'Paris.', { parentId: USER_ONE, minute: 1, role: 'assistant' }),
    message(ANSWER_TWO, 'PARIS, OBVIOUSLY.', { parentId: USER_ONE, minute: 2, role: 'assistant' }),
    message(USER_TWO, 'and its population', { parentId: ANSWER_ONE, minute: 3 }),
  ];
}

function seedBranchedConversation(activeLeafId: string) {
  useChatStore.setState({
    conversations: [CONVERSATION],
    activeConversationId: CONVERSATION.id,
  });
  useChatStore
    .getState()
    .setActiveConversationWithMessages(CONVERSATION.id, branchedTranscript(), activeLeafId);
}

function mockSseStream(text: string) {
  const body = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: new Headers() });
}

interface CapturedRequest {
  url: string;
  body: Record<string, unknown>;
}

function captureRequests(): CapturedRequest[] {
  const captured: CapturedRequest[] = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    captured.push({ url, body });
    if (url.includes('/api/llm/v1/chat/completions')) {
      return mockSseStream('Around 2.1 million.');
    }
    return new Response(JSON.stringify({ message: { id: body['id'] ?? NEW_ASSISTANT } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return captured;
}

function promptContents(captured: CapturedRequest[]): string[] {
  const completion = captured.find((call) =>
    call.url.includes('/api/llm/v1/chat/completions'),
  )?.body;
  const messages = (completion?.['messages'] ?? []) as Array<{ content: unknown }>;
  return messages.map((entry) => (typeof entry.content === 'string' ? entry.content : ''));
}

function messageWrites(captured: CapturedRequest[]): Array<Record<string, unknown>> {
  return captured.filter((call) => call.url.includes('/messages')).map((call) => call.body);
}

describe('useChatStream, variant-aware context assembly', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useThinkingStore.getState().setEnabled(false);
    useFreeTrialStore.getState().clearLimitReached();
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('the send path', () => {
    it('builds the prompt from the active path only', async () => {
      seedBranchedConversation(USER_TWO);
      const captured = captureRequests();

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('thanks', { conversationId: CONVERSATION.id });
      });

      const contents = promptContents(captured);
      expect(contents).toContain('Paris.');
      expect(contents).not.toContain('PARIS, OBVIOUSLY.');
      expect(contents).toContain('thanks');
    });

    it('sends the abandoned answer once the reader pages onto it', async () => {
      seedBranchedConversation(ANSWER_TWO);
      const captured = captureRequests();

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('thanks', { conversationId: CONVERSATION.id });
      });

      const contents = promptContents(captured);
      expect(contents).toContain('PARIS, OBVIOUSLY.');
      expect(contents).not.toContain('Paris.');
      // The follow-up hangs off the other answer, so it is off this path too.
      expect(contents).not.toContain('and its population');
    });

    it('continues a threaded conversation from its leaf on both writes', async () => {
      seedBranchedConversation(USER_TWO);
      const captured = captureRequests();

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('thanks', { conversationId: CONVERSATION.id });
      });

      const writes = messageWrites(captured);
      const userWrite = writes.find((body) => body['role'] === 'user');
      const assistantWrite = writes.find((body) => body['role'] === 'assistant');
      expect(userWrite?.['parentId']).toBe(USER_TWO);
      expect(assistantWrite?.['parentId']).toBe(userWrite?.['id']);
    });
  });

  describe('regenerate as a sibling', () => {
    it('answers the same question again without creating a second user message', async () => {
      seedBranchedConversation(ANSWER_ONE);
      const captured = captureRequests();

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('what is the capital of france', {
          conversationId: CONVERSATION.id,
          regenerateParentMessageId: USER_ONE,
        });
      });

      expect(messageWrites(captured).some((body) => body['role'] === 'user')).toBe(false);
      const assistantWrite = messageWrites(captured).find((body) => body['role'] === 'assistant');
      expect(assistantWrite?.['parentId']).toBe(USER_ONE);
    });

    it('stops the prompt at the question, so neither existing answer is in it', async () => {
      seedBranchedConversation(ANSWER_ONE);
      const captured = captureRequests();

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('what is the capital of france', {
          conversationId: CONVERSATION.id,
          regenerateParentMessageId: USER_ONE,
        });
      });

      const contents = promptContents(captured);
      expect(contents).toEqual(['what is the capital of france']);
    });

    it('leaves the previous answer in the transcript and shows the new one', async () => {
      seedBranchedConversation(ANSWER_ONE);
      captureRequests();

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('what is the capital of france', {
          conversationId: CONVERSATION.id,
          regenerateParentMessageId: USER_ONE,
          assistantMessageId: NEW_ASSISTANT,
        });
      });

      const rows = useChatStore.getState().messagesByConversation[CONVERSATION.id] ?? [];
      expect(rows.map((row) => row.id)).toContain(ANSWER_ONE);
      expect(useChatStore.getState().messages.map((row) => row.id)).toEqual([
        USER_ONE,
        NEW_ASSISTANT,
      ]);
    });

    /**
     * The error banner's Retry comes through this flow with a question that has
     * no answer yet. Converting that conversation to a tree would cost a row
     * lock on every later write for a sibling group of one.
     */
    it('leaves a conversation linear when the question has no answer to sit beside', async () => {
      useChatStore.setState({
        conversations: [CONVERSATION],
        activeConversationId: CONVERSATION.id,
      });
      useChatStore
        .getState()
        .setActiveConversationWithMessages(CONVERSATION.id, [
          message(USER_ONE, 'this one failed', { minute: 0 }),
        ]);
      const captured = captureRequests();

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('this one failed', {
          conversationId: CONVERSATION.id,
          regenerateParentMessageId: USER_ONE,
        });
      });

      const assistantWrite = messageWrites(captured).find((body) => body['role'] === 'assistant');
      expect(assistantWrite?.['parentId']).toBeUndefined();
      expect(useChatStore.getState().activeLeafByConversation[CONVERSATION.id] ?? null).toBeNull();
    });

    it('takes the placeholder back out and restores the path when nothing streams', async () => {
      seedBranchedConversation(ANSWER_ONE);
      vi.mocked(fetch).mockImplementation(async (input) => {
        if (String(input).includes('/api/llm/v1/chat/completions')) {
          return new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
            status: 429,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      });

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('what is the capital of france', {
          conversationId: CONVERSATION.id,
          regenerateParentMessageId: USER_ONE,
          assistantMessageId: NEW_ASSISTANT,
        });
      });

      const rows = useChatStore.getState().messagesByConversation[CONVERSATION.id] ?? [];
      expect(rows.map((row) => row.id)).not.toContain(NEW_ASSISTANT);
      expect(useChatStore.getState().activeLeafByConversation[CONVERSATION.id]).toBe(ANSWER_ONE);
      expect(useChatStore.getState().messages.map((row) => row.id)).toEqual([USER_ONE, ANSWER_ONE]);
    });
  });

  describe('edit as a sibling', () => {
    it('hangs the revision off the edited message and answers it in place', async () => {
      seedBranchedConversation(USER_TWO);
      const captured = captureRequests();

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('and its area', {
          conversationId: CONVERSATION.id,
          userMessageParentId: ANSWER_ONE,
        });
      });

      const writes = messageWrites(captured);
      const userWrite = writes.find((body) => body['role'] === 'user');
      expect(userWrite?.['parentId']).toBe(ANSWER_ONE);
      expect(useChatStore.getState().messages.map((row) => row.content)).toEqual([
        'what is the capital of france',
        'Paris.',
        'and its area',
        'Around 2.1 million.',
      ]);
    });

    it('keeps the original message and its reply in the tree', async () => {
      seedBranchedConversation(USER_TWO);
      captureRequests();

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('and its area', {
          conversationId: CONVERSATION.id,
          userMessageParentId: ANSWER_ONE,
        });
      });

      const rows = useChatStore.getState().messagesByConversation[CONVERSATION.id] ?? [];
      expect(rows.map((row) => row.id)).toContain(USER_TWO);
    });

    it('never puts the message it replaces into the prompt', async () => {
      seedBranchedConversation(USER_TWO);
      const captured = captureRequests();

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('and its area', {
          conversationId: CONVERSATION.id,
          userMessageParentId: ANSWER_ONE,
        });
      });

      expect(promptContents(captured)).toEqual([
        'what is the capital of france',
        'Paris.',
        'and its area',
      ]);
    });

    describe('editing the opening message', () => {
      function seedLinearConversation() {
        useChatStore.setState({
          conversations: [CONVERSATION],
          activeConversationId: CONVERSATION.id,
        });
        useChatStore
          .getState()
          .setActiveConversationWithMessages(CONVERSATION.id, [
            message(USER_ONE, 'what is the capital of france', { minute: 0 }),
            message(ANSWER_ONE, 'Paris.', { minute: 1, role: 'assistant' }),
            message(USER_TWO, 'and its population', { minute: 2 }),
            message(ANSWER_TWO, 'Around 2.1 million.', { minute: 3, role: 'assistant' }),
          ]);
      }

      /**
       * Null is the only way to say "root sibling"; omitting the field asks the
       * server to continue from the leaf, which would append the revision to the
       * end of the transcript instead of branching at the top.
       */
      it('asks for the root sibling group explicitly', async () => {
        seedLinearConversation();
        const captured = captureRequests();

        const { result } = renderHook(() => useChatStream());
        await act(async () => {
          await result.current.sendMessage('what is the capital of japan', {
            conversationId: CONVERSATION.id,
            userMessageParentId: null,
            userMessageId: NEW_ASSISTANT,
          });
        });

        const userWrite = messageWrites(captured).find((body) => body['role'] === 'user');
        expect(userWrite).toHaveProperty('parentId', null);
      });

      it('converts the conversation on the client the way the server does', async () => {
        seedLinearConversation();
        captureRequests();

        const { result } = renderHook(() => useChatStream());
        await act(async () => {
          await result.current.sendMessage('what is the capital of japan', {
            conversationId: CONVERSATION.id,
            userMessageParentId: null,
            userMessageId: NEW_ASSISTANT,
          });
        });

        const rows = useChatStore.getState().messagesByConversation[CONVERSATION.id] ?? [];
        const parents = Object.fromEntries(rows.map((row) => [row.id, row.parentId ?? null]));
        expect(parents[USER_ONE]).toBeNull();
        expect(parents[ANSWER_ONE]).toBe(USER_ONE);
        expect(parents[USER_TWO]).toBe(ANSWER_ONE);
        expect(parents[ANSWER_TWO]).toBe(USER_TWO);
        expect(parents[NEW_ASSISTANT]).toBeNull();
      });

      it('shows the revision and its own reply, and nothing from the original branch', async () => {
        seedLinearConversation();
        captureRequests();

        const { result } = renderHook(() => useChatStream());
        await act(async () => {
          await result.current.sendMessage('what is the capital of japan', {
            conversationId: CONVERSATION.id,
            userMessageParentId: null,
            userMessageId: NEW_ASSISTANT,
          });
        });

        expect(useChatStore.getState().messages.map((row) => row.content)).toEqual([
          'what is the capital of japan',
          'Around 2.1 million.',
        ]);
      });

      it('leaves the original opening turn and its whole tail in the tree', async () => {
        seedLinearConversation();
        captureRequests();

        const { result } = renderHook(() => useChatStream());
        await act(async () => {
          await result.current.sendMessage('what is the capital of japan', {
            conversationId: CONVERSATION.id,
            userMessageParentId: null,
            userMessageId: NEW_ASSISTANT,
          });
        });

        const rows = useChatStore.getState().messagesByConversation[CONVERSATION.id] ?? [];
        expect(rows.map((row) => row.id)).toEqual(
          expect.arrayContaining([USER_ONE, ANSWER_ONE, USER_TWO, ANSWER_TWO, NEW_ASSISTANT]),
        );
      });

      it('starts the prompt from the revision, not from the message it replaces', async () => {
        seedLinearConversation();
        const captured = captureRequests();

        const { result } = renderHook(() => useChatStream());
        await act(async () => {
          await result.current.sendMessage('what is the capital of japan', {
            conversationId: CONVERSATION.id,
            userMessageParentId: null,
            userMessageId: NEW_ASSISTANT,
          });
        });

        expect(promptContents(captured)).toEqual(['what is the capital of japan']);
      });
    });
  });

  describe('the continue path', () => {
    it('builds its context from the active path only', async () => {
      const rows = [
        ...branchedTranscript(),
        {
          ...message(NEW_ASSISTANT, 'The population is', {
            parentId: USER_TWO,
            minute: 4,
            role: 'assistant',
          }),
          metadata: { finishReason: 'length' },
        },
      ];
      useChatStore.setState({
        conversations: [CONVERSATION],
        activeConversationId: CONVERSATION.id,
      });
      useChatStore
        .getState()
        .setActiveConversationWithMessages(CONVERSATION.id, rows, NEW_ASSISTANT);
      const captured = captureRequests();

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.continueGeneration(NEW_ASSISTANT);
      });

      const contents = promptContents(captured);
      expect(contents).toContain('Paris.');
      expect(contents).not.toContain('PARIS, OBVIOUSLY.');
    });
  });

  describe('a conversation nobody has branched', () => {
    it('names no parent on either write, so the server keeps its fast path', async () => {
      useChatStore.setState({
        conversations: [CONVERSATION],
        activeConversationId: CONVERSATION.id,
      });
      useChatStore
        .getState()
        .setActiveConversationWithMessages(CONVERSATION.id, [
          message(USER_ONE, 'first', { minute: 0 }),
          message(ANSWER_ONE, 'reply', { minute: 1, role: 'assistant' }),
        ]);
      const captured = captureRequests();

      const { result } = renderHook(() => useChatStream());
      await act(async () => {
        await result.current.sendMessage('second', { conversationId: CONVERSATION.id });
      });

      expect(messageWrites(captured).every((body) => body['parentId'] === undefined)).toBe(true);
      expect(promptContents(captured)).toEqual(['first', 'reply', 'second']);
    });
  });
});
