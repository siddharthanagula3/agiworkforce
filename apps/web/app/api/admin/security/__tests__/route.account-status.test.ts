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
  mockUnbanUser,
  mockRecordAction,
  mockSettleStep,
  mockQueueRetry,
} = vi.hoisted(() => ({
  mockRecordAction: vi.fn(),
  mockSettleStep: vi.fn(),
  mockQueueRetry: vi.fn(),
  mockUnbanUser: vi.fn(),
  mockAssertAccountActive: vi.fn(),
  mockGetClerkAuthUser: vi.fn(),
  mockExecute: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetDashboardSummary: vi.fn(),
  mockLogSecurityEvent: vi.fn(),
  mockBanUser: vi.fn(),
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule7>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule6>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule5>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule4>()),
  recordAuditEvent: vi.fn(async () => undefined),
  logSecurityEvent: (...args: unknown[]) => mockLogSecurityEvent(...args),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule3>()),
  getNeonDb: vi.fn(() => ({
    query: vi.fn(async () => []),
    execute: (...args: unknown[]) => mockExecute(...args),
  })),
}));
vi.mock('@/lib/server/admin-account-actions', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  recordAdminAccountAction: (...args: unknown[]) => mockRecordAction(...args),
  settleAccountProviderStep: (...args: unknown[]) => mockSettleStep(...args),
  queueAccountProviderStepRetry: (...args: unknown[]) => mockQueueRetry(...args),
}));
vi.mock('@/lib/services/security-monitoring-service', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  SecurityMonitoringService: {
    getDashboardSummary: (...args: unknown[]) => mockGetDashboardSummary(...args),
  },
}));
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    users: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      banUser: (...args: unknown[]) => mockBanUser(...args),
      unbanUser: (...args: unknown[]) => mockUnbanUser(...args),
    },
  }),
}));

vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
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
const STEP = { actionId: 'action-1', userId: TARGET_ID };

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
  mockUnbanUser.mockResolvedValue(undefined);
  mockRecordAction.mockResolvedValue(STEP);
  mockSettleStep.mockResolvedValue(undefined);
  mockQueueRetry.mockResolvedValue(true);
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
      { required: true },
    );
  });
});

describe('POST /api/admin/security reactivation reports the provider step', () => {
  function reactivate() {
    return POST(
      adminRequest('https://app.test/api/admin/security?action=reactivate-user', 'POST', {
        userId: TARGET_ID,
        reason: 'appeal upheld',
      }),
    );
  }

  it('says the reactivation is incomplete when the provider unban fails', async () => {
    mockUnbanUser.mockRejectedValue(new Error('provider unavailable'));

    const response = await reactivate();
    const body = (await response.json()) as Record<string, unknown>;

    expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining("'active'"), [TARGET_ID]);
    expect(mockUnbanUser).toHaveBeenCalledWith(TARGET_ID);
    expect(body).toMatchObject({
      success: false,
      complete: false,
      provider_status: 'failed',
      account_status: 'active',
    });
    expect(String(body['message'])).not.toContain('has been reactivated');
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ action: 'reactivate-user', providerStatus: 'failed' }),
      }),
    );
  });

  it('reports a completed reactivation when the provider unban succeeds', async () => {
    const response = await reactivate();

    expect(await response.json()).toMatchObject({
      success: true,
      complete: true,
      provider_status: 'completed',
      retry_queued: false,
      action_id: 'action-1',
      message: `User ${TARGET_ID} has been reactivated`,
    });
    expect(mockSettleStep).toHaveBeenCalledWith(expect.anything(), STEP, { ok: true });
    expect(mockQueueRetry).not.toHaveBeenCalled();
  });

  it('records the action and its provider step before calling the provider', async () => {
    await reactivate();

    expect(mockRecordAction).toHaveBeenCalledWith(expect.anything(), {
      userId: TARGET_ID,
      action: 'reactivate-user',
      accountStatus: 'active',
      providerSuspended: false,
      requestedByUserId: ADMIN_ID,
    });
    expect(mockRecordAction.mock.invocationCallOrder[0]).toBeLessThan(
      mockUnbanUser.mock.invocationCallOrder[0]!,
    );
  });

  it('stores the failed provider step and queues its retry', async () => {
    const failure = new Error('provider unavailable');
    mockUnbanUser.mockRejectedValue(failure);

    const body = (await (await reactivate()).json()) as Record<string, unknown>;

    expect(mockSettleStep).toHaveBeenCalledWith(expect.anything(), STEP, {
      ok: false,
      error: failure,
    });
    expect(mockQueueRetry).toHaveBeenCalledWith(expect.anything(), STEP);
    expect(body).toMatchObject({ complete: false, retry_queued: true, action_id: 'action-1' });
    expect(String(body['message'])).toContain('retried automatically');
  });

  it('asks the operator to resubmit when the action could not be stored', async () => {
    mockRecordAction.mockResolvedValue(null);
    mockUnbanUser.mockRejectedValue(new Error('provider unavailable'));

    const body = (await (await reactivate()).json()) as Record<string, unknown>;

    expect(mockQueueRetry).not.toHaveBeenCalled();
    expect(mockSettleStep).not.toHaveBeenCalled();
    expect(body).toMatchObject({ complete: false, retry_queued: false, action_id: null });
    expect(String(body['message'])).toContain('Submit again to retry it.');
  });

  it('still bans at the provider when the action could not be stored', async () => {
    mockRecordAction.mockResolvedValue(null);

    const response = await POST(
      adminRequest('https://app.test/api/admin/security?action=ban-user', 'POST', {
        userId: TARGET_ID,
        reason: 'abuse',
      }),
    );

    expect(mockBanUser).toHaveBeenCalledWith(TARGET_ID);
    expect(await response.json()).toMatchObject({ complete: true, provider_status: 'completed' });
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

type ImportedModule7 = typeof import('@/lib/rate-limit');
type ImportedModule6 = typeof import('@/lib/csrf');
type ImportedModule5 = typeof import('@/lib/logger');
type ImportedModule4 = typeof import('@/lib/security-audit');
type ImportedModule3 = typeof import('@/lib/server/neon-db');
type ImportedModule2 = typeof import('@/lib/server/admin-account-actions');
type ImportedModule1 = typeof import('@/lib/services/security-monitoring-service');
type ImportedModule0 = typeof import('@/lib/api-auth');
