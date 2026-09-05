import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockAuth, mockGetUserScopedDb, mockQuery, mockExecute, mockTransaction, mockAudit } =
  vi.hoisted(() => ({
    mockAuth: vi.fn(),
    mockGetUserScopedDb: vi.fn(),
    mockQuery: vi.fn(),
    mockExecute: vi.fn(async () => 1),
    mockTransaction: vi.fn(),
    mockAudit: vi.fn(async () => {}),
  }));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...a: unknown[]) => mockGetUserScopedDb(...a),
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
import { DELETE } from '../[deviceId]/route';

const DEVICE_ID = '11111111-2222-4333-8444-555555555555';

function req(url = 'http://localhost:3000/api/settings/devices') {
  return new Request(url) as never;
}

function params(deviceId: string) {
  return { params: Promise.resolve({ deviceId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: 'user-1', sessionId: 'sess_current' });
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: mockQuery, execute: mockExecute, transaction: mockTransaction },
    userId: 'user-1',
    organizationId: null,
  });
});

describe('listing linked devices', () => {
  it('scopes the query to the caller and reports whether a credential is still live', async () => {
    mockQuery.mockResolvedValue([
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
    ]);

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
  });
});
