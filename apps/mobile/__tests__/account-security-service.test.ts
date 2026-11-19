import { api } from '@/services/api';
import {
  fetchAccountSecurityStatus,
  fetchSessionTimeout,
  saveSessionTimeout,
  fetchLockdownMode,
  saveLockdownMode,
  fetchAccountSessions,
  fetchAuditLog,
  parseAccountSecurityStatus,
  parseAccountSessions,
  revokeAccountSession,
} from '@/src/features/settings/account-security/service';

jest.mock('@/services/api', () => ({
  api: {
    get: jest.fn(),
    delete: jest.fn(),
    put: jest.fn(),
  },
}));

const apiMock = api as jest.Mocked<typeof api>;

describe('Mobile account security service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads and validates the account-owned authenticator status', async () => {
    apiMock.get.mockResolvedValueOnce({ enabled: true, backup_codes_ready: true });
    const controller = new AbortController();

    await expect(fetchAccountSecurityStatus(controller.signal)).resolves.toEqual({
      twoFactorEnabled: true,
      backupCodesReady: true,
      enrollmentAvailable: false,
    });
    expect(apiMock.get).toHaveBeenCalledWith('/api/settings/2fa', {
      signal: controller.signal,
    });
  });

  it.each([null, {}, [], { enabled: 'yes', backup_codes_ready: true }])(
    'rejects malformed status payload %# instead of fabricating security state',
    (payload) => {
      expect(() => parseAccountSecurityStatus(payload)).toThrow(
        'Account security returned an invalid response.',
      );
    },
  );

  it.each([null, {}, { entries: 'none' }])(
    'rejects malformed activity history %# instead of reporting no recorded activity',
    async (payload) => {
      apiMock.get.mockResolvedValueOnce(payload);

      await expect(fetchAuditLog(20)).rejects.toThrow(
        'Account security returned an invalid activity history',
      );
    },
  );

  it('returns an empty history only when the server sends an empty entries list', async () => {
    apiMock.get.mockResolvedValueOnce({ entries: [] });

    await expect(fetchAuditLog(20)).resolves.toEqual([]);
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

    const account = { ownerId: 'fixture-account', epoch: 3 };
    const controller = new AbortController();
    await revokeAccountSession('sess_laptop', account, controller.signal);

    expect(apiMock.delete).toHaveBeenCalledWith('/api/settings/sessions/sess_laptop', {
      accountEpoch: account,
      signal: controller.signal,
    });
  });
  it('forwards the original owner and abort signal through security preference reads and writes', async () => {
    const options = {
      accountEpoch: { ownerId: 'fixture-account', epoch: 5 },
      signal: new AbortController().signal,
    };
    apiMock.get.mockResolvedValueOnce({ settings: { session_timeout: 30 } });
    await expect(fetchSessionTimeout(options)).resolves.toBe(30);
    expect(apiMock.get).toHaveBeenLastCalledWith(expect.any(String), options);
    await saveSessionTimeout(120, options);
    expect(apiMock.put).toHaveBeenLastCalledWith(
      expect.any(String),
      { settings: { session_timeout: 120 } },
      options,
    );
    apiMock.get.mockResolvedValueOnce({ settings: { enabled: true } });
    await expect(fetchLockdownMode(options)).resolves.toBe(true);
    expect(apiMock.get).toHaveBeenLastCalledWith(expect.any(String), options);
    await saveLockdownMode(false, options);
    expect(apiMock.put).toHaveBeenLastCalledWith(
      expect.any(String),
      { namespace: 'lockdown', value: { enabled: false } },
      options,
    );
  });

  it.each([null, {}, { settings: null }, { settings: [] }, { settings: false }])(
    'rejects malformed security preference envelopes instead of synthesizing defaults: %j',
    async (body) => {
      apiMock.get.mockResolvedValue(body);
      await expect(fetchSessionTimeout()).rejects.toThrow();
      await expect(fetchLockdownMode()).rejects.toThrow();
    },
  );

  it.each([null, '60', 0, 45, false])('rejects a defined invalid timeout: %j', async (value) => {
    apiMock.get.mockResolvedValue({ settings: { session_timeout: value } });
    await expect(fetchSessionTimeout()).rejects.toThrow();
  });

  it.each([null, 'false', 0, {}])('rejects a defined invalid lockdown flag: %j', async (value) => {
    apiMock.get.mockResolvedValue({ settings: { enabled: value } });
    await expect(fetchLockdownMode()).rejects.toThrow();
  });

  it('preserves defaults for valid empty settings and strips strictSettings before transport', async () => {
    apiMock.get.mockResolvedValue({ settings: {} });
    await expect(fetchSessionTimeout()).resolves.toBe(60);
    await expect(fetchLockdownMode()).resolves.toBe(false);
    expect(apiMock.get).toHaveBeenLastCalledWith(expect.any(String), {});
    for (const call of apiMock.get.mock.calls) {
      expect(call[1]).not.toHaveProperty('strictSettings');
    }
  });
});
