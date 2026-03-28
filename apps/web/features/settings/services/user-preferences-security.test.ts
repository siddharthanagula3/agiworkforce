import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const maybeSingleMock = vi.fn();
const selectMock = vi.fn(() => ({
  eq: vi.fn(() => ({
    maybeSingle: maybeSingleMock,
  })),
}));
const upsertMock = vi.fn();
const fromMock = vi.fn(() => ({
  select: selectMock,
  upsert: upsertMock,
}));

vi.mock('@shared/lib/supabase-client', () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
    },
    from: fromMock,
  },
}));

describe('settingsService 2FA storage security', () => {
  beforeEach(() => {
    vi.resetModules();
    getUserMock.mockReset();
    maybeSingleMock.mockReset();
    selectMock.mockClear();
    upsertMock.mockReset();
    fromMock.mockClear();

    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'ship@example.com',
        },
      },
    });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    upsertMock.mockResolvedValue({ error: null });

    delete process.env['TOTP_ENCRYPTION_KEY'];
    delete process.env['VITE_TOTP_ENCRYPTION_KEY'];
    delete process.env['NEXT_PUBLIC_TOTP_ENCRYPTION_KEY'];
  });

  it('fails closed when no dedicated TOTP encryption key is configured', async () => {
    const { settingsService } = await import('./user-preferences');

    const result = await settingsService.setup2FA();

    expect(result.error).toContain('TOTP secret encryption is not configured');
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
