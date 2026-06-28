/**
 * DCL-3 — Cloud chat persistence egress CONTRACT test.
 *
 * Ties the REAL shared persistence client (`@agiworkforce/unified-chat`) to the
 * REAL desktop egress guard (`guardedFetch`) and proves the trust boundary on
 * the exact path desktop Cloud mode will use (`<WEB_APP_URL>/api/chat/conversations`):
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

import { createCloudChatPersistenceClient } from '@agiworkforce/unified-chat';
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
  return createCloudChatPersistenceClient({
    baseUrl: WEB_APP_URL,
    getAuthToken: async () => 'desktop-clerk-token',
    fetchImpl: guardedFetch,
  });
}

beforeEach(() => {
  getStateMock.mockReset();
  // Return a FRESH Response per call — a Response body can only be read once, so
  // a single shared instance would throw "Body is unusable" across verbs.
  fetchSpy = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ conversation: { id: 'c1', user_id: 'u1' }, conversations: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
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
      await expect(client.createConversation({ title: 'x', mode: 'chat' })).rejects.toThrow(
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
  },
);

describe('cloud persistence is ALLOWED in managed mode and reaches only the allowed host', () => {
  beforeEach(() => {
    getStateMock.mockReturnValue({ privacyMode: 'managed' });
  });

  it('createConversation reaches exactly the cloud host /api/chat/conversations', async () => {
    const client = makeClient();
    await client.createConversation({ title: 'hi', mode: 'chat' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchUrlAt(0);
    expect(new URL(url).hostname).toBe(CLOUD_HOST);
    expect(new URL(url).pathname).toBe('/api/chat/conversations');
  });

  it('every persistence verb reaches only the allowed cloud host', async () => {
    const client = makeClient();
    await client.createConversation({ title: 'a', mode: 'chat' });
    await client.listConversations();
    await client.updateConversationTitle('c1', 'b');
    await client.deleteConversation('c1');

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    for (let i = 0; i < fetchSpy.mock.calls.length; i += 1) {
      const host = new URL(fetchUrlAt(i)).hostname;
      expect(host === CLOUD_HOST || host.endsWith(`.${CLOUD_HOST}`)).toBe(true);
    }
  });
});
