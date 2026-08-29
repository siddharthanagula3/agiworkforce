import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/clerk-session', () => ({
  hasClerkSessionCookie: () => clerk.cookie,
  hasUsableClerkSessionToken: () => clerk.token,
}));

const clerk = { cookie: true, token: true };

import { requestMe } from '../me-request';

afterEach(() => {
  vi.unstubAllGlobals();
  clerk.cookie = true;
  clerk.token = true;
});

describe('identity request', () => {
  // Seven call sites fetched /api/me independently, producing 3-4 requests per
  // page load, and the earliest fired before Clerk minted a token and answered 401.
  it('collapses concurrent callers into one network request', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ id: 'u1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const [a, b, c] = await Promise.all([requestMe(), requestMe(), requestMe()]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(a.status).toBe(200);
    await expect(b.json()).resolves.toEqual({ id: 'u1' });
    await expect(c.json()).resolves.toEqual({ id: 'u1' });
  });

  it('hands each caller its own readable body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'u2' }), { status: 200 })),
    );

    const [a, b] = await Promise.all([requestMe(), requestMe()]);

    await expect(a.json()).resolves.toEqual({ id: 'u2' });
    await expect(b.json()).resolves.toEqual({ id: 'u2' });
  });

  it('waits for a usable token before spending a request that would 401', async () => {
    clerk.token = false;
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const pending = requestMe();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fetchSpy).not.toHaveBeenCalled();

    clerk.token = true;
    await pending;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not wait when the visitor is signed out', async () => {
    clerk.cookie = false;
    clerk.token = false;
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetchSpy);

    await requestMe();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh request once the previous one settles', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    await requestMe();
    await requestMe();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
