import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/lib/get-auth-token', () => ({
  getAuthToken: vi.fn().mockResolvedValue('mock-token'),
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn().mockResolvedValue('csrf-token'),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('settingsService 2FA security', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    const { getAuthToken } = await import('@shared/lib/get-auth-token');
    vi.mocked(getAuthToken).mockResolvedValue('mock-token');
    const { getCsrfToken } = await import('@/lib/client/csrf');
    vi.mocked(getCsrfToken).mockResolvedValue('csrf-token');
  });

  it('returns the backup codes the confirmation issued', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, backup_codes: ['abcd2345', 'efgh6789'] }),
    });

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.verify2FA('123456');

    expect(result.error).toBeUndefined();
    expect(result.backupCodes).toEqual(['abcd2345', 'efgh6789']);
  });

  it('returns error when auth token is missing', async () => {
    const { getAuthToken } = await import('@shared/lib/get-auth-token');
    vi.mocked(getAuthToken).mockResolvedValueOnce(null);

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.verify2FA('123456');

    expect(result.error).toContain('not authenticated');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the CSRF header on every mutating 2FA call', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });

    const { settingsService } = await import('./user-preferences');
    await settingsService.verify2FA('123456');

    for (const call of fetchMock.mock.calls) {
      expect(call[1].headers['x-csrf-token']).toBe('csrf-token');
    }
  });

  it('reads the message out of the withErrorHandler envelope instead of stringifying it', async () => {
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

    expect(result.backupCodes).toBeUndefined();
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
    const result = await settingsService.verify2FA('123456');

    expect(result.error).toBe('Invalid or missing CSRF token');
    expect(result.status).toBe(403);
  });

  it('surfaces the rate-limit status from the confirmation route', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }),
    });

    const { settingsService } = await import('./user-preferences');
    const result = await settingsService.verify2FA('123456');

    expect(result.backupCodes).toBeUndefined();
    expect(result.status).toBe(429);
    // 'Too many requests' is the bare HTTP reason phrase, which restates the
    // status and tells a reader nothing to act on, so the ladder answers
    // instead. The point of this test is that a 429 reaches the user at all.
    expect(result.error).toMatch(/going a little fast|wait a moment/i);
  });
});
