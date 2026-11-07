import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyBulkConversationAction,
  fetchConversationHistoryStats,
  listArchivedConversations,
  listDeletedConversations,
  restoreDeletedConversation,
  deleteManagedConversation,
  listSharedLinks,
  revokeSharedLink,
  restoreArchivedConversation,
} from './conversation-data-service';
import { addCsrfHeaders } from '@/lib/client/csrf';
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

    const request = shareOwner().request;
    const result = await listSharedLinks(request);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/share',
      expect.objectContaining({ credentials: 'omit', signal: request.signal }),
    );
    expect(result.shares[0]?.title).toBe('Shared planning');
    expect(result.complete).toBe(true);
  });

  it.each([false, undefined])('treats complete=%s as an incomplete shared-link inventory', async (complete) => {
    const body = complete === undefined ? { shares: [] } : { shares: [], complete };
    const fetchMock = vi.fn(async () => response(body));
    vi.stubGlobal('fetch', fetchMock);
    const request = shareOwner().request;

    await expect(listSharedLinks(request)).resolves.toEqual({ shares: [], complete: false });
    expect(fetchMock).toHaveBeenCalledWith('/api/share', expect.objectContaining({
      credentials: 'omit',
      signal: request.signal,
    }));
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

function deferredShare<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function shareOwner() {
  let userId = 'account-a';
  let sessionId = 'session-a';
  const getToken = vi.fn(async (): Promise<string | null> => 'token-a');
  const request = createRequestAuthority({
    userId, sessionId, getToken,
    isCurrent: () => userId === 'account-a' && sessionId === 'session-a',
  });
  return {
    request, getToken,
    retire: (reason: 'account' | 'session' | 'explicit') => {
      if (reason === 'account') userId = 'account-b';
      else if (reason === 'session') sessionId = 'session-b';
      else request.retire();
    },
  };
}

const shareOperations = [
  { name: 'list', call: listSharedLinks, body: { shares: [], complete: true } },
  {
    name: 'revoke',
    call: (request: ReturnType<typeof createRequestAuthority>) => revokeSharedLink('share-token', request),
    body: { success: true },
  },
] as const;

const shareRetirements = ['account', 'session', 'explicit'] as const;

describe('shared-link session authority source fixtures (UNRUN)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(addCsrfHeaders).mockReset();
    vi.mocked(addCsrfHeaders).mockImplementation(async (headers = {}) => ({
      ...Object.fromEntries(new Headers(headers).entries()), 'x-csrf-token': 'csrf-token',
    }));
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected network call')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(addCsrfHeaders).mockReset();
    vi.mocked(addCsrfHeaders).mockImplementation(async (headers = {}) => ({
      ...Object.fromEntries(new Headers(headers).entries()), 'x-csrf-token': 'csrf-token',
    }));
  });

  it('uses captured bearer credentials for account-wide GET and encoded DELETE without workspace scope', async () => {
    const owner = shareOwner();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ shares: [], complete: true, workspace: { memberCount: 2 } }))
      .mockResolvedValueOnce(response({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listSharedLinks(owner.request)).resolves.toEqual({ shares: [], complete: true });
    expect(addCsrfHeaders).not.toHaveBeenCalled();
    await expect(revokeSharedLink('token/with ?#%', owner.request)).resolves.toBeUndefined();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/share');
    expect(fetchMock.mock.calls[0]?.[1]?.method ?? 'GET').toBe('GET');
    expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe('no-store');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/share/token%2Fwith%20%3F%23%25');
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('DELETE');
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.credentials).toBe('omit');
      expect(init?.signal).toBe(owner.request.signal);
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-a');
      expect(new Headers(init?.headers).has(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(false);
    }
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('x-csrf-token')).toBe('csrf-token');
    expect(owner.getToken).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(shareRetirements)('does not dispatch revoke after %s retirement during CSRF', async (reason) => {
    const owner = shareOwner();
    const csrf = deferredShare<Record<string, string>>();
    vi.mocked(addCsrfHeaders).mockReturnValueOnce(csrf.promise);
    const pending = revokeSharedLink('share-token', owner.request);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(addCsrfHeaders).toHaveBeenCalledTimes(1);
    owner.retire(reason);
    csrf.resolve({ 'x-csrf-token': 'late-csrf' });
    await rejected;
    expect(owner.getToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('prefers session retirement over a late CSRF rejection without dispatching', async () => {
    const owner = shareOwner();
    const csrf = deferredShare<HeadersInit>();
    vi.mocked(addCsrfHeaders).mockReturnValueOnce(csrf.promise);
    const pending = revokeSharedLink('share-token', owner.request);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    owner.retire('session');
    csrf.reject(new Error('Old session CSRF failed'));
    await rejected;
    expect(owner.getToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  describe.each(shareOperations)('$name', ({ call, body }) => {
    it('fails closed without an authority rather than using ambient cookies', async () => {
      await expect(call(undefined as unknown as Parameters<typeof listSharedLinks>[0])).rejects.toThrow();
      expect(addCsrfHeaders).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it.each(shareRetirements)('rejects a pre-retired %s authority before any boundary', async (reason) => {
      const owner = shareOwner();
      owner.retire(reason);
      await expect(call(owner.request)).rejects.toMatchObject({ name: 'AbortError' });
      expect(owner.getToken).not.toHaveBeenCalled();
      expect(addCsrfHeaders).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it.each(shareRetirements)('rejects %s retirement during captured token acquisition without rebinding', async (reason) => {
      const owner = shareOwner();
      const token = deferredShare<string>();
      const entered = deferredShare<void>();
      owner.getToken.mockImplementationOnce(() => { entered.resolve(); return token.promise; });
      const pending = call(owner.request);
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      await entered.promise;
      owner.retire(reason);
      token.resolve('token-a');
      await rejected;
      expect(owner.getToken).toHaveBeenCalledTimes(1);
      expect(fetch).not.toHaveBeenCalled();
    });

    it.each(shareRetirements)('rejects %s retirement while fetch is pending before reading its body', async (reason) => {
      const owner = shareOwner();
      const transport = deferredShare<Response>();
      const entered = deferredShare<void>();
      const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => {
        entered.resolve();
        return transport.promise;
      });
      const json = vi.fn(async () => body);
      vi.stubGlobal('fetch', fetchMock);
      const pending = call(owner.request);
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      await entered.promise;
      owner.retire(reason);
      transport.resolve({ ok: true, json } as unknown as Response);
      await rejected;
      expect(json).not.toHaveBeenCalled();
      expect(owner.request.signal.aborted).toBe(true);
      expect(owner.getToken).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    describe.each([true, false])('HTTP ok=%s', (ok) => {
      it.each(shareRetirements)('rejects %s retirement during body parsing instead of surfacing old account data', async (reason) => {
        const owner = shareOwner();
        const parsed = deferredShare<unknown>();
        const entered = deferredShare<void>();
        const json = vi.fn(() => { entered.resolve(); return parsed.promise; });
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok, json } as unknown as Response);
        vi.stubGlobal('fetch', fetchMock);
        const pending = call(owner.request);
        const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        await entered.promise;
        owner.retire(reason);
        parsed.resolve(ok ? body : { error: 'Old account failure' });
        await rejected;
        expect(owner.request.signal.aborted).toBe(true);
        expect(json).toHaveBeenCalledTimes(1);
        expect(owner.getToken).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
    });

    describe.each(['malformed', 'rejected'] as const)('late %s body', (outcome) => {
      it.each([true, false])('prefers retirement over stale body errors when HTTP ok=%s', async (ok) => {
        const owner = shareOwner();
        const parsed = deferredShare<unknown>();
        const entered = deferredShare<void>();
        const json = vi.fn(() => { entered.resolve(); return parsed.promise; });
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok, json } as unknown as Response);
        vi.stubGlobal('fetch', fetchMock);
        const pending = call(owner.request);
        const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        await entered.promise;
        owner.retire('session');
        if (outcome === 'rejected') parsed.reject(new SyntaxError('Old session JSON failed'));
        else parsed.resolve(null);
        await rejected;
        expect(json).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(owner.getToken).toHaveBeenCalledTimes(1);
      });
    });

    it.each([null, ''])('rejects missing token %s without a cookie fallback', async (token) => {
      const owner = shareOwner();
      owner.getToken.mockResolvedValueOnce(token);
      await expect(call(owner.request)).rejects.toThrow('Not authenticated');
      expect(owner.getToken).toHaveBeenCalledTimes(1);
      expect(fetch).not.toHaveBeenCalled();
    });

    it.each([401, 403, 404, 500])('surfaces HTTP %s failure once without retrying', async (status) => {
      const owner = shareOwner();
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
        ...response({ error: { message: 'Share operation denied' } }, false), status,
      } as Response);
      vi.stubGlobal('fetch', fetchMock);
      await expect(call(owner.request)).rejects.toThrow('Share operation denied');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(owner.getToken).toHaveBeenCalledTimes(1);
    });

    it('does not retry a rejected transport', async () => {
      const owner = shareOwner();
      const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('Network unavailable'));
      vi.stubGlobal('fetch', fetchMock);
      await expect(call(owner.request)).rejects.toThrow('Network unavailable');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(owner.getToken).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid JSON without retrying', async () => {
      const owner = shareOwner();
      const json = vi.fn().mockRejectedValue(new SyntaxError('Invalid JSON'));
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json } as unknown as Response);
      vi.stubGlobal('fetch', fetchMock);
      await expect(call(owner.request)).rejects.toThrow('Invalid JSON');
      expect(json).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it.each([{}, { success: false }, { success: 'true' }, null, { revoked: 1 }])(
    'rejects a noncanonical revoke receipt %j without retrying', async (body) => {
      const owner = shareOwner();
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(body));
      vi.stubGlobal('fetch', fetchMock);
      await expect(revokeSharedLink('share-token', owner.request)).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(owner.getToken).toHaveBeenCalledTimes(1);
    },
  );

  it.each([{ complete: true }, { shares: [], complete: 'true' }, { shares: [{}], complete: true }])(
    'rejects malformed inventory %j', async (body) => {
      const owner = shareOwner();
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(body));
      vi.stubGlobal('fetch', fetchMock);
      await expect(listSharedLinks(owner.request)).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});
