import { describe, expect, it, vi } from 'vitest';
import { createManagedCloudChatClient } from '../managed-cloud-chat-client';

const rawConversation = {
  id: '0190a000-0000-7000-8000-0000000000aa',
  title: 'Cloud chat',
  model: 'auto',
  project_id: null,
  pinned: false,
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
      response({ conversations: [rawConversation], hasMore: false, nextOffset: 1 }),
    );
    const client = createManagedCloudChatClient({ fetchImpl });

    const page = await client.listConversations({ limit: 50, offset: 0 });

    expect(fetchImpl).toHaveBeenCalledWith('/api/chat/conversations?limit=50&offset=0', {
      headers: {},
    });
    expect(page.conversations[0]).toMatchObject({
      id: rawConversation.id,
      projectId: null,
      createdAt: rawConversation.created_at,
    });
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
            cost_cents: 0,
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

  it('does not retry a rate-limited message write', async () => {
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
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
