import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ conversations: [], messages: [], id: 'conversation-1' }),
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
