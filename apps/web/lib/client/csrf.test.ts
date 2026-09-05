import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addCsrfHeaders, clearCsrfToken, getCsrfToken } from './csrf';

const TOKEN = 'csrf-token-1';
const EXPIRES_IN_MS = 60 * 60 * 1000;

function deferredFetch(): {
  fetchMock: ReturnType<typeof vi.fn>;
  resolve: () => void;
} {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  const fetchMock = vi.fn(async () => {
    await gate;
    return {
      ok: true,
      json: async () => ({ token: TOKEN, expiresIn: EXPIRES_IN_MS }),
    } as unknown as Response;
  });
  return {
    fetchMock,
    resolve: () => release?.(),
  };
}

describe('csrf token fetching', () => {
  beforeEach(() => {
    clearCsrfToken();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearCsrfToken();
  });

  it('issues one request when several callers ask at once on a cold cache', async () => {
    const { fetchMock, resolve } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);

    const pending = Promise.all([getCsrfToken(), getCsrfToken(), addCsrfHeaders({})]);
    resolve();
    const [first, second, headers] = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(TOKEN);
    expect(second).toBe(TOKEN);
    expect(headers).toMatchObject({ 'x-csrf-token': TOKEN });
  });

  it('refetches after a failure rather than caching the rejection', async () => {
    const failing = vi.fn(async () => ({ ok: false, statusText: 'nope' }) as unknown as Response);
    vi.stubGlobal('fetch', failing);
    await expect(getCsrfToken()).rejects.toThrow();

    const { fetchMock, resolve } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);
    const pending = getCsrfToken();
    resolve();

    await expect(pending).resolves.toBe(TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
