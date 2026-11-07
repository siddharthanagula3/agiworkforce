import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { addCsrfHeaders } from '@/lib/client/csrf';
import {
  readNotificationPreferences,
  saveNotificationPreferences,
} from './notification-preferences-client';

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
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(addCsrfHeaders)
    .mockReset()
    .mockImplementation(async (headers) => new Headers(headers));
});
afterEach(() => vi.unstubAllGlobals());

describe('notification stored snapshots', () => {
  it.each([
    {},
    { settings: null, version: null },
    { settings: [], version: null },
    { settings: {}, version: '' },
    { settings: {}, version: '   ' },
    { settings: { notifications: null }, version: 'v1' },
    { settings: { notifications: [] }, version: 'v1' },
    ...[
      'browserReplyReady',
      'emailScheduleDone',
      'mobilePushScheduleDone',
      'emailSecurityAlerts',
      'pushUsageReset',
    ].map((key) => ({ settings: { notifications: { [key]: 'true' } }, version: 'v1' })),
  ])('rejects malformed GET without manufacturing defaults: %j', async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body));
    await expect(readNotificationPreferences(authority())).rejects.toThrow();
  });

  it('allows a missing first-use namespace and null initial version', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ settings: {}, version: null }));
    await expect(readNotificationPreferences(authority())).resolves.toEqual({
      stored: {},
      version: null,
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store', credentials: 'omit' });
  });

  it.each([
    {},
    { settings: {}, version: 'v1' },
    { settings: { notifications: { emailScheduleDone: true } }, version: 'v1' },
    {
      settings: { notifications: { emailScheduleDone: true, mobilePushScheduleDone: false } },
      version: 'v1',
    },
    ...[null, '', '  '].map((version) => ({
      settings: { notifications: { emailScheduleDone: true, mobilePushScheduleDone: true } },
      version,
    })),
  ])('rejects unconfirmed or partially matching event receipts: %j', async (body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body));
    const event = vi.fn();
    window.addEventListener('agi:preference-namespace-saved', event);
    try {
      await expect(
        saveNotificationPreferences(authority(), {
          emailScheduleDone: true,
          mobilePushScheduleDone: true,
        }),
      ).rejects.toThrow();
      expect(event).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('agi:preference-namespace-saved', event);
    }
  });

  it('submits only event keys and publishes actual stored siblings', async () => {
    const stored = {
      emailScheduleDone: false,
      mobilePushScheduleDone: false,
      browserReplyReady: true,
      mobilePushAgentActivity: true,
      unknown: 'keep',
    };
    fetchMock.mockResolvedValueOnce(
      Response.json({ settings: { notifications: stored }, version: 'v2' }),
    );
    const event = vi.fn();
    window.addEventListener('agi:preference-namespace-saved', event);
    try {
      await expect(
        saveNotificationPreferences(authority(), {
          emailScheduleDone: false,
          mobilePushScheduleDone: false,
        }),
      ).resolves.toEqual({ stored, version: 'v2' });
      expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
        namespace: 'notifications',
        patch: { emailScheduleDone: false, mobilePushScheduleDone: false },
      });
      expect(event.mock.calls[0]?.[0].detail).toEqual({
        namespace: 'notifications',
        value: stored,
      });
    } finally {
      window.removeEventListener('agi:preference-namespace-saved', event);
    }
  });

  it('rejects retirement during CSRF before dispatch', async () => {
    const csrf = deferred<Headers>();
    vi.mocked(addCsrfHeaders).mockReturnValueOnce(csrf.promise);
    const operation = authority();
    const pending = saveNotificationPreferences(operation, { browserReplyReady: false });
    const rejected = expect(pending).rejects.toThrow();
    operation.retire();
    csrf.resolve(new Headers());
    await rejected;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a changed session during token acquisition', async () => {
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
    const pending = saveNotificationPreferences(operation, { browserReplyReady: false });
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
            ? readNotificationPreferences(operation)
            : saveNotificationPreferences(operation, { browserReplyReady: false });
        const rejected = expect(pending).rejects.toThrow();
        await parsing.promise;
        operation.retire();
        body.resolve({ settings: { notifications: { browserReplyReady: false } }, version: 'v1' });
        await rejected;
        expect(event).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener('agi:preference-namespace-saved', event);
      }
    },
  );
});
