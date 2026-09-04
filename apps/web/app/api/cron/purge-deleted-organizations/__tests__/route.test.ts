import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  query: vi.fn(),
  eraseOrganizationData: vi.fn(),
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));
vi.mock('@/lib/server/organization-erasure', () => ({
  eraseOrganizationData: (...args: unknown[]) => mocks.eraseOrganizationData(...args),
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));

import { GET } from '../route';

function request(): Request {
  return new Request('https://app.test/api/cron/purge-deleted-organizations');
}

function baseReport(organizationId: string, overrides: Record<string, unknown> = {}) {
  return {
    organizationId,
    mediaObjectsDeleted: 0,
    mediaObjectsFailed: 0,
    mediaRowsDeleted: 0,
    tables: {},
    anonymized: {},
    complete: true,
    organizationRetained: false,
    blockedByLegalHold: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCronRequest.mockReturnValue(true);
});

describe('GET /api/cron/purge-deleted-organizations', () => {
  it('rejects a request without the cron secret', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);
    const res = await GET(request() as never);
    expect(res.status).toBe(401);
  });

  it('reports the columns unprovisioned rather than failing when the migration has not shipped', async () => {
    mocks.query.mockImplementation(async () => {
      throw Object.assign(new Error('column does not exist'), { code: '42703' });
    });
    const res = await GET(request() as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { candidates: number };
    expect(body.candidates).toBe(0);
    expect(mocks.eraseOrganizationData).not.toHaveBeenCalled();
  });

  it('purges every due workspace and records the completion audit event', async () => {
    mocks.query.mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]);
    mocks.eraseOrganizationData.mockImplementation(async (id: string) => baseReport(id));

    const res = await GET(request() as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { purged: number; held: number; failed: number };
    expect(body.purged).toBe(2);
    expect(body.held).toBe(0);
    expect(body.failed).toBe(0);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'organization_deletion_completed', userId: null }),
    );
  });

  it('leaves a legal-hold-blocked workspace scheduled and reports the block in the audit log', async () => {
    mocks.query.mockResolvedValue([{ id: 'org-held' }]);
    mocks.eraseOrganizationData.mockResolvedValue(
      baseReport('org-held', {
        complete: false,
        organizationRetained: true,
        blockedByLegalHold: true,
      }),
    );

    const res = await GET(request() as never);
    const body = (await res.json()) as { purged: number; held: number; failed: number };
    expect(body.purged).toBe(0);
    expect(body.held).toBe(1);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'organization_deletion_blocked',
        organizationId: 'org-held',
        detail: expect.objectContaining({ reason: 'legal_hold' }),
      }),
    );
  });

  it('leaves an incompletely erased workspace for retry', async () => {
    mocks.query.mockResolvedValue([{ id: 'org-broken' }]);
    mocks.eraseOrganizationData.mockResolvedValue(
      baseReport('org-broken', { complete: false, organizationRetained: true }),
    );

    const res = await GET(request() as never);
    const body = (await res.json()) as { purged: number; failed: number };
    expect(body.purged).toBe(0);
    expect(body.failed).toBe(1);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'organization_deletion_blocked',
        detail: expect.objectContaining({ reason: 'erasure_incomplete' }),
      }),
    );
  });
});
