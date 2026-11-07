import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyBulkConversationAction,
  fetchConversationHistoryStats,
  listArchivedConversations,
  listDeletedConversations,
  restoreDeletedConversation,
  deleteManagedConversation,
  listSharedLinks,
  restoreArchivedConversation,
} from './conversation-data-service';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string> = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  })),
}));

function response(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe('conversation data settings service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads only archived conversations and normalizes the managed-cloud wire shape', async () => {
    const fetchMock = vi.fn(async () =>
      response({
        conversations: [
          {
            id: 'conversation-1',
            title: 'Archived planning',
            model: 'auto',
            project_id: null,
            pinned: false,
            starred: false,
            archived: true,
            is_temporary: false,
            created_at: '2026-07-01T00:00:00.000Z',
            updated_at: '2026-07-02T00:00:00.000Z',
          },
        ],
        hasMore: false,
        nextOffset: 1,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const page = await listArchivedConversations();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/conversations?archived=only&limit=50&offset=0',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(page.conversations).toEqual([
      {
        id: 'conversation-1',
        title: 'Archived planning',
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
    ]);
  });

  it('sends CSRF-protected restore and atomic bulk mutations', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          conversation: {
            id: 'conversation-1',
            title: 'Restored',
            model: 'auto',
            project_id: null,
            pinned: false,
            starred: false,
            archived: false,
            is_temporary: false,
            created_at: '2026-07-01T00:00:00.000Z',
            updated_at: '2026-07-03T00:00:00.000Z',
          },
        }),
      )
      .mockResolvedValueOnce(response({ success: true, action: 'archive_all', affectedCount: 4 }));
    vi.stubGlobal('fetch', fetchMock);

    await restoreArchivedConversation('conversation-1');
    const affected = await applyBulkConversationAction('archive_all');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/chat/conversations/conversation-1',
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        body: JSON.stringify({ archived: false }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/chat/conversations/bulk',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'archive_all' }),
      }),
    );
    expect(affected).toBe(4);
  });

  it('validates the complete account-owned shared-link index', async () => {
    const fetchMock = vi.fn(async () =>
      response({
        complete: true,
        shares: [
          {
            token: 'share-token',
            title: 'Shared planning',
            shareUrl: 'https://agiworkforce.com/share/share-token',
            modelId: null,
            provider: null,
            messageCount: 3,
            createdAt: '2026-07-01T00:00:00.000Z',
            expiresAt: '2026-08-01T00:00:00.000Z',
            expired: false,
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await listSharedLinks();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/share',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(result.shares[0]?.title).toBe('Shared planning');
    expect(result.complete).toBe(true);
  });

  it.each([false, undefined])('treats complete=%s as an incomplete shared-link inventory', async (complete) => {
    const body = complete === undefined ? { shares: [] } : { shares: [], complete };
    const fetchMock = vi.fn(async () => response(body));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(listSharedLinks(controller.signal)).resolves.toEqual({ shares: [], complete: false });
    expect(fetchMock).toHaveBeenCalledWith('/api/share', {
      credentials: 'include',
      signal: controller.signal,
    });
  });

  it('keeps an explicit original organization on the count and mutation after CSRF', async () => {
    const request = createRequestAuthority({ userId: 'a', sessionId: 'session-a',
      isCurrent: () => true, getToken: async () => 'token-a' });
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ historyStats: {
      conversationCount: 8, activeConversationCount: 6, messageCount: 40,
    } })).mockResolvedValueOnce(response({ success: true, action: 'delete_all', affectedCount: 8 }));
    vi.stubGlobal('fetch', fetchMock);
    const scope = { request, organizationId: '11111111-1111-4111-8111-111111111111' };
    expect((await fetchConversationHistoryStats(undefined, scope)).conversationCount).toBe(8);
    expect(await applyBulkConversationAction('delete_all', scope)).toBe(8);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.credentials).toBe('omit');
      expect(new Headers(init.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(scope.organizationId);
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-a');
    }
    expect(new Headers(fetchMock.mock.calls[1]![1].headers).get('x-csrf-token')).toBe('csrf-token');
    request.retire();
  });

  it.each(['delete_all', 'delete_archived'] as const)('rejects an archive receipt for %s', async (action) => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ success: true, action: 'archive_all', affectedCount: 3 })));
    await expect(applyBulkConversationAction(action)).rejects.toThrow('not confirmed');
  });
});

const restoredConversation = {
  id: 'restore-id', title: 'Restored', model: 'auto', project_id: null,
  pinned: true, starred: false, archived: false, is_temporary: false,
  created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-02T00:00:00.000Z',
};

describe('owned manager receipts', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it.each([
    { ...restoredConversation, id: 'different-id' },
    { ...restoredConversation, archived: true },
  ])('rejects an unarchive receipt that does not acknowledge the requested transition', async (conversation) => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ conversation })));
    await expect(restoreArchivedConversation('restore-id')).rejects.toThrow('not confirmed');
  });

  it('preserves archived and pinned fields when restoring deleted chats', async () => {
    const conversation = { ...restoredConversation, archived: true };
    vi.stubGlobal('fetch', vi.fn(async () => response({ conversation })));
    expect(await restoreDeletedConversation('restore-id')).toMatchObject({ id: 'restore-id', archived: true, pinned: true });
    await expect(restoreDeletedConversation('different-id')).rejects.toThrow('not confirmed');
  });

  it('retires a receipt while its response body is pending', async () => {
    let resolve!: (value: unknown) => void;
    const body = new Promise((done) => { resolve = done; });
    let entered!: () => void;
    const parsing = new Promise<void>((done) => { entered = done; });
    const request = createRequestAuthority({ userId: 'a', sessionId: 'a', isCurrent: () => true, getToken: async () => 'token' });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: () => { entered(); return body; } } as Response)));
    const pending = restoreDeletedConversation('restore-id', { request, organizationId: null });
    const rejected = expect(pending).rejects.toThrow();
    await parsing;
    request.retire();
    resolve({ conversation: restoredConversation });
    await rejected;
  });

  it('sends the captured personal header and bearer token for lists and individual writes', async () => {
    const request = createRequestAuthority({ userId: 'a', sessionId: 'a', isCurrent: () => true, getToken: async () => 'token' });
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ conversations: [], hasMore: false, nextOffset: 0 }))
      .mockResolvedValueOnce(response({ conversation: restoredConversation })).mockResolvedValueOnce(response({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    const scope = { request, organizationId: null };
    await listDeletedConversations(0, undefined, scope);
    await restoreDeletedConversation('restore-id', scope);
    await deleteManagedConversation('restore-id', scope);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.credentials).toBe('omit');
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token');
      expect(new Headers(init.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe('personal');
    }
    request.retire();
  });
});
