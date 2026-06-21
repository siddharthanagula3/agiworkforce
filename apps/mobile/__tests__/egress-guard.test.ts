/**
 * Zero-leak guard tests for lib/egressGuard.ts (Agent Beta-4).
 *
 * Invariant under test: in Local mode the app must NEVER reach our managed
 * cloud (AGI API / gateway / Neon / Clerk / signaling). BYOK direct-to-provider
 * traffic is allowed. In Cloud mode our-cloud is allowed. Mode resolution is
 * fail-closed: an unknown/unreadable mode is treated as Local.
 *
 * `guardedFetch` delegates allowed requests to `secureFetch` (the TLS-pinning
 * chokepoint), so we mock secureFetch and assert (a) it is NOT called when the
 * guard blocks, and (b) it IS called (with the original args) when allowed.
 */

const mockSecureFetch = jest.fn();
jest.mock('@/services/secureFetch', () => ({
  secureFetch: (input: unknown, init: unknown) => mockSecureFetch(input, init),
}));

// Mode source: the persisted app-mode store. We control getState() per test.
let mockAppMode: unknown = 'local';
jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: {
    getState: () => ({ appMode: mockAppMode }),
  },
}));

import {
  guardedFetch,
  isOurCloudHost,
  OUR_CLOUD_HOSTS,
  EgressBlockedError,
} from '../lib/egressGuard';

beforeEach(() => {
  mockSecureFetch.mockReset().mockResolvedValue(new Response('ok', { status: 200 }));
  mockAppMode = 'local';
});

describe('isOurCloudHost — host classification', () => {
  it('matches our product apex and any subdomain', () => {
    expect(isOurCloudHost('agiworkforce.com')).toBe(true);
    expect(isOurCloudHost('api.agiworkforce.com')).toBe(true);
    expect(isOurCloudHost('signaling.agiworkforce.com')).toBe(true);
    expect(isOurCloudHost('telemetry.agiworkforce.com')).toBe(true);
  });

  it('matches managed Postgres (Neon) and managed auth (Clerk) hosts', () => {
    expect(isOurCloudHost('ep-cool-darkness-123.us-east-2.aws.neon.tech')).toBe(true);
    expect(isOurCloudHost('clerk.agiworkforce.com')).toBe(true);
    expect(isOurCloudHost('foo.clerk.accounts.dev')).toBe(true);
    expect(isOurCloudHost('frontend-api.clerk.com')).toBe(true);
  });

  it('does NOT match BYOK direct-to-provider hosts', () => {
    expect(isOurCloudHost('api.anthropic.com')).toBe(false);
    expect(isOurCloudHost('api.openai.com')).toBe(false);
    expect(isOurCloudHost('generativelanguage.googleapis.com')).toBe(false);
    expect(isOurCloudHost('api.deepgram.com')).toBe(false);
  });

  it('does not treat a lookalike suffix as ours (no substring bypass)', () => {
    // Attacker domain that merely ends with our brand string must NOT match.
    expect(isOurCloudHost('agiworkforce.com.evil.example')).toBe(false);
    expect(isOurCloudHost('notneon.tech')).toBe(false);
    expect(isOurCloudHost('neon.tech.attacker.example')).toBe(false);
  });

  it('treats empty / nullish hosts as not-ours', () => {
    expect(isOurCloudHost('')).toBe(false);
    expect(isOurCloudHost(undefined)).toBe(false);
    expect(isOurCloudHost(null)).toBe(false);
  });

  it('exposes config-derived exact hosts', () => {
    expect(OUR_CLOUD_HOSTS).toContain('agiworkforce.com');
  });
});

describe('guardedFetch — Local mode (block our-cloud, allow provider)', () => {
  it('BLOCKS our-cloud requests before any network I/O', async () => {
    mockAppMode = 'local';
    await expect(
      guardedFetch('https://agiworkforce.com/api/llm/v1/chat/completions', { method: 'POST' }),
    ).rejects.toBeInstanceOf(EgressBlockedError);
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });

  it('BLOCKS the api-gateway provider-stream host (still our cloud)', async () => {
    mockAppMode = 'local';
    await expect(
      guardedFetch('https://api.agiworkforce.com/api/v1/providers/anthropic/stream'),
    ).rejects.toBeInstanceOf(EgressBlockedError);
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });

  it('ALLOWS BYOK direct-to-provider requests, delegating to secureFetch', async () => {
    mockAppMode = 'local';
    const init = { method: 'POST', body: '{}' };
    await guardedFetch('https://api.anthropic.com/v1/messages', init);
    expect(mockSecureFetch).toHaveBeenCalledTimes(1);
    expect(mockSecureFetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', init);
  });
});

describe('guardedFetch — Cloud mode (managed allows our-cloud)', () => {
  it('ALLOWS our-cloud requests, delegating to secureFetch', async () => {
    mockAppMode = 'cloud';
    await guardedFetch('https://agiworkforce.com/api/usage/summary');
    expect(mockSecureFetch).toHaveBeenCalledTimes(1);
    expect(mockSecureFetch).toHaveBeenCalledWith(
      'https://agiworkforce.com/api/usage/summary',
      undefined,
    );
  });
});

describe('guardedFetch — fail-closed mode resolution', () => {
  it('treats an unknown mode value as Local and blocks our-cloud', async () => {
    mockAppMode = undefined;
    await expect(guardedFetch('https://agiworkforce.com/api/x')).rejects.toBeInstanceOf(
      EgressBlockedError,
    );
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });

  it('blocks our-cloud even when a URL object is passed in Local mode', async () => {
    mockAppMode = 'local';
    await expect(
      guardedFetch(new URL('https://api.agiworkforce.com/api/mcp/servers')),
    ).rejects.toBeInstanceOf(EgressBlockedError);
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });

  it('blocks our-cloud when host casing is mixed (case-insensitive match)', async () => {
    mockAppMode = 'local';
    await expect(guardedFetch('https://AGIWORKFORCE.COM/api/x')).rejects.toBeInstanceOf(
      EgressBlockedError,
    );
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });
});
