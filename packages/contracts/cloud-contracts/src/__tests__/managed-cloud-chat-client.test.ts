import { describe, expect, it, vi } from 'vitest';
import { createManagedCloudChatClient } from '../managed-cloud-chat-client';
import {
  MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '../conversations';

const rawConversation = {
  id: '0190a000-0000-7000-8000-0000000000aa',
  title: 'Cloud chat',
  model: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
  project_id: null,
  pinned: false,
  starred: false,
  archived: false,
  is_temporary: false,
  created_at: '2026-07-14T00:00:00.000Z',
  updated_at: '2026-07-14T00:01:00.000Z',
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

describe('createManagedCloudChatClient', () => {
  it('uses one encoded transport path and runtime-validates list responses', async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        conversations: [rawConversation],
        hasMore: false,
        nextOffset: 1,
        historyStats: { conversationCount: 195, messageCount: 842 },
      }),
    );
    const client = createManagedCloudChatClient({ fetchImpl });

    const page = await client.listConversations({
      limit: 50,
      offset: 0,
      includeHistoryStats: true,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/chat/conversations?limit=50&offset=0&includeHistoryStats=1',
      {
        headers: {},
      },
    );
    expect(page.conversations[0]).toMatchObject({
      id: rawConversation.id,
      projectId: null,
      createdAt: rawConversation.created_at,
    });
    expect(page.historyStats).toEqual({ conversationCount: 195, messageCount: 842 });
  });

  it('carries the archived filter so surfaces do not hand-roll the query string', async () => {
    const fetchImpl = vi.fn(async () =>
      response({ conversations: [], hasMore: false, nextOffset: 0 }),
    );
    const client = createManagedCloudChatClient({ fetchImpl });

    await client.listConversations({ limit: 100, offset: 0, archived: 'exclude' });

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/chat/conversations?limit=100&offset=0&archived=exclude',
      { headers: {} },
    );
  });

  it('fails closed when a successful HTTP response violates the contract', async () => {
    const fetchImpl = vi.fn(async () =>
      response({ conversations: [{ ...rawConversation, created_at: 123 }] }),
    );
    const client = createManagedCloudChatClient({ fetchImpl });

    await expect(client.listConversations()).rejects.toThrow(/contract/i);
  });

  it('shares create/read/update/delete/message mechanics with auth and mutation decoration', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ conversation: rawConversation }, 201))
      .mockResolvedValueOnce(
        response({ conversation: rawConversation, messages: [], total: 0, hasMore: false }),
      )
      .mockResolvedValueOnce(response({ conversation: { ...rawConversation, title: 'Renamed' } }))
      .mockResolvedValueOnce(
        response({
          message: {
            id: '0190a000-0000-7000-8000-0000000000bb',
            role: 'user',
            content: 'Hello',
            model: null,
            provider: null,
            input_tokens: 0,
            output_tokens: 0,
            created_at: rawConversation.created_at,
            metadata: {},
          },
        }),
      )
      .mockResolvedValueOnce(response({ success: true }));
    const client = createManagedCloudChatClient({
      baseUrl: 'https://cloud.example/',
      fetchImpl,
      getAuthToken: async () => 'token',
      decorateMutationHeaders: async (headers) => ({ ...headers, 'x-csrf-token': 'csrf' }),
    });

    await client.createConversation({ title: 'Cloud chat' });
    await client.getConversation(rawConversation.id);
    await client.updateConversation(rawConversation.id, { title: 'Renamed' });
    await client.saveMessage(
      rawConversation.id,
      { role: 'user', content: 'Hello' },
      {
        retryDelayMs: 0,
      },
    );
    await client.deleteConversation(rawConversation.id);

    const calls = fetchImpl.mock.calls as Array<[string, RequestInit]>;
    expect(calls.map(([url]) => url)).toEqual([
      'https://cloud.example/api/chat/conversations',
      `https://cloud.example/api/chat/conversations/${rawConversation.id}`,
      `https://cloud.example/api/chat/conversations/${rawConversation.id}`,
      `https://cloud.example/api/chat/conversations/${rawConversation.id}/messages`,
      `https://cloud.example/api/chat/conversations/${rawConversation.id}`,
    ]);
    expect(calls[0]?.[1].headers).toMatchObject({
      Authorization: 'Bearer token',
      'x-csrf-token': 'csrf',
    });
    expect(calls[1]?.[1].headers).toEqual({ Authorization: 'Bearer token' });
  });

  it('retries a rate-limited message write until its attempts are spent', async () => {
    const fetchImpl = vi.fn(async () => response({ error: 'rate limited' }, 429));
    const client = createManagedCloudChatClient({ fetchImpl });

    await expect(
      client.saveMessage(
        'conversation-1',
        { role: 'user', content: 'Hello' },
        {
          maxAttempts: 3,
          retryDelayMs: 0,
        },
      ),
    ).rejects.toThrow('rate limited');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('carries an explicit organization or Personal scope on reads and mutations', async () => {
    const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response({ conversation: rawConversation, messages: [], total: 0, hasMore: false }),
      )
      .mockResolvedValueOnce(response({ success: true }));
    const client = createManagedCloudChatClient({ fetchImpl });

    await client.getConversation(rawConversation.id, {}, { organizationId });
    await client.deleteConversation(rawConversation.id, { organizationId: null });

    const calls = fetchImpl.mock.calls as Array<[string, RequestInit]>;
    expect(calls[0]?.[1].headers).toMatchObject({
      [MANAGED_CLOUD_ORGANIZATION_HEADER]: organizationId,
    });
    expect(calls[1]?.[1].headers).toMatchObject({
      [MANAGED_CLOUD_ORGANIZATION_HEADER]: MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
    });
  });

  it('propagates one caller signal through persistence request methods', async () => {
    const controller = new AbortController();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ conversations: [], hasMore: false, nextOffset: 0 }))
      .mockResolvedValueOnce(response({ conversation: rawConversation }, 201))
      .mockResolvedValueOnce(
        response({ conversation: rawConversation, messages: [], total: 0, hasMore: false }),
      )
      .mockResolvedValueOnce(response({ conversation: rawConversation }))
      .mockResolvedValueOnce(response({ message: { id: '0190a000-0000-7000-8000-0000000000bb' } }));
    const client = createManagedCloudChatClient({ fetchImpl });

    await client.listConversations({}, { signal: controller.signal });
    await client.createConversation({ title: 'Cloud chat' }, { signal: controller.signal });
    await client.getConversation(rawConversation.id, {}, { signal: controller.signal });
    await client.updateConversation(
      rawConversation.id,
      { title: 'Renamed' },
      { signal: controller.signal },
    );
    await client.saveMessage(
      rawConversation.id,
      { id: '0190a000-0000-7000-8000-0000000000bb', content: 'Hello' },
      { signal: controller.signal },
    );

    for (const [, init] of fetchImpl.mock.calls as Array<[string, RequestInit]>) {
      expect(init.signal).toBe(controller.signal);
    }
  });

  it('does not begin a persistence fetch for an already-aborted request', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    const client = createManagedCloudChatClient({ fetchImpl });

    await expect(client.listConversations({}, { signal: controller.signal })).rejects.toMatchObject(
      { name: 'AbortError' },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('stops waiting for half-open auth preflight before persistence fetch', async () => {
    const controller = new AbortController();
    const getAuthToken = vi.fn(() => new Promise<string | null>(() => {}));
    const fetchImpl = vi.fn();
    const client = createManagedCloudChatClient({ fetchImpl, getAuthToken });

    const pending = client.listConversations({}, { signal: controller.signal });
    await vi.waitFor(() => expect(getAuthToken).toHaveBeenCalledOnce());
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('passes cancellation into a half-open persistence fetch', async () => {
    const controller = new AbortController();
    let transportSignal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          transportSignal = init?.signal;
          init?.signal?.addEventListener(
            'abort',
            () => {
              const error = new Error('stopped');
              error.name = 'AbortError';
              reject(error);
            },
            { once: true },
          );
        }),
    );
    const client = createManagedCloudChatClient({ fetchImpl });

    const pending = client.listConversations({}, { signal: controller.signal });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(transportSignal).toBe(controller.signal);
  });

  it('aborts message retry backoff without issuing another write', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => {
      controller.abort();
      return response({ error: 'temporarily unavailable' }, 503);
    });
    const client = createManagedCloudChatClient({ fetchImpl });

    await expect(
      client.saveMessage(
        rawConversation.id,
        { content: 'Hello' },
        { maxAttempts: 3, retryDelayMs: 10_000, signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
