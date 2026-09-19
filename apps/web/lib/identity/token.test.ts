import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({}));

function setClient(value: unknown): void {
  Object.defineProperty(window, 'Clerk', { configurable: true, writable: true, value });
}

async function loadTokenModule() {
  return import('./token');
}

describe('getIdentityToken', () => {
  beforeEach(() => {
    vi.resetModules();
    setClient(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    setClient(undefined);
  });

  it('waits for a delayed signed-in browser client', async () => {
    vi.useFakeTimers();
    const getToken = vi.fn(async () => 'identity-token');
    const { getIdentityToken } = await loadTokenModule();
    const pending = getIdentityToken();

    await vi.advanceTimersByTimeAsync(50);
    setClient({ loaded: true, session: { getToken } });
    await vi.advanceTimersByTimeAsync(25);

    await expect(pending).resolves.toBe('identity-token');
    expect(getToken).toHaveBeenCalledOnce();
  });

  it('deduplicates concurrent readiness waits', async () => {
    vi.useFakeTimers();
    const getToken = vi.fn(async () => 'identity-token');
    const { getIdentityToken } = await loadTokenModule();
    const first = getIdentityToken();
    const second = getIdentityToken();

    await vi.advanceTimersByTimeAsync(50);
    setClient({ loaded: true, session: { getToken } });
    await vi.advanceTimersByTimeAsync(25);

    await expect(Promise.all([first, second])).resolves.toEqual([
      'identity-token',
      'identity-token',
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns promptly when the loaded client is signed out', async () => {
    vi.useFakeTimers();
    setClient({ loaded: true, session: null });
    const { getIdentityToken } = await loadTokenModule();

    await expect(getIdentityToken()).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops waiting after the bounded readiness deadline', async () => {
    vi.useFakeTimers();
    const { getIdentityToken, IDENTITY_CLIENT_READY_TIMEOUT_MS } = await loadTokenModule();
    const pending = getIdentityToken();

    await vi.advanceTimersByTimeAsync(IDENTITY_CLIENT_READY_TIMEOUT_MS);

    await expect(pending).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns null when token retrieval fails', async () => {
    setClient({
      loaded: true,
      session: { getToken: vi.fn().mockRejectedValue(new Error('session expired')) },
    });
    const { getIdentityToken } = await loadTokenModule();

    await expect(getIdentityToken()).resolves.toBeNull();
  });
});
