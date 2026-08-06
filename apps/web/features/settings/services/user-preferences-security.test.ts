import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock getAuthToken so SettingsService#setup2FA reaches the fetch call.
// NOTE: vi.mock is hoisted to top of file by vitest; the factory runs once.
// Do NOT call vi.resetModules() in beforeEach · it would clear the mock
// registry and cause re-imports to fail to find the mock, making
// getAuthToken return undefined instead of 'mock-token'.
vi.mock('@shared/lib/get-auth-token', () => ({
  getAuthToken: vi.fn().mockResolvedValue('mock-token'),
}));

// The 2FA routes call requireCsrfToken(); without this mock getCsrfToken would
// consume the fetch mock's queued responses and make the assertions below lie.
vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn().mockResolvedValue('csrf-token'),
}));

// Mock fetch to intercept the /api/settings/2fa/setup call
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('settingsService 2FA security', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    // Re-apply default return value after any test that overrides it
    // (vitest.config.ts sets mockReset, which clears factory-time defaults).
    const { getAuthToken } = await import('@shared/lib/get-auth-token');
    vi.mocked(getAuthToken).mockResolvedValue('mock-token');
    const { getCsrfToken } = await import('@/lib/client/csrf');
    vi.mocked(getCsrfToken).mockResolvedValue('csrf-token');
  });

  it('returns server error when /api/settings/2fa/setup returns 503', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Service unavailable' }),
    });

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.setup2FA();

    expect(result.error).toBeTruthy();
    expect(result.data).toBeUndefined();
  });

  it('propagates otpauth_url and backup_codes on success', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        secret: 'JBSWY3DPEHPK3PXP',
        otpauth_url: 'otpauth://totp/AGI%20Platform:test%40example.com?secret=JBSWY3DPEHPK3PXP',
        backup_codes: ['ABCD-EFGH', 'IJKL-MNOP'],
      }),
    });

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.setup2FA();

    expect(result.error).toBeUndefined();
    expect(result.data?.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(result.data?.otpauthUrl).toContain('otpauth://totp/');
    expect(result.data?.backupCodes).toHaveLength(2);
  });

  it('returns error when auth token is missing', async () => {
    const { getAuthToken } = await import('@shared/lib/get-auth-token');
    vi.mocked(getAuthToken).mockResolvedValueOnce(null);

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.setup2FA();

    expect(result.error).toContain('not authenticated');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the CSRF header on every mutating 2FA call', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });

    const { settingsService } = await import('./user-preferences');
    await settingsService.verify2FA('123456');
    await settingsService.disable2FA('123456');

    for (const call of fetchMock.mock.calls) {
      expect(call[1].headers['x-csrf-token']).toBe('csrf-token');
    }
  });

  it('reads the message out of the withErrorHandler envelope instead of stringifying it', async () => {
    // lib/error-handler.ts responds with { error: { code, message } }. Reading
    // `body.error` as a string rendered "[object Object]" to the user.
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        requestId: 'req_1',
      }),
    });

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.verify2FA('000000');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Authentication required');
    expect(result.status).toBe(401);
  });

  it('still reads the flat { error: string } shape used by the CSRF rejection', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: 'Invalid or missing CSRF token',
        code: 'CSRF_VALIDATION_FAILED',
      }),
    });

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.disable2FA('123456');

    expect(result.error).toBe('Invalid or missing CSRF token');
    expect(result.status).toBe(403);
  });

  it('surfaces the rate-limit status from the backup-code regeneration route', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }),
    });

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.regenerateBackupCodes('123456');

    expect(result.backupCodes).toBeUndefined();
    expect(result.status).toBe(429);
    expect(result.error).toBe('Too many requests');
  });
});
