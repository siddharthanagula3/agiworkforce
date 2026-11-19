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

type QueryCall = [string, unknown[]];

function pageQueries(): QueryCall[] {
  return (mocks.query.mock.calls as QueryCall[]).filter(([sql]) => !/^\s*update/i.test(sql));
}

function stampQueries(): QueryCall[] {
  return (mocks.query.mock.calls as QueryCall[]).filter(([sql]) => /^\s*update/i.test(sql));
}

function queueOf(ids: string[], alreadyAttempted: string[] = []): void {
  const stamped = new Set(alreadyAttempted);
  mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (/^\s*update/i.test(sql)) {
      stamped.add(params[0] as string);
      return [];
    }
    const attemptedThisRun = params[0] as string[];
    return ids
      .filter((id) => !attemptedThisRun.includes(id))
      .map((id, index) => ({ id, index }))
      .sort((a, b) => Number(stamped.has(a.id)) - Number(stamped.has(b.id)) || a.index - b.index)
      .slice(0, 25)
      .map(({ id }) => ({ id }));
  });
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

  it('fails loudly instead of reporting nothing due when the deletion columns are missing', async () => {
    mocks.query.mockImplementation(async () => {
      throw Object.assign(new Error('column does not exist'), { code: '42703' });
    });
    const res = await GET(request() as never);
    expect(res.status).toBe(500);
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

  it('counts a rejected erasure as failed and continues with the next due workspace', async () => {
    mocks.query.mockResolvedValue([{ id: 'org-locked-failed' }, { id: 'org-next' }]);
    mocks.eraseOrganizationData.mockImplementation(async (id: string) => {
      if (id === 'org-locked-failed') throw new Error('lockdown unavailable');
      return baseReport(id);
    });

    const res = await GET(request() as never);
    const body = (await res.json()) as { purged: number; failed: number };

    expect(body.purged).toBe(1);
    expect(body.failed).toBe(1);
    expect(mocks.eraseOrganizationData).toHaveBeenNthCalledWith(2, 'org-next');
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'organization_deletion_completed',
        detail: expect.objectContaining({ resourceId: 'org-next' }),
      }),
    );
  });

  it('reaches a healthy workspace queued behind a full page of held ones', async () => {
    const heldIds = Array.from({ length: 25 }, (_, index) => `org-held-${index}`);
    queueOf([...heldIds, 'org-healthy']);
    mocks.eraseOrganizationData.mockImplementation(async (id: string) =>
      id.startsWith('org-held')
        ? baseReport(id, { complete: false, organizationRetained: true, blockedByLegalHold: true })
        : baseReport(id),
    );

    const res = await GET(request() as never);
    const body = (await res.json()) as {
      candidates: number;
      purged: number;
      held: number;
      deferred: number;
    };

    expect(body).toMatchObject({ candidates: 26, purged: 1, held: 25, deferred: 0 });
    expect(pageQueries()[0]?.[1]).toEqual([[]]);
    expect(pageQueries()[1]?.[1]).toEqual([heldIds]);
    expect(mocks.eraseOrganizationData).toHaveBeenLastCalledWith('org-healthy');
  });

  it('stamps each attempt before erasing and puts the least recently attempted first', async () => {
    queueOf(['org-held-before', 'org-new'], ['org-held-before']);
    mocks.eraseOrganizationData.mockImplementation(async (id: string) =>
      baseReport(id, { complete: false, organizationRetained: true, blockedByLegalHold: true }),
    );

    await GET(request() as never);

    expect(pageQueries()[0]?.[0]).toMatch(
      /order by deletion_last_attempt_at asc nulls first, deletion_scheduled_for asc, id asc/,
    );
    expect(mocks.eraseOrganizationData.mock.calls.map(([id]) => id)).toEqual([
      'org-new',
      'org-held-before',
    ]);
    const stampOrder = stampQueries().map(([, params]) => params[0]);
    expect(stampOrder).toEqual(['org-new', 'org-held-before']);
    const firstStamp =
      mocks.query.mock.invocationCallOrder[mocks.query.mock.calls.indexOf(stampQueries()[0]!)];
    expect(firstStamp).toBeLessThan(mocks.eraseOrganizationData.mock.invocationCallOrder[0]!);
  });

  it('still erases a workspace whose attempt stamp could not be written', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (/^\s*update/i.test(sql)) throw new Error('stamp refused');
      return [{ id: 'org-1' }];
    });
    mocks.eraseOrganizationData.mockImplementation(async (id: string) => baseReport(id));

    const res = await GET(request() as never);
    const body = (await res.json()) as { purged: number };

    expect(body.purged).toBe(1);
  });

  it('stops paging and counts the rest as deferred once the sweep budget is spent', async () => {
    const page = Array.from({ length: 25 }, (_, index) => ({ id: `org-${index}` }));
    mocks.query.mockResolvedValue(page);
    mocks.eraseOrganizationData.mockImplementation(async (id: string) => baseReport(id));
    const now = vi.spyOn(Date, 'now');
    now
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(10 * 60_000);

    const res = await GET(request() as never);
    const body = (await res.json()) as { purged: number; deferred: number };
    now.mockRestore();

    expect(body.purged).toBe(1);
    expect(body.deferred).toBe(24);
    expect(pageQueries()).toHaveLength(1);
  });
});
