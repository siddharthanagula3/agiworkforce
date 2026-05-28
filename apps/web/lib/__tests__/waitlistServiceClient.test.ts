import { describe, it, expect, vi, beforeEach } from 'vitest';

// waitlistServiceClient routes through active Next.js API endpoints — Supabase
// browser access was removed. Mock global fetch and CSRF header injection.
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-test-token',
  })),
}));

import { redeemInviteCode, joinWaitlist } from '../services/waitlistServiceClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// redeemInviteCode
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// joinWaitlist
// ---------------------------------------------------------------------------

describe('joinWaitlist', () => {
  it('returns success on 200 response', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ success: true }));

    const result = await joinWaitlist({ email: 'test@example.com' });
    expect(result).toEqual({ success: true });
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
