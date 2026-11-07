import { StrictMode, useEffect } from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudCodeApi } from '@agiworkforce/cloud-contracts';

const identity = vi.hoisted(() => ({ current: true }));
vi.mock('@/lib/identity/useSessionSnapshot', () => ({
  useSessionSnapshot: () => () => {
    let retired = false;
    return {
      userId: 'account-a',
      sessionId: 'session-a',
      getToken: async () => 'token-a',
      isCurrent: () => {
        if (!identity.current) retired = true;
        return !retired;
      },
    };
  },
}));

import { useCloudCodeAuthority } from './use-cloud-code-authority';

beforeEach(() => {
  identity.current = true;
});

describe('managed Code pane authority', () => {
  it('never revives the first StrictMode publication guard', () => {
    const captured: Array<() => boolean> = [];
    const { result, unmount } = renderHook(
      () => {
        const authority = useCloudCodeAuthority();
        useEffect(() => {
          captured.push(authority.capture());
        }, [authority.capture]);
        return authority;
      },
      { wrapper: StrictMode },
    );
    expect(captured).toHaveLength(2);
    expect(captured[0]!()).toBe(false);
    expect(captured[1]!()).toBe(true);
    const last = result.current.capture();
    unmount();
    expect(last()).toBe(false);
  });

  it('retires pending work only in the disposed pane sharing an injected API', async () => {
    type Listing = Awaited<ReturnType<CloudCodeApi['list']>>;
    const resolveCalls: Array<(value: Listing) => void> = [];
    const list: CloudCodeApi['list'] = vi.fn(
      () =>
        new Promise<Listing>((resolve) => {
          resolveCalls.push(resolve);
        }),
    );
    const injected = { list } as unknown as CloudCodeApi;
    const value: Listing = {
      availability: {
        deploymentEnabled: true,
        planEntitled: true,
        planTier: 'pro',
        maxSessions: 5,
      },
      sessions: [],
      runtimes: [],
    };
    const first = renderHook(() => useCloudCodeAuthority(injected));
    const second = renderHook(() => useCloudCodeAuthority(injected));
    const firstGuard = first.result.current.capture();
    const secondGuard = second.result.current.capture();
    const firstPending = first.result.current.api.list();
    const secondPending = second.result.current.api.list();
    expect(list).toHaveBeenCalledTimes(2);
    first.unmount();
    expect(firstGuard()).toBe(false);
    expect(secondGuard()).toBe(true);
    const disposedResult = expect(firstPending).rejects.toMatchObject({ name: 'AbortError' });
    resolveCalls[0]!(value);
    resolveCalls[1]!(value);
    await disposedResult;
    await expect(secondPending).resolves.toBe(value);
    const continued = second.result.current.api.list();
    expect(list).toHaveBeenCalledTimes(3);
    resolveCalls[2]!(value);
    await expect(continued).resolves.toBe(value);
    expect(secondGuard()).toBe(true);
    second.unmount();
  });

  it.each(['resolve', 'reject'] as const)(
    'rejects injected late %s after pane disposal',
    async (outcome) => {
      let resolve!: (value: unknown) => void;
      let reject!: (reason: unknown) => void;
      const list = vi.fn(
        () =>
          new Promise((done, fail) => {
            resolve = done;
            reject = fail;
          }),
      );
      const injected = { list } as unknown as CloudCodeApi;
      const { result, unmount } = renderHook(() => useCloudCodeAuthority(injected));
      const pending = result.current.api.list();
      unmount();
      if (outcome === 'resolve') resolve({ sessions: [] });
      else reject(new Error('Private failure'));
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    },
  );

  it('latches an observed account mismatch for publication', () => {
    const { result, unmount } = renderHook(() => useCloudCodeAuthority());
    const guard = result.current.capture();
    identity.current = false;
    expect(guard()).toBe(false);
    identity.current = true;
    expect(guard()).toBe(false);
    unmount();
  });
});
