import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyBulkConversationAction,
  listArchivedConversations,
  listSharedLinks,
  restoreArchivedConversation,
} from './conversation-data-service';

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

  it('validates the account-owned shared-link index', async () => {
    const fetchMock = vi.fn(async () =>
      response({
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

    const shares = await listSharedLinks();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/share',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(shares[0]?.title).toBe('Shared planning');
  });
});
