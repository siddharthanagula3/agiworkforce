import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));

const {
  mockQuery, mockExecute, mockGetClerkAuthUser, mockRecordAuditEvent,
  mockGetCachedActiveOrganizationId,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockGetClerkAuthUser: vi.fn(),
  mockRecordAuditEvent: vi.fn(async () => undefined),
  mockGetCachedActiveOrganizationId: vi.fn(),
}));

vi.mock('@/lib/server/request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/request-context-cache')>()),
  getCachedActiveOrganizationId: mockGetCachedActiveOrganizationId,
  setCachedActiveOrganizationId: vi.fn(async () => undefined),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mockGetClerkAuthUser }));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mockRecordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logAuthFailure: vi.fn(async () => undefined),
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockQuery(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
  })),
}));

import { DELETE } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';

function organizationRow(over: Record<string, unknown> = {}) {
  return { id: ORG, name: 'Acme', slug: 'acme', ...over };
}

function bind({
  role = 'member' as 'owner' | 'admin' | 'member' | 'viewer' | null,
  deletionRequestedAtIsMissingColumn = false,
  existingScheduledFor = null as string | null,
  activeLegalHolds = 0,
  seatSubscriptionId = null as string | null,
  scheduleUpdateRows = 1,
}: {
  role?: 'owner' | 'admin' | 'member' | 'viewer' | null;
  deletionRequestedAtIsMissingColumn?: boolean;
  existingScheduledFor?: string | null;
  activeLegalHolds?: number;
  seatSubscriptionId?: string | null;
  scheduleUpdateRows?: number;
} = {}) {
  mockQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) {
      return role ? [{ organization_id: ORG }] : [];
    }
    if (/from public\.organization_members/i.test(text)) {
      return role ? [{ organization_id: ORG, role }] : [];
    }
    if (/select id, name, slug(, stripe_subscription_id)? from public\.organizations/i.test(text)) {
      return [organizationRow({ stripe_subscription_id: seatSubscriptionId })];
    }
    if (/count\(\*\)::int as count\s+from public\.legal_holds/i.test(text)) {
      return [{ count: activeLegalHolds }];
    }
    if (/select deletion_requested_at/i.test(text)) {
      if (deletionRequestedAtIsMissingColumn) {
        const error = new Error('column "deletion_requested_at" does not exist') as Error & {
          code: string;
        };
        error.code = '42703';
        throw error;
      }
      return [
        {
          deletion_requested_at: existingScheduledFor ? '2026-09-01T00:00:00.000Z' : null,
          deletion_scheduled_for: existingScheduledFor,
        },
      ];
    }
    return [];
  });
  mockExecute.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/update public\.organizations/i.test(text) && /deletion_scheduled_for/i.test(text)) {
      if (deletionRequestedAtIsMissingColumn) {
        const error = new Error('column "deletion_requested_at" does not exist') as Error & {
          code: string;
        };
        error.code = '42703';
        throw error;
      }
      return scheduleUpdateRows;
    }
    return 1;
  });
}

function req(body?: unknown, selector?: string): Request {
  return new Request('https://app.test/api/settings/organization', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(selector === undefined ? {} : { [MANAGED_CLOUD_ORGANIZATION_HEADER]: selector }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCachedActiveOrganizationId.mockResolvedValue(undefined);
  mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-1' });
});

describe('DELETE /api/settings/organization', () => {
  it('refuses a signed-out caller', async () => {
    const { AppError } = await import('@/lib/errors');
    mockGetClerkAuthUser.mockRejectedValueOnce(
      new AppError('UNAUTHORIZED' as never, 'Unauthorized', 401),
    );
    bind({ role: 'owner' });
    const res = await DELETE(req({ confirm: 'acme' }) as never);
    expect(res.status).toBe(401);
  });

  it('refuses a plain member', async () => {
    bind({ role: 'member' });
    const res = await DELETE(req({ confirm: 'acme' }) as never);
    expect(res.status).toBe(403);
  });

  it('refuses an admin who is not the owner', async () => {
    bind({ role: 'admin' });
    const res = await DELETE(req({ confirm: 'acme' }) as never);
    expect(res.status).toBe(403);
  });

  it('refuses a caller with no workspace', async () => {
    bind({ role: null });
    const res = await DELETE(req({ confirm: 'acme' }) as never);
    expect(res.status).toBe(404);
  });

  it('rejects a confirmation that does not match the name or slug', async () => {
    bind({ role: 'owner' });
    const res = await DELETE(req({ confirm: 'not-acme' }) as never);
    expect(res.status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('schedules deletion for the owner when the confirmation matches the slug', async () => {
    bind({ role: 'owner' });
    const res = await DELETE(req({ confirm: 'acme' }) as never);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { scheduledFor: string; coolingPeriodDays: number };
    expect(body.coolingPeriodDays).toBeGreaterThan(0);
    expect(new Date(body.scheduledFor).getTime()).toBeGreaterThan(Date.now());
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('deletion_scheduled_for'),
      expect.arrayContaining([ORG, expect.any(String), 'user-1']),
    );
    expect(String(mockExecute.mock.calls[0]?.[0])).toMatch(
      /where id = \$1\s+and deletion_scheduled_for is null/,
    );
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'organization_deletion_requested',
        organizationId: ORG,
        severity: 'critical',
      }),
    );
  });

  it('schedules deletion for the owner when the confirmation matches the display name', async () => {
    bind({ role: 'owner' });
    const res = await DELETE(req({ confirm: 'Acme' }) as never);
    expect(res.status).toBe(200);
  });

  it('is idempotent when deletion is already pending', async () => {
    const scheduledFor = new Date(Date.now() + 60_000).toISOString();
    bind({ role: 'owner', existingScheduledFor: scheduledFor });
    const res = await DELETE(req({ confirm: 'acme' }) as never);
    expect(res.status).toBe(200);
    expect((await res.json()).scheduledFor).toBe(scheduledFor);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('does not restart the cancellation window for an overdue schedule', async () => {
    bind({ role: 'owner', existingScheduledFor: '2020-01-01T00:00:00.000Z' });

    const response = await DELETE(req({ confirm: 'acme' }) as never);

    expect(response.status).toBe(409);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    expect((await response.json()).error.message).toMatch(/cancellation window has closed/i);
  });

  it('reports changed state when the conditional scheduling update changes no row', async () => {
    bind({ role: 'owner', scheduleUpdateRows: 0 });

    const response = await DELETE(req({ confirm: 'acme' }) as never);

    expect(response.status).toBe(409);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(String(mockExecute.mock.calls[0]?.[0])).toMatch(
      /where id = \$1\s+and deletion_scheduled_for is null/,
    );
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    expect((await response.json()).error.message).toMatch(/state changed/i);
  });

  it('fails and schedules nothing when the deletion columns are missing', async () => {
    bind({ role: 'owner', deletionRequestedAtIsMissingColumn: true });
    const res = await DELETE(req({ confirm: 'acme' }) as never);
    expect(res.status).toBe(500);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses to schedule deletion while a legal hold is active, naming the hold count', async () => {
    bind({ role: 'owner', activeLegalHolds: 2 });
    const res = await DELETE(req({ confirm: 'acme' }) as never);

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain('2');
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('schedules deletion once every legal hold has been released', async () => {
    bind({ role: 'owner', activeLegalHolds: 0 });
    const res = await DELETE(req({ confirm: 'acme' }) as never);

    expect(res.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('deletion_scheduled_for'),
      expect.arrayContaining([ORG, expect.any(String), 'user-1']),
    );
  });

  it('refuses to schedule deletion while the workspace seat plan is still billing', async () => {
    bind({ role: 'owner', seatSubscriptionId: 'sub_seats1' });
    const res = await DELETE(req({ confirm: 'acme' }) as never);

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe('Cancel the workspace plan before deleting the workspace.');
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  describe('explicit workspace selection', () => {
    const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
    const NONMEMBER_ORG = '33333333-3333-4333-8333-333333333333';

    beforeEach(() => {
      mockGetCachedActiveOrganizationId.mockResolvedValue(OTHER_ORG);
      mockExecute.mockResolvedValue(1);
      mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
        if (sql.includes('from public.organization_members')) {
          return params[0] === ORG || params[0] === OTHER_ORG
            ? [{ organization_id: params[0], user_id: 'user-1', role: 'owner' }]
            : [];
        }
        if (sql.includes('select id, name, slug')) {
          return [organizationRow({ id: params[0], stripe_subscription_id: null })];
        }
        if (sql.includes('from public.legal_holds')) return [{ count: 0 }];
        if (sql.includes('select deletion_requested_at')) {
          return [{ deletion_requested_at: null, deletion_scheduled_for: null }];
        }
        return [];
      });
    });

    it('schedules A rather than selected B even when their confirmation names match', async () => {
      const response = await DELETE(req({ confirm: 'Acme' }, ORG) as never);

      expect(response.status).toBe(200);
      expect(mockGetCachedActiveOrganizationId).not.toHaveBeenCalled();
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('deletion_scheduled_for'), [
        ORG, expect.any(String), 'user-1',
      ]);
      expect(mockRecordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG }));
    });

    it.each([
      ['not-a-workspace', 400],
      [NONMEMBER_ORG, 403],
      [MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE, 404],
    ] as const)('refuses selector %s without scheduling B', async (selector, status) => {
      const response = await DELETE(req({ confirm: 'Acme' }, selector) as never);

      expect(response.status).toBe(status);
      expect(mockGetCachedActiveOrganizationId).not.toHaveBeenCalled();
      expect(mockExecute).not.toHaveBeenCalled();
      expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    });

    it('retains legacy headerless scheduling of selected B', async () => {
      const response = await DELETE(req({ confirm: 'Acme' }) as never);

      expect(response.status).toBe(200);
      expect(mockGetCachedActiveOrganizationId).toHaveBeenCalledWith('user-1');
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('deletion_scheduled_for'), [
        OTHER_ORG, expect.any(String), 'user-1',
      ]);
    });
  });
});
