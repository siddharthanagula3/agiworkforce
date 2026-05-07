/**
 * api.ts — ApiPaywallError detection tests
 *
 * Verifies that:
 *  - HTTP 429 with { kind: 'paywall', feature, requiredTier, reason } throws ApiPaywallError
 *  - ApiPaywallError carries the correct fields
 *  - HTTP 429 without paywall body throws a generic Error
 *  - HTTP 429 with non-JSON body throws a generic Error
 *  - Non-429 errors pass through unchanged
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      refreshSession: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

jest.mock('../lib/constants', () => ({
  API_URL: 'https://api.test.local',
  TIMEOUTS: { DEFAULT: 10_000 },
}));

jest.mock('../lib/abortSignal', () => ({
  combineAbortSignals: (signals: AbortSignal[]) => signals[0],
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { api, ApiPaywallError } from '../services/api';
import { supabase } from '../services/supabase';

const mockGetSession = supabase.auth.getSession as jest.Mock;
const mockRefreshSession = supabase.auth.refreshSession as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(status: number, body: unknown, contentType = 'application/json'): Response {
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h === 'content-type' ? contentType : null) },
    text: jest.fn(async () => bodyText),
    json: jest.fn(async () => (typeof body === 'string' ? JSON.parse(body) : body)),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } } });
  mockRefreshSession.mockResolvedValue({
    data: { session: null },
    error: new Error('no-refresh'),
  });
  (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
});

// ---------------------------------------------------------------------------
// 1. Paywall 429 throws ApiPaywallError
// ---------------------------------------------------------------------------

describe('429 with paywall payload', () => {
  it('throws ApiPaywallError with correct fields', async () => {
    const paywallBody = {
      kind: 'paywall',
      feature: 'token_cap',
      requiredTier: 'hobby',
      reason: '2M tokens used this month',
    };
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(429, paywallBody));

    let caught: unknown;
    try {
      await api.post('/api/llm/v1/chat/completions', { model: 'test', messages: [] });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiPaywallError);
    const paywallErr = caught as ApiPaywallError;
    expect(paywallErr.feature).toBe('token_cap');
    expect(paywallErr.requiredTier).toBe('hobby');
    expect(paywallErr.reason).toBe('2M tokens used this month');
    expect(paywallErr.name).toBe('ApiPaywallError');
  });

  it('message contains feature, requiredTier, and reason', async () => {
    const paywallBody = {
      kind: 'paywall',
      feature: 'image_quota',
      requiredTier: 'pro',
      reason: '10/10 images used',
    };
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(429, paywallBody));

    await expect(api.post('/api/llm/v1/chat/completions', {})).rejects.toThrow(
      'Paywall: image_quota requires pro tier.',
    );
  });

  it('uses "token_cap" and "hobby" as defaults when fields are missing', async () => {
    const paywallBody = { kind: 'paywall' };
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(429, paywallBody));

    let caught: unknown;
    try {
      await api.get('/api/chat');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiPaywallError);
    const paywallErr = caught as ApiPaywallError;
    expect(paywallErr.feature).toBe('token_cap');
    expect(paywallErr.requiredTier).toBe('hobby');
    expect(paywallErr.reason).toBe('');
  });

  it('handles pro_plus tier correctly', async () => {
    const paywallBody = {
      kind: 'paywall',
      feature: 'video_generation',
      requiredTier: 'pro_plus',
      reason: 'Video generation requires Pro+',
    };
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(429, paywallBody));

    const err = await api.get('/api/chat').catch((e) => e);
    expect(err).toBeInstanceOf(ApiPaywallError);
    expect((err as ApiPaywallError).requiredTier).toBe('pro_plus');
  });
});

// ---------------------------------------------------------------------------
// 2. 429 without paywall body — generic Error
// ---------------------------------------------------------------------------

describe('429 without paywall payload', () => {
  it('throws generic Error when body is rate-limit plain text', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(429, 'Too many requests', 'text/plain'));

    const err = await api.get('/api/chat').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ApiPaywallError);
  });

  it('throws generic Error when body is JSON without kind=paywall', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(429, { error: 'rate_limited', retryAfter: 60 }));

    const caught = await api.get('/api/test').catch((e) => e);

    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(ApiPaywallError);
  });
});

// ---------------------------------------------------------------------------
// 3. Non-429 errors pass through unaffected
// ---------------------------------------------------------------------------

describe('non-429 errors pass through', () => {
  it('throws plain Error for 500', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(500, 'server error'));

    const err = await api.get('/api/test').catch((e) => e);
    expect(err).not.toBeInstanceOf(ApiPaywallError);
    expect((err as Error).message).toContain('500');
  });

  it('does NOT throw ApiPaywallError for 403', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(403, 'forbidden'));

    const err = await api.get('/api/test').catch((e) => e);
    expect(err).not.toBeInstanceOf(ApiPaywallError);
  });

  it('2xx responses still return parsed JSON', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse(200, { tier: 'hobby' }));

    const result = await api.get<{ tier: string }>('/api/auth/me');
    expect(result.tier).toBe('hobby');
  });
});

// ---------------------------------------------------------------------------
// 4. ApiPaywallError is instanceof Error
// ---------------------------------------------------------------------------

describe('ApiPaywallError class', () => {
  it('is an instance of Error', () => {
    const err = new ApiPaywallError('token_cap', 'hobby', 'reason');
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of ApiPaywallError', () => {
    const err = new ApiPaywallError('token_cap', 'hobby', '');
    expect(err).toBeInstanceOf(ApiPaywallError);
  });

  it('carries all three fields', () => {
    const err = new ApiPaywallError('image_quota', 'pro_plus', 'custom reason');
    expect(err.feature).toBe('image_quota');
    expect(err.requiredTier).toBe('pro_plus');
    expect(err.reason).toBe('custom reason');
  });
});
