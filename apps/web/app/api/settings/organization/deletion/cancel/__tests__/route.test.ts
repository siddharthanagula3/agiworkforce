import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockGetClerkAuthUser, mockRecordAuditEvent } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
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
  getNeonDb: vi.fn(() => ({ query: (...args: unknown[]) => mockQuery(...args) })),
}));

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

function req(): Request {
  return new Request('https://app.test/api/settings/organization/deletion/cancel', {
    method: 'POST',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
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
  });
});
