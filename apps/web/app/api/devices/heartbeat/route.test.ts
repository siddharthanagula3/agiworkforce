import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DEVICE_HEARTBEAT_INTERVAL_MS } from '@agiworkforce/cloud-contracts';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getUserScopedDb: vi.fn(),
  verifyDeveloperTokenSignature: vi.fn(),
  verifyIdentitySessionToken: vi.fn(),
  getRequestIdentity: vi.fn(),
  requireCsrfToken: vi.fn(async () => null),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mocks.getUserScopedDb(...args),
}));
vi.mock('@/lib/server/developer-token', () => ({
  verifyDeveloperTokenSignature: (...args: unknown[]) =>
    mocks.verifyDeveloperTokenSignature(...args),
}));
vi.mock('@/lib/server/identity', () => ({
  verifyIdentitySessionToken: (...args: unknown[]) => mocks.verifyIdentitySessionToken(...args),
  getRequestIdentity: (...args: unknown[]) => mocks.getRequestIdentity(...args),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { POST } from './route';

const DEVICE_ID = '11111111-2222-4333-8444-555555555555';
const WORKSPACE_ID = '33333333-4444-4555-8666-777777777777';

function heartbeat(body: unknown, authorization?: string) {
  return new NextRequest('http://localhost:3000/api/devices/heartbeat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

const CLI_BODY = {
  surface: 'cli',
  installId: 'cli-install-0001',
  name: 'build-box',
  os: 'linux',
  osVersion: '6.8.0',
  architecture: 'x64',
  appVersion: '0.9.2',
  capabilities: { browser: false, computerUse: false, localModels: true, localMcp: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue([{ id: DEVICE_ID }]);
  mocks.getUserScopedDb.mockResolvedValue({
    db: { query: mocks.query },
    userId: 'user-1',
    organizationId: WORKSPACE_ID,
  });
  mocks.verifyDeveloperTokenSignature.mockReturnValue(null);
  mocks.verifyIdentitySessionToken.mockResolvedValue(null);
  mocks.getRequestIdentity.mockResolvedValue({ sessionId: null });
});

describe('POST /api/devices/heartbeat', () => {
  it('records the install under the caller, its workspace and the credential family it holds', async () => {
    mocks.verifyDeveloperTokenSignature.mockReturnValue({
      userId: 'user-1',
      sessionFamilyId: 'family-7',
      jti: 'j',
      exp: 1,
    });

    const response = await POST(heartbeat(CLI_BODY, 'Bearer developer-token-value'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deviceId: DEVICE_ID,
      nextHeartbeatInMs: DEVICE_HEARTBEAT_INTERVAL_MS,
    });
    const [sql, values] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('on conflict (user_id, surface, install_id) do update');
    expect(sql).toContain('last_seen_at = now()');
    expect(values).toEqual([
      'user-1',
      WORKSPACE_ID,
      'cli',
      'cli-install-0001',
      'build-box',
      'linux',
      '6.8.0',
      'x64',
      '0.9.2',
      null,
      false,
      false,
      true,
      true,
      false,
      'family-7',
      null,
    ]);
  });

  it('links a cookie-signed shell to the identity session it runs under', async () => {
    mocks.getRequestIdentity.mockResolvedValue({ sessionId: 'sess_shell' });

    const response = await POST(
      heartbeat({
        surface: 'desktop',
        installId: 'desktop-install-01',
        os: 'macos',
        architecture: 'arm64',
        shell: 'electron',
        capabilities: { remoteControl: true },
      }),
    );

    expect(response.status).toBe(200);
    const values = mocks.query.mock.calls[0]?.[1] as unknown[];
    expect(values[9]).toBe('electron');
    expect(values[14]).toBe(true);
    expect(values[15]).toBeNull();
    expect(values[16]).toBe('sess_shell');
  });

  it('keeps a name the user chose over the one the client reports', async () => {
    await POST(heartbeat(CLI_BODY, 'Bearer developer-token-value'));
    const sql = mocks.query.mock.calls[0]?.[0] as string;
    expect(sql).toContain('name = coalesce(public.device_registrations.name, excluded.name)');
  });

  it('never links a developer token issued to another account', async () => {
    mocks.verifyDeveloperTokenSignature.mockReturnValue({
      userId: 'user-2',
      sessionFamilyId: 'family-other',
      jti: 'j',
      exp: 1,
    });

    await POST(heartbeat(CLI_BODY, 'Bearer developer-token-value'));

    const values = mocks.query.mock.calls[0]?.[1] as unknown[];
    expect(values[15]).toBeNull();
  });

  it('refuses a body that claims fields the registry does not accept', async () => {
    const response = await POST(heartbeat({ ...CLI_BODY, userId: 'user-2' }));
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('stops at a failed CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValueOnce(new Response(null, { status: 403 }) as never);
    const response = await POST(heartbeat(CLI_BODY));
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
