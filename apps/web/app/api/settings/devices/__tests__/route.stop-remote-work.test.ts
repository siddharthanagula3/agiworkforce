import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockAuth, mockGetUserScopedDb, mockQuery, mockExecute, mockAudit } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetUserScopedDb: vi.fn(),
  mockQuery: vi.fn(),
  mockExecute: vi.fn(async () => 1),
  mockAudit: vi.fn(async () => {}),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...a: unknown[]) => mockGetUserScopedDb(...a),
}));
vi.mock('@/lib/services/account-activity-notifications', () => ({
  notifyDeviceDisconnected: vi.fn(async () => undefined),
  notifyDeviceSignInApproved: vi.fn(async () => undefined),
}));
vi.mock('@/lib/server/identity', () => ({
  getIdentityProvider: () => ({
    getSession: vi.fn(),
    revokeSession: vi.fn(),
    listUserSessions: vi.fn(async () => ({ sessions: [], totalCount: 0 })),
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

import { POST } from '../[deviceId]/route';

const DEVICE_ID = '11111111-2222-4333-8444-555555555555';

function params(deviceId: string) {
  return { params: Promise.resolve({ deviceId }) };
}

function stopRequest(body: Record<string, unknown> = { action: 'stop-remote-work' }) {
  return new Request(`http://localhost:3000/api/settings/devices/${DEVICE_ID}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

function registered() {
  mockQuery.mockImplementation(async (sql: string) =>
    sql.includes('from device_registrations')
      ? [
          {
            kind: 'desktop',
            name: 'Work laptop',
            install_id: 'install-1',
            credential_family_id: 'family-1',
            identity_session_id: null,
          },
        ]
      : [],
  );
}

function executedStatements(): string[] {
  return mockExecute.mock.calls.map((call) => String((call as unknown[])[0]));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([]);
  mockExecute.mockResolvedValue(1);
  mockAuth.mockResolvedValue({ userId: 'user-1', sessionId: 'sess_current' });
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: mockQuery, execute: mockExecute, transaction: vi.fn() },
    userId: 'user-1',
    organizationId: null,
  });
});

describe('stopping remote work on one device', () => {
  it('withdraws the device from remote work without touching its credential', async () => {
    registered();

    const response = await POST(stopRequest(), params(DEVICE_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ remoteWorkStopped: true });
    const statements = executedStatements();
    expect(statements.some((sql) => sql.includes('remote_enabled = false'))).toBe(true);
    expect(statements.some((sql) => sql.includes('device_refresh_tokens'))).toBe(false);
    expect(statements.some((sql) => sql.includes('delete from'))).toBe(false);
  });

  it('records the revocation in the audit trail', async () => {
    registered();

    await POST(stopRequest(), params(DEVICE_ID));

    const event = (mockAudit.mock.calls as unknown[][])[0]?.[0] as {
      eventType?: string;
      detail?: { source?: string; enabled?: boolean; resourceId?: string };
    };
    expect(event.eventType).toBe('device_trust_revoked');
    expect(event.detail?.source).toBe('remote_work_stopped');
    expect(event.detail?.enabled).toBe(false);
    expect(event.detail?.resourceId).toBe(DEVICE_ID);
  });

  it('says plainly when the device was already withdrawn', async () => {
    registered();
    mockExecute.mockResolvedValue(0);

    const response = await POST(stopRequest(), params(DEVICE_ID));

    await expect(response.json()).resolves.toMatchObject({ remoteWorkStopped: false });
  });

  it('refuses an unknown device', async () => {
    mockQuery.mockResolvedValue([]);

    const response = await POST(stopRequest(), params(DEVICE_ID));

    expect(response.status).toBe(404);
  });

  it('refuses a malformed device id and an unsupported action', async () => {
    registered();
    expect((await POST(stopRequest(), params('not-a-uuid'))).status).toBe(400);
    expect((await POST(stopRequest({ action: 'wipe' }), params(DEVICE_ID))).status).toBe(400);
  });

  it('drops the live sessions through the signaling server when it is configured', async () => {
    registered();
    vi.stubEnv('SIGNALING_HTTP_URL', 'https://signal.example.test');
    vi.stubEnv('SIGNALING_INTERNAL_SECRET', 'signal-secret');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ closed: 2 }), { status: 200 }));

    const response = await POST(stopRequest(), params(DEVICE_ID));

    await expect(response.json()).resolves.toMatchObject({
      liveSessionsDropped: 2,
      signalingReachable: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://signal.example.test/devices/${DEVICE_ID}/revoke`,
      expect.objectContaining({ method: 'POST' }),
    );
    fetchMock.mockRestore();
  });

  it('still withdraws the device when the signaling server is unreachable', async () => {
    registered();
    vi.stubEnv('SIGNALING_HTTP_URL', 'https://signal.example.test');
    vi.stubEnv('SIGNALING_INTERNAL_SECRET', 'signal-secret');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unreachable'));

    const response = await POST(stopRequest(), params(DEVICE_ID));

    await expect(response.json()).resolves.toMatchObject({
      remoteWorkStopped: true,
      signalingReachable: false,
    });
    expect(executedStatements().some((sql) => sql.includes('remote_enabled = false'))).toBe(true);
    fetchMock.mockRestore();
  });
});
