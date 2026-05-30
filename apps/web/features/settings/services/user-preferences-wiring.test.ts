/**
 * Tests for wired settings service methods.
 *
 * Verifies that each method:
 * 1. Calls the correct route with the correct HTTP method and headers.
 * 2. Returns the SERVER response (not a fake success).
 * 3. Surfaces an error when the server returns a non-ok response.
 *
 * No toast.success is ever called from the service layer — that is the
 * hooks layer's responsibility, so we do not test it here.
 *
 * NOTE: vitest.config.ts sets mockReset: true, which clears mock
 * implementations between tests. Each beforeEach must re-apply them.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Module-level mocks (factories run once; implementations reset by mockReset).
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

// Re-apply mock implementations after each mockReset.
async function setupMocks() {
  const { getAuthToken } = await import('@shared/lib/get-auth-token');
  const { getCsrfToken } = await import('@/lib/client/csrf');
  vi.mocked(getAuthToken).mockResolvedValue('test-auth-token');
  vi.mocked(getCsrfToken).mockResolvedValue('test-csrf-token');
}

describe('settingsService — getSettings', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('calls GET /api/settings/preferences with auth header and surfaces server result', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({ settings: { theme: 'light', email_notifications: false } }),
    );

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.getSettings();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/preferences',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-auth-token' }),
      }),
    );
    // Server value overrides default — proves we surfaced the server result.
    expect(result.data.theme).toBe('light');
    expect(result.data.email_notifications).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('returns defaults + error when server returns 500', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Internal error' }, 500));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.getSettings();

    // Returns safe defaults so the UI does not crash.
    expect(result.data).toBeDefined();
    expect(result.data.theme).toBe('dark');
    // Reports the server error instead of silently returning defaults.
    expect(result.error).toBeTruthy();
  });
});

describe('settingsService — updateSettings', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('calls PUT /api/settings/preferences with CSRF + auth + body', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ settings: { theme: 'light' } }));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.updateSettings({ theme: 'light' });

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

  it('surfaces server error — does NOT return empty success on 422', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Invalid payload' }, 422));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.updateSettings({ theme: 'light' });

    expect(result.error).toBeTruthy();
  });
});

describe('settingsService — updateProfile', () => {
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

  it('surfaces server error from PATCH /api/me — old code was a no-op returning {}', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.updateProfile({ name: 'Alice' });

    expect(result.error).toBeTruthy();
  });

  it('stores extended fields via PUT /api/settings/preferences for bio/phone/timezone/language', async () => {
    // Only an extended field — no PATCH /api/me should be called.
    fetchMock.mockResolvedValueOnce(makeResponse({ settings: {} }));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.updateProfile({ timezone: 'Europe/London' });

    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    expect(firstCall).toBeDefined();
    const [url, opts] = firstCall!;
    expect(url).toBe('/api/settings/preferences');
    expect((opts as { method?: string }).method).toBe('PUT');
    expect(result.error).toBeUndefined();
  });

  it('surfaces error from preferences PUT when extended fields fail', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Settings too large' }, 413));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.updateProfile({ bio: 'x'.repeat(200) });

    expect(result.error).toBeTruthy();
  });
});

describe('settingsService — getProfile (round-trip: extended fields read from preferences)', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  const mePayload = {
    id: 'u1',
    email: 'alice@example.com',
    name: 'Alice',
    avatar_url: null,
    plan: { tier: 'free' },
  };

  it('calls GET /api/me AND GET /api/settings/preferences?namespace=profile in parallel', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(mePayload))
      .mockResolvedValueOnce(
        makeResponse({ settings: { timezone: 'Europe/London', language: 'fr' } }),
      );

    const { settingsService } = await import('./user-preferences');
    await settingsService.getProfile();

    const urls = (fetchMock.mock.calls as [string][]).map(([url]) => url);
    expect(urls).toContain('/api/me');
    expect(
      urls.some((u) => u.includes('/api/settings/preferences') && u.includes('namespace=profile')),
    ).toBe(true);
  });

  it('surfaces stored timezone and language over hardcoded defaults', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(mePayload))
      .mockResolvedValueOnce(
        makeResponse({ settings: { timezone: 'Asia/Tokyo', language: 'ja' } }),
      );

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.getProfile();

    expect(result.error).toBeUndefined();
    expect(result.data?.timezone).toBe('Asia/Tokyo');
    expect(result.data?.language).toBe('ja');
  });

  it('surfaces stored bio and phone — which were previously invisible', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(mePayload))
      .mockResolvedValueOnce(
        makeResponse({ settings: { bio: 'AI researcher', phone: '+1-555-0100' } }),
      );

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.getProfile();

    expect(result.data?.bio).toBe('AI researcher');
    expect(result.data?.phone).toBe('+1-555-0100');
  });

  it('falls back to safe defaults when preferences fetch fails — does not error the whole call', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(mePayload))
      .mockResolvedValueOnce(makeResponse({ error: 'DB error' }, 500));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.getProfile();

    // /api/me succeeded so we have a profile.
    expect(result.data).not.toBeNull();
    expect(result.error).toBeUndefined();
    // Falls back to hardcoded defaults.
    expect(result.data?.timezone).toBe('America/New_York');
    expect(result.data?.language).toBe('en');
    expect(result.data?.bio).toBeUndefined();
  });

  it('returns error only when /api/me fails — not when preferences fetch fails', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(makeResponse({ settings: {} }));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.getProfile();

    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });
});

describe('settingsService — getAPIKeys', () => {
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

  it('returns error on 500 — old code returned [] with no error', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'DB error' }, 500));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.getAPIKeys();

    expect(result.data).toEqual([]);
    expect(result.error).toBeTruthy();
  });
});

describe('settingsService — createAPIKey', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    await setupMocks();
  });

  it('calls POST /api/settings/api-keys with CSRF + body and returns full_key', async () => {
    const apiKey = {
      id: 'k2',
      name: 'staging',
      key_prefix: 'agi_',
      created_at: '2026-01-01T00:00:00Z',
    };
    fetchMock.mockResolvedValueOnce(makeResponse({ api_key: apiKey, full_key: 'agi_abc123' }, 201));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.createAPIKey('staging');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/api-keys',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-csrf-token': 'test-csrf-token',
          Authorization: 'Bearer test-auth-token',
        }),
      }),
    );
    expect(result.data).toEqual(apiKey);
    expect(result.fullKey).toBe('agi_abc123');
    expect(result.error).toBeUndefined();
  });

  it('surfaces server error — old code returned hardcoded "not yet available" string', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Key limit exceeded' }, 422));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.createAPIKey('overflow');

    expect(result.data).toBeNull();
    expect(result.error).toContain('Key limit exceeded');
    // Confirm the old hardcoded string is NOT returned.
    expect(result.error).not.toBe('API key management not yet available via API');
  });
});

describe('settingsService — deleteAPIKey', () => {
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

  it('surfaces server error — old code always returned hardcoded "not yet available" string', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'Not found' }, 404));

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.deleteAPIKey('bad-id');

    expect(result.error).toBeTruthy();
    // Confirm the old hardcoded string is NOT returned.
    expect(result.error).not.toBe('API key management not yet available via API');
  });
});
