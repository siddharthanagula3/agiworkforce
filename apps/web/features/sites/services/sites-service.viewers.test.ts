import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { managedCloudPublishedArtifactViewersPath } from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { changeSiteViewer, listSiteViewers } from './sites-service';

vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: vi.fn() }));
const fetchMock = vi.fn<typeof fetch>();
const token = 'a'.repeat(24);
const viewers = [{ email: 'ana@example.com', invitedAt: 'now' }];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function authority() {
  let current = true;
  return {
    retire: () => { current = false; },
    assertCurrent: () => { if (!current) throw new DOMException('Retired', 'AbortError'); },
    fetch: vi.fn<typeof fetch>((input, init) => fetchMock(input, init)),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async () => Response.json({ viewers }));
  vi.mocked(addCsrfHeaders).mockResolvedValue({ 'X-CSRF-Token': 'csrf' });
});
afterEach(() => vi.unstubAllGlobals());

describe('Viewer helper authority (UNRUN source fixtures)', () => {
  it.each(['add', 'remove'] as const)('preserves canonical %s response, request and optional callers', async (action) => {
    await expect(changeSiteViewer(token, viewers[0]!.email, action)).resolves.toEqual(viewers);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(managedCloudPublishedArtifactViewersPath(token), {
      method: action === 'add' ? 'POST' : 'DELETE', credentials: 'include',
      headers: { 'X-CSRF-Token': 'csrf' }, body: JSON.stringify({ email: viewers[0]!.email }),
    });
    expect(addCsrfHeaders).toHaveBeenCalledWith({ 'Content-Type': 'application/json' });
  });

  it('routes reads through the narrow authority preserving cookies and signal', async () => {
    const owner = authority();
    const controller = new AbortController();
    await expect(listSiteViewers(token, controller.signal, owner)).resolves.toEqual(viewers);
    expect(owner.fetch).toHaveBeenCalledExactlyOnceWith(managedCloudPublishedArtifactViewersPath(token), {
      credentials: 'include', signal: controller.signal,
    });
  });

  it.each(['add', 'remove'] as const)('rejects retired %s before preparation and after deferred CSRF', async (action) => {
    const retired = authority();
    retired.retire();
    await expect(changeSiteViewer(token, viewers[0]!.email, action, retired)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(listSiteViewers(token, undefined, retired)).rejects.toMatchObject({ name: 'AbortError' });
    expect(addCsrfHeaders).not.toHaveBeenCalled();
    for (const outcome of ['resolve', 'reject'] as const) {
      const csrf = deferred<Record<string, string>>();
      vi.mocked(addCsrfHeaders).mockReturnValueOnce(csrf.promise);
      const owner = authority();
      const pending = changeSiteViewer(token, viewers[0]!.email, action, owner);
      const result = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      owner.retire();
      if (outcome === 'resolve') csrf.resolve({ 'X-CSRF-Token': 'csrf' });
      else csrf.reject(new Error('late CSRF failure'));
      await result;
      expect(owner.fetch).not.toHaveBeenCalled();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['read', 'add', 'remove'] as const)('rejects retired %s bodies and failures', async (operation) => {
    for (const outcome of ['success', 'http-error', 'decode-error', 'transport-error'] as const) {
      const entered = deferred<void>();
      const body = deferred<unknown>();
      const transport = deferred<Response>();
      const response = Response.json({}, { status: outcome === 'http-error' ? 403 : 200 });
      vi.spyOn(response, 'json').mockImplementation(() => { entered.resolve(); return body.promise; });
      const owner = authority();
      owner.fetch.mockImplementationOnce(() => {
        if (outcome === 'transport-error') { entered.resolve(); return transport.promise; }
        return Promise.resolve(response);
      });
      const pending = operation === 'read' ? listSiteViewers(token, undefined, owner)
        : changeSiteViewer(token, viewers[0]!.email, operation, owner);
      const result = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      await entered.promise;
      owner.retire();
      if (outcome === 'transport-error') transport.reject(new Error('late fetch failure'));
      else if (outcome === 'decode-error') body.reject(new Error('late decode failure'));
      else body.resolve(outcome === 'http-error' ? { error: 'forbidden' } : { viewers });
      await result;
      expect(owner.fetch).toHaveBeenCalledTimes(1);
    }
  });

  it.each(['add', 'remove'] as const)('preserves active %s errors without replay', async (action) => {
    fetchMock.mockResolvedValue(Response.json({ error: 'Access change refused' }, { status: 403 }));
    await expect(changeSiteViewer(token, viewers[0]!.email, action, authority())).rejects.toThrow('Access change refused');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
