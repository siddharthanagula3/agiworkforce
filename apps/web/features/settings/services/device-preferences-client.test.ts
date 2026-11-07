import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidatePreferencesSnapshot } from '@/app/settings/_lib/preferences-client';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { readDevicePreferences, saveDevicePreference } from './device-preferences-client';

vi.mock('@/app/settings/_lib/preferences-client', async (original) => {
  const module = await original<typeof import('@/app/settings/_lib/preferences-client')>();
  return { ...module, invalidatePreferencesSnapshot: vi.fn(module.invalidatePreferencesSnapshot) };
});
vi.mock('@/lib/client/csrf', async (original) => ({
  ...(await original<typeof import('@/lib/client/csrf')>()),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => new Headers(headers)),
}));
const fetchMock = vi.fn<typeof fetch>();
const authority = () =>
  createRequestAuthority({
    userId: 'a',
    sessionId: 'session-a',
    isCurrent: () => true,
    getToken: async () => 'token-a',
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.mocked(invalidatePreferencesSnapshot).mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(addCsrfHeaders)
    .mockReset()
    .mockImplementation(async (headers) => new Headers(headers));
});
afterEach(() => vi.unstubAllGlobals());

describe('device sign-in preference transport', () => {
  it.each([
    {},
    { settings: null, version: null },
    { settings: [], version: null },
    { settings: {}, version: '' },
    { settings: {}, version: '   ' },
    { settings: { deviceCodeSignInEnabled: 'false' }, version: 'v1' },
    { settings: { deviceCodeSignInEnabled: null }, version: 'v1' },
  ])('rejects malformed GET: %j', async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body));
    await expect(readDevicePreferences(authority())).rejects.toThrow();
  });
  it('allows successful first-use absence only', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ settings: {}, version: null }));
    await expect(readDevicePreferences(authority())).resolves.toEqual({
      stored: {},
      version: null,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/settings/preferences?namespace=security');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store', credentials: 'omit' });
  });
  it.each([
    {},
    { settings: {}, version: 'v1' },
    { settings: { security: { deviceCodeSignInEnabled: true } }, version: 'v1' },
    ...[null, '', '  '].map((version) => ({
      settings: { security: { deviceCodeSignInEnabled: false } },
      version,
    })),
  ])('rejects malformed or mismatched receipts without publishing: %j', async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body));
    const event = vi.fn();
    window.addEventListener('agi:preference-namespace-saved', event);
    try {
      await expect(saveDevicePreference(authority(), false)).rejects.toThrow();
      expect(event).not.toHaveBeenCalled();
      expect(invalidatePreferencesSnapshot).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('agi:preference-namespace-saved', event);
    }
  });
  it('patches only the requested key and publishes stored siblings', async () => {
    const stored = { deviceCodeSignInEnabled: false, otherSecuritySetting: 'keep' };
    fetchMock.mockResolvedValueOnce(
      Response.json({ settings: { security: stored }, version: 'v2' }),
    );
    const event = vi.fn();
    window.addEventListener('agi:preference-namespace-saved', event);
    try {
      await expect(saveDevicePreference(authority(), false)).resolves.toEqual({
        stored,
        version: 'v2',
      });
      expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
        namespace: 'security',
        patch: { deviceCodeSignInEnabled: false },
      });
      expect(event.mock.calls[0]?.[0].detail).toEqual({ namespace: 'security', value: stored });
      expect(invalidatePreferencesSnapshot).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('agi:preference-namespace-saved', event);
    }
  });
  it('blocks retirement during CSRF before dispatch', async () => {
    const csrf = deferred<Headers>();
    vi.mocked(addCsrfHeaders).mockReturnValueOnce(csrf.promise);
    const operation = authority();
    const pending = saveDevicePreference(operation, false);
    const rejected = expect(pending).rejects.toThrow();
    operation.retire();
    csrf.resolve(new Headers());
    await rejected;
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('blocks silent session loss during token acquisition', async () => {
    const token = deferred<string>();
    const started = deferred<void>();
    let current = true;
    const operation = createRequestAuthority({
      userId: 'a',
      sessionId: 'a',
      isCurrent: () => current,
      getToken: () => {
        started.resolve();
        return token.promise;
      },
    });
    const pending = saveDevicePreference(operation, false);
    const rejected = expect(pending).rejects.toThrow();
    await started.promise;
    current = false;
    token.resolve('old-token');
    await rejected;
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['read', 'write'] as const)(
    'rejects %s body completion after retirement',
    async (kind) => {
      const body = deferred<unknown>();
      const parsing = deferred<void>();
      const response = new Response();
      vi.spyOn(response, 'json').mockImplementation(() => {
        parsing.resolve();
        return body.promise;
      });
      fetchMock.mockResolvedValueOnce(response);
      const operation = authority();
      const event = vi.fn();
      window.addEventListener('agi:preference-namespace-saved', event);
      try {
        const pending =
          kind === 'read'
            ? readDevicePreferences(operation)
            : saveDevicePreference(operation, false);
        const rejected = expect(pending).rejects.toThrow();
        await parsing.promise;
        operation.retire();
        body.resolve({ settings: { security: { deviceCodeSignInEnabled: false } }, version: 'v1' });
        await rejected;
        expect(event).not.toHaveBeenCalled();
        expect(invalidatePreferencesSnapshot).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener('agi:preference-namespace-saved', event);
      }
    },
  );
});
