import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  requestSupportAccess: vi.fn(),
  approveSupportAccess: vi.fn(),
  denySupportAccess: vi.fn(),
  revokeSupportAccess: vi.fn(),
  listSupportAccessGrants: vi.fn(),
  verifySupportAccessTrail: vi.fn(),
  recordAuditEvent: vi.fn(async () => undefined),
  requireCsrfToken: vi.fn<() => Promise<Response | null>>(async () => null),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: (...args: unknown[]) => mocks.requireCsrfToken(...(args as [])),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(async () => undefined),
  recordAuditEvent: (...args: unknown[]) => mocks.recordAuditEvent(...(args as [])),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: vi.fn(), execute: vi.fn() }),
}));
vi.mock('@/lib/auth-guards', () => ({
  requirePlatformAdmin: (...args: unknown[]) => mocks.requirePlatformAdmin(...(args as [])),
}));
vi.mock('@/lib/server/support-access-service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/lib/server/support-access-service',
  );
  return {
    ...actual,
    requestSupportAccess: (...args: unknown[]) => mocks.requestSupportAccess(...(args as [])),
    approveSupportAccess: (...args: unknown[]) => mocks.approveSupportAccess(...(args as [])),
    denySupportAccess: (...args: unknown[]) => mocks.denySupportAccess(...(args as [])),
    revokeSupportAccess: (...args: unknown[]) => mocks.revokeSupportAccess(...(args as [])),
    listSupportAccessGrants: (...args: unknown[]) => mocks.listSupportAccessGrants(...(args as [])),
    verifySupportAccessTrail: (...args: unknown[]) =>
      mocks.verifySupportAccessTrail(...(args as [])),
  };
});

import { createError } from '@/lib/errors';

import { GET, POST } from './route';

const ORG = '11111111-1111-4111-8111-111111111111';
const GRANT_ID = '22222222-2222-4222-8222-222222222222';
const REASON = 'Customer reported missing messages after a failed import, ticket attached.';

const grant = {
  id: GRANT_ID,
  organizationId: ORG,
  requestedByUserId: 'user_support_a',
  approvedByUserId: null,
  revokedByUserId: null,
  reason: REASON,
  ticketRef: 'SUP-1',
  scopes: ['conversations'],
  status: 'pending',
  requestedAt: '2026-09-17T09:00:00.000Z',
  decidedAt: null,
  expiresAt: null,
  revokedAt: null,
};

function post(body: unknown): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/admin/support-access', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'user_support_b' });
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.requestSupportAccess.mockResolvedValue(grant);
  mocks.approveSupportAccess.mockResolvedValue({ ...grant, status: 'approved' });
  mocks.denySupportAccess.mockResolvedValue({ ...grant, status: 'denied' });
  mocks.revokeSupportAccess.mockResolvedValue({ ...grant, status: 'revoked' });
  mocks.listSupportAccessGrants.mockResolvedValue([grant]);
  mocks.verifySupportAccessTrail.mockResolvedValue({ intact: true, entries: 3 });
});

describe('the break-glass control plane is operator-only', () => {
  it('never lists a grant to a caller who is not a platform operator', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));
    const response = await GET(
      new NextRequest('https://agiworkforce.com/api/admin/support-access'),
    );
    expect(response.status).toBe(404);
    expect(mocks.listSupportAccessGrants).not.toHaveBeenCalled();
  });

  it('refuses a state-changing call whose CSRF token does not check out', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));
    await POST(
      post({
        action: 'request',
        organizationId: ORG,
        reason: REASON,
        ticketRef: 'SUP-1',
        scopes: ['conversations'],
      }),
    );
    expect(mocks.requestSupportAccess).not.toHaveBeenCalled();
  });
});

describe('requesting', () => {
  it('records the request under the calling operator and audits it', async () => {
    const response = await POST(
      post({
        action: 'request',
        organizationId: ORG,
        reason: REASON,
        ticketRef: 'SUP-1',
        scopes: ['conversations'],
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.requestSupportAccess).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, requestedByUserId: 'user_support_b' }),
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, severity: 'warning' }),
    );
  });

  it('refuses a reason too short to tell the workspace anything', async () => {
    const response = await POST(
      post({
        action: 'request',
        organizationId: ORG,
        reason: 'debug',
        ticketRef: 'SUP-1',
        scopes: ['conversations'],
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.requestSupportAccess).not.toHaveBeenCalled();
  });

  it('refuses a scope this build does not define', async () => {
    const response = await POST(
      post({
        action: 'request',
        organizationId: ORG,
        reason: REASON,
        ticketRef: 'SUP-1',
        scopes: ['everything'],
      }),
    );
    expect(response.status).toBe(400);
  });
});

describe('deciding', () => {
  it('approves under the caller, so the second approver is whoever made the call', async () => {
    const response = await POST(post({ action: 'approve', grantId: GRANT_ID }));

    expect(response.status).toBe(200);
    expect(mocks.approveSupportAccess).toHaveBeenCalledWith(
      expect.objectContaining({ grantId: GRANT_ID, actorUserId: 'user_support_b' }),
    );
  });

  it('never carries a window past the ceiling into the service', async () => {
    const response = await POST(
      post({ action: 'approve', grantId: GRANT_ID, ttlMs: 24 * 60 * 60_000 }),
    );
    expect(response.status).toBe(400);
    expect(mocks.approveSupportAccess).not.toHaveBeenCalled();
  });

  it('routes deny and revoke to their own service calls, never to approve', async () => {
    await POST(post({ action: 'deny', grantId: GRANT_ID }));
    await POST(post({ action: 'revoke', grantId: GRANT_ID }));

    expect(mocks.denySupportAccess).toHaveBeenCalledTimes(1);
    expect(mocks.revokeSupportAccess).toHaveBeenCalledTimes(1);
    expect(mocks.approveSupportAccess).not.toHaveBeenCalled();
  });

  it('refuses an action it does not know rather than falling through to one it does', async () => {
    const response = await POST(post({ action: 'escalate', grantId: GRANT_ID }));
    expect(response.status).toBe(400);
  });
});

describe('verifying', () => {
  it('recomputes the chain for one named workspace', async () => {
    const response = await GET(
      new NextRequest(
        `https://agiworkforce.com/api/admin/support-access?action=verify&organizationId=${ORG}`,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ intact: true });
    expect(mocks.verifySupportAccessTrail).toHaveBeenCalledWith(expect.anything(), ORG);
  });

  it('will not verify "every workspace" by leaving the id off', async () => {
    const response = await GET(
      new NextRequest('https://agiworkforce.com/api/admin/support-access?action=verify'),
    );
    expect(response.status).toBe(400);
    expect(mocks.verifySupportAccessTrail).not.toHaveBeenCalled();
  });
});
