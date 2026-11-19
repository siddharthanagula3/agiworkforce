import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  disableWebPush: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@clerk/nextjs', async (importOriginal) => ({
  ...(await importOriginal()),
  useClerk: () => ({ signOut: mocks.signOut }),
}));
type LocalRuntimeContractModule = typeof import('@agiworkforce/local-runtime-contract');

vi.mock('@agiworkforce/local-runtime-contract', async (importOriginal) => ({
  ...(await importOriginal<LocalRuntimeContractModule>()),
  getHostBridge: () => null,
}));
vi.mock('@/features/notifications/lib/web-push-client', () => ({
  disableWebPush: mocks.disableWebPush,
}));

const { useSignOut } = await import('../client');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.length = 0;
  mocks.disableWebPush.mockImplementation(async () => {
    mocks.order.push('push');
    return true;
  });
  mocks.signOut.mockImplementation(async () => {
    mocks.order.push('signOut');
  });
});

describe('useSignOut', () => {
  it('revokes this browser push registration before ending the provider session', async () => {
    const { result } = renderHook(useSignOut);

    await result.current({ redirectUrl: '/login' });

    expect(mocks.order).toEqual(['push', 'signOut']);
  });

  it('still signs out when push revocation throws', async () => {
    mocks.disableWebPush.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(useSignOut);

    await result.current({ redirectUrl: '/login' });

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it('leaves the registration alone when ending one named session', async () => {
    const { result } = renderHook(useSignOut);

    await result.current({ sessionId: 'session-other', redirectUrl: '/login' });

    expect(mocks.disableWebPush).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });
});
