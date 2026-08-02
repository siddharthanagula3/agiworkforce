import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const guardedFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/egressGuard', () => ({ guardedFetch: guardedFetchMock }));
vi.mock('../../lib/runtimeEnvironment', () => ({ isTauri: true }));

import { cloudAccountAuth } from '../../services/cloudAccountAuth';
import { accountBoundCloudFetch } from '../cloudApi';

describe('cloudApi Desktop 401 credential ownership', () => {
  beforeEach(() => {
    guardedFetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not let a late T1 401 invalidate the same account after T2 rotates in', async () => {
    let releaseResponse: ((response: Response) => void) | undefined;
    guardedFetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          releaseResponse = resolve;
        }),
    );
    vi.spyOn(cloudAccountAuth, 'getValidSession').mockResolvedValue({
      access_token: 'token-1',
      user: { id: 'account-a' },
    } as never);
    const getSession = vi.spyOn(cloudAccountAuth, 'getSession').mockReturnValue({
      access_token: 'token-1',
      user: { id: 'account-a' },
    } as never);
    const invalidate = vi.spyOn(cloudAccountAuth, 'invalidateSession').mockResolvedValue();

    const pending = accountBoundCloudFetch('/api/test', undefined, 'account-a');
    await vi.waitFor(() => expect(guardedFetchMock).toHaveBeenCalledOnce());
    const dispatchedHeaders = new Headers(guardedFetchMock.mock.calls[0]?.[1]?.headers);
    expect(dispatchedHeaders.get('Authorization')).toBe('Bearer token-1');

    getSession.mockReturnValue({
      access_token: 'token-2',
      user: { id: 'account-a' },
    } as never);
    releaseResponse?.(new Response(null, { status: 401 }));

    await expect(pending).resolves.toMatchObject({ status: 401 });
    expect(invalidate).not.toHaveBeenCalled();
    expect(cloudAccountAuth.getSession()?.access_token).toBe('token-2');
  });

  it('invalidates when the rejected bearer is still the current credential', async () => {
    guardedFetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const session = {
      access_token: 'current-token',
      user: { id: 'account-a' },
    } as never;
    vi.spyOn(cloudAccountAuth, 'getValidSession').mockResolvedValue(session);
    vi.spyOn(cloudAccountAuth, 'getSession').mockReturnValue(session);
    const invalidate = vi.spyOn(cloudAccountAuth, 'invalidateSession').mockResolvedValue();

    await accountBoundCloudFetch('/api/test', undefined, 'account-a');

    expect(invalidate).toHaveBeenCalledOnce();
  });

  it('reports the exact rotated bearer installed at the final transport boundary', async () => {
    guardedFetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.spyOn(cloudAccountAuth, 'getValidSession').mockResolvedValue({
      access_token: 'rotated-token',
      user: { id: 'account-a' },
    } as never);
    vi.spyOn(cloudAccountAuth, 'getSession').mockReturnValue({
      access_token: 'rotated-token',
      user: { id: 'account-a' },
    } as never);
    const onCredential = vi.fn();

    await accountBoundCloudFetch('/api/test', undefined, 'account-a', undefined, onCredential);

    expect(onCredential).toHaveBeenCalledWith({
      accountId: 'account-a',
      accessToken: 'rotated-token',
    });
    expect(new Headers(guardedFetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer rotated-token',
    );
  });
});
