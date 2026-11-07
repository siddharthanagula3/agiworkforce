import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { managedCloudPublishedArtifactVersionPath } from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { republishArtifactVersion } from './sites-service';

vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: vi.fn() }));

const fetchMock = vi.fn<typeof fetch>();
const artifact = { token: 'a'.repeat(24), artifactId: 'untrusted-client-artifact' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(addCsrfHeaders).mockResolvedValue({ 'X-CSRF-Token': 'restore-csrf' });
});
afterEach(() => vi.unstubAllGlobals());

describe('republishArtifactVersion canonical restore (UNRUN source fixtures)', () => {
  it('makes one bodyless credentialed CSRF POST without fetching a snapshot', async () => {
    fetchMock.mockResolvedValue(Response.json({ token: artifact.token, version: 8 }));
    await republishArtifactVersion(artifact, 7);
    expect(addCsrfHeaders).toHaveBeenCalledExactlyOnceWith();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      managedCloudPublishedArtifactVersionPath(artifact.token, 7),
      { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': 'restore-csrf' } },
    );
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it.each([404, 405, 409, 403, 500])('does not fall back to Publish after %s', async (status) => {
    fetchMock.mockResolvedValue(Response.json({ error: { message: 'Restore refused' } }, { status }));
    await expect(republishArtifactVersion(artifact, 7)).rejects.toThrow('Restore refused');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      managedCloudPublishedArtifactVersionPath(artifact.token, 7),
    );
  });

  it('reports malformed error bodies without making another request', async () => {
    fetchMock.mockResolvedValue(new Response('not JSON', { status: 405 }));
    await expect(republishArtifactVersion(artifact, 7)).rejects.toThrow('Failed to put that version live');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not send a request if CSRF preparation fails', async () => {
    vi.mocked(addCsrfHeaders).mockRejectedValue(new Error('CSRF unavailable'));
    await expect(republishArtifactVersion(artifact, 7)).rejects.toThrow('CSRF unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe.each(['ordinary', 'authority'] as const)('%s restore acknowledgement (UNRUN source fixtures)', (mode) => {
  function authority() {
    return mode === 'ordinary' ? undefined : createRequestAuthority({
      userId: 'account-a', sessionId: 'session-a', isCurrent: () => true,
      getToken: async () => 'captured-token',
    });
  }

  it.each([1, 7, 9])('accepts matching publication version %s without an equality or increase rule', async (version) => {
    fetchMock.mockResolvedValue(Response.json({ token: artifact.token, version }));
    await expect(republishArtifactVersion(artifact, 7, authority())).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    null, [], 'receipt', {}, { token: artifact.token }, { version: 8 },
    { token: 'b'.repeat(24), version: 8 }, { token: '', version: 8 },
    { token: artifact.token, version: '8' }, { token: artifact.token, version: null },
    { token: artifact.token, version: 0 }, { token: artifact.token, version: -1 },
    { token: artifact.token, version: 1.5 },
    { token: artifact.token, version: Number.MAX_SAFE_INTEGER + 1 },
  ].map((body) => ({ body })))('reports an unconfirmed outcome for invalid successful receipt $body', async ({ body }) => {
    fetchMock.mockResolvedValue(Response.json(body));
    await expect(republishArtifactVersion(artifact, 7, authority())).rejects.toThrow(
      'This version restore could not be confirmed. It may have taken effect.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(managedCloudPublishedArtifactVersionPath(artifact.token, 7));
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it.each(['empty', 'malformed', 'unreadable'] as const)('reports an unconfirmed %s successful body without retry', async (body) => {
    const response = body === 'empty' ? new Response(null, { status: 204 }) : new Response('not JSON');
    if (body === 'unreadable') vi.spyOn(response, 'json').mockRejectedValue(new Error('body unavailable'));
    fetchMock.mockResolvedValue(response);
    await expect(republishArtifactVersion(artifact, 7, authority())).rejects.toThrow('It may have taken effect');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['original', 'mutated'] as const)('pins the target before CSRF and validates the %s receipt against it', async (receiptTarget) => {
    const target = { ...artifact };
    const csrf = deferred<Record<string, string>>();
    vi.mocked(addCsrfHeaders).mockReturnValue(csrf.promise);
    fetchMock.mockResolvedValue(Response.json({
      token: receiptTarget === 'original' ? artifact.token : 'b'.repeat(24), version: 8,
    }));
    const pending = republishArtifactVersion(target, 7, authority());
    const result = receiptTarget === 'original'
      ? expect(pending).resolves.toBeUndefined()
      : expect(pending).rejects.toThrow('It may have taken effect');
    target.token = 'b'.repeat(24);
    csrf.resolve({ 'X-CSRF-Token': 'restore-csrf' });
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(managedCloudPublishedArtifactVersionPath(artifact.token, 7));
  });

  it('does not accept a mutated target while reading the receipt', async () => {
    const target = { ...artifact };
    const body = deferred<unknown>();
    const entered = deferred<void>();
    const response = Response.json({});
    vi.spyOn(response, 'json').mockImplementation(() => { entered.resolve(); return body.promise; });
    fetchMock.mockResolvedValue(response);
    const pending = republishArtifactVersion(target, 7, authority());
    const rejected = expect(pending).rejects.toThrow('It may have taken effect');
    await entered.promise;
    target.token = 'b'.repeat(24);
    body.resolve({ token: target.token, version: 8 });
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
