import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { desktopSignInLink } from '@agiworkforce/local-runtime-contract';

const openExternal = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ shell: { openExternal } }));

type SignInOwner = typeof import('../browserSignIn');
let owner: SignInOwner;
const CODE = 'c'.repeat(43);

function callbackFor(call = 0): string {
  const url = new URL(openExternal.mock.calls[call]?.[0]);
  return desktopSignInLink(CODE, url.searchParams.get('challenge')!);
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
  openExternal.mockReset().mockResolvedValue(undefined);
  owner = await import('../browserSignIn');
});

afterEach(() => vi.useRealTimers());

describe('native browser sign-in ownership', () => {
  it('opens a first-party challenge and exchanges it exactly once without exposing the verifier', async () => {
    const result = await owner.startBrowserSignIn();
    const opened = new URL(openExternal.mock.calls[0]?.[0]);
    expect(opened.pathname).toBe('/auth/desktop');
    expect([...opened.searchParams.keys()]).toEqual(['challenge']);
    expect(owner.browserSignInState()).toEqual({
      kind: 'waiting',
      expiresAtMs: result.expiresAtMs,
    });
    const complete = owner.readBrowserSignInLink(callbackFor());
    expect(complete.kind).toBe('complete');
    if (complete.kind !== 'complete') throw new Error('Expected a completion');
    const url = new URL(complete.url);
    expect(url.pathname).toBe('/auth/desktop/complete');
    expect(url.search).toBe('');
    expect(new URLSearchParams(url.hash.slice(1)).get('code')).toBe(CODE);
    expect(owner.readBrowserSignInLink(callbackFor())).toEqual({ kind: 'ignored' });
    expect(owner.browserSignInState()).toEqual({ kind: 'idle' });
  });

  it('reopens the same pending attempt and preserves its deadline', async () => {
    const first = await owner.startBrowserSignIn();
    vi.setSystemTime(Date.now() + 1000);
    expect(await owner.startBrowserSignIn()).toEqual(first);
    expect(openExternal.mock.calls[1]).toEqual(openExternal.mock.calls[0]);
  });

  it('invalidates cancelled callbacks while a new attempt can complete', async () => {
    await owner.startBrowserSignIn();
    const old = callbackFor();
    expect(owner.cancelBrowserSignIn()).toEqual({ cancelled: true });
    expect(owner.readBrowserSignInLink(old)).toEqual({ kind: 'ignored' });
    await owner.startBrowserSignIn();
    expect(callbackFor(1)).not.toBe(old);
    expect(owner.readBrowserSignInLink(old)).toEqual({ kind: 'ignored' });
    expect(owner.readBrowserSignInLink(callbackFor(1)).kind).toBe('complete');
  });

  it('rejects expiry at the exact deadline and starts a fresh challenge', async () => {
    const first = await owner.startBrowserSignIn();
    const old = callbackFor();
    vi.setSystemTime(first.expiresAtMs);
    expect(owner.readBrowserSignInLink(old)).toEqual({ kind: 'expired' });
    await owner.startBrowserSignIn();
    expect(callbackFor(1)).not.toBe(old);
  });

  it('restores idle after expiry without needing a callback', async () => {
    const first = await owner.startBrowserSignIn();
    vi.setSystemTime(first.expiresAtMs);
    expect(owner.browserSignInState()).toEqual({ kind: 'idle' });
    expect(owner.readBrowserSignInLink(callbackFor())).toEqual({ kind: 'ignored' });
  });

  it('does not let a mismatched callback consume the active attempt', async () => {
    await owner.startBrowserSignIn();
    expect(owner.readBrowserSignInLink(desktopSignInLink(CODE, 'x'.repeat(43)))).toEqual({
      kind: 'ignored',
    });
    expect(owner.readBrowserSignInLink(callbackFor()).kind).toBe('complete');
  });

  it('clears a failed browser launch so retry gets a fresh attempt', async () => {
    openExternal.mockRejectedValueOnce(new Error('Browser unavailable'));
    await expect(owner.startBrowserSignIn()).rejects.toThrow('Browser unavailable');
    expect(owner.browserSignInState()).toEqual({ kind: 'idle' });
    await owner.startBrowserSignIn();
    expect(callbackFor(1)).not.toBe(callbackFor());
  });

  it('cannot revive a sign-in cancelled while the browser is opening', async () => {
    let opened!: () => void;
    openExternal.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          opened = resolve;
        }),
    );
    const starting = owner.startBrowserSignIn();
    const old = callbackFor();
    owner.cancelBrowserSignIn();
    await owner.startBrowserSignIn();
    opened();
    await expect(starting).rejects.toThrow('cancelled');
    expect(owner.readBrowserSignInLink(old)).toEqual({ kind: 'ignored' });
    expect(owner.readBrowserSignInLink(callbackFor(1)).kind).toBe('complete');
  });

  it('does not clear a newer attempt when an old browser launch fails', async () => {
    let fail!: (cause: Error) => void;
    openExternal.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
    );
    const starting = owner.startBrowserSignIn();
    owner.cancelBrowserSignIn();
    await owner.startBrowserSignIn();
    fail(new Error('Old browser launch failed'));
    await expect(starting).rejects.toThrow('Old browser launch failed');
    expect(owner.readBrowserSignInLink(callbackFor(1)).kind).toBe('complete');
  });
});
