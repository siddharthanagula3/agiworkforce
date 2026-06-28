import { describe, it, expect, vi } from 'vitest';
import {
  createCloudChatPersistenceClient,
  mapRawConversation,
  type CloudChatHeaders,
} from '../cloud-chat-persistence-client';

/** Build a typed mock `fetch` returning a JSON body with the given status. */
function mockFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  const status = init.status ?? 200;
  return vi.fn(
    (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
      Promise.resolve({
        ok,
        status,
        json: async () => body,
      } as unknown as Response),
  );
}

type MockFetch = ReturnType<typeof mockFetch>;

/** Extract the URL + init of the nth recorded fetch call (asserting presence). */
function nthCall(fetchImpl: MockFetch, n = 0): { url: string; init: RequestInit } {
  const call = fetchImpl.mock.calls[n];
  expect(call).toBeDefined();
  const [input, init] = call as [RequestInfo | URL, RequestInit | undefined];
  return { url: String(input), init: init ?? {} };
}

const RAW_CONV = {
  id: 'conv_1',
  user_id: 'user_1',
  title: 'My chat',
  mode: 'mission',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  metadata: { messageCount: 3, agentsInvolved: ['a'], lastActivity: new Date(0) },
};

describe('mapRawConversation', () => {
  it('normalizes snake_case fields into the shared DTO', () => {
    const c = mapRawConversation(RAW_CONV);
    expect(c.id).toBe('conv_1');
    expect(c.userId).toBe('user_1');
    expect(c.title).toBe('My chat');
    expect(c.mode).toBe('mission');
    expect(c.createdAt).toBeInstanceOf(Date);
    expect(c.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(c.updatedAt.toISOString()).toBe('2026-01-02T00:00:00.000Z');
    expect(c.metadata.messageCount).toBe(3);
  });

  it('applies defaults for missing fields', () => {
    const c = mapRawConversation({ id: 'x' });
    expect(c.title).toBe('Untitled');
    expect(c.mode).toBe('chat');
    expect(c.createdAt).toBeInstanceOf(Date);
    expect(c.metadata).toEqual({
      messageCount: 0,
      agentsInvolved: [],
      lastActivity: expect.any(Date),
    });
  });
});

describe('createCloudChatPersistenceClient', () => {
  describe('createConversation', () => {
    it('POSTs to /api/chat/conversations with title+mode body and returns normalized DTO', async () => {
      const fetchImpl = mockFetch({ conversation: RAW_CONV });
      const client = createCloudChatPersistenceClient({ fetchImpl });

      const result = await client.createConversation({ title: 'My chat', mode: 'mission' });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const { url, init } = nthCall(fetchImpl);
      expect(url).toBe('/api/chat/conversations');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ title: 'My chat', mode: 'mission' });
      expect((init.headers as CloudChatHeaders)['Content-Type']).toBe('application/json');
      expect(result.id).toBe('conv_1');
      expect(result.userId).toBe('user_1');
    });
  });

  describe('getConversation', () => {
    it('GETs /api/chat/conversations/:id and returns conversation + raw messages', async () => {
      const messages = [{ id: 'm1', role: 'user', content: 'hi' }];
      const fetchImpl = mockFetch({ conversation: RAW_CONV, messages });
      const client = createCloudChatPersistenceClient({ fetchImpl });

      const result = await client.getConversation('conv_1');

      const { url, init } = nthCall(fetchImpl);
      expect(url).toBe('/api/chat/conversations/conv_1');
      expect(init.method).toBeUndefined();
      expect(result.conversation.id).toBe('conv_1');
      expect(result.messages).toEqual(messages);
    });

    it('defaults messages to [] when absent', async () => {
      const fetchImpl = mockFetch({ conversation: RAW_CONV });
      const client = createCloudChatPersistenceClient({ fetchImpl });
      const result = await client.getConversation('conv_1');
      expect(result.messages).toEqual([]);
    });
  });

  describe('updateConversationTitle', () => {
    it('PUTs the new title to /api/chat/conversations/:id', async () => {
      const fetchImpl = mockFetch({});
      const client = createCloudChatPersistenceClient({ fetchImpl });

      await client.updateConversationTitle('conv_1', 'New title');

      const { url, init } = nthCall(fetchImpl);
      expect(url).toBe('/api/chat/conversations/conv_1');
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body as string)).toEqual({ title: 'New title' });
      expect((init.headers as CloudChatHeaders)['Content-Type']).toBe('application/json');
    });
  });

  describe('deleteConversation', () => {
    it('DELETEs /api/chat/conversations/:id with no Content-Type', async () => {
      const fetchImpl = mockFetch({});
      const client = createCloudChatPersistenceClient({ fetchImpl });

      await client.deleteConversation('conv_1');

      const { url, init } = nthCall(fetchImpl);
      expect(url).toBe('/api/chat/conversations/conv_1');
      expect(init.method).toBe('DELETE');
      expect(init.body).toBeUndefined();
      expect((init.headers as CloudChatHeaders)['Content-Type']).toBeUndefined();
    });
  });

  describe('listConversations', () => {
    it('GETs /api/chat/conversations and maps each conversation', async () => {
      const fetchImpl = mockFetch({ conversations: [RAW_CONV, { id: 'conv_2' }] });
      const client = createCloudChatPersistenceClient({ fetchImpl });

      const result = await client.listConversations();

      const { url, init } = nthCall(fetchImpl);
      expect(url).toBe('/api/chat/conversations');
      expect(init.method).toBeUndefined();
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('conv_1');
      expect(result[1]?.title).toBe('Untitled');
    });

    it('defaults to [] when conversations field is absent', async () => {
      const fetchImpl = mockFetch({});
      const client = createCloudChatPersistenceClient({ fetchImpl });
      expect(await client.listConversations()).toEqual([]);
    });
  });

  describe('baseUrl prefixing', () => {
    it('uses relative paths when baseUrl is "" (default, web)', async () => {
      const fetchImpl = mockFetch({ conversations: [] });
      const client = createCloudChatPersistenceClient({ baseUrl: '', fetchImpl });
      await client.listConversations();
      expect(nthCall(fetchImpl).url).toBe('/api/chat/conversations');
    });

    it('prefixes an absolute base URL (desktop)', async () => {
      const fetchImpl = mockFetch({ conversation: RAW_CONV });
      const client = createCloudChatPersistenceClient({
        baseUrl: 'https://agiworkforce.com',
        fetchImpl,
      });
      await client.getConversation('conv_1');
      expect(nthCall(fetchImpl).url).toBe('https://agiworkforce.com/api/chat/conversations/conv_1');
    });

    it('strips a single trailing slash from baseUrl', async () => {
      const fetchImpl = mockFetch({ conversation: RAW_CONV });
      const client = createCloudChatPersistenceClient({
        baseUrl: 'https://agiworkforce.com/',
        fetchImpl,
      });
      await client.createConversation({ title: 't', mode: 'chat' });
      expect(nthCall(fetchImpl).url).toBe('https://agiworkforce.com/api/chat/conversations');
    });
  });

  describe('auth header injection', () => {
    it('adds Authorization Bearer header when getAuthToken returns a token', async () => {
      const fetchImpl = mockFetch({ conversations: [] });
      const client = createCloudChatPersistenceClient({
        fetchImpl,
        getAuthToken: async () => 'tok_123',
      });
      await client.listConversations();
      const headers = nthCall(fetchImpl).init.headers as CloudChatHeaders;
      expect(headers['Authorization']).toBe('Bearer tok_123');
    });

    it('omits Authorization header when getAuthToken returns null', async () => {
      const fetchImpl = mockFetch({ conversations: [] });
      const client = createCloudChatPersistenceClient({
        fetchImpl,
        getAuthToken: async () => null,
      });
      await client.listConversations();
      const headers = nthCall(fetchImpl).init.headers as CloudChatHeaders;
      expect(headers['Authorization']).toBeUndefined();
    });

    it('injects auth on mutating requests too', async () => {
      const fetchImpl = mockFetch({ conversation: RAW_CONV });
      const client = createCloudChatPersistenceClient({
        fetchImpl,
        getAuthToken: async () => 'tok_xyz',
      });
      await client.createConversation({ title: 't', mode: 'chat' });
      const headers = nthCall(fetchImpl).init.headers as CloudChatHeaders;
      expect(headers['Authorization']).toBe('Bearer tok_xyz');
    });
  });

  describe('decorateHeaders', () => {
    it('applies decorateHeaders to mutating requests (POST/PUT/DELETE)', async () => {
      const decorateHeaders = vi.fn(async (h: CloudChatHeaders) => ({
        ...h,
        'X-CSRF-Token': 'csrf_1',
      }));
      const fetchImpl = mockFetch({ conversation: RAW_CONV });
      const client = createCloudChatPersistenceClient({ fetchImpl, decorateHeaders });

      await client.createConversation({ title: 't', mode: 'chat' });

      expect(decorateHeaders).toHaveBeenCalledTimes(1);
      const headers = nthCall(fetchImpl).init.headers as CloudChatHeaders;
      expect(headers['X-CSRF-Token']).toBe('csrf_1');
    });

    it('applies decorateHeaders to DELETE', async () => {
      const decorateHeaders = vi.fn((h: CloudChatHeaders) => ({ ...h, 'X-CSRF-Token': 'csrf_d' }));
      const fetchImpl = mockFetch({});
      const client = createCloudChatPersistenceClient({ fetchImpl, decorateHeaders });

      await client.deleteConversation('conv_1');

      expect(decorateHeaders).toHaveBeenCalledTimes(1);
      const headers = nthCall(fetchImpl).init.headers as CloudChatHeaders;
      expect(headers['X-CSRF-Token']).toBe('csrf_d');
    });

    it('does NOT apply decorateHeaders to read requests (GET)', async () => {
      const decorateHeaders = vi.fn((h: CloudChatHeaders) => h);
      const fetchImpl = mockFetch({ conversations: [] });
      const client = createCloudChatPersistenceClient({ fetchImpl, decorateHeaders });

      await client.listConversations();

      expect(decorateHeaders).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('throws the server error field on non-ok responses', async () => {
      const fetchImpl = mockFetch({ error: 'Not allowed' }, { ok: false, status: 403 });
      const client = createCloudChatPersistenceClient({ fetchImpl });
      await expect(client.createConversation({ title: 't', mode: 'chat' })).rejects.toThrow(
        'Not allowed',
      );
    });

    it('throws HTTP <status> when the error body has no error field', async () => {
      const fetchImpl = mockFetch({}, { ok: false, status: 500 });
      const client = createCloudChatPersistenceClient({ fetchImpl });
      await expect(client.getConversation('conv_1')).rejects.toThrow('HTTP 500');
    });

    it('throws on non-ok for listConversations (surface adapter decides fallback)', async () => {
      const fetchImpl = mockFetch({ error: 'boom' }, { ok: false, status: 502 });
      const client = createCloudChatPersistenceClient({ fetchImpl });
      await expect(client.listConversations()).rejects.toThrow('boom');
    });

    it('throws on non-ok for updateConversationTitle and deleteConversation', async () => {
      const failFetch = mockFetch({ error: 'denied' }, { ok: false, status: 401 });
      const client = createCloudChatPersistenceClient({ fetchImpl: failFetch });
      await expect(client.updateConversationTitle('id', 't')).rejects.toThrow('denied');
      await expect(client.deleteConversation('id')).rejects.toThrow('denied');
    });
  });
});
