import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { PLATFORM_ADMIN_ENV_VAR } from '@/features/admin/lib/platform-admin-access';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
  assertAccountActive: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  logSecurityEvent: vi.fn(),
  getUser: vi.fn(),
  banUser: vi.fn(),
  unbanUser: vi.fn(),
  getDashboardSummary: vi.fn(),
  purgeExpiredSecurityAuditLogs: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/security-audit', () => ({
  getClientIp: () => '203.0.113.7',
  logSecurityEvent: (...args: unknown[]) => mocks.logSecurityEvent(...args),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  }),
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mocks.getClerkAuthUser(...args),
  assertAccountActive: (...args: unknown[]) => mocks.assertAccountActive(...args),
}));
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    users: {
      getUser: (...args: unknown[]) => mocks.getUser(...args),
      banUser: (...args: unknown[]) => mocks.banUser(...args),
      unbanUser: (...args: unknown[]) => mocks.unbanUser(...args),
    },
  }),
}));
vi.mock('@/lib/services/security-monitoring-service', () => ({
  SecurityMonitoringService: {
    getDashboardSummary: (...args: unknown[]) => mocks.getDashboardSummary(...args),
  },
}));
vi.mock('@/lib/server/security-log-retention', () => ({
  purgeExpiredSecurityAuditLogs: (...args: unknown[]) =>
    mocks.purgeExpiredSecurityAuditLogs(...args),
}));

import { GET as securityGet, POST as securityPost } from '@/app/api/admin/security/route';
import { POST as erasuresPost } from '@/app/api/admin/privacy/erasures/route';
import { GET as privacyRequestsGet } from '@/app/api/admin/privacy/requests/route';
import {
  GET as contentReportsGet,
  POST as contentReportsPost,
} from '@/app/api/admin/content-reports/route';
import { GET as takedownGet, POST as takedownPost } from '@/app/api/admin/takedown/route';

const ORG_ADMIN_ID = 'user_org_owner_1';
const OPERATOR_ID = 'user_platform_operator_1';

function req(url: string, method: 'GET' | 'POST', body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

type RouteCall = { name: string; call: () => Promise<Response> };

const CROSS_TENANT_ROUTES: RouteCall[] = [
  {
    name: 'GET /api/admin/security',
    call: () => securityGet(req('https://app.test/api/admin/security', 'GET')),
  },
  {
    name: 'POST /api/admin/security?action=ban-user',
    call: () =>
      securityPost(
        req('https://app.test/api/admin/security?action=ban-user', 'POST', {
          userId: 'user_victim_9',
          reason: 'escalation attempt',
        }),
      ),
  },
  {
    name: 'POST /api/admin/privacy/erasures',
    call: () =>
      erasuresPost(
        req('https://app.test/api/admin/privacy/erasures', 'POST', {
          email: 'victim@example.com',
          reason: 'escalation attempt',
        }),
      ),
  },
  {
    name: 'GET /api/admin/privacy/requests',
    call: () => privacyRequestsGet(req('https://app.test/api/admin/privacy/requests', 'GET')),
  },
  {
    name: 'GET /api/admin/content-reports',
    call: () => contentReportsGet(req('https://app.test/api/admin/content-reports', 'GET')),
  },
  {
    name: 'POST /api/admin/content-reports',
    call: () =>
      contentReportsPost(
        req('https://app.test/api/admin/content-reports', 'POST', {
          reportId: 'report_1',
          status: 'dismissed',
          reviewerNote: 'nothing to see here',
        }),
      ),
  },
  {
    name: 'GET /api/admin/takedown',
    call: () => takedownGet(req('https://app.test/api/admin/takedown?token=share_victim', 'GET')),
  },
  {
    name: 'POST /api/admin/takedown',
    call: () =>
      takedownPost(
        req('https://app.test/api/admin/takedown', 'POST', {
          token: 'share_victim',
          reason: 'escalation attempt',
        }),
      ),
  },
];

const originalAllowlist = process.env[PLATFORM_ADMIN_ENV_VAR];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertAccountActive.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue([]);
  mocks.execute.mockResolvedValue(undefined);
  mocks.logSecurityEvent.mockResolvedValue(undefined);
  mocks.getUser.mockResolvedValue({ publicMetadata: { role: 'owner' } });
  mocks.banUser.mockResolvedValue(undefined);
  mocks.unbanUser.mockResolvedValue(undefined);
  mocks.getDashboardSummary.mockResolvedValue({ metrics: {}, alerts: [], top_ips: [] });
  mocks.purgeExpiredSecurityAuditLogs.mockResolvedValue({
    deleted: 0,
    retentionDays: 90,
    oldestRemainingAgeDays: null,
    retentionHolds: 0,
  });
});

afterEach(() => {
  if (originalAllowlist === undefined) {
    delete process.env[PLATFORM_ADMIN_ENV_VAR];
  } else {
    process.env[PLATFORM_ADMIN_ENV_VAR] = originalAllowlist;
  }
});

describe('cross-tenant admin routes reject an org admin who is not a platform operator', () => {
  it.each(CROSS_TENANT_ROUTES)('$name answers 404 and touches nothing', async ({ call }) => {
    process.env[PLATFORM_ADMIN_ENV_VAR] = OPERATOR_ID;
    mocks.getClerkAuthUser.mockResolvedValue({ userId: ORG_ADMIN_ID });

    const response = await call();

    expect(response.status).toBe(404);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.banUser).not.toHaveBeenCalled();
    expect(mocks.logSecurityEvent).not.toHaveBeenCalled();
    expect(mocks.getDashboardSummary).not.toHaveBeenCalled();
    expect(mocks.purgeExpiredSecurityAuditLogs).not.toHaveBeenCalled();
  });

  it.each(CROSS_TENANT_ROUTES)(
    '$name answers 404 when no allowlist is configured at all',
    async ({ call }) => {
      delete process.env[PLATFORM_ADMIN_ENV_VAR];
      mocks.getClerkAuthUser.mockResolvedValue({ userId: ORG_ADMIN_ID });

      const response = await call();

      expect(response.status).toBe(404);
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.banUser).not.toHaveBeenCalled();
    },
  );

  it.each(CROSS_TENANT_ROUTES)(
    '$name answers 404 to a desktop device token holding an allowlisted id',
    async ({ call }) => {
      process.env[PLATFORM_ADMIN_ENV_VAR] = OPERATOR_ID;
      mocks.getClerkAuthUser.mockResolvedValue({
        userId: OPERATOR_ID,
        surfaceClass: 'developer',
      });

      const response = await call();

      expect(response.status).toBe(404);
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.banUser).not.toHaveBeenCalled();
      expect(mocks.getDashboardSummary).not.toHaveBeenCalled();
    },
  );

  it('never consults the org-scoped Clerk role for these routes', async () => {
    process.env[PLATFORM_ADMIN_ENV_VAR] = OPERATOR_ID;
    mocks.getClerkAuthUser.mockResolvedValue({ userId: ORG_ADMIN_ID });

    await securityGet(req('https://app.test/api/admin/security', 'GET'));

    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});

describe('an allowlisted platform operator still reaches the same routes', () => {
  beforeEach(() => {
    process.env[PLATFORM_ADMIN_ENV_VAR] = `other_operator, ${OPERATOR_ID} ,`;
    mocks.getClerkAuthUser.mockResolvedValue({ userId: OPERATOR_ID });
  });

  it('reads the security dashboard', async () => {
    const response = await securityGet(req('https://app.test/api/admin/security', 'GET'));

    expect(response.status).toBe(200);
    expect(mocks.getDashboardSummary).toHaveBeenCalled();
    expect(mocks.assertAccountActive).toHaveBeenCalledWith(OPERATOR_ID);
  });

  it('bans a target account', async () => {
    const response = await securityPost(
      req('https://app.test/api/admin/security?action=ban-user', 'POST', {
        userId: 'user_victim_9',
        reason: 'confirmed abuse',
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining("'banned'"), [
      'user_victim_9',
    ]);
    expect(mocks.banUser).toHaveBeenCalledWith('user_victim_9');
  });

  it('reads the open data-rights request queue', async () => {
    const response = await privacyRequestsGet(
      req('https://app.test/api/admin/privacy/requests', 'GET'),
    );

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalled();
  });

  it('reads the content report queue', async () => {
    const response = await contentReportsGet(
      req('https://app.test/api/admin/content-reports', 'GET'),
    );

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalled();
  });

  it('is refused when the operator account itself is suspended', async () => {
    const { createError } = await import('@/lib/errors');
    mocks.assertAccountActive.mockRejectedValue(createError.forbidden('suspended'));

    const response = await securityGet(req('https://app.test/api/admin/security', 'GET'));

    expect(response.status).toBe(403);
    expect(mocks.getDashboardSummary).not.toHaveBeenCalled();
  });
});

describe('the operator allowlist is a registered environment variable', () => {
  async function warnings(): Promise<string[]> {
    const { validateRequiredEnvVars } = await import('@/lib/validate-env');
    return validateRequiredEnvVars().warnings;
  }

  it('warns a deployment that left it unset, since every operator surface then 404s', async () => {
    delete process.env[PLATFORM_ADMIN_ENV_VAR];

    expect(await warnings()).toContainEqual(expect.stringContaining(PLATFORM_ADMIN_ENV_VAR));
  });

  it('stays quiet once operators are configured', async () => {
    process.env[PLATFORM_ADMIN_ENV_VAR] = OPERATOR_ID;

    expect(await warnings()).not.toContainEqual(expect.stringContaining(PLATFORM_ADMIN_ENV_VAR));
  });
});
