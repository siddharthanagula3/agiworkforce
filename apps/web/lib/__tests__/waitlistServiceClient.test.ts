import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}, mintedToken = 'csrf-test-token') => ({
    ...headers,
    'x-csrf-token': mintedToken,
  })),
}));

import { joinPublicWaitlist } from '../services/waitlistServiceClient';

function makeJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('joinPublicWaitlist', () => {
  const PUBLIC_WAITLIST_URL = '/api/waitlist/public';
  const ENTRY = {
    email: 'Visitor@Example.invalid',
    referralSource: 'mobile',
    consent: [{ purpose: 'platform_availability_waitlist', granted: true }],
  };

  function answerWith(join: Response, token: Response = makeJsonResponse({ token: 'anon-token' })) {
    mockFetch.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? join : token,
    );
  }

  function postCall(): [string, RequestInit] | undefined {
    return mockFetch.mock.calls.find(
      (call: unknown[]) => (call[1] as RequestInit | undefined)?.method === 'POST',
    ) as [string, RequestInit] | undefined;
  }

  it('takes its token from the public waitlist route, never the identity-bound one', async () => {
    answerWith(makeJsonResponse({ ok: true, joined: true }));

    const result = await joinPublicWaitlist(ENTRY);

    expect(result).toEqual({ success: true });
    expect(mockFetch.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      PUBLIC_WAITLIST_URL,
      PUBLIC_WAITLIST_URL,
    ]);
    expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', cache: 'no-store' });
    const post = postCall();
    expect(post?.[1].headers).toMatchObject({ 'x-csrf-token': 'anon-token' });
    expect(JSON.parse(String(post?.[1].body))).toMatchObject({
      email: 'visitor@example.invalid',
      source: 'mobile',
    });
  });

  it.each([
    ['an empty body', {}],
    ['ok without the stored flag', { ok: true }],
    ['a stored flag that is false', { ok: true, joined: false }],
  ])('treats a 2xx answer with %s as a failure', async (_label, body) => {
    answerWith(makeJsonResponse(body));

    const result = await joinPublicWaitlist(ENTRY);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/failed to join/i);
  });

  it('treats a 2xx answer that is not JSON as a failure', async () => {
    answerWith({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
    } as unknown as Response);

    expect((await joinPublicWaitlist(ENTRY)).success).toBe(false);
  });

  it('does not post when the token cannot be minted', async () => {
    answerWith(makeJsonResponse({ ok: true, joined: true }), makeJsonResponse({}, 429));

    const result = await joinPublicWaitlist(ENTRY);

    expect(result.success).toBe(false);
    expect(postCall()).toBeUndefined();
  });

  it('shows the reason the server gives when it refuses', async () => {
    answerWith(
      makeJsonResponse(
        { error: { code: 'CONSENT_REQUIRED', message: 'Agree to be stored.' } },
        400,
      ),
    );

    expect(await joinPublicWaitlist(ENTRY)).toEqual({
      success: false,
      error: 'Agree to be stored.',
    });
  });
});
