import type { WebFetch } from '@/test/fetch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { managedCloudPublishedArtifactDataPath } from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { clearPublishedSiteSharedData, readPublishedSiteData } from './sites-service';

vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: vi.fn() }));
const fetchMock = vi.fn<WebFetch>();
const token = 'a'.repeat(24);
const data = {
  supported: true,
  ownPersonalEntryCount: 0,
  shared: { entries: [], entryCount: 0, totalBytes: 0, limitBytes: 1024 },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function authority() {
  let current = true;
  return {
    retire: () => {
      current = false;
    },
    assertCurrent: () => {
      if (!current) throw new DOMException('Retired', 'AbortError');
    },
    fetch: vi.fn<WebFetch>((input, init) => fetchMock(input, init)),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(addCsrfHeaders).mockResolvedValue({ 'X-CSRF-Token': 'csrf' });
});
afterEach(() => vi.unstubAllGlobals());

describe('Site data authority (UNRUN source fixtures)', () => {
  it.each([0, 4])(
    'preserves canonical cleared=%s with cookies and no receipt additions',
    async (cleared) => {
      fetchMock.mockResolvedValue(Response.json({ cleared }));
      await expect(clearPublishedSiteSharedData(token)).resolves.toBe(cleared);
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        managedCloudPublishedArtifactDataPath(token),
        {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'X-CSRF-Token': 'csrf' },
        },
      );
    },
  );

  it('dispatches through the supplied narrow authority and preserves read signal', async () => {
    const owner = authority();
    const controller = new AbortController();
    fetchMock.mockResolvedValue(Response.json(data));
    await expect(readPublishedSiteData(token, controller.signal, owner)).resolves.toEqual(data);
    expect(owner.fetch).toHaveBeenCalledExactlyOnceWith(
      managedCloudPublishedArtifactDataPath(token),
      {
        credentials: 'include',
        signal: controller.signal,
      },
    );
    fetchMock.mockResolvedValue(Response.json({ cleared: 0 }));
    await expect(clearPublishedSiteSharedData(token, owner)).resolves.toBe(0);
    expect(owner.fetch).toHaveBeenCalledTimes(2);
  });

  it('checks currentness before CSRF preparation or reading', async () => {
    const owner = authority();
    owner.retire();
    await expect(clearPublishedSiteSharedData(token, owner)).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(readPublishedSiteData(token, undefined, owner)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(addCsrfHeaders).not.toHaveBeenCalled();
    expect(owner.fetch).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)(
    'checks retirement after CSRF %s without DELETE',
    async (outcome) => {
      const csrf = deferred<Record<string, string>>();
      vi.mocked(addCsrfHeaders).mockReturnValue(csrf.promise);
      const owner = authority();
      const pending = clearPublishedSiteSharedData(token, owner);
      const result = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      owner.retire();
      if (outcome === 'resolve') csrf.resolve({ 'X-CSRF-Token': 'csrf' });
      else csrf.reject(new Error('late CSRF error'));
      await result;
      expect(owner.fetch).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(['read', 'clear'] as const)(
    'rejects retired %s success or error while decoding',
    async (operation) => {
      for (const status of [200, 403]) {
        const body = deferred<unknown>();
        const entered = deferred<void>();
        const response = Response.json({}, { status });
        vi.spyOn(response, 'json').mockImplementation(() => {
          entered.resolve();
          return body.promise;
        });
        fetchMock.mockResolvedValue(response);
        const owner = authority();
        const pending =
          operation === 'read'
            ? readPublishedSiteData(token, undefined, owner)
            : clearPublishedSiteSharedData(token, owner);
        const result = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        await entered.promise;
        owner.retire();
        body.resolve(
          status === 403 ? { error: 'forbidden' } : operation === 'read' ? data : { cleared: 0 },
        );
        await result;
        expect(owner.fetch).toHaveBeenCalledTimes(1);
      }
    },
  );

  it.each(['read', 'clear'] as const)(
    'checks retirement before propagating a late %s fetch failure',
    async (operation) => {
      const response = deferred<Response>();
      fetchMock.mockReturnValue(response.promise);
      const owner = authority();
      const entered = deferred<void>();
      owner.fetch.mockImplementation((input, init) => {
        entered.resolve();
        return fetchMock(input, init);
      });
      const pending =
        operation === 'read'
          ? readPublishedSiteData(token, undefined, owner)
          : clearPublishedSiteSharedData(token, owner);
      const result = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      await entered.promise;
      owner.retire();
      response.reject(new Error('late transport failure'));
      await result;
    },
  );

  it('preserves current clear errors and does not dispatch retries', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'Clear refused' }, { status: 403 }));
    await expect(clearPublishedSiteSharedData(token, authority())).rejects.toThrow('Clear refused');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
