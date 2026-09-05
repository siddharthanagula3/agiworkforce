import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockAssertAccountActive,
  mockGetClerkAuthUser,
  mockExecute,
  mockGetUser,
  mockGetDashboardSummary,
  mockLogSecurityEvent,
  mockBanUser,
} = vi.hoisted(() => ({
  mockAssertAccountActive: vi.fn(),
  mockGetClerkAuthUser: vi.fn(),
  mockExecute: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetDashboardSummary: vi.fn(),
  mockLogSecurityEvent: vi.fn(),
  mockBanUser: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  logSecurityEvent: (...args: unknown[]) => mockLogSecurityEvent(...args),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: vi.fn(async () => []),
    execute: (...args: unknown[]) => mockExecute(...args),
  })),
}));
vi.mock('@/lib/services/security-monitoring-service', () => ({
  SecurityMonitoringService: {
    getDashboardSummary: (...args: unknown[]) => mockGetDashboardSummary(...args),
  },
}));
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    users: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      banUser: (...args: unknown[]) => mockBanUser(...args),
      unbanUser: vi.fn(),
    },
  }),
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
  assertAccountActive: (...args: unknown[]) => mockAssertAccountActive(...args),
  getClerkAuthorizedParties: () =>
    (process.env['CLERK_AUTHORIZED_PARTIES'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
}));

import { GET, POST } from '../route';
import { createError } from '@/lib/errors';
import { PLATFORM_ADMIN_ENV_VAR } from '@/features/admin/lib/platform-admin-access';

const ADMIN_ID = 'user_admin_1';
const TARGET_ID = 'user_target_2';

function adminRequest(url: string, method: 'GET' | 'POST', body?: unknown) {
  return new Request(url, {
    method,
    headers: {
      authorization: 'Bearer test-admin-token',
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

const originalAllowlist = process.env[PLATFORM_ADMIN_ENV_VAR];

beforeEach(() => {
  vi.clearAllMocks();
  process.env[PLATFORM_ADMIN_ENV_VAR] = ADMIN_ID;
  mockGetClerkAuthUser.mockResolvedValue({ userId: ADMIN_ID });
  mockGetUser.mockResolvedValue({ publicMetadata: { role: 'admin' } });
  mockAssertAccountActive.mockResolvedValue(undefined);
  mockGetDashboardSummary.mockResolvedValue({ metrics: {}, alerts: [], top_ips: [] });
  mockExecute.mockResolvedValue(undefined);
  mockLogSecurityEvent.mockResolvedValue(undefined);
  mockBanUser.mockResolvedValue(undefined);
});

afterEach(() => {
  if (originalAllowlist === undefined) {
    delete process.env[PLATFORM_ADMIN_ENV_VAR];
  } else {
    process.env[PLATFORM_ADMIN_ENV_VAR] = originalAllowlist;
  }
});

describe('GET /api/admin/security, suspended admin', () => {
  it('reads account status for the id proved by the token', async () => {
    await GET(adminRequest('https://app.test/api/admin/security', 'GET'));
    expect(mockAssertAccountActive).toHaveBeenCalledWith(ADMIN_ID);
  });

  it('refuses a suspended admin with 403 and never reaches the dashboard service', async () => {
    mockAssertAccountActive.mockRejectedValue(
      createError.forbidden('Your account has been suspended. Please contact support.'),
    );

    const response = await GET(adminRequest('https://app.test/api/admin/security', 'GET'));

    expect(response.status).toBe(403);
    expect(mockGetDashboardSummary).not.toHaveBeenCalled();
  });

  it('propagates the fail-closed 503 when the status lookup itself fails', async () => {
    mockAssertAccountActive.mockRejectedValue(
      createError.serviceUnavailable('Unable to verify account status. Please try again shortly.'),
    );

    const response = await GET(adminRequest('https://app.test/api/admin/security', 'GET'));

    expect(response.status).toBe(503);
    expect(mockGetDashboardSummary).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/security, suspended admin cannot act on other accounts', () => {
  it.each(['suspend-user', 'ban-user', 'reactivate-user'])(
    'refuses %s and writes no account_status row',
    async (action) => {
      mockAssertAccountActive.mockRejectedValue(createError.forbidden('suspended'));

      const response = await POST(
        adminRequest(`https://app.test/api/admin/security?action=${action}`, 'POST', {
          userId: TARGET_ID,
          reason: 'escalation test',
        }),
      );

      expect(response.status).toBe(403);
      expect(mockExecute).not.toHaveBeenCalled();
      expect(mockBanUser).not.toHaveBeenCalled();
      expect(mockLogSecurityEvent).not.toHaveBeenCalled();
    },
  );
});

describe('POST /api/admin/security, an active admin is unaffected', () => {
  it('still bans a target account and records the audit event', async () => {
    const response = await POST(
      adminRequest('https://app.test/api/admin/security?action=ban-user', 'POST', {
        userId: TARGET_ID,
        reason: 'abuse',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining("'banned'"), [TARGET_ID]);
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ADMIN_ID, eventType: 'admin_action' }),
    );
  });
});

describe('the guard rejects non-operators before touching account status', () => {
  it('returns 404 for a signed-in org owner who is not on the allowlist', async () => {
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_org_owner_2' });
    mockGetUser.mockResolvedValue({ publicMetadata: { role: 'owner' } });

    const response = await GET(adminRequest('https://app.test/api/admin/security', 'GET'));

    expect(response.status).toBe(404);
    expect(mockAssertAccountActive).not.toHaveBeenCalled();
    expect(mockGetDashboardSummary).not.toHaveBeenCalled();
  });

  it('propagates 401 when no credential is presented', async () => {
    mockGetClerkAuthUser.mockRejectedValue(createError.unauthorized());

    const response = await GET(
      new Request('https://app.test/api/admin/security', { method: 'GET' }) as never,
    );

    expect(response.status).toBe(401);
    expect(mockAssertAccountActive).not.toHaveBeenCalled();
  });
});
