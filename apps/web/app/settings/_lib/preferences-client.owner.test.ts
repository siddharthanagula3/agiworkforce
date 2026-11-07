import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import {
  fetchStoredPreferenceNamespace,
  invalidatePreferencesSnapshot,
  observePreferenceOwner,
  readOwnedPreferences,
  saveOwnedPreferenceNamespace,
  savePreferenceNamespace,
} from './preferences-client';

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit) => headers),
  clearCsrfToken: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function identity(userId: string, sessionId = `${userId}-session`) {
  let current = true;
  const session: SessionAuthority = {
    userId,
    sessionId,
    isCurrent: () => current,
    getToken: async () => `fixture-${userId}-token`,
  };
  return {
    session,
    retire: () => {
      current = false;
    },
  };
}

const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  observePreferenceOwner(null);
  invalidatePreferencesSnapshot();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  const { addCsrfHeaders } = await import('@/lib/client/csrf');
  vi.mocked(addCsrfHeaders)
    .mockReset()
    .mockImplementation(async (headers = {}) => headers);
});

describe('account-owned preference snapshots', () => {
  it('shares an atomic settings/version result without consuming the legacy snapshot', async () => {
    fetchMock.mockResolvedValueOnce(
      response({ settings: { general: { aboutYou: 'legacy' } }, version: 'legacy' }),
    );
    await fetchStoredPreferenceNamespace('general');
    const owner = observePreferenceOwner(identity('a').session)!;
    fetchMock.mockResolvedValueOnce(
      response({ settings: { general: { aboutYou: 'owned' } }, version: 'owned' }),
    );
    const first = readOwnedPreferences(owner);
    const second = readOwnedPreferences(owner);
    expect(first).toBe(second);
    await expect(first).resolves.toEqual({
      settings: { general: { aboutYou: 'owned' } },
      version: 'owned',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.credentials).toBe('omit');
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer fixture-a-token',
    );
  });

  it('does not let an obsolete rejected read clear the newer generation', async () => {
    const owner = observePreferenceOwner(identity('a').session)!;
    const oldResponse = deferred<Response>();
    const started = deferred<void>();
    fetchMock.mockImplementationOnce(() => {
      started.resolve();
      return oldResponse.promise;
    });
    const oldRead = readOwnedPreferences(owner);
    const rejected = expect(oldRead).rejects.toThrow();
    await started.promise;
    const nextOwner = observePreferenceOwner(identity('b').session)!;
    fetchMock.mockResolvedValueOnce(
      response({ settings: { capabilities: { memory: true } }, version: 'new' }),
    );
    const nextRead = readOwnedPreferences(nextOwner);
    await nextRead;
    oldResponse.reject(new Error('obsolete request failed'));
    await rejected;
    expect(readOwnedPreferences(nextOwner)).toBe(nextRead);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('expires a pending snapshot without cancelling its consumers', async () => {
    const owner = observePreferenceOwner(identity('a').session)!;
    const pendingResponse = deferred<Response>();
    const started = deferred<void>();
    fetchMock.mockImplementationOnce(() => {
      started.resolve();
      return pendingResponse.promise;
    });
    const pendingRead = readOwnedPreferences(owner);
    await started.promise;
    invalidatePreferencesSnapshot();
    expect(readOwnedPreferences(owner)).toBe(pendingRead);
    pendingResponse.resolve(response({ settings: {}, version: 'in-flight' }));
    await expect(pendingRead).resolves.toMatchObject({ version: 'in-flight' });
    fetchMock.mockResolvedValueOnce(response({ settings: {}, version: 'fresh' }));
    await expect(readOwnedPreferences(owner)).resolves.toMatchObject({ version: 'fresh' });
  });

  it('does not let a legacy save completion retire a new owned read', async () => {
    const legacyResponse = deferred<Response>();
    const legacyStarted = deferred<void>();
    fetchMock.mockImplementationOnce(() => {
      legacyStarted.resolve();
      return legacyResponse.promise;
    });
    const legacySave = savePreferenceNamespace('appearance', { theme: 'dark' });
    await legacyStarted.promise;
    const owner = observePreferenceOwner(identity('b').session)!;
    const ownedResponse = deferred<Response>();
    const ownedStarted = deferred<void>();
    fetchMock.mockImplementationOnce(() => {
      ownedStarted.resolve();
      return ownedResponse.promise;
    });
    const ownedRead = readOwnedPreferences(owner);
    await ownedStarted.promise;
    legacyResponse.resolve(response({ version: 'legacy' }));
    await legacySave;
    expect(readOwnedPreferences(owner)).toBe(ownedRead);
    expect(fetchMock.mock.calls[1]?.[1]?.signal?.aborted).toBe(false);
    ownedResponse.resolve(response({ settings: {}, version: 'b' }));
    await expect(ownedRead).resolves.toMatchObject({ version: 'b' });
  });

  it('rejects late success from a retired account without replacing the new account snapshot', async () => {
    const accountA = identity('a');
    const ownerA = observePreferenceOwner(accountA.session)!;
    const oldResponse = deferred<Response>();
    const started = deferred<void>();
    fetchMock.mockImplementationOnce(() => {
      started.resolve();
      return oldResponse.promise;
    });
    const oldRead = readOwnedPreferences(ownerA);
    const rejected = expect(oldRead).rejects.toMatchObject({ name: 'AbortError' });
    await started.promise;
    accountA.retire();
    const ownerB = observePreferenceOwner(identity('b').session)!;
    fetchMock.mockResolvedValueOnce(
      response({ settings: { capabilities: { memory: false } }, version: 'b' }),
    );
    const currentRead = readOwnedPreferences(ownerB);
    await currentRead;
    oldResponse.resolve(response({ settings: { capabilities: { memory: true } }, version: 'a' }));
    await rejected;
    expect(readOwnedPreferences(ownerB)).toBe(currentRead);
    await expect(currentRead).resolves.toMatchObject({ version: 'b' });
  });

  it('does not revive an old account incarnation after A to B to A', () => {
    const first = observePreferenceOwner(identity('a', 'same-session').session)!;
    observePreferenceOwner(identity('b').session);
    const next = observePreferenceOwner(identity('a', 'same-session').session)!;
    expect(next.incarnation).not.toBe(first.incarnation);
    expect(first.isCurrent()).toBe(false);
    expect(next.isCurrent()).toBe(true);
  });

  it('retains one owner across valid observations of the same session', () => {
    const first = observePreferenceOwner(identity('a').session)!;
    const next = observePreferenceOwner(identity('a').session)!;
    expect(next).toBe(first);
  });

  it('treats malformed success JSON as a failed read rather than empty settings', async () => {
    const owner = observePreferenceOwner(identity('a').session)!;
    fetchMock.mockResolvedValueOnce(new Response('{', { status: 200 }));
    await expect(readOwnedPreferences(owner)).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(response({ settings: {}, version: 'retry' }));
    await expect(readOwnedPreferences(owner)).resolves.toMatchObject({ version: 'retry' });
  });
});

describe('captured preference writes', () => {
  it('does not dispatch old-owner intent after account changes during CSRF acquisition', async () => {
    const { addCsrfHeaders } = await import('@/lib/client/csrf');
    const headers = deferred<HeadersInit>();
    vi.mocked(addCsrfHeaders).mockReturnValueOnce(headers.promise);
    const ownerA = observePreferenceOwner(identity('a').session)!;
    const saving = saveOwnedPreferenceNamespace(
      ownerA,
      'capabilities',
      { memory: true },
      {
        merge: true,
        expectedVersion: 'a-version',
      },
    );
    const rejected = expect(saving).rejects.toMatchObject({ name: 'AbortError' });
    observePreferenceOwner(identity('b').session);
    headers.resolve({});
    await rejected;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('captures write data before awaiting CSRF and preserves merge/version/keepalive options', async () => {
    const { addCsrfHeaders } = await import('@/lib/client/csrf');
    const headers = deferred<HeadersInit>();
    vi.mocked(addCsrfHeaders).mockReturnValueOnce(headers.promise);
    const owner = observePreferenceOwner(identity('a').session)!;
    const patch = { memory: true };
    const saving = saveOwnedPreferenceNamespace(owner, 'capabilities', patch, {
      merge: true,
      expectedVersion: 'version-a',
      keepalive: true,
    });
    patch.memory = false;
    fetchMock.mockResolvedValueOnce(response({ version: 'version-b' }));
    headers.resolve({});
    await expect(saving).resolves.toEqual({ version: 'version-b' });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toMatchObject({ method: 'PUT', credentials: 'omit', keepalive: true });
    expect(JSON.parse(String(init?.body))).toEqual({
      namespace: 'capabilities',
      patch: { memory: true },
      expectedVersion: 'version-a',
    });
  });
});
