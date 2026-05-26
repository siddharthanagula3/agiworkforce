import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock getAuthToken so SettingsService#setup2FA reaches the fetch call.
// NOTE: vi.mock is hoisted to top of file by vitest; the factory runs once.
// Do NOT call vi.resetModules() in beforeEach — it would clear the mock
// registry and cause re-imports to fail to find the mock, making
// getAuthToken return undefined instead of 'mock-token'.
vi.mock('@shared/lib/get-auth-token', () => ({
  getAuthToken: vi.fn().mockResolvedValue('mock-token'),
}));

// Mock fetch to intercept the /api/settings/2fa/setup call
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('settingsService 2FA security', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    // Re-apply default return value after any test that overrides it
    const { getAuthToken } = await import('@shared/lib/get-auth-token');
    vi.mocked(getAuthToken).mockResolvedValue('mock-token');
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
});
