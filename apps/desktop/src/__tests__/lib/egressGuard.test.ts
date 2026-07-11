/**
 * Egress Guard spy tests.
 *
 * Verifies the zero-leak chokepoint: in Local/BYOK trust boundaries the guard
 * must throw BEFORE any network call when the target is one of OUR cloud hosts,
 * while still allowing BYOK client-direct streaming to the user's own provider.
 * In Managed Cloud mode our-cloud egress is allowed. Fail-closed: an unreadable
 * store is treated as Local.
 *
 * The guard branches on the canonical 3-tier `selectPrivacyMode`
 * ('local' | 'byok' | 'managed'), NOT the binary AppMode — because BYOK runs
 * under appMode 'cloud'. These tests mock `selectPrivacyMode` directly so the
 * guard's mapping (block unless 'managed') is exercised deterministically,
 * independent of selectPrivacyMode's internal settingsStore lookup.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the app-mode store. `selectPrivacyMode` mirrors the real selector by
// returning the privacyMode we drive per test via `getState`.
// `vi.hoisted` is required because `vi.mock` is hoisted above module-body
// declarations — a plain `const getStateMock = vi.fn()` would not be
// initialized when the mock factory runs, throwing a TDZ ReferenceError.
const { getStateMock } = vi.hoisted(() => ({ getStateMock: vi.fn() }));
vi.mock('../../stores/appModeStore', () => ({
  useAppModeStore: { getState: getStateMock },
  selectPrivacyMode: (state: { privacyMode: unknown }) => state.privacyMode,
}));

import { guardedFetch, isOurCloudHost, OUR_CLOUD_HOSTS } from '../../lib/egressGuard';

const OUR_CLOUD_URL = 'https://www.agiworkforce.com/api/cloud-chat';
const PROVIDER_URL = 'https://api.anthropic.com/v1/messages';

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getStateMock.mockReset();
  // Inject a spy global fetch that resolves to a sentinel Response.
  fetchSpy = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isOurCloudHost', () => {
  it('matches our cloud hosts and subdomains (boundary-safe)', () => {
    expect(isOurCloudHost('agiworkforce.com')).toBe(true);
    expect(isOurCloudHost('www.agiworkforce.com')).toBe(true);
    expect(isOurCloudHost('gateway.agiworkforce.com')).toBe(true);
    expect(isOurCloudHost('my-app.vercel.app')).toBe(true);
    expect(isOurCloudHost('ep-cool-db.neon.tech')).toBe(true);
    expect(isOurCloudHost('clerk.com')).toBe(true);
    expect(isOurCloudHost('foo.clerk.accounts.dev')).toBe(true);
  });

  it('does NOT match provider hosts (BYOK passes through)', () => {
    expect(isOurCloudHost('api.anthropic.com')).toBe(false);
    expect(isOurCloudHost('api.openai.com')).toBe(false);
    expect(isOurCloudHost('generativelanguage.googleapis.com')).toBe(false);
  });

  it('does NOT match look-alike hosts (no substring/prefix bypass)', () => {
    expect(isOurCloudHost('notagiworkforce.com')).toBe(false);
    expect(isOurCloudHost('agiworkforce.com.evil.example')).toBe(false);
    expect(isOurCloudHost('evilvercel.app')).toBe(false);
    expect(isOurCloudHost('')).toBe(false);
    expect(isOurCloudHost(null)).toBe(false);
    expect(isOurCloudHost(undefined)).toBe(false);
  });

  it('exposes a documented, maintainable denylist', () => {
    expect(OUR_CLOUD_HOSTS).toContain('agiworkforce.com');
    expect(OUR_CLOUD_HOSTS).toContain('vercel.app');
    expect(OUR_CLOUD_HOSTS).toContain('neon.tech');
    // Provider hosts must never be on the denylist.
    expect(OUR_CLOUD_HOSTS).not.toContain('api.anthropic.com');
  });

  it('DRIFT REGRESSION: classifies the Clerk hosts desktop used to miss as ours', () => {
    // These two Clerk domains were on mobile's denylist but NOT desktop's, so
    // desktop Local mode wouldn't have blocked them. After reconciling to the
    // shared union they must classify as ours on both surfaces.
    expect(OUR_CLOUD_HOSTS).toContain('clerk.dev');
    expect(OUR_CLOUD_HOSTS).toContain('clerk.services');
    expect(isOurCloudHost('clerk.dev')).toBe(true);
    expect(isOurCloudHost('foo.clerk.dev')).toBe(true);
    expect(isOurCloudHost('clerk.services')).toBe(true);
    expect(isOurCloudHost('frontend-api.clerk.services')).toBe(true);
  });
});

describe('guardedFetch — DRIFT REGRESSION (Clerk hosts desktop missed are now blocked in Local mode)', () => {
  // Before the shared-policy reconcile, desktop's denylist omitted clerk.dev and
  // clerk.services, so Local mode would have LEAKED account/auth traffic to them.
  // These assert the guard now throws BEFORE any network call for those hosts.
  const PREVIOUSLY_LEAKED = [
    'https://foo.clerk.dev/v1/client',
    'https://frontend-api.clerk.services/v1/environment',
  ];

  it.each(['local', 'byok'])('blocks the previously-drifted Clerk hosts in %s mode', async (mode) => {
    getStateMock.mockReturnValue({ privacyMode: mode });
    for (const url of PREVIOUSLY_LEAKED) {
      await expect(guardedFetch(url, { method: 'POST' })).rejects.toThrow(
        /blocked our-cloud egress/,
      );
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('guardedFetch — privacy mode "local"', () => {
  beforeEach(() => {
    getStateMock.mockReturnValue({ privacyMode: 'local' });
  });

  it('blocks our-cloud egress BEFORE any network call', async () => {
    await expect(guardedFetch(OUR_CLOUD_URL)).rejects.toThrow(
      /\[egress-guard\] blocked our-cloud egress in Local mode/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows BYOK provider-direct egress (provider host passes)', async () => {
    const res = await guardedFetch(PROVIDER_URL);
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(PROVIDER_URL, undefined);
  });
});

describe('guardedFetch — privacy mode "byok" (REGRESSION: must block our-cloud)', () => {
  // BYOK runs under appMode 'cloud' but is a Local trust boundary. A naive
  // `mode !== 'cloud'` check would WRONGLY allow our-cloud egress here. This
  // suite is the regression guard for that exact leak.
  beforeEach(() => {
    getStateMock.mockReturnValue({ privacyMode: 'byok' });
  });

  it('BLOCKS our-cloud egress (the leak that must never regress)', async () => {
    await expect(guardedFetch('https://app.vercel.app/api/me')).rejects.toThrow(
      /blocked our-cloud egress/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks our-cloud chat egress and does not call fetch', async () => {
    await expect(guardedFetch(OUR_CLOUD_URL)).rejects.toThrow(/blocked our-cloud egress/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows the user-owned provider host (BYOK client-direct streaming)', async () => {
    await guardedFetch(PROVIDER_URL);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('guardedFetch — privacy mode "managed" (managed cloud)', () => {
  beforeEach(() => {
    getStateMock.mockReturnValue({ privacyMode: 'managed' });
  });

  it('allows our-cloud egress (delegates to fetch)', async () => {
    const res = await guardedFetch(OUR_CLOUD_URL);
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(OUR_CLOUD_URL, undefined);
  });

  it('also allows provider hosts', async () => {
    await guardedFetch(PROVIDER_URL);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('guardedFetch — fail-closed', () => {
  it('treats an unreadable store (getState throws) as Local and blocks', async () => {
    getStateMock.mockImplementation(() => {
      throw new Error('store not initialized');
    });

    await expect(guardedFetch(OUR_CLOUD_URL)).rejects.toThrow(/blocked our-cloud egress/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fail-closed still allows provider hosts (BYOK never broken)', async () => {
    getStateMock.mockImplementation(() => {
      throw new Error('store not initialized');
    });

    await guardedFetch(PROVIDER_URL);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('guardedFetch — desktop P0 endpoints stay behind the chokepoint', () => {
  // The three desktop call sites wired through guardedFetch in the egress
  // chokepoint fix (built from WEB_APP_URL / API_BASE_URL — both agiworkforce.com
  // hosts). The matching eslint rule blocks the raw-fetch form at lint time;
  // these tests lock the RUNTIME behavior so a denylist gap or a future bypass
  // re-trips this guard. The Share endpoint is the headline P0 (full chat content).
  const P0_ENDPOINTS = [
    'https://agiworkforce.com/api/shared', // ShareConversationDialog — full conversation
    'https://www.agiworkforce.com/api/models', // App.tsx model-catalog fallback
    'https://www.agiworkforce.com/api/pair/initiate', // connectionStore mobile pairing
  ];

  it.each(['local', 'byok'])('blocks every P0 endpoint in %s mode', async (mode) => {
    getStateMock.mockReturnValue({ privacyMode: mode });
    for (const url of P0_ENDPOINTS) {
      await expect(guardedFetch(url, { method: 'POST' })).rejects.toThrow(
        /blocked our-cloud egress/,
      );
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows the P0 endpoints only in managed mode', async () => {
    getStateMock.mockReturnValue({ privacyMode: 'managed' });
    for (const url of P0_ENDPOINTS) {
      const res = await guardedFetch(url, { method: 'POST' });
      expect(res.status).toBe(200);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(P0_ENDPOINTS.length);
  });
});

describe('guardedFetch — input shapes (privacy mode "local")', () => {
  beforeEach(() => {
    getStateMock.mockReturnValue({ privacyMode: 'local' });
  });

  it('blocks a URL object targeting our cloud', async () => {
    await expect(guardedFetch(new URL(OUR_CLOUD_URL))).rejects.toThrow(/blocked our-cloud egress/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks a Request object targeting our cloud', async () => {
    await expect(guardedFetch(new Request(OUR_CLOUD_URL))).rejects.toThrow(
      /blocked our-cloud egress/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('passes a Request object targeting a provider', async () => {
    await guardedFetch(new Request(PROVIDER_URL));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('forwards init options to the underlying fetch when allowed', async () => {
    const init: RequestInit = { method: 'POST', body: '{}' };
    await guardedFetch(PROVIDER_URL, init);
    expect(fetchSpy).toHaveBeenCalledWith(PROVIDER_URL, init);
  });
});
