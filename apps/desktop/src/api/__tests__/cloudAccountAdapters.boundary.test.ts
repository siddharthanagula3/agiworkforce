import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MANAGED_MEMORY_MAX_PAGE_SIZE } from '@agiworkforce/types';

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
    mocks.fetch.mockReset();
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

  describe('native cloud memory list completion', () => {
    const rows = (count: number, offset = 0) => Array.from({ length: count }, (_, index) => ({
      id: `memory-${offset + index}`,
      content: `Fact ${offset + index}`,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    }));
    const response = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    const pageSize = MANAGED_MEMORY_MAX_PAGE_SIZE;

    it('retains legacy full-page continuation and short-page completion', async () => {
      mocks.fetch
        .mockResolvedValueOnce(response({ memories: rows(pageSize) }))
        .mockResolvedValueOnce(response({ memories: rows(1, pageSize) }));
      const result = await listCloudMemories();
      expect(result).toHaveLength(pageSize + 1);
      expect(result[pageSize]).toEqual({
        id: `memory-${pageSize}`, text: `Fact ${pageSize}`,
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      });
      expect(mocks.fetch.mock.calls[1]?.[0]).toBe(
        `https://cloud.agi.example/api/memory?limit=${pageSize}&offset=${pageSize}`,
      );
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
    });

    it('accepts explicit completion on a full page without an extra request', async () => {
      mocks.fetch.mockResolvedValueOnce(response({ memories: rows(pageSize), hasMore: false }));
      await expect(listCloudMemories()).resolves.toHaveLength(pageSize);
      expect(mocks.fetch).toHaveBeenCalledOnce();
    });

    it('honors continuation on a short page and advances by its actual row count', async () => {
      mocks.fetch
        .mockResolvedValueOnce(response({ memories: rows(2), hasMore: true }))
        .mockResolvedValueOnce(response({ memories: rows(1, 2), hasMore: false }));
      await expect(listCloudMemories()).resolves.toHaveLength(3);
      expect(mocks.fetch.mock.calls[1]?.[0]).toBe(
        `https://cloud.agi.example/api/memory?limit=${pageSize}&offset=2`,
      );
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
    });

    it('rejects a continuing empty page without repeating its offset', async () => {
      mocks.fetch.mockResolvedValueOnce(response({ memories: [], hasMore: true }));
      await expect(listCloudMemories()).rejects.toThrow('complete cloud memory list');
      expect(mocks.fetch).toHaveBeenCalledOnce();
    });

    it.each([null, 'true', 0, {}, undefined])('rejects present nonboolean continuation %s', async (hasMore) => {
      mocks.fetch.mockResolvedValueOnce(response({ memories: [], hasMore }));
      await expect(listCloudMemories()).rejects.toThrow('invalid continuation');
      expect(mocks.fetch).toHaveBeenCalledOnce();
    });

    it.each(['complete', 'continuing', 'legacy'] as const)(
      'handles a full page at the maximum offset: %s', async (terminal) => {
        const pageCount = 10_000 / pageSize + 1;
        for (let offset = 0; offset <= 10_000; offset += pageSize) {
          mocks.fetch.mockResolvedValueOnce(response({
            memories: rows(pageSize, offset),
            ...(terminal === 'legacy' ? {} : { hasMore: offset < 10_000 || terminal === 'continuing' }),
          }));
        }
        if (terminal === 'complete') {
          await expect(listCloudMemories()).resolves.toHaveLength(10_000 + pageSize);
        } else {
          await expect(listCloudMemories()).rejects.toThrow('complete cloud memory list');
        }
        expect(mocks.fetch).toHaveBeenCalledTimes(pageCount);
        expect(mocks.fetch.mock.calls[pageCount - 1]?.[0]).toBe(
          `https://cloud.agi.example/api/memory?limit=${pageSize}&offset=10000`,
        );
      },
    );

    it.each(['row', 'transport', 'json'] as const)('does not return earlier pages after a later %s failure', async (stage) => {
      mocks.fetch.mockResolvedValueOnce(response({ memories: rows(pageSize), hasMore: true }));
      if (stage === 'row') {
        mocks.fetch.mockResolvedValueOnce(response({ memories: [{ id: 'invalid' }], hasMore: false }));
      } else if (stage === 'transport') {
        mocks.fetch.mockRejectedValueOnce(new Error('Response lost'));
      } else {
        mocks.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error('Invalid JSON'); } });
      }
      await expect(listCloudMemories()).rejects.toThrow();
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
    });

    it.each(['account-b:2', 'account-a:2'])(
      'rejects a later page parsed after the boundary changes to %s', async (nextBoundary) => {
        const body = deferred<unknown>();
        mocks.fetch
          .mockResolvedValueOnce(response({ memories: rows(pageSize), hasMore: true }))
          .mockResolvedValueOnce({ ok: true, status: 200, json: () => body.promise });
        const pending = listCloudMemories();
        const settled = pending.then(() => undefined, () => undefined);
        try {
          await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
          boundaryKey = nextBoundary;
        } finally {
          body.resolve({ memories: rows(1, pageSize), hasMore: false });
          await settled;
        }
        await expect(pending).rejects.toThrow('account changed');
        expect(mocks.fetch).toHaveBeenCalledTimes(2);
      },
    );
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
