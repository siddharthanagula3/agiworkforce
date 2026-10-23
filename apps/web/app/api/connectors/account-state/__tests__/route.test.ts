import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { CONNECTOR_ACCOUNT_STATE_MAX_ENTRIES } from '@agiworkforce/cloud-contracts';

type SecurityAuditModule = typeof import('@/lib/security-audit');

const { mockGetUserScopedDb, mockQuery, mockCsrf, mockAudit } = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockQuery: vi.fn(),
  mockCsrf: vi.fn(),
  mockAudit: vi.fn(),
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rls-db')>()),
  getUserScopedDb: mockGetUserScopedDb,
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: mockCsrf,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: mockAudit,
}));

import { GET, PUT } from '../route';

const URL_PATH = 'http://localhost:3000/api/connectors/account-state';

function put(body: unknown): NextRequest {
  return new NextRequest(URL_PATH, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('/api/connectors/account-state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserScopedDb.mockResolvedValue({
      db: { query: mockQuery },
      userId: 'user-owner',
      organizationId: null,
    });
    mockCsrf.mockResolvedValue(null);
    mockAudit.mockResolvedValue(undefined);
  });

  it('GET lists the connectors the account switched off, through the scoped adapter', async () => {
    mockQuery.mockResolvedValue([{ connector_id: 'notion' }, { connector_id: 'custom-abc' }]);

    const res = await GET(new NextRequest(URL_PATH));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ disabledConnectorIds: ['custom-abc', 'notion'] });
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('from public.connector_account_states');
    expect(sql).toContain('where user_id = $1 and not enabled');
    expect(params).toEqual(['user-owner']);
  });

  it('GET fails rather than reporting every connector on when the read fails', async () => {
    mockQuery.mockRejectedValue(new Error('connection reset'));

    const res = await GET(new NextRequest(URL_PATH));

    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it('PUT saves the switch for the signed-in account and records it', async () => {
    mockQuery.mockResolvedValue([{ connector_id: 'notion', enabled: false }]);

    const res = await PUT(put({ connectorId: 'notion', enabled: false }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connectorId: 'notion', enabled: false });
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('insert into public.connector_account_states');
    expect(sql).toContain('on conflict (user_id, connector_id)');
    expect(params).toEqual(['user-owner', 'notion', false, CONNECTOR_ACCOUNT_STATE_MAX_ENTRIES]);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-owner',
        eventType: 'connector_setting_changed',
        detail: expect.objectContaining({ connectorId: 'notion', status: 'disabled' }),
      }),
    );
  });

  it('PUT refuses without a CSRF token and writes nothing', async () => {
    mockCsrf.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));

    const res = await PUT(put({ connectorId: 'notion', enabled: false }));

    expect(res.status).toBe(403);
    expect(mockGetUserScopedDb).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it.each([
    [{ connectorId: 'notion' }],
    [{ connectorId: 'notion', enabled: 'false' }],
    [{ connectorId: '../etc', enabled: false }],
    [{ connectorId: 'notion', enabled: false, userId: 'someone-else' }],
  ])('PUT rejects a malformed body %j', async (body) => {
    const res = await PUT(put(body));

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('PUT refuses a new switch once the account holds the most it may', async () => {
    mockQuery.mockResolvedValue([]);

    const res = await PUT(put({ connectorId: 'notion', enabled: false }));

    expect(res.status).toBe(400);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});
