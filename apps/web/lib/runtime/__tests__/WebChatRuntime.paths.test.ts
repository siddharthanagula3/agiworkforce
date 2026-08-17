import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@shared/stores/web-chat-store';

/**
 * `WebChatRuntime` retyped `/api/chat/conversations` at five call sites, so a
 * conversations-route move would have silently split the runtime from the rest
 * of the managed-cloud clients. Relocating the contract is the only way to tell
 * a real reference from a value-equal literal: a literal keeps the old URL.
 */
const RELOCATED = '/api/relocated-conversations';

vi.mock('@agiworkforce/cloud-contracts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/cloud-contracts')>();
  const conversationPath = (id: string) => `${RELOCATED}/${encodeURIComponent(id)}`;
  return {
    ...actual,
    MANAGED_CLOUD_CHAT_BASE_PATH: RELOCATED,
    managedCloudConversationPath: conversationPath,
    managedCloudConversationMessagesPath: (id: string) => `${conversationPath(id)}/messages`,
  };
});

// Hermetic auth + csrf so the runtime can build a request without network/env.
vi.mock('@shared/lib/get-auth-token', () => ({
  getAuthToken: vi.fn(async () => 'test-token'),
}));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: (h: HeadersInit) => h,
}));

const { WebChatRuntime } = await import('../WebChatRuntime');

const STUB_CONVERSATION = {
  id: 'conversation-1',
  title: 'Renamed',
  model: null,
  project_id: null,
  pinned: false,
  starred: false,
  archived: false,
  is_temporary: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    // Shaped to satisfy both list ({ conversations }) and single-conversation
    // ({ conversation }) response schemas -- renameConversation now parses
    // the PUT response body (it syncs the local store from it), where it used
    // to only check `res.ok`.
    json: async () => ({
      conversations: [],
      conversation: STUB_CONVERSATION,
      messages: [],
      id: 'conversation-1',
    }),
  }));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  return fetchMock;
}

describe('WebChatRuntime canonical path ownership', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let runtime: InstanceType<typeof WebChatRuntime>;

  beforeEach(() => {
    fetchMock = stubFetch();
    runtime = new WebChatRuntime();
  });

  it('reads and writes conversations through the cloud contract, never a retyped literal', async () => {
    await runtime.loadConversations();
    await runtime.createConversation('Untitled');
    await runtime.getMessages('conversation/1');
    await runtime.renameConversation('conversation/1', 'Renamed');
    await runtime.deleteConversation('conversation/1');

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      RELOCATED,
      RELOCATED,
      `${RELOCATED}/conversation%2F1/messages`,
      `${RELOCATED}/conversation%2F1`,
      `${RELOCATED}/conversation%2F1`,
    ]);
  });
});

/**
 * agentic-modes-gap-06: `renameConversation` had ZERO callers before this
 * change. `sendMessage` is now the first one -- for the first message of a
 * new conversation, it polls for the title the messages route generates
 * asynchronously and, once that title differs from what it saw at turn-start,
 * commits it through `renameConversation` so the sidebar picks it up without
 * a reload. This exercises that whole path end to end against a real
 * `sendMessage` call, rather than calling `renameConversation` directly (the
 * first test above already covers that method's own contract).
 */
describe('WebChatRuntime auto-title sync (first message of a new conversation)', () => {
  const CONVERSATION_ID = 'convo-title-sync';
  const CONVERSATION_URL = `${RELOCATED}/${CONVERSATION_ID}`;

  beforeEach(() => {
    vi.useFakeTimers();
    // Seed the store with the placeholder title a freshly created conversation
    // starts with, so a successful rename is observable as a real row change.
    useChatStore.setState({
      conversations: [
        {
          id: CONVERSATION_ID,
          title: 'New Chat',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls the generated title and renames the conversation once it changes', async () => {
    const encoder = new TextEncoder();
    let sseSent = false;
    let getCalls = 0;
    // First GET (the pre-loop baseline) sees the still-truncated stage-1
    // title; the next GET (after the runtime's first poll delay) sees the
    // title the messages route's background generation has since written --
    // simulating generation winning the race after the turn already ended.
    const titleSequence = ['first message trunc…', 'A Generated Title'];

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/llm/v1/chat/completions' && method === 'POST') {
        return {
          ok: true,
          body: {
            getReader: () => ({
              read: async () => {
                if (sseSent) return { done: true, value: undefined };
                sseSent = true;
                return { done: false, value: encoder.encode('data: [DONE]\n\n') };
              },
            }),
          },
        };
      }
      if (url === `${CONVERSATION_URL}/messages` && method === 'GET') {
        // getMessages(): empty history marks this as the conversation's first message.
        return { ok: true, status: 200, json: async () => ({ messages: [] }) };
      }
      if (url === `${CONVERSATION_URL}?limit=1` && method === 'GET') {
        const title = titleSequence[Math.min(getCalls, titleSequence.length - 1)];
        getCalls += 1;
        return { ok: true, status: 200, json: async () => ({ conversation: { title } }) };
      }
      if (url === CONVERSATION_URL && method === 'PUT') {
        const body = JSON.parse(String(init?.body)) as { title: string };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            conversation: { ...STUB_CONVERSATION, id: CONVERSATION_ID, title: body.title },
          }),
        };
      }
      throw new Error(`unexpected fetch in test: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const runtime = new WebChatRuntime();
    await runtime.sendMessage(CONVERSATION_ID, 'first message');

    // sendMessage's finally block fires syncGeneratedTitle without awaiting
    // it; drive its internal sleeps forward and let each round of fetch
    // promises settle in between.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1200);
    await vi.advanceTimersByTimeAsync(3000);

    const puts = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
    );
    expect(puts).toHaveLength(1);
    expect(JSON.parse(String((puts[0]?.[1] as RequestInit).body))).toMatchObject({
      title: 'A Generated Title',
    });

    // The whole point of giving renameConversation a caller here: the local
    // store -- what the sidebar actually renders -- reflects the generated
    // title without any reload or separate fetch.
    expect(useChatStore.getState().conversations.find((c) => c.id === CONVERSATION_ID)?.title).toBe(
      'A Generated Title',
    );
  });
});
