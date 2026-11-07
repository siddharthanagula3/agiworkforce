import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequestAuthority, type SessionAuthority } from '../request-authority';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function session() {
  let current = true;
  const identity: SessionAuthority = {
    userId: 'account-a',
    sessionId: 'session-a',
    isCurrent: () => current,
    getToken: vi.fn(async () => 'token-a'),
  };
  return {
    identity,
    switchAccount: () => {
      current = false;
    },
    restoreAccount: () => {
      current = true;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('immutable request authority', () => {
  it('rejects retirement during captured token acquisition without issuing a request', async () => {
    const owner = session();
    const token = deferred<string>();
    owner.identity.getToken = () => token.promise;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const authority = createRequestAuthority(owner.identity);
    const request = authority.fetch('/api/chat/conversations', { method: 'POST' });
    owner.switchAccount();
    token.resolve('token-a');
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('latches an observed owner mismatch even after the account returns', () => {
    const owner = session();
    const authority = createRequestAuthority(owner.identity);
    owner.switchAccount();
    expect(authority.isCurrent()).toBe(false);
    owner.restoreAccount();
    expect(authority.isCurrent()).toBe(false);
    expect(authority.signal.aborted).toBe(true);
  });

  it('overrides replacement credentials and cookie authentication', async () => {
    const owner = session();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}'),
    );
    vi.stubGlobal('fetch', fetchMock);
    await createRequestAuthority(owner.identity).fetch('/api/chat/conversations', {
      headers: { Authorization: 'Bearer token-b' },
      credentials: 'include',
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-a');
    expect(init.credentials).toBe('omit');
  });

  it('rejects signed storage and external destinations before retrieving a token', async () => {
    const owner = session();
    const authority = createRequestAuthority(owner.identity);
    await expect(authority.fetch('https://storage.example/upload')).rejects.toThrow(
      'same-origin API',
    );
    expect(owner.identity.getToken).not.toHaveBeenCalled();
  });

  it('rejects a late response from a retired operation', async () => {
    const owner = session();
    const reply = deferred<Response>();
    const issued = deferred<void>();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        issued.resolve();
        return reply.promise;
      }),
    );
    const authority = createRequestAuthority(owner.identity);
    const request = authority.fetch('/api/chat/conversations');
    await issued.promise;
    authority.retire();
    reply.resolve(new Response('{}'));
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('keeps owner credentials usable for partial save after transport-only Stop', async () => {
    const owner = session();
    const authority = createRequestAuthority(owner.identity);
    const generation = new AbortController();
    generation.abort();
    expect(authority.isCurrent()).toBe(true);
    await expect(authority.getToken()).resolves.toBe('token-a');
    authority.retire();
    await expect(authority.getToken()).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('request dispatch observation source fixtures (unexecuted)', () => {
  it('does not observe dispatch before token resolution or after owner retirement', async () => {
    const owner = session();
    const token = deferred<string>();
    owner.identity.getToken = () => token.promise;
    const dispatched = vi.fn();
    const transport = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', transport);
    const authority = createRequestAuthority(owner.identity, () => true, dispatched);
    const request = authority.fetch('/api/memory', { method: 'POST' });
    const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(dispatched).not.toHaveBeenCalled();
    owner.switchAccount();
    token.resolve('retired-token');
    await rejected;
    expect(dispatched).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it('observes exactly one dispatch immediately before each fetch invocation', async () => {
    const owner = session();
    const order: string[] = [];
    const dispatched = vi.fn(() => {
      order.push('dispatch');
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        order.push('fetch');
        return new Response('{}');
      }),
    );
    const authority = createRequestAuthority(owner.identity, () => true, dispatched);
    await authority.getToken();
    expect(dispatched).not.toHaveBeenCalled();
    await authority.fetch('/api/memory', { method: 'POST' });
    expect(dispatched).toHaveBeenCalledTimes(1);
    await authority.fetch('/api/memory', { method: 'GET' });
    expect(dispatched).toHaveBeenCalledTimes(2);
    expect(order).toEqual(['dispatch', 'fetch', 'dispatch', 'fetch']);
  });

  it('reports invocation, not proof that an already-aborted request reached a server', async () => {
    const owner = session();
    const input = new AbortController();
    input.abort();
    const dispatched = vi.fn();
    const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      expect(init?.signal?.aborted).toBe(true);
      throw new DOMException('Aborted input', 'AbortError');
    });
    vi.stubGlobal('fetch', transport);
    const authority = createRequestAuthority(owner.identity, () => true, dispatched);
    await expect(authority.fetch('/api/memory', { signal: input.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(dispatched).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
