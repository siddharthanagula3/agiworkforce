
const mockSecureFetch = jest.fn();
jest.mock('@/services/secureFetch', () => ({
  secureFetch: (input: unknown, init: unknown) => mockSecureFetch(input, init),
}));

const mockNetInfoRefresh = jest.fn().mockResolvedValue(undefined);
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { refresh: (...args: unknown[]) => mockNetInfoRefresh(...args) },
}));

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
  mockNetInfoRefresh.mockClear();
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

  it('DRIFT REGRESSION: classifies vercel.app (mobile used to miss it) as ours', () => {
    expect(OUR_CLOUD_HOSTS).toContain('vercel.app');
    expect(isOurCloudHost('vercel.app')).toBe(true);
    expect(isOurCloudHost('my-app.vercel.app')).toBe(true);
    expect(isOurCloudHost('evilvercel.app')).toBe(false);
  });
});

describe('guardedFetch — DRIFT REGRESSION (vercel.app mobile missed is now blocked in Local mode)', () => {
  it('BLOCKS a *.vercel.app host in Local mode before any network I/O', async () => {
    mockAppMode = 'local';
    await expect(
      guardedFetch('https://our-web.vercel.app/api/cloud-chat', { method: 'POST' }),
    ).rejects.toBeInstanceOf(EgressBlockedError);
    expect(mockSecureFetch).not.toHaveBeenCalled();
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

describe('guardedFetch — NetInfo self-correction on a successful round-trip', () => {
  it('force-refreshes NetInfo after a successful (2xx) response', async () => {
    mockAppMode = 'cloud';
    mockSecureFetch.mockResolvedValue(new Response('ok', { status: 200 }));
    await guardedFetch('https://agiworkforce.com/api/chat/send');
    expect(mockNetInfoRefresh).toHaveBeenCalledTimes(1);
  });

  it('still force-refreshes NetInfo on a resolved non-2xx response (round-trip proves connectivity)', async () => {
    mockAppMode = 'cloud';
    mockSecureFetch.mockResolvedValue(new Response('server error', { status: 500 }));
    await guardedFetch('https://agiworkforce.com/api/chat/send');
    expect(mockNetInfoRefresh).toHaveBeenCalledTimes(1);
  });

  it('does NOT refresh NetInfo when the request never leaves the device (Local-mode block)', async () => {
    mockAppMode = 'local';
    await expect(guardedFetch('https://agiworkforce.com/api/x')).rejects.toBeInstanceOf(
      EgressBlockedError,
    );
    expect(mockNetInfoRefresh).not.toHaveBeenCalled();
  });

  it('does NOT refresh NetInfo when the fetch itself throws (genuine network failure)', async () => {
    mockAppMode = 'cloud';
    mockSecureFetch.mockRejectedValue(new Error('Network request failed'));
    await expect(guardedFetch('https://agiworkforce.com/api/chat/send')).rejects.toThrow(
      'Network request failed',
    );
    expect(mockNetInfoRefresh).not.toHaveBeenCalled();
  });
});
