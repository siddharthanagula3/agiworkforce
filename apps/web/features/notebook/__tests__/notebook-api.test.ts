import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequestAuthority, type SessionAuthority } from '@/lib/identity/request-authority';
import { createNotebookApi } from '../services/notebook-api';

const id = '11111111-1111-4111-8111-111111111111';
const session = {
  id,
  title: 'Notebook',
  repositoryUrl: null,
  networkAccess: 'none',
  state: 'ready',
  workspacePath: '/home/user',
  lastError: null,
  createdAt: '',
  updatedAt: '',
  closedAt: null,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function owned() {
  let current = true;
  const identity: SessionAuthority = {
    userId: 'account-a',
    sessionId: 'login-a',
    isCurrent: () => current,
    getToken: vi.fn(async () => 'token-a'),
  };
  const authority = createRequestAuthority(identity);
  const getCsrfToken = vi.fn(async () => 'unused');
  const api = createNotebookApi({
    fetchImpl: authority.fetch,
    bearerAuthenticated: true,
    assertCurrent: authority.assertCurrent,
    getCsrfToken,
  });
  return {
    api,
    authority,
    identity,
    getCsrfToken,
    expire: () => {
      current = false;
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe('owned notebook transport', () => {
  it('uses original bearer authentication without cookies or ambient CSRF', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ session, ok: true, outputs: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const owner = owned();
    await owner.api.execute(id, { code: '1', language: 'python' });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.credentials).toBe('omit');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-a');
    expect(owner.getCsrfToken).not.toHaveBeenCalled();
  });

  it('does not dispatch when ownership expires during token retrieval', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const owner = owned();
    const token = deferred<string>();
    const retrieving = deferred<void>();
    owner.identity.getToken = () => {
      retrieving.resolve();
      return token.promise;
    };
    const pending = owner.api.runAll(id, {
      cells: [{ id: 'cell', code: '1', language: 'python' }],
      fromTop: true,
    });
    await retrieving.promise;
    owner.expire();
    token.resolve('token-a');
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks ownership after the complete JSON body has been consumed', async () => {
    const body = deferred<unknown>();
    const parsing = deferred<void>();
    const response = new Response('{}');
    vi.spyOn(response, 'json').mockImplementation(() => {
      parsing.resolve();
      return body.promise;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );
    const owner = owned();
    const pending = owner.api.listFiles(id);
    await parsing.promise;
    owner.expire();
    body.resolve({ session, files: [] });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('preserves the browser multipart boundary while binding uploads to the original account', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        session,
        file: { path: 'a.csv', name: 'a.csv', isDir: false, byteSize: 1 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const owner = owned();
    const file = new File(['a'], 'a.csv');
    await owner.api.uploadFile(id, file, file.name);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('Content-Type')).toBeNull();
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-a');
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('path')).toBe('a.csv');
    expect(init?.credentials).toBe('omit');
  });
});
