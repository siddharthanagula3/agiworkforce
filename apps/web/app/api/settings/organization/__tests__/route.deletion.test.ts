import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute, mockGetClerkAuthUser, mockRecordAuditEvent } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockGetClerkAuthUser: vi.fn(),
  mockRecordAuditEvent: vi.fn(async () => undefined),
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
}: {
  role?: 'owner' | 'admin' | 'member' | 'viewer' | null;
  deletionRequestedAtIsMissingColumn?: boolean;
  existingScheduledFor?: string | null;
  activeLegalHolds?: number;
} = {}) {
  mockQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) {
      return role ? [{ organization_id: ORG }] : [];
    }
    if (/from public\.organization_members/i.test(text)) {
      return role ? [{ organization_id: ORG, role }] : [];
    }
    if (/select id, name, slug from public\.organizations/i.test(text)) {
      return [organizationRow()];
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
      return 1;
    }
    return 1;
  });
}

function req(body?: unknown): Request {
  return new Request('https://app.test/api/settings/organization', {
    method: 'DELETE',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
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
    bind({ role: 'owner', existingScheduledFor: new Date(Date.now() + 60_000).toISOString() });
    const res = await DELETE(req({ confirm: 'acme' }) as never);
    expect(res.status).toBe(200);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('reports the feature unavailable when the migration has not shipped yet', async () => {
    bind({ role: 'owner', deletionRequestedAtIsMissingColumn: true });
    const res = await DELETE(req({ confirm: 'acme' }) as never);
    expect(res.status).toBe(503);
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
});
