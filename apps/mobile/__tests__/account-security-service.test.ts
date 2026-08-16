import { api } from '@/services/api';
import {
  fetchAccountSecurityStatus,
  fetchAccountSessions,
  parseAccountSecurityStatus,
  parseAccountSessions,
  revokeAccountSession,
} from '@/src/features/settings/account-security/service';

jest.mock('@/services/api', () => ({
  api: {
    get: jest.fn(),
    delete: jest.fn(),
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

  it('reads the account device list from the server rather than the local session', async () => {
    apiMock.get.mockResolvedValueOnce({
      sessions: [
        {
          id: 'sess_mobile',
          status: 'active',
          device: 'iPhone',
          browser: null,
          location: 'Austin, US',
          createdAt: '2026-08-01T00:00:00.000Z',
          lastActiveAt: '2026-08-05T00:00:00.000Z',
          expiresAt: null,
          isCurrent: true,
        },
        {
          id: 'sess_laptop',
          status: 'active',
          device: 'Macintosh',
          browser: 'Chrome 141',
          location: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          lastActiveAt: '2026-08-04T00:00:00.000Z',
          expiresAt: null,
          isCurrent: false,
        },
      ],
      totalCount: 2,
      currentSessionKnown: true,
    });
    const controller = new AbortController();

    await expect(fetchAccountSessions(controller.signal)).resolves.toEqual({
      sessions: [
        {
          id: 'sess_mobile',
          device: 'iPhone',
          browser: null,
          location: 'Austin, US',
          lastActiveAt: '2026-08-05T00:00:00.000Z',
          isCurrent: true,
        },
        {
          id: 'sess_laptop',
          device: 'Macintosh',
          browser: 'Chrome 141',
          location: null,
          lastActiveAt: '2026-08-04T00:00:00.000Z',
          isCurrent: false,
        },
      ],
      currentSessionKnown: true,
    });
    expect(apiMock.get).toHaveBeenCalledWith('/api/settings/sessions', {
      signal: controller.signal,
    });
  });

  it('drops rows with no session id instead of listing a device that cannot be revoked', () => {
    expect(
      parseAccountSessions({
        sessions: [{ device: 'Ghost' }, { id: 'sess_ok', device: 'Macintosh' }],
      }),
    ).toEqual({
      sessions: [
        {
          id: 'sess_ok',
          device: 'Macintosh',
          browser: null,
          location: null,
          lastActiveAt: null,
          isCurrent: false,
        },
      ],
      currentSessionKnown: false,
    });
  });

  it.each([null, {}, { sessions: 'nope' }])(
    'rejects malformed session payload %# instead of reporting an empty device list',
    (payload) => {
      expect(() => parseAccountSessions(payload)).toThrow(
        'Account sessions returned an invalid response.',
      );
    },
  );

  it('revokes one session by id through the per-session route', async () => {
    apiMock.delete.mockResolvedValueOnce(undefined);

    await revokeAccountSession('sess_laptop');

    expect(apiMock.delete).toHaveBeenCalledWith('/api/settings/sessions/sess_laptop');
  });
});
