/**
 * DCL-3 — Cloud chat persistence egress CONTRACT test.
 *
 * Ties the REAL shared persistence client (`@agiworkforce/cloud-contracts`) to the
 * REAL desktop egress guard (`guardedFetch`) and proves the trust boundary on
 * every path desktop Cloud mode will use (`<WEB_APP_URL>/api/chat/conversations*`,
 * including the per-message `.../:id/messages` save route added to the shared
 * client to mirror `useChatStream.ts`'s `saveMessageToDb()`):
 *
 *   (a) LOCAL  mode  → every cloud persistence call is BLOCKED (no non-local egress).
 *   (b) BYOK   mode  → every cloud persistence call is BLOCKED.
 *   (c) MANAGED mode → calls are ALLOWED and reach ONLY the allowed cloud host.
 *
 * This is a contract, not a wiring test: it does not import the desktop seam, it
 * exercises the client+guard composition end to end so a denylist gap, a base-URL
 * regression, or a guard bypass re-trips here.
 *
 * Mocks `appModeStore` to drive `privacyMode` deterministically (same pattern as
 * `egressGuard.test.ts`), since the guard branches on `selectPrivacyMode`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getStateMock } = vi.hoisted(() => ({ getStateMock: vi.fn() }));
vi.mock('../../stores/appModeStore', () => ({
  useAppModeStore: { getState: getStateMock },
  selectPrivacyMode: (state: { privacyMode: unknown }) => state.privacyMode,
}));

import { createManagedCloudChatClient } from '@agiworkforce/cloud-contracts';
import { guardedFetch } from '../../lib/egressGuard';
import { WEB_APP_URL } from '../../api/config';

const CLOUD_HOST = 'agiworkforce.com';

let fetchSpy: ReturnType<typeof vi.fn>;

/** The URL string passed to `fetch` on call `n` (guards strict index access). */
function fetchUrlAt(n: number): string {
  const call = fetchSpy.mock.calls.at(n);
  if (!call) throw new Error(`fetch was not called ${n + 1} time(s)`);
  return call[0] as string;
}

function makeClient() {
  return createManagedCloudChatClient({
    baseUrl: WEB_APP_URL,
    getAuthToken: async () => 'desktop-clerk-token',
    fetchImpl: guardedFetch,
  });
}

beforeEach(() => {
  getStateMock.mockReset();
  // Return a FRESH Response per call — a Response body can only be read once, so
  // a single shared instance would throw "Body is unusable" across verbs.
  fetchSpy = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
    const path = new URL(input).pathname;
    const conversation = {
      id: 'c1',
      title: 'Cloud chat',
      model: 'auto',
      project_id: null,
      pinned: false,
      starred: false,
      archived: false,
      is_temporary: false,
      created_at: '2026-07-14T00:00:00.000Z',
      updated_at: '2026-07-14T00:00:00.000Z',
    };
    let body: unknown;
    if (init?.method === 'DELETE') body = { success: true };
    else if (path.endsWith('/messages')) {
      body = {
        message: {
          id: 'm1',
          role: 'user',
          content: 'hi',
          model: null,
          provider: null,
          input_tokens: 0,
          output_tokens: 0,
          created_at: conversation.created_at,
          metadata: {},
        },
      };
    } else if (init?.method === 'POST' || init?.method === 'PUT') body = { conversation };
    else body = { conversations: [], hasMore: false, nextOffset: 0 };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(['local', 'byok'] as const)(
  'cloud persistence is BLOCKED in %s mode (no non-local egress)',
  (mode) => {
    beforeEach(() => {
      getStateMock.mockReturnValue({ privacyMode: mode });
    });

    it('createConversation (POST) is blocked before any network call', async () => {
      const client = makeClient();
      await expect(client.createConversation({ title: 'x' })).rejects.toThrow(
        /blocked our-cloud egress/,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('listConversations (GET) is blocked before any network call', async () => {
      const client = makeClient();
      await expect(client.listConversations()).rejects.toThrow(/blocked our-cloud egress/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('deleteConversation (DELETE) is blocked before any network call', async () => {
      const client = makeClient();
      await expect(client.deleteConversation('c1')).rejects.toThrow(/blocked our-cloud egress/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('saveMessage (POST .../messages) is blocked before any network call', async () => {
      const client = makeClient();
      await expect(client.saveMessage('c1', { role: 'user', content: 'hi' })).rejects.toThrow(
        /blocked our-cloud egress/,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  },
);

describe('cloud persistence is ALLOWED in managed mode and reaches only the allowed host', () => {
  beforeEach(() => {
    getStateMock.mockReturnValue({ privacyMode: 'managed' });
  });

  it('createConversation reaches exactly the cloud host /api/chat/conversations', async () => {
    const client = makeClient();
    await client.createConversation({ title: 'hi' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchUrlAt(0);
    expect(new URL(url).hostname).toBe(CLOUD_HOST);
    expect(new URL(url).pathname).toBe('/api/chat/conversations');
  });

  it('every persistence verb reaches only the allowed cloud host', async () => {
    const client = makeClient();
    await client.createConversation({ title: 'a' });
    await client.listConversations();
    await client.updateConversation('c1', { title: 'b' });
    await client.deleteConversation('c1');
    await client.saveMessage('c1', { role: 'user', content: 'hi' });

    expect(fetchSpy).toHaveBeenCalledTimes(5);
    for (let i = 0; i < fetchSpy.mock.calls.length; i += 1) {
      const host = new URL(fetchUrlAt(i)).hostname;
      expect(host === CLOUD_HOST || host.endsWith(`.${CLOUD_HOST}`)).toBe(true);
    }
  });

  it('saveMessage reaches exactly the cloud host /api/chat/conversations/:id/messages', async () => {
    const client = makeClient();
    await client.saveMessage('c1', { role: 'user', content: 'hi' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchUrlAt(0);
    expect(new URL(url).hostname).toBe(CLOUD_HOST);
    expect(new URL(url).pathname).toBe('/api/chat/conversations/c1/messages');
  });
});
