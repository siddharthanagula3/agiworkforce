import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createManagedCloudRequestContext: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('../cloudApi', () => ({
  CLOUD_API_BASE_URL: 'https://cloud.agi.example',
  accountBoundCloudFetch: mocks.fetch,
  getAuthHeaders: async () => ({ Authorization: 'Bearer live-account-a-token' }),
}));
vi.mock('../config', () => ({
  WEB_APP_URL: 'https://cloud.agi.example',
  desktopRequestHeaders: () => ({}),
}));
vi.mock('../../services/managedCloudRequestContext', () => ({
  createManagedCloudRequestContext: mocks.createManagedCloudRequestContext,
}));

import { exportCloudAccountData } from '../cloudAccountData';
import {
  listCloudSharedLinks,
  requestCloudAccountDeletion,
  revokeCloudApiKey,
  revokeCloudSession,
} from '../cloudAccountSettings';
import { disconnectConnector } from '../cloudConnectors';
import { listCloudMemories } from '../cloudMemory';
import { listCloudSkills } from '../cloudSkills';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('Desktop Managed Cloud account adapter boundaries', () => {
  let boundaryKey = 'account-a:1';

  beforeEach(() => {
    vi.clearAllMocks();
    boundaryKey = 'account-a:1';
    mocks.createManagedCloudRequestContext.mockImplementation(() => {
      const capturedKey = boundaryKey;
      const assertBoundary = () => {
        if (boundaryKey !== capturedKey) {
          throw new Error('The Managed Cloud account changed while this request was in progress.');
        }
      };
      return {
        assertBoundary,
        fetch: mocks.fetch,
        getHeaders: async () => {
          assertBoundary();
          return { Authorization: 'Bearer live-account-a-token' };
        },
      };
    });
  });

  it('uses a fresh pinned bearer context for export, memory, and skill reads', async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response('reviewed export', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ memories: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ skills: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await expect(exportCloudAccountData()).resolves.toBe('reviewed export');
    await expect(listCloudMemories()).resolves.toEqual([]);
    await expect(listCloudSkills()).resolves.toEqual([]);

    expect(mocks.createManagedCloudRequestContext.mock.calls.map(([label]) => label)).toEqual([
      'Cloud account export',
      'Cloud memory',
      'Cloud skill catalog',
    ]);
    for (const [, init] of mocks.fetch.mock.calls as Array<[string, RequestInit]>) {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer live-account-a-token');
    }
  });

  it('rejects a deferred account A read after its body parses under account B', async () => {
    const body = deferred<unknown>();
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => body.promise,
    } as Response);
    const pending = listCloudSharedLinks();
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());

    boundaryKey = 'account-b:2';
    body.resolve({ shares: [] });

    await expect(pending).rejects.toThrow('account changed');
  });

  it.each(['account-b:2', 'account-a:2'])(
    'rejects deletion after its body resolves under %s', async (nextBoundary) => {
      const body = deferred<unknown>();
      mocks.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => body.promise });
      const pending = requestCloudAccountDeletion();
      await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
      boundaryKey = nextBoundary;
      body.resolve({
        message: 'Deletion scheduled', scheduledFor: '2026-11-06T18:00:00.000Z',
        status: 'pending', statusReason: 'Grace window pending',
      });
      await expect(pending).rejects.toThrow('account changed');
      expect(mocks.fetch).toHaveBeenCalledOnce();
    },
  );

  it.each(['network', 'json'])(
    'preserves the boundary failure before wrapping %s uncertainty', async (stage) => {
      const fail = async () => {
        boundaryKey = 'account-b:2';
        throw new Error('Response lost');
      };
      if (stage === 'network') mocks.fetch.mockImplementationOnce(fail);
      else mocks.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: fail });
      await expect(requestCloudAccountDeletion()).rejects.toThrow('account changed');
      expect(mocks.fetch).toHaveBeenCalledOnce();
    },
  );

  it('rejects a destructive response after a same-account session epoch changes', async () => {
    const response = deferred<Response>();
    mocks.fetch.mockReturnValue(response.promise);
    const pending = revokeCloudSession('session-1');
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());

    boundaryKey = 'account-a:2';
    response.resolve(new Response(null, { status: 200 }));

    await expect(pending).rejects.toThrow('account changed');
  });

  it.each([
    ['delete account', () => requestCloudAccountDeletion()],
    ['revoke session', () => revokeCloudSession('session-1')],
    ['revoke API key', () => revokeCloudApiKey('key-1')],
    ['disconnect connector', () => disconnectConnector('github')],
  ] as const)(
    'blocks %s egress when A changes to B during header resolution',
    async (_name, run) => {
      const headersStarted = deferred<void>();
      const releaseHeaders = deferred<void>();
      mocks.createManagedCloudRequestContext.mockImplementationOnce(() => {
        const capturedKey = boundaryKey;
        const assertBoundary = () => {
          if (boundaryKey !== capturedKey) {
            throw new Error(
              'The Managed Cloud account changed while this request was in progress.',
            );
          }
        };
        return {
          assertBoundary,
          fetch: mocks.fetch,
          getHeaders: async () => {
            headersStarted.resolve();
            await releaseHeaders.promise;
            assertBoundary();
            return { Authorization: 'Bearer stale-account-a-token' };
          },
        };
      });
      const pending = run();
      await headersStarted.promise;

      boundaryKey = 'account-b:2';
      releaseHeaders.resolve();

      await expect(pending).rejects.toThrow('account changed');
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );
});
