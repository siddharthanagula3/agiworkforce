import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockVerifyCron, mockRecordAuditEvent, mockList, mockSweep } = vi.hoisted(() => ({
  mockVerifyCron: vi.fn(() => true),
  mockRecordAuditEvent: vi.fn(async (_event: unknown) => undefined),
  mockList: vi.fn(),
  mockSweep: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mockVerifyCron }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: vi.fn() }) }));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mockRecordAuditEvent }));
vi.mock('@/lib/services/domain-retention-service', () => ({
  listEnforcedDomainPolicies: mockList,
  sweepOrganizationDomain: mockSweep,
}));

import { GET } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';

function sweep(over: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    domain: 'files',
    retentionDays: 30,
    cutoff: '2026-08-18T00:00:00.000Z',
    outcome: 'deleted',
    recordsDeleted: 4,
    recordsHeld: 1,
    objectsDeleted: 4,
    objectsFailed: 0,
    activeHolds: 1,
    error: null,
    ...over,
  };
}

function req(): Request {
  return new Request('https://app.test/api/cron/enforce-domain-retention');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCron.mockReturnValue(true);
});

describe('GET /api/cron/enforce-domain-retention', () => {
  it('refuses a caller without the cron secret', async () => {
    mockVerifyCron.mockReturnValueOnce(false);

    const res = await GET(req() as never);

    expect(res.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('sweeps every enforced domain and audits each deletion', async () => {
    mockList.mockResolvedValue([
      { organizationId: ORG, domain: 'files', retentionDays: 30 },
      { organizationId: ORG, domain: 'notifications', retentionDays: 7 },
    ]);
    mockSweep
      .mockResolvedValueOnce(sweep())
      .mockResolvedValueOnce(
        sweep({
          domain: 'notifications',
          outcome: 'nothing_due',
          recordsDeleted: 0,
          objectsDeleted: 0,
        }),
      );

    const res = await GET(req() as never);
    const body = await res.json();

    expect(mockSweep).toHaveBeenCalledTimes(2);
    expect(body).toMatchObject({ policiesSwept: 2, recordsDeleted: 4, objectsDeleted: 4 });
    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'domain_retention_sweep_completed',
        organizationId: ORG,
        detail: expect.objectContaining({ scope: 'files', deleted: 4 }),
      }),
    );
  });

  it('audits a held sweep as a failure so it is not mistaken for compliance', async () => {
    mockList.mockResolvedValue([{ organizationId: ORG, domain: 'work', retentionDays: 30 }]);
    mockSweep.mockResolvedValueOnce(sweep({ domain: 'work', outcome: 'held', recordsDeleted: 0 }));

    await GET(req() as never);

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure', severity: 'critical' }),
    );
  });

  it('answers 503 and deletes nothing when policies cannot be listed', async () => {
    mockList.mockRejectedValue(new Error('connection refused'));

    const res = await GET(req() as never);

    expect(res.status).toBe(503);
    expect(mockSweep).not.toHaveBeenCalled();
  });
});
