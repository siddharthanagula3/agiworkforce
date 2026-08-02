import { beforeEach, describe, expect, it, vi } from 'vitest';

let currentAccountId = 'account-a';

const {
  accountBoundCloudFetch,
  assertManagedCloudBoundary,
  captureManagedCloudBoundary,
  getAuthHeaders,
  guardedFetch,
  subscribeManagedCloudBoundary,
  unsubscribeManagedCloudBoundary,
} = vi.hoisted(() => ({
  accountBoundCloudFetch: vi.fn(),
  assertManagedCloudBoundary: vi.fn(),
  captureManagedCloudBoundary: vi.fn(),
  getAuthHeaders: vi.fn(),
  guardedFetch: vi.fn(),
  subscribeManagedCloudBoundary: vi.fn(),
  unsubscribeManagedCloudBoundary: vi.fn(),
}));

vi.mock('../../api/cloudApi', () => ({
  accountBoundCloudFetch,
  getAuthHeaders,
}));

vi.mock('../../lib/egressGuard', () => ({ guardedFetch }));

vi.mock('../managedCloudBoundary', () => ({
  assertManagedCloudBoundary,
  captureManagedCloudBoundary,
  subscribeManagedCloudBoundary,
}));

import { createManagedCloudRequestContext } from '../managedCloudRequestContext';

describe('createManagedCloudRequestContext', () => {
  let invalidateBoundary: (() => void) | undefined;

  beforeEach(() => {
    currentAccountId = 'account-a';
    invalidateBoundary = undefined;
    vi.clearAllMocks();
    captureManagedCloudBoundary.mockReturnValue({
      accountId: 'account-a',
      accessToken: 'token-a1',
    });
    assertManagedCloudBoundary.mockImplementation((boundary: { accountId: string }) => {
      if (boundary.accountId !== currentAccountId) {
        throw new Error('The Managed Cloud account changed while this request was in progress.');
      }
    });
    getAuthHeaders.mockResolvedValue({ Authorization: 'Bearer token-a2' });
    accountBoundCloudFetch.mockResolvedValue(new Response(null, { status: 204 }));
    guardedFetch.mockResolvedValue(new Response(null, { status: 200 }));
    subscribeManagedCloudBoundary.mockImplementation((_boundary, listener: () => void) => {
      invalidateBoundary = listener;
      return unsubscribeManagedCloudBoundary;
    });
  });

  it('pins header and transport resolution to one account while allowing token rotation', async () => {
    const request = createManagedCloudRequestContext('Managed Cloud projects');

    await expect(request.getHeaders()).resolves.toEqual({ Authorization: 'Bearer token-a2' });
    await request.fetch('https://cloud.example.test/api/projects', {
      headers: { Authorization: 'Bearer token-a1' },
    });

    expect(getAuthHeaders).toHaveBeenCalledWith('account-a');
    expect(accountBoundCloudFetch).toHaveBeenCalledWith(
      'https://cloud.example.test/api/projects',
      { headers: { Authorization: 'Bearer token-a1' } },
      'account-a',
      expect.any(Function),
    );
  });

  it('blocks authenticated and signed-upload egress after account A changes to B', async () => {
    const request = createManagedCloudRequestContext('Managed Cloud project knowledge upload');
    currentAccountId = 'account-b';

    expect(() => request.fetch('https://cloud.example.test/api/projects')).toThrow(
      'account changed',
    );
    await expect(
      request.fetchExternal('https://storage.example.test/signed-upload', {
        method: 'PUT',
      }),
    ).rejects.toThrow('account changed');

    expect(accountBoundCloudFetch).not.toHaveBeenCalled();
    expect(guardedFetch).not.toHaveBeenCalled();
  });

  it('rechecks ownership after asynchronous header resolution', async () => {
    const request = createManagedCloudRequestContext('Managed Cloud schedules');
    getAuthHeaders.mockImplementationOnce(async () => {
      currentAccountId = 'account-b';
      return { Authorization: 'Bearer token-a2' };
    });

    await expect(request.getHeaders()).rejects.toThrow('account changed');
    expect(accountBoundCloudFetch).not.toHaveBeenCalled();
  });

  it('aborts a deferred signed upload when its Managed Cloud authority changes', async () => {
    guardedFetch.mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(signal.reason);
            return;
          }
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    const request = createManagedCloudRequestContext('Managed Cloud project knowledge upload');
    const pending = request.fetchExternal('https://storage.example.test/signed-upload', {
      method: 'PUT',
      body: new Blob(['private project knowledge']),
    });
    await vi.waitFor(() => expect(guardedFetch).toHaveBeenCalledOnce());

    invalidateBoundary?.();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const signal = guardedFetch.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(signal.aborted).toBe(true);
    expect(unsubscribeManagedCloudBoundary).toHaveBeenCalledOnce();
  });
});
