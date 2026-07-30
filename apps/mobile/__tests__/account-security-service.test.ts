import { api } from '@/services/api';
import {
  fetchAccountSecurityStatus,
  parseAccountSecurityStatus,
} from '@/src/features/settings/account-security/service';

jest.mock('@/services/api', () => ({
  api: {
    get: jest.fn(),
  },
}));

const apiMock = api as jest.Mocked<typeof api>;

describe('Mobile account security service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads and validates the account-owned authenticator status', async () => {
    apiMock.get.mockResolvedValueOnce({
      enabled: true,
      enabled_at: '2026-07-30T12:00:00.000Z',
      backup_codes_remaining: 4,
    });
    const controller = new AbortController();

    await expect(fetchAccountSecurityStatus(controller.signal)).resolves.toEqual({
      twoFactorEnabled: true,
      enabledAt: '2026-07-30T12:00:00.000Z',
      backupCodesRemaining: 4,
    });
    expect(apiMock.get).toHaveBeenCalledWith('/api/settings/2fa', {
      signal: controller.signal,
    });
  });

  it.each([
    null,
    {},
    { enabled: 'yes', backup_codes_remaining: 0 },
    { enabled: false, backup_codes_remaining: -1 },
    { enabled: true, enabled_at: 'not-a-date', backup_codes_remaining: 2 },
    { enabled: true, enabled_at: null, backup_codes_remaining: 1.5 },
  ])('rejects malformed status payload %# instead of fabricating security state', (payload) => {
    expect(() => parseAccountSecurityStatus(payload)).toThrow(
      'Account security returned an invalid response.',
    );
  });
});
