import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}, mintedToken = 'csrf-test-token') => ({
    ...headers,
    'x-csrf-token': mintedToken,
  })),
}));

import {
  redeemInviteCode,
  joinPublicWaitlist,
  joinWaitlist,
} from '../services/waitlistServiceClient';

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

describe('redeemInviteCode', () => {
  it('POSTs to /api/claim-offer with uppercased code and CSRF header', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ success: true, invite_id: 'inv-abc' }));

    const result = await redeemInviteCode('abcdef', 'connectors');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/claim-offer',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-csrf-token': 'csrf-test-token' }),
        body: JSON.stringify({ code: 'ABCDEF' }),
      }),
    );
    expect(result).toEqual({ success: true, inviteId: 'inv-abc' });
  });

  it('returns rpc_error when response is not ok', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ error: 'rpc_error' }, 500));

    const result = await redeemInviteCode('ABCDEF', 'connectors');
    expect(result).toEqual({ success: false, error: 'rpc_error' });
  });

  it('returns typed error from API body on invalid_code', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ success: false, error: 'Invalid invite code' }));

    const result = await redeemInviteCode('ABCDEF', 'connectors');
    expect(result).toEqual({ success: false, error: 'invalid_code' });
  });

  it('returns rpc_error when fetch throws (network failure)', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));

    const result = await redeemInviteCode('ABCDEF', 'connectors');
    expect(result).toEqual({ success: false, error: 'rpc_error' });
  });

  it('returns rpc_error when API body has no error field and success=false', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ success: false }));

    const result = await redeemInviteCode('ABCDEF', 'web-search');
    expect(result).toEqual({ success: false, error: 'rpc_error' });
  });

  it('returns inviteId from invite_id field in response body', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ success: true, invite_id: 'inv-xyz' }));

    const result = await redeemInviteCode('ABCDEF', 'web-search');
    expect(result).toEqual({ success: true, inviteId: 'inv-xyz' });
  });
});

describe('joinWaitlist', () => {
  it('returns success on 200 response', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ success: true }));

    const result = await joinWaitlist({ email: 'test@example.com' });
    expect(result).toEqual({ success: true });
  });

  it('returns rank when the waitlist endpoint provides one', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ ok: true, joined: true, rank: 12 }));

    const result = await joinWaitlist({ email: 'test@example.com' });
    expect(result).toEqual({ success: true, rank: 12 });
  });

  it('normalizes email to lowercase in POST body', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ success: true }));

    await joinWaitlist({ email: 'TEST@EXAMPLE.COM' });

    const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.email).toBe('test@example.com');
  });

  it('POSTs to the active Cloud Managed waitlist endpoint with CSRF header', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ success: true }));

    await joinWaitlist({ email: 'test@example.com' });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/waitlist/cloud-managed',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-csrf-token': 'csrf-test-token' }),
      }),
    );
  });

  it('maps unknown referralSource to other in POST body', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ success: true }));

    await joinWaitlist({ email: 'a@b.com', referralSource: 'connectors' });

    const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.source).toBe('other');
  });

  it('passes byok source through in POST body', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ success: true }));

    await joinWaitlist({ email: 'a@b.com', referralSource: 'byok' });

    const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.source).toBe('byok');
  });

  it('passes mobile source through in POST body', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ success: true }));

    await joinWaitlist({ email: 'a@b.com', referralSource: 'mobile' });

    const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.source).toBe('mobile');
  });

  it('returns error message on non-ok response', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({}, 400));

    const result = await joinWaitlist({ email: 'a@b.com' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/failed to join/i);
  });

  it('returns error message when fetch throws (network failure)', async () => {
    mockFetch.mockRejectedValue(new Error('timeout'));

    const result = await joinWaitlist({ email: 'a@b.com' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/failed to join/i);
  });
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
