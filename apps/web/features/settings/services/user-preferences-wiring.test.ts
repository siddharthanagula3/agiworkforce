import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';

vi.mock('@shared/lib/get-auth-token', () => ({
  getAuthToken: vi.fn(),
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(),
  addCsrfHeaders: vi.fn(),
  clearCsrfToken: vi.fn(),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function makeResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

async function setupMocks() {
  const { getAuthToken } = await import('@shared/lib/get-auth-token');
  const { getCsrfToken } = await import('@/lib/client/csrf');
  vi.mocked(getAuthToken).mockResolvedValue('test-auth-token');
  vi.mocked(getCsrfToken).mockResolvedValue('test-csrf-token');
}

describe('settingsService · getSettings', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('calls GET /api/settings/preferences with auth header and surfaces server result', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ settings: { session_timeout: 30 } }));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.getSettings();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/preferences',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-auth-token' }),
      }),
    );
    expect(result.data.session_timeout).toBe(30);
    expect(result.error).toBeUndefined();
  });

  it('returns defaults + error when server returns 500', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Internal error' }, 500));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.getSettings();

    expect(result.data).toBeDefined();
    expect(result.data.session_timeout).toBe(60);
    expect(result.error).toBeTruthy();
  });
});

describe('settingsService · updateSettings', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('calls PUT /api/settings/preferences with CSRF + auth + body', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ settings: { session_timeout: 30 } }));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.updateSettings({ session_timeout: 30 });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/preferences',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'x-csrf-token': 'test-csrf-token',
          Authorization: 'Bearer test-auth-token',
        }),
      }),
    );
    expect(result.error).toBeUndefined();
  });

  it('surfaces server error · does NOT return empty success on 422', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Invalid payload' }, 422));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.updateSettings({ session_timeout: 30 });

    expect(result.error).toBeTruthy();
  });
});

describe('settingsService · updateProfile', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('calls PATCH /api/me for name/avatar_url with CSRF + auth', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({ id: 'u1', display_name: 'Alice', avatar_url: null }),
    );

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.updateProfile({ name: 'Alice' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/me',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          'x-csrf-token': 'test-csrf-token',
          Authorization: 'Bearer test-auth-token',
        }),
      }),
    );
    expect(result.error).toBeUndefined();
  });

  it('surfaces server error from PATCH /api/me · old code was a no-op returning {}', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.updateProfile({ name: 'Alice' });

    expect(result.error).toBeTruthy();
  });
});

describe('settingsService · getAPIKeys', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('calls GET /api/settings/api-keys and returns server array', async () => {
    const keys = [
      { id: 'k1', name: 'prod', key_prefix: 'agi_', created_at: '2026-01-01T00:00:00Z' },
    ];
    fetchMock.mockResolvedValueOnce(makeResponse({ api_keys: keys }));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.getAPIKeys();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/api-keys',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-auth-token' }),
      }),
    );
    expect(result.data).toEqual(keys);
    expect(result.error).toBeUndefined();
  });

  it('returns error on 500 · old code returned [] with no error', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'DB error' }, 500));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.getAPIKeys();

    expect(result.data).toEqual([]);
    expect(result.error).toBeTruthy();
  });
});

describe('settingsService · deleteAPIKey', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('calls DELETE /api/settings/api-keys/[id] with CSRF', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ message: 'API key revoked' }));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.deleteAPIKey('key-123');

    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    expect(firstCall).toBeDefined();
    const [url, opts] = firstCall!;
    expect(url).toBe('/api/settings/api-keys/key-123');
    expect((opts as { method?: string }).method).toBe('DELETE');
    expect(((opts as { headers?: Record<string, string> }).headers ?? {})['x-csrf-token']).toBe(
      'test-csrf-token',
    );
    expect(result.error).toBeUndefined();
  });

  it('surfaces server error · old code always returned hardcoded "not yet available" string', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Not found' }, 404));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.deleteAPIKey('bad-id');

    expect(result.error).toBeTruthy();
    expect(result.error).not.toBe('API key management not yet available via API');
  });
});

describe('settingsService · getAPIKeys owned transport', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
    const { getAuthToken } = await import('@shared/lib/get-auth-token');
    vi.mocked(getAuthToken).mockClear();
  });

  function ownedRequest() {
    const getToken = vi.fn(async () => 'captured-owner-token');
    const request = createRequestAuthority({
      userId: 'owner-a', sessionId: 'session-a', isCurrent: () => true, getToken,
    });
    const headers = {
      [MANAGED_CLOUD_ORGANIZATION_HEADER]: MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
    };
    return { request, headers, getToken };
  }

  it('uses only captured auth, explicit scope and abort signal with the existing array parser', async () => {
    const keys = [{ id: 'owned-key', name: 'Owned', key_prefix: 'agi_', scopes: [],
      created_at: '2026-10-20T00:00:00.000Z' }];
    fetchMock.mockResolvedValueOnce(makeResponse({ api_keys: keys }));
    const owned = ownedRequest();
    const controller = new AbortController();
    const { settingsService } = await import('./user-preferences');
    const { getAuthToken } = await import('@shared/lib/get-auth-token');
    const result = await settingsService.getAPIKeys(controller.signal, owned);
    expect(result).toEqual({ data: keys });
    expect(getAuthToken).not.toHaveBeenCalled();
    expect(owned.getToken).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/settings/api-keys',
      expect.objectContaining({ method: 'GET', cache: 'no-store', credentials: 'omit' }));
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer captured-owner-token');
    expect(new Headers(init.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(
      MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
    );
    expect(init.signal?.aborted).toBe(false);
    controller.abort();
    expect(init.signal?.aborted).toBe(true);
  });

  it.each([
    { label: 'missing array', response: () => makeResponse({}), expected: { data: [] } },
    { label: 'HTTP failure', response: () => makeResponse({ error: 'Unavailable' }, 503),
      expected: { data: [], error: 'HTTP 503' } },
  ])('retains the legacy parser for $label without ambient auth', async ({ response, expected }) => {
    fetchMock.mockResolvedValueOnce(response());
    const { settingsService } = await import('./user-preferences');
    const { getAuthToken } = await import('@shared/lib/get-auth-token');
    expect(await settingsService.getAPIKeys(undefined, ownedRequest())).toEqual(expected);
    expect(getAuthToken).not.toHaveBeenCalled();
  });

  it('does not acquire either token or dispatch when the caller signal is already aborted', async () => {
    const owned = ownedRequest();
    const controller = new AbortController();
    controller.abort();
    const { settingsService } = await import('./user-preferences');
    const { getAuthToken } = await import('@shared/lib/get-auth-token');
    const result = await settingsService.getAPIKeys(controller.signal, owned);
    expect(result.data).toEqual([]);
    expect(result.error).toBeTruthy();
    expect(getAuthToken).not.toHaveBeenCalled();
    expect(owned.getToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not return a parsed array after its captured authority is retired', async () => {
    let resolveBody!: (body: unknown) => void;
    let started!: () => void;
    const parsing = new Promise<void>((resolve) => { started = resolve; });
    const body = new Promise<unknown>((resolve) => { resolveBody = resolve; });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200,
      json: () => { started(); return body; } });
    const owned = ownedRequest();
    const { settingsService } = await import('./user-preferences');
    const { getAuthToken } = await import('@shared/lib/get-auth-token');
    const result = settingsService.getAPIKeys(undefined, owned);
    await parsing;
    owned.request.retire();
    resolveBody({ api_keys: [{ id: 'retired-key' }] });
    expect(await result).toMatchObject({ data: [], error: expect.any(String) });
    expect(getAuthToken).not.toHaveBeenCalled();
  });
});
