import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  scopedQuery: vi.fn(),
  scopedExecute: vi.fn(),
  settingsQuery: vi.fn(),
  audit: vi.fn(),
  loggerInfo: vi.fn(),
  hasAcceptedCurrentTerms: vi.fn(),
  notifySignIn: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({
    userId: 'user_approved',
    email: 'approved@example.com',
  })),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/device-signin-policy', async (importOriginal) => {
  const actual = await importOriginal<ImportedModule0>();
  return { ...actual, readDeviceCodeSignInPolicy: vi.fn(actual.readDeviceCodeSignInPolicy) };
});
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  recordAuditEvent: (...args: unknown[]) => mocks.audit(...args),
}));
vi.mock('@/lib/services/account-activity-notifications', () => ({
  notifyDeviceSignInApproved: (...args: unknown[]) => mocks.notifySignIn(...args),
  notifyDeviceDisconnected: vi.fn(),
}));
vi.mock('@/lib/server/terms', () => ({
  hasAcceptedCurrentTerms: (...args: unknown[]) => mocks.hasAcceptedCurrentTerms(...args),
  mustAcceptTerms: async (userId: string) => !(await mocks.hasAcceptedCurrentTerms(userId)),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
    transaction: (...args: unknown[]) => mocks.transaction(...args),
  })),
}));
vi.mock('@/lib/logger', () => ({
  logger: {
    info: (...args: unknown[]) => mocks.loggerInfo(...args),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { POST } from './route';
import { getClerkAuthUser } from '@/lib/api-auth';
import { readDeviceCodeSignInPolicy } from '@/lib/server/device-signin-policy';

describe('POST /api/auth/device/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const mock of Object.values(mocks)) mock.mockReset();
    vi.mocked(getClerkAuthUser).mockReset().mockResolvedValue({
      userId: 'user_approved',
      email: 'approved@example.com',
    });
    vi.mocked(readDeviceCodeSignInPolicy).mockClear();
    mocks.hasAcceptedCurrentTerms.mockResolvedValue(true);
    mocks.settingsQuery.mockResolvedValue([{ settings: {} }]);
    mocks.scopedExecute.mockResolvedValue(0);
    mocks.scopedQuery.mockImplementation((sql: string, params: unknown[]) => {
      if (sql.includes("set_config('request.jwt.claim.sub'")) return Promise.resolve([]);
      if (sql.includes('select settings from public.user_settings'))
        return mocks.settingsQuery(sql, params);
      throw new Error(`Unexpected scoped query: ${sql}`);
    });
    mocks.transaction.mockImplementation(
      async (callback: (tx: DatabaseAdapter) => Promise<unknown>) =>
        callback({
          query: mocks.scopedQuery,
          execute: mocks.scopedExecute,
        } as unknown as DatabaseAdapter),
    );
    mocks.query
      .mockResolvedValueOnce([
        {
          device_id: '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
          status: 'pending',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      ])
      .mockResolvedValueOnce([{ status: 'approved' }]);
  });

  it('refuses to let a device credential approve another device', async () => {
    vi.mocked(getClerkAuthUser).mockResolvedValueOnce({
      userId: 'user_approved',
      surfaceClass: 'developer',
    });

    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/auth/device/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_code: 'ABCD-2345' }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('logs only a derived device reference, never the poll secret', async () => {
    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/auth/device/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_code: 'ABCD-2345' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      {
        deviceRef: expect.stringMatching(/^[a-f0-9]{12}$/),
        userId: 'user_approved',
      },
      'Device code approved',
    );
    expect(JSON.stringify(mocks.loggerInfo.mock.calls)).not.toContain(
      '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
    );
  });

  it('puts the approval in the account owner’s security feed under the derived reference', async () => {
    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/auth/device/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_code: 'ABCD-2345' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.notifySignIn).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user_approved',
      deviceRef: expect.stringMatching(/^[a-f0-9]{12}$/),
    });
  });

  it('does not approve a device for an account missing the current terms revision', async () => {
    mocks.hasAcceptedCurrentTerms.mockResolvedValue(false);

    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/auth/device/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_code: 'ABCD-2345', surface: 'desktop' }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'TERMS_ACCEPTANCE_REQUIRED' },
      acceptanceUrl:
        '/login/complete?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-2345%26surface%3Ddesktop',
    });
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.loggerInfo).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user_approved' }),
      'Device code approved',
    );
  });

  it.each([
    'read failure',
    'scope binding failure',
    'malformed root',
    'malformed namespace',
    'malformed key',
    'disabled',
  ])('blocks a pending unexpired approval on %s without grant side effects', async (reason) => {
    if (reason === 'read failure')
      mocks.settingsQuery.mockRejectedValue(new Error('database offline'));
    if (reason === 'scope binding failure')
      mocks.scopedExecute.mockRejectedValue(new Error('role unavailable'));
    if (reason === 'malformed root') mocks.settingsQuery.mockResolvedValue([{ settings: null }]);
    if (reason === 'malformed namespace')
      mocks.settingsQuery.mockResolvedValue([{ settings: { security: [] } }]);
    if (reason === 'malformed key')
      mocks.settingsQuery.mockResolvedValue([
        { settings: { security: { deviceCodeSignInEnabled: 'false' } } },
      ]);
    if (reason === 'disabled')
      mocks.settingsQuery.mockResolvedValue([
        { settings: { security: { deviceCodeSignInEnabled: false } } },
      ]);
    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/auth/device/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_code: 'ABCD-2345' }),
      }),
    );
    expect(response.status).toBe(reason === 'disabled' ? 403 : 503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: reason === 'disabled' ? 'DEVICE_SIGNIN_DISABLED' : 'DEVICE_SIGNIN_POLICY_UNAVAILABLE',
      },
    });
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.scopedExecute).toHaveBeenCalledOnce();
    expect(mocks.query.mock.calls[0]?.[0]).toContain('SELECT device_id, status, expires_at');
    expect(mocks.hasAcceptedCurrentTerms).not.toHaveBeenCalled();
    expect(mocks.notifySignIn).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.scopedExecute).toHaveBeenCalledWith('set local role app_rls');
  });

  it('retains defaults only after a successful scoped empty read', async () => {
    mocks.settingsQuery.mockResolvedValue([]);
    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/auth/device/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_code: 'ABCD-2345' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.scopedQuery).toHaveBeenCalledWith(
      expect.stringContaining("set_config('request.jwt.claim.sub'"),
      ['user_approved', ''],
    );
    expect(mocks.settingsQuery).toHaveBeenCalledWith(
      expect.stringContaining('where user_id = $1'),
      ['user_approved'],
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_approved',
        eventType: 'device_authorization_approved',
      }),
    );
  });

  it('denies without consulting unavailable policy or terms', async () => {
    mocks.settingsQuery.mockRejectedValue(new Error('database offline'));
    mocks.query
      .mockReset()
      .mockResolvedValueOnce([
        {
          device_id: 'device-denied',
          status: 'pending',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      ])
      .mockResolvedValueOnce([{ status: 'denied' }]);
    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/auth/device/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_code: 'ABCD-2345', action: 'deny' }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ approved: false, status: 'denied' });
    expect(readDeviceCodeSignInPolicy).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.settingsQuery).not.toHaveBeenCalled();
    expect(mocks.hasAcceptedCurrentTerms).not.toHaveBeenCalled();
    expect(mocks.notifySignIn).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("SET status = 'denied'"),
      ['user_approved', 'approved@example.com', expect.any(String), 'device-denied'],
    );
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_approved',
        eventType: 'device_authorization_denied',
        outcome: 'denied',
      }),
    );
  });
});

type ImportedModule0 = typeof import('@/lib/server/device-signin-policy');

type ImportedModule1 = typeof import('@/lib/security-audit');
