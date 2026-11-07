import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequestAuthority, type SessionAuthority } from '@/lib/identity/request-authority';
import { createOwnedCloudCodeApi } from './cloud-code-api';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function owner() {
  let current = true;
  const session: SessionAuthority = {
    userId: 'account-a',
    sessionId: 'session-a',
    isCurrent: () => current,
    getToken: vi.fn(async () => 'token-a'),
  };
  return {
    session,
    retire: () => {
      current = false;
    },
  };
}

const listing = {
  availability: { deploymentEnabled: true, planEntitled: true, planTier: 'pro', maxSessions: 5 },
  sessions: [],
};

afterEach(() => vi.unstubAllGlobals());

describe('owned managed Code transport', () => {
  it('captures mutation authority before asynchronous header construction', async () => {
    const first = owner();
    const second = owner();
    second.session.getToken = vi.fn(async () => 'token-b');
    let active = first;
    const capture = vi.fn(() => createRequestAuthority(active.session));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const api = createOwnedCloudCodeApi(capture);
    const pending = api.rename('session-id', 'Renamed');
    expect(capture).toHaveBeenCalledOnce();
    first.retire();
    active = second;
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(second.session.getToken).not.toHaveBeenCalled();
  });

  it('uses only the captured bearer and never cookie or CSRF authentication', async () => {
    const identity = owner();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ deleted: true })),
    );
    vi.stubGlobal('fetch', fetchMock);
    await createOwnedCloudCodeApi(() => createRequestAuthority(identity.session)).deleteSession(
      'id',
    );
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.credentials).toBe('omit');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-a');
    expect(new Headers(init?.headers).has('x-csrf-token')).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([true, false])('rejects stale JSON completion for response ok=%s', async (ok) => {
    const identity = owner();
    const body = deferred<unknown>();
    const parsing = deferred<void>();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok,
            status: ok ? 200 : 403,
            json: () => {
              parsing.resolve();
              return body.promise;
            },
          }) as Response,
      ),
    );
    const pending = createOwnedCloudCodeApi(() => createRequestAuthority(identity.session)).list();
    await parsing.promise;
    identity.retire();
    body.resolve(ok ? listing : { error: { message: 'Private account detail' } });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects retirement while a captured token is pending', async () => {
    const identity = owner();
    const token = deferred<string>();
    identity.session.getToken = () => token.promise;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const pending = createOwnedCloudCodeApi(() => createRequestAuthority(identity.session)).list();
    identity.retire();
    token.resolve('token-a');
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
