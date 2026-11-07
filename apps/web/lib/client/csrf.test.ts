import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  API_CONTRACT_VERSION,
  API_VERSION_REQUEST_HEADER,
  CLIENT_VERSION_HEADER,
  REQUEST_ID_HEADER,
  isWellFormedRequestId,
} from '@agiworkforce/cloud-contracts';

import { addCsrfHeaders, clearCsrfToken, getCsrfToken } from './csrf';

const TOKEN = 'csrf-token-1';
const EXPIRES_IN_MS = 60 * 60 * 1000;

const headerInputs: Array<{
  name: string;
  create: () => { headers: HeadersInit; mutate: () => void };
}> = [
  {
    name: 'object',
    create: () => {
      const headers = { Authorization: 'Bearer original', 'Content-Type': 'application/json' };
      return {
        headers,
        mutate: () => {
          headers.Authorization = 'Bearer replacement';
        },
      };
    },
  },
  {
    name: 'Headers instance',
    create: () => {
      const headers = new Headers({
        Authorization: 'Bearer original',
        'Content-Type': 'application/json',
      });
      return {
        headers,
        mutate: () => {
          headers.set('Authorization', 'Bearer replacement');
        },
      };
    },
  },
  {
    name: 'tuple array',
    create: () => {
      const authorization: [string, string] = ['Authorization', 'Bearer original'];
      const headers: [string, string][] = [
        authorization,
        ['Content-Type', 'application/json'],
      ];
      return {
        headers,
        mutate: () => {
          authorization[1] = 'Bearer replacement';
        },
      };
    },
  },
];

function deferredFetch(): {
  fetchMock: ReturnType<typeof vi.fn>;
  resolve: () => void;
} {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  const fetchMock = vi.fn(async () => {
    await gate;
    return {
      ok: true,
      json: async () => ({ token: TOKEN, expiresIn: EXPIRES_IN_MS }),
    } as unknown as Response;
  });
  return {
    fetchMock,
    resolve: () => release?.(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('CSRF acquisition retirement', () => {
  beforeEach(() => {
    clearCsrfToken();
  });

  afterEach(() => {
    clearCsrfToken();
    vi.unstubAllGlobals();
  });

  it.each([
    'fetch-success',
    'fetch-failure',
    'http-failure',
    'json-success',
    'json-failure',
  ] as const)('retires immediately and preserves the newer pending slot after late %s', async (outcome) => {
    const oldFetch = deferred<Response>();
    const oldBody = deferred<{ token: string; expiresIn: number }>();
    const bodyStarted = deferred<void>();
    const nextFetch = deferred<Response>();
    const response = {
      ok: true,
      json: vi.fn(() => {
        bodyStarted.resolve();
        return oldBody.promise;
      }),
    } as unknown as Response;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => oldFetch.promise)
      .mockImplementationOnce(() => nextFetch.promise);
    vi.stubGlobal('fetch', fetchMock);

    const old = getCsrfToken();
    const joined = addCsrfHeaders();
    const oldRejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    const joinedRejected = expect(joined).rejects.toMatchObject({ name: 'AbortError' });
    const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal;
    if (outcome.startsWith('json-')) {
      oldFetch.resolve(response);
      await bodyStarted.promise;
    }

    clearCsrfToken();
    const next = getCsrfToken();
    await Promise.all([oldRejected, joinedRejected]);
    expect(signal?.aborted).toBe(true);

    if (outcome === 'fetch-failure') {
      oldFetch.reject(new Error('Late network failure'));
    } else if (outcome === 'http-failure') {
      oldFetch.resolve({ ok: false, status: 503, statusText: 'Unavailable' } as Response);
    } else if (outcome === 'fetch-success') {
      oldBody.resolve({ token: 'retired', expiresIn: EXPIRES_IN_MS });
      oldFetch.resolve(response);
    } else if (outcome === 'json-failure') {
      oldBody.reject(new Error('Late JSON failure'));
    } else {
      oldBody.resolve({ token: 'retired', expiresIn: EXPIRES_IN_MS });
    }
    await oldFetch.promise.catch(() => undefined);
    if (outcome.startsWith('json-')) await oldBody.promise.catch(() => undefined);
    await Promise.resolve();

    const nextJoined = getCsrfToken();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    nextFetch.resolve({
      ok: true,
      json: async () => ({ token: 'current', expiresIn: EXPIRES_IN_MS }),
    } as Response);
    await expect(next).resolves.toBe('current');
    await expect(nextJoined).resolves.toBe('current');
    await expect(getCsrfToken()).resolves.toBe('current');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cannot replace a newer cached token when a retired JSON body finishes last', async () => {
    const oldBody = deferred<{ token: string; expiresIn: number }>();
    const bodyStarted = deferred<void>();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => {
          bodyStarted.resolve();
          return oldBody.promise;
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'current', expiresIn: EXPIRES_IN_MS }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const old = getCsrfToken();
    const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    await bodyStarted.promise;
    clearCsrfToken();
    await rejected;
    await expect(getCsrfToken()).resolves.toBe('current');
    oldBody.resolve({ token: 'retired', expiresIn: EXPIRES_IN_MS });
    await oldBody.promise;
    await Promise.resolve();

    await expect(getCsrfToken()).resolves.toBe('current');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('drops a completed cache entry without retracting an already resolved token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'previous', expiresIn: EXPIRES_IN_MS }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'current', expiresIn: EXPIRES_IN_MS }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const completed = getCsrfToken();
    await expect(completed).resolves.toBe('previous');
    clearCsrfToken();
    await expect(completed).resolves.toBe('previous');
    await expect(getCsrfToken()).resolves.toBe('current');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('csrf token fetching', () => {
  beforeEach(() => {
    clearCsrfToken();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearCsrfToken();
  });

  it('issues one request when several callers ask at once on a cold cache', async () => {
    const { fetchMock, resolve } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);

    const pending = Promise.all([getCsrfToken(), getCsrfToken(), addCsrfHeaders({})]);
    resolve();
    const [first, second, headers] = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(TOKEN);
    expect(second).toBe(TOKEN);
    expect(headers).toMatchObject({ 'x-csrf-token': TOKEN });
  });

  it('refetches after a failure rather than caching the rejection', async () => {
    const failing = vi.fn(async () => ({ ok: false, statusText: 'nope' }) as unknown as Response);
    vi.stubGlobal('fetch', failing);
    await expect(getCsrfToken()).rejects.toThrow();

    const { fetchMock, resolve } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);
    const pending = getCsrfToken();
    resolve();

    await expect(pending).resolves.toBe(TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('CSRF header decoration', () => {
  beforeEach(() => {
    clearCsrfToken();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    clearCsrfToken();
  });

  it.each(headerInputs)('preserves $name headers without mutating the input', async ({ create }) => {
    const { headers } = create();
    const before = Array.from(new Headers(headers).entries());
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await addCsrfHeaders(headers, TOKEN);
    const decorated = new Headers(result);

    expect(decorated.get('authorization')).toBe('Bearer original');
    expect(decorated.get('content-type')).toBe('application/json');
    expect(decorated.get('x-csrf-token')).toBe(TOKEN);
    expect(Array.from(new Headers(headers).entries())).toEqual(before);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    const record = result as Record<string, string>;
    const spread = new Headers({ ...record, 'x-step-up-token': 'step-up' });
    expect(spread.get('authorization')).toBe('Bearer original');
    expect(spread.get('x-csrf-token')).toBe(TOKEN);
    expect(spread.get('x-step-up-token')).toBe('step-up');
  });

  it.each(headerInputs)('snapshots $name headers before awaiting a token', async ({ create }) => {
    const { headers, mutate } = create();
    const { fetchMock, resolve } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);

    const pending = addCsrfHeaders(headers);
    mutate();
    resolve();
    const result = new Headers(await pending);

    expect(result.get('authorization')).toBe('Bearer original');
    expect(result.get('x-csrf-token')).toBe(TOKEN);
    expect(new Headers(headers).get('authorization')).toBe('Bearer replacement');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('combines ordinary duplicate tuple headers using HTTP semantics', async () => {
    const result = await addCsrfHeaders(
      [
        ['X-Example', 'first'],
        ['x-example', 'second'],
      ],
      TOKEN,
    );

    expect(new Headers(result).get('x-example')).toBe('first, second');
    expect(Object.keys(result)).not.toContain('0');
    expect(new Headers(result).has('content-type')).toBe(false);
  });

  it('replaces mixed-case owned headers rather than combining stale and generated values', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '  fixture-build  ');
    const result = await addCsrfHeaders(
      {
        'X-CSRF-Token': 'stale-csrf',
        'x-csrf-token': 'another-stale-csrf',
        [API_VERSION_REQUEST_HEADER.toUpperCase()]: 'stale-contract',
        [REQUEST_ID_HEADER.toUpperCase()]: 'stale-request',
        [CLIENT_VERSION_HEADER.toUpperCase()]: 'stale-build',
      },
      TOKEN,
    );
    const decorated = new Headers(result);

    expect(decorated.get('x-csrf-token')).toBe(TOKEN);
    expect(decorated.get(API_VERSION_REQUEST_HEADER)).toBe(API_CONTRACT_VERSION);
    expect(decorated.get(CLIENT_VERSION_HEADER)).toBe('fixture-build');
    expect(isWellFormedRequestId(decorated.get(REQUEST_ID_HEADER))).toBe(true);
    expect(decorated.get(REQUEST_ID_HEADER)).not.toBe('stale-request');
    expect(Object.keys(result)).toHaveLength(4);
  });

  it('preserves an incoming client version when the bundle is unstamped', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '  ');

    const result = await addCsrfHeaders(
      { [CLIENT_VERSION_HEADER.toUpperCase()]: 'caller-build' },
      TOKEN,
    );

    expect(new Headers(result).get(CLIENT_VERSION_HEADER)).toBe('caller-build');
  });

  it('rejects invalid header names before requesting a CSRF token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(addCsrfHeaders({ 'invalid header': 'value' })).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('a token the caller already holds', () => {
  const MINTED = 'anon-token-minted-by-the-route-it-is-for';
  const identityBoundFetch = () =>
    vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ token: TOKEN, expiresIn: EXPIRES_IN_MS }),
        }) as unknown as Response,
    );

  beforeEach(() => {
    clearCsrfToken();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearCsrfToken();
  });

  it('is sent as given, without asking /api/csrf for the identity-bound one', async () => {
    const fetchMock = identityBoundFetch();
    vi.stubGlobal('fetch', fetchMock);

    const headers = (await addCsrfHeaders(
      { 'Content-Type': 'application/json' },
      MINTED,
    )) as Record<string, string>;

    expect(headers['x-csrf-token']).toBe(MINTED);
    expect(new Headers(headers).get('content-type')).toBe('application/json');
    expect(headers[API_VERSION_REQUEST_HEADER]).toBe(API_CONTRACT_VERSION);
    expect(isWellFormedRequestId(headers[REQUEST_ID_HEADER])).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('replaces a cached identity-bound token for that one request only', async () => {
    const fetchMock = identityBoundFetch();
    vi.stubGlobal('fetch', fetchMock);
    await getCsrfToken();

    const minted = (await addCsrfHeaders({}, MINTED)) as Record<string, string>;
    const next = (await addCsrfHeaders({})) as Record<string, string>;

    expect(minted['x-csrf-token']).toBe(MINTED);
    expect(next['x-csrf-token']).toBe(TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/csrf', expect.anything());
  });
});

describe('what every browser request tells the platform', () => {
  beforeEach(() => {
    clearCsrfToken();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({ token: TOKEN, expiresIn: EXPIRES_IN_MS }),
          }) as unknown as Response,
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('names the contract this bundle was built against on every request', async () => {
    const headers = (await addCsrfHeaders({ 'Content-Type': 'application/json' })) as Record<
      string,
      string
    >;

    expect(headers[API_VERSION_REQUEST_HEADER]).toBe(API_CONTRACT_VERSION);
    expect(new Headers(headers).get('content-type')).toBe('application/json');
  });

  it('carries an id for this request, so a reader report names the request that failed', async () => {
    const first = (await addCsrfHeaders()) as Record<string, string>;
    const second = (await addCsrfHeaders()) as Record<string, string>;

    expect(isWellFormedRequestId(first[REQUEST_ID_HEADER])).toBe(true);
    expect(second[REQUEST_ID_HEADER]).not.toBe(first[REQUEST_ID_HEADER]);
  });

  it('takes the build version from the bundle rather than a literal', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '2026.9.3');

    const headers = (await addCsrfHeaders()) as Record<string, string>;

    expect(headers[CLIENT_VERSION_HEADER]).toBe('2026.9.3');
  });

  it('omits the version rather than claiming one an unstamped build does not have', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '');

    const headers = (await addCsrfHeaders()) as Record<string, string>;

    expect(Object.keys(headers)).not.toContain(CLIENT_VERSION_HEADER);
    expect(headers[API_VERSION_REQUEST_HEADER]).toBe(API_CONTRACT_VERSION);
  });
});
