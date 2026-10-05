import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearCsrfToken, getCsrfToken } from '@/lib/client/csrf';
import { joinPublicWaitlist } from '../services/waitlistServiceClient';

const PUBLIC_WAITLIST_URL = '/api/waitlist/public';
const IDENTITY_TOKEN_URL = '/api/csrf';
const ANONYMOUS_TOKEN = 'anon-token-from-the-waitlist-route';
const IDENTITY_BOUND_TOKEN = 'user_signed_in_1:token-from-api-csrf';

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (url === IDENTITY_TOKEN_URL) {
    return jsonResponse({ token: IDENTITY_BOUND_TOKEN, expiresIn: 60 * 60 * 1000 });
  }
  if (url === PUBLIC_WAITLIST_URL && init?.method === 'POST') {
    return jsonResponse({ ok: true, joined: true });
  }
  if (url === PUBLIC_WAITLIST_URL) return jsonResponse({ token: ANONYMOUS_TOKEN });
  throw new Error(`Unexpected request: ${url}`);
});

function requestedUrls(): string[] {
  return fetchMock.mock.calls.map(([url]) => url);
}

function joinHeaders(): Record<string, string> {
  const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
  return (post?.[1]?.headers ?? {}) as Record<string, string>;
}

describe('joinPublicWaitlist through the real CSRF header helper', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    clearCsrfToken();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearCsrfToken();
  });

  it('posts the token the waitlist route minted and never asks for the identity-bound one', async () => {
    const result = await joinPublicWaitlist({ email: 'visitor@example.invalid' });

    expect(result).toEqual({ success: true });
    expect(joinHeaders()['x-csrf-token']).toBe(ANONYMOUS_TOKEN);
    expect(requestedUrls()).toEqual([PUBLIC_WAITLIST_URL, PUBLIC_WAITLIST_URL]);
  });

  it('still posts the waitlist token when an identity-bound token is already cached', async () => {
    await getCsrfToken();
    fetchMock.mockClear();

    const result = await joinPublicWaitlist({ email: 'visitor@example.invalid' });

    expect(result).toEqual({ success: true });
    expect(joinHeaders()['x-csrf-token']).toBe(ANONYMOUS_TOKEN);
    expect(requestedUrls()).not.toContain(IDENTITY_TOKEN_URL);
  });
});
