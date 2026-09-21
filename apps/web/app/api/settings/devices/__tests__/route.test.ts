import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockGetSession,
  mockRevokeSession,
  mockAuth,
  mockGetUserScopedDb,
  mockQuery,
  mockExecute,
  mockTransaction,
  mockAudit,
  mockNotifyDisconnected,
  mockListUserSessions,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRevokeSession: vi.fn(async () => undefined),
  mockNotifyDisconnected: vi.fn(async () => undefined),
  mockAuth: vi.fn(),
  mockGetUserScopedDb: vi.fn(),
  mockQuery: vi.fn(),
  mockExecute: vi.fn(async () => 1),
  mockTransaction: vi.fn(),
  mockAudit: vi.fn(async () => {}),
  mockListUserSessions: vi.fn(async () => ({
    sessions: [] as Array<Record<string, unknown>>,
    totalCount: 0,
  })),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...a: unknown[]) => mockGetUserScopedDb(...a),
}));

vi.mock('@/lib/services/account-activity-notifications', () => ({
  notifyDeviceDisconnected: mockNotifyDisconnected,
  notifyDeviceSignInApproved: vi.fn(async () => undefined),
}));

vi.mock('@/lib/server/identity', () => ({
  getIdentityProvider: () => ({
    getSession: mockGetSession,
    revokeSession: mockRevokeSession,
    listUserSessions: mockListUserSessions,
  }),
  getRequestIdentity: vi.fn(async () => ({ sessionId: 'sess_current' })),
  verifyIdentitySessionToken: vi.fn(async () => null),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mockAudit,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

import { GET } from '../route';
import { DELETE, PATCH } from '../[deviceId]/route';

const DEVICE_ID = '11111111-2222-4333-8444-555555555555';

function req(url = 'http://localhost:3000/api/settings/devices') {
  return new Request(url) as never;
}

function params(deviceId: string) {
  return { params: Promise.resolve({ deviceId }) };
}

function legacyOnly(rows: unknown[]) {
  return async (sql: string) => (sql.includes('device_registrations') ? [] : rows);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([]);
  mockAuth.mockResolvedValue({ userId: 'user-1', sessionId: 'sess_current' });
  mockListUserSessions.mockResolvedValue({ sessions: [], totalCount: 0 });
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: mockQuery, execute: mockExecute, transaction: mockTransaction },
    userId: 'user-1',
    organizationId: null,
  });
});

describe('listing linked devices', () => {
  it('scopes the query to the caller and reports whether a credential is still live', async () => {
    mockQuery.mockImplementation(
      legacyOnly([
        {
          device_id: DEVICE_ID,
          kind: 'desktop',
          name: 'Work laptop',
          platform: 'macos',
          version: '1.4.0',
          last_seen_at: '2026-08-19T10:00:00.000Z',
          registered_at: '2026-06-01T10:00:00.000Z',
          live_credentials: 2,
        },
        {
          device_id: '99999999-2222-4333-8444-555555555555',
          kind: 'mobile',
          name: null,
          platform: 'ios',
          version: null,
          last_seen_at: null,
          registered_at: '2026-05-01T10:00:00.000Z',
          live_credentials: 0,
        },
      ]),
    );

    const response = await GET(req());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { devices: Array<Record<string, unknown>> };

    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['user-1']);
    expect(body.devices[0]?.['hasLiveCredential']).toBe(true);
    expect(body.devices[1]?.['hasLiveCredential']).toBe(false);
  });

  it('never exposes a token hash or push token', async () => {
    mockQuery.mockResolvedValue([]);
    const response = await GET(req());
    const raw = await response.text();
    expect(raw).not.toMatch(/token_hash|push_token/);
  });
});

describe('a pending migration degrades one column, not the panel', () => {
  it('still lists registrations when device_refresh_tokens has no device_id yet', async () => {
    const undefinedColumn = Object.assign(new Error('column "device_id" does not exist'), {
      code: '42703',
    });
    mockQuery.mockRejectedValueOnce(undefinedColumn).mockResolvedValueOnce([
      {
        device_id: DEVICE_ID,
        kind: 'desktop',
        name: 'Work laptop',
        platform: 'macos',
        version: '1.4.0',
        last_seen_at: null,
        registered_at: '2026-06-01T10:00:00.000Z',
        live_credentials: 0,
      },
    ]);

    const response = await GET(req());
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      devices: Array<Record<string, unknown>>;
      credentialStateKnown: boolean;
    };

    expect(body.devices).toHaveLength(1);
    // Not false: reporting "not signed in" when the column cannot be read
    // would be a claim the deployment cannot support.
    expect(body.devices[0]?.['hasLiveCredential']).toBeNull();
    expect(body.credentialStateKnown).toBe(false);
  });

  it('does not treat an unrelated database failure as a pending migration', async () => {
    mockQuery.mockRejectedValue(
      Object.assign(new Error('connection terminated'), { code: '08006' }),
    );

    const response = await GET(req());
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('unlinking a device', () => {
  it('rejects an id that is not a device identifier', async () => {
    const response = await DELETE(
      new Request('http://localhost:3000/api/settings/devices/x', { method: 'DELETE' }) as never,
      params('../../etc/passwd'),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("refuses a device the caller does not own rather than revoking someone else's", async () => {
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ query: vi.fn(async () => []), execute: mockExecute }),
    );

    const response = await DELETE(
      new Request('http://localhost:3000/api/settings/devices/x', { method: 'DELETE' }) as never,
      params(DEVICE_ID),
    );

    expect(response.status).toBe(404);
  });

  it('unregisters without revoking every other device when the link column is missing', async () => {
    const txQuery = vi.fn(async (sql: string) => {
      if (sql.includes('desktop_devices where id')) return [{ kind: 'desktop', name: 'Laptop' }];
      throw Object.assign(new Error('column "device_id" does not exist'), { code: '42703' });
    });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ query: txQuery, execute: mockExecute }),
    );

    const response = await DELETE(
      new Request('http://localhost:3000/api/settings/devices/x', { method: 'DELETE' }) as never,
      params(DEVICE_ID),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      revokedCredentials: 0,
      credentialsRevoked: false,
    });
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('delete from desktop_devices'),
      [DEVICE_ID, 'user-1'],
    );
  });

  it('revokes the whole credential family, not just rows tagged with the device', async () => {
    const statements: string[] = [];
    const txQuery = vi.fn(async (sql: string) => {
      statements.push(sql);
      if (sql.includes('desktop_devices where id')) return [{ kind: 'desktop', name: 'Laptop' }];
      return [{ id: 'tok-1' }, { id: 'tok-2' }];
    });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ query: txQuery, execute: mockExecute }),
    );

    const response = await DELETE(
      new Request('http://localhost:3000/api/settings/devices/x', { method: 'DELETE' }) as never,
      params(DEVICE_ID),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ revokedCredentials: 2 });

    const revokeSql = statements.find((sql) => sql.includes('update device_refresh_tokens'));
    expect(revokeSql).toContain('family_id in');
    expect(revokeSql).toContain('user_id = $2');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('delete from desktop_devices'),
      [DEVICE_ID, 'user-1'],
    );
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('delete from mobile_devices'),
      [DEVICE_ID, 'user-1'],
    );
    expect(mockAudit).toHaveBeenCalled();
    expect(mockNotifyDisconnected).toHaveBeenCalledWith(
      expect.objectContaining({ query: mockQuery }),
      { userId: 'user-1', deviceId: DEVICE_ID, kind: 'desktop', name: 'Laptop' },
    );
  });
});

const REGISTERED_ID = '22222222-3333-4444-8555-666666666666';

function registryRow(overrides: Record<string, unknown> = {}) {
  return {
    device_id: REGISTERED_ID,
    surface: 'cli',
    name: 'Build box',
    os: 'linux',
    os_version: '6.8',
    architecture: 'x64',
    app_version: '0.9.2',
    shell: null,
    organization_id: '33333333-4444-4555-8666-777777777777',
    browser_available: false,
    computer_use_available: false,
    local_models_available: true,
    local_mcp_available: true,
    remote_enabled: false,
    last_seen_at: new Date().toISOString(),
    created_at: '2026-09-01T10:00:00.000Z',
    live_credential: true,
    ...overrides,
  };
}

describe('the device registry', () => {
  it('lists every surface with workspace, architecture, capabilities and presence', async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      sql.includes('device_registrations')
        ? [
            registryRow(),
            registryRow({
              device_id: '44444444-3333-4444-8555-666666666666',
              surface: 'desktop',
              os: 'macos',
              architecture: 'arm64',
              shell: 'electron',
              remote_enabled: true,
              last_seen_at: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
            }),
          ]
        : [],
    );

    const response = await GET(req());
    const body = (await response.json()) as { devices: Array<Record<string, unknown>> };

    expect(body.devices[0]).toMatchObject({
      id: REGISTERED_ID,
      kind: 'cli',
      platform: 'linux',
      architecture: 'x64',
      version: '0.9.2',
      workspaceId: '33333333-4444-4555-8666-777777777777',
      presence: 'online',
      hasLiveCredential: true,
      capabilities: {
        browser: false,
        computerUse: false,
        localModels: true,
        localMcp: true,
        remoteControl: false,
      },
    });
    expect(body.devices[1]).toMatchObject({
      kind: 'desktop',
      shell: 'electron',
      presence: 'sleeping',
      capabilities: expect.objectContaining({ remoteControl: true }),
    });
    const registrySql = mockQuery.mock.calls
      .map((call) => call[0] as string)
      .find((sql) => sql.includes('device_registrations'));
    expect(registrySql).toContain('r.user_id = $1');
  });

  it('still lists legacy registrations while migration 0207 is pending', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('device_registrations')) {
        throw Object.assign(new Error('relation "device_registrations" does not exist'), {
          code: '42P01',
        });
      }
      return [
        {
          device_id: DEVICE_ID,
          kind: 'mobile',
          name: null,
          platform: 'ios',
          version: null,
          last_seen_at: null,
          registered_at: '2026-05-01T10:00:00.000Z',
          live_credentials: 0,
        },
      ];
    });

    const response = await GET(req());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { devices: Array<Record<string, unknown>> };
    expect(body.devices).toHaveLength(1);
    expect(body.devices[0]).toMatchObject({ kind: 'mobile', presence: null, capabilities: null });
  });

  it('revokes the credential family and identity session the device holds', async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      sql.includes('from device_registrations')
        ? [
            {
              kind: 'mobile',
              name: 'Phone',
              install_id: '55555555-3333-4444-8555-666666666666',
              credential_family_id: 'family-9',
              identity_session_id: 'sess_phone',
            },
          ]
        : [],
    );
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const txQuery = vi.fn(async (sql: string, values: unknown[]) => {
      statements.push({ sql, values });
      return sql.includes('update device_refresh_tokens') ? [{ id: 'tok-1' }] : [];
    });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ query: txQuery, execute: mockExecute }),
    );
    mockGetSession.mockResolvedValue({ id: 'sess_phone', userId: 'user-1', status: 'active' });

    const response = await DELETE(
      new Request('http://localhost:3000/api/settings/devices/x', { method: 'DELETE' }) as never,
      params(REGISTERED_ID),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ revokedCredentials: 2 });
    const revoke = statements.find((entry) => entry.sql.includes('update device_refresh_tokens'));
    expect(revoke?.sql).toContain('family_id::text = $3');
    expect(revoke?.values).toEqual([REGISTERED_ID, 'user-1', 'family-9']);
    expect(mockRevokeSession).toHaveBeenCalledWith('sess_phone');
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('delete from device_registrations'),
      [REGISTERED_ID, 'user-1'],
    );
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('delete from mobile_devices where id::text = $1'),
      ['55555555-3333-4444-8555-666666666666', 'user-1'],
    );
  });

  it('never revokes an identity session that belongs to someone else', async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      sql.includes('from device_registrations')
        ? [
            {
              kind: 'desktop',
              name: 'Laptop',
              install_id: 'install-abcdef',
              credential_family_id: null,
              identity_session_id: 'sess_other',
            },
          ]
        : [],
    );
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ query: vi.fn(async () => []), execute: mockExecute }),
    );
    mockGetSession.mockResolvedValue({ id: 'sess_other', userId: 'user-2', status: 'active' });

    const response = await DELETE(
      new Request('http://localhost:3000/api/settings/devices/x', { method: 'DELETE' }) as never,
      params(REGISTERED_ID),
    );

    expect(response.status).toBe(200);
    expect(mockRevokeSession).not.toHaveBeenCalled();
  });
});

describe('renaming a device', () => {
  function patch(body: unknown) {
    return new Request('http://localhost:3000/api/settings/devices/x', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never;
  }

  it('renames a registered device inside the caller scope', async () => {
    mockExecute.mockResolvedValueOnce(1);

    const response = await PATCH(patch({ name: '  Studio Mac  ' }), params(REGISTERED_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: REGISTERED_ID, name: 'Studio Mac' });
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('update device_registrations set name = $3'),
      [REGISTERED_ID, 'user-1', 'Studio Mac'],
    );
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'device_renamed' }),
    );
  });

  it('takes a chosen name back, so the device shows its generated name again', async () => {
    mockExecute.mockResolvedValueOnce(1);

    const response = await PATCH(patch({ name: null }), params(REGISTERED_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: REGISTERED_ID, name: null });
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('update device_registrations set name = $3'),
      [REGISTERED_ID, 'user-1', null],
    );
  });

  it('falls back to the legacy tables and 404s a device the caller does not own', async () => {
    mockExecute.mockResolvedValue(0);

    const response = await PATCH(patch({ name: 'Mine now' }), params(REGISTERED_ID));

    expect(response.status).toBe(404);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('update mobile_devices set name'),
      [REGISTERED_ID, 'user-1', 'Mine now'],
    );
    mockExecute.mockResolvedValue(1);
  });

  it('refuses an empty or oversized name', async () => {
    expect((await PATCH(patch({ name: '   ' }), params(REGISTERED_ID))).status).toBe(400);
    expect((await PATCH(patch({ name: 'x'.repeat(121) }), params(REGISTERED_ID))).status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe('reporting a device lost', () => {
  function registryRow() {
    return {
      kind: 'desktop',
      name: 'Stolen laptop',
      install_id: 'install-abcdef',
      credential_family_id: 'family-9',
      identity_session_id: null,
    };
  }

  function unlinkRequest(body: Record<string, unknown>) {
    return new Request('http://localhost:3000/api/settings/devices/x', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never;
  }

  function bindRegisteredDevice() {
    mockQuery.mockImplementation(async (sql: string) =>
      sql.includes('from device_registrations') ? [registryRow()] : [],
    );
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        query: vi.fn(async (sql: string) =>
          sql.includes('update device_refresh_tokens') ? [{ id: 'tok-1' }, { id: 'tok-2' }] : [],
        ),
        execute: mockExecute,
      }),
    );
  }

  function executedStatements(): string[] {
    return mockExecute.mock.calls.map((call) => String((call as unknown[])[0]));
  }

  function executedSql(fragment: string): boolean {
    return executedStatements().some((sql) => sql.includes(fragment));
  }

  function auditedEvents(): string[] {
    return mockAudit.mock.calls.map((call) => {
      const event = (call as unknown[])[0] as { eventType?: unknown };
      return String(event.eventType);
    });
  }

  it('tells the account holder the device is gone, naming it', async () => {
    bindRegisteredDevice();

    const response = await DELETE(unlinkRequest({ lost: true }), params(REGISTERED_ID));

    expect(response.status).toBe(200);
    expect(mockNotifyDisconnected).toHaveBeenCalledTimes(1);
    const [, notice] = mockNotifyDisconnected.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ];
    expect(notice).toMatchObject({
      deviceId: REGISTERED_ID,
      kind: 'desktop',
      name: 'Stolen laptop',
    });
  });

  it('finishes the credential family for good and withdraws remote control', async () => {
    bindRegisteredDevice();

    const response = await DELETE(unlinkRequest({ lost: true }), params(REGISTERED_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Device reported lost and unlinked',
      credentialFamilyCompromised: true,
      remoteControlRevoked: true,
      revokedCredentials: 2,
    });
    expect(executedSql('compromised_at')).toBe(true);
    expect(executedSql('remote_enabled = false')).toBe(true);
    expect(auditedEvents()).toEqual(
      expect.arrayContaining(['device_trust_revoked', 'refresh_family_compromised']),
    );
  });

  it('withdraws remote control before the registration row is deleted', async () => {
    bindRegisteredDevice();

    await DELETE(unlinkRequest({ lost: true }), params(REGISTERED_ID));

    const order = executedStatements();
    const revoked = order.findIndex((sql) => sql.includes('remote_enabled = false'));
    const deleted = order.findIndex((sql) => sql.includes('delete from device_registrations'));
    expect(revoked).toBeGreaterThanOrEqual(0);
    expect(deleted).toBeGreaterThan(revoked);
  });

  it('ends every other session inline when the report asks for it', async () => {
    bindRegisteredDevice();
    mockListUserSessions
      .mockResolvedValueOnce({
        sessions: [
          { id: 'sess_current', userId: 'user-1', status: 'active' },
          { id: 'sess_elsewhere', userId: 'user-1', status: 'active' },
        ],
        totalCount: 2,
      })
      .mockResolvedValue({ sessions: [], totalCount: 0 });

    const response = await DELETE(
      unlinkRequest({ lost: true, logoutAll: true }),
      params(REGISTERED_ID),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      loggedOutEverywhere: { ended: 1, failed: 0, incomplete: false },
    });
    expect(mockRevokeSession).toHaveBeenCalledWith('sess_elsewhere');
    expect(mockRevokeSession).not.toHaveBeenCalledWith('sess_current');
    expect(executedSql('update device_refresh_tokens')).toBe(true);
  });

  it('leaves an ordinary unlink exactly as it was: revoked, not compromised', async () => {
    bindRegisteredDevice();

    const response = await DELETE(
      new Request('http://localhost:3000/api/settings/devices/x', { method: 'DELETE' }) as never,
      params(REGISTERED_ID),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Device unlinked',
      credentialFamilyCompromised: false,
    });
    expect(executedSql('compromised_at')).toBe(false);
    expect(auditedEvents()).not.toContain('refresh_family_compromised');
  });

  it('refuses an unlink body it does not recognise rather than guessing', async () => {
    bindRegisteredDevice();

    const response = await DELETE(unlinkRequest({ lost: 'yes' }), params(REGISTERED_ID));

    expect(response.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
