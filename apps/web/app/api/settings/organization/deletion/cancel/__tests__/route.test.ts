import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));

const {
  mockQuery,
  mockGetClerkAuthUser,
  mockGetNeonDb,
  mockRecordAuditEvent,
  mockGetCachedActiveOrganizationId,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetClerkAuthUser: vi.fn(),
  mockGetNeonDb: vi.fn(),
  mockRecordAuditEvent: vi.fn(async () => undefined),
  mockGetCachedActiveOrganizationId: vi.fn(),
}));

vi.mock('@/lib/server/request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<MockedModule0>()),
  getCachedActiveOrganizationId: mockGetCachedActiveOrganizationId,
  setCachedActiveOrganizationId: vi.fn(async () => undefined),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: async (...args: unknown[]) => {
    const { userId } = (await mockGetClerkAuthUser(...args)) as { userId: string };
    return {
      db: { query: (...queryArgs: unknown[]) => mockQuery(...queryArgs) },
      userId,
      organizationId: null,
    };
  },
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mockRecordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logAuthFailure: vi.fn(async () => undefined),
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mockGetNeonDb }));

import { POST } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';

function bind({
  role = 'owner' as 'owner' | 'admin' | 'member' | 'viewer' | null,
  cancelReturns = [{ id: ORG }] as Array<{ id: string }>,
  pendingSelectReturns = [{ deletion_scheduled_for: null }] as Array<{
    deletion_scheduled_for: string | null;
  }>,
}: {
  role?: 'owner' | 'admin' | 'member' | 'viewer' | null;
  cancelReturns?: Array<{ id: string }>;
  pendingSelectReturns?: Array<{ deletion_scheduled_for: string | null }>;
} = {}) {
  mockQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) {
      return role ? [{ organization_id: ORG }] : [];
    }
    if (/from public\.organization_members/i.test(text)) {
      return role ? [{ organization_id: ORG, role }] : [];
    }
    if (/^update public\.organizations/i.test(text.trim())) {
      return cancelReturns;
    }
    if (/select deletion_scheduled_for from public\.organizations/i.test(text)) {
      return pendingSelectReturns;
    }
    return [];
  });
}

function req(selector?: string): Request {
  return new Request('https://app.test/api/settings/organization/deletion/cancel', {
    method: 'POST',
    headers: selector === undefined ? {} : { [MANAGED_CLOUD_ORGANIZATION_HEADER]: selector },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCachedActiveOrganizationId.mockResolvedValue(undefined);
  mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-1' });
});

describe('POST /api/settings/organization/deletion/cancel', () => {
  it('refuses a signed-out caller', async () => {
    const { AppError } = await import('@/lib/errors');
    mockGetClerkAuthUser.mockRejectedValueOnce(
      new AppError('UNAUTHORIZED' as never, 'Unauthorized', 401),
    );
    bind();
    expect((await POST(req() as never)).status).toBe(401);
  });

  it('refuses a plain member', async () => {
    bind({ role: 'member' });
    expect((await POST(req() as never)).status).toBe(403);
  });

  it('refuses an admin who is not the owner', async () => {
    bind({ role: 'admin' });
    expect((await POST(req() as never)).status).toBe(403);
  });

  it('cancels a pending deletion for the owner', async () => {
    bind({ role: 'owner' });
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cancelled: boolean };
    expect(body.cancelled).toBe(true);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'organization_deletion_cancelled',
        organizationId: ORG,
      }),
    );
  });

  it('reports nothing pending when there is no schedule to cancel', async () => {
    bind({
      role: 'owner',
      cancelReturns: [],
      pendingSelectReturns: [{ deletion_scheduled_for: null }],
    });
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cancelled: boolean };
    expect(body.cancelled).toBe(false);
  });

  it('refuses to cancel once the grace window has closed', async () => {
    bind({
      role: 'owner',
      cancelReturns: [],
      pendingSelectReturns: [{ deletion_scheduled_for: '2020-01-01T00:00:00.000Z' }],
    });
    const res = await POST(req() as never);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toMatch(/cancellation window has closed/i);
    expect(body.error.message).not.toMatch(/erasure.*underway/i);
  });

  describe('explicit workspace selection', () => {
    const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
    const NONMEMBER_ORG = '33333333-3333-4333-8333-333333333333';

    beforeEach(() => {
      mockGetCachedActiveOrganizationId.mockResolvedValue(OTHER_ORG);
      mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
        if (sql.includes('from public.organization_members')) {
          return params[0] === ORG || params[0] === OTHER_ORG
            ? [{ organization_id: params[0], user_id: 'user-1', role: 'owner' }]
            : [];
        }
        if (sql.trim().startsWith('update public.organizations')) return [{ id: params[0] }];
        return [];
      });
    });

    it('cancels A rather than the account selection B', async () => {
      const response = await POST(req(ORG) as never);

      expect(response.status).toBe(200);
      expect(mockGetCachedActiveOrganizationId).not.toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('deletion_scheduled_for > now()'),
        [ORG],
      );
      expect(mockRecordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG }),
      );
    });

    it.each([
      ['not-a-workspace', 400],
      [NONMEMBER_ORG, 403],
      [MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE, 404],
    ] as const)('refuses selector %s without cancelling B', async (selector, status) => {
      const response = await POST(req(selector) as never);

      expect(response.status).toBe(status);
      expect(mockGetCachedActiveOrganizationId).not.toHaveBeenCalled();
      expect(mockQuery.mock.calls.some(([sql]) => String(sql).trim().startsWith('update'))).toBe(
        false,
      );
      expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    });

    it('retains legacy headerless cancellation of selected B', async () => {
      const response = await POST(req() as never);

      expect(response.status).toBe(200);
      expect(mockGetCachedActiveOrganizationId).toHaveBeenCalledWith('user-1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('deletion_scheduled_for > now()'),
        [OTHER_ORG],
      );
    });
  });
});

type MockedModule0 = typeof import('@/lib/server/request-context-cache');
