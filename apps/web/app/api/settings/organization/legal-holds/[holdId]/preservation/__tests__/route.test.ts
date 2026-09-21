import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolveCaller: vi.fn(),
  logAdminDataAccess: vi.fn(async () => undefined),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));
vi.mock('@/lib/server/admin-data-access', () => ({
  logAdminDataAccess: mocks.logAdminDataAccess,
}));
vi.mock('@/lib/server/compliance-caller', () => ({
  resolveComplianceCaller: mocks.resolveCaller,
}));

import { createError } from '@/lib/errors';

import { GET } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const HOLD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function holdRow(over: Record<string, unknown> = {}) {
  return {
    id: HOLD,
    organization_id: ORG,
    name: 'Matter 9',
    reason: null,
    scope: 'member',
    subject_user_id: 'alice',
    resource_types: null,
    custodian_user_ids: [],
    created_by_user_id: 'admin',
    released_at: null,
    released_by_user_id: null,
    created_at: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

function call(holdId = HOLD) {
  const url = `https://app.test/api/x/${holdId}/preservation`;
  return GET(new Request(url) as never, { params: Promise.resolve({ holdId }) });
}

function harness(hold: Record<string, unknown> | null, counts: Record<string, number> = {}) {
  const asked: Array<{ sql: string; params: unknown[] }> = [];
  mocks.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/custodian_user_ids/.test(sql)) return hold === null ? [] : [hold];
    asked.push({ sql, params });
    const table = /from public\.([a-z_]+) held/.exec(sql)?.[1] ?? '';
    return [{ count: counts[table] ?? 0 }];
  });
  return asked;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveCaller.mockResolvedValue({
    kind: 'member',
    actorUserId: 'admin-1',
    organizationId: ORG,
    role: 'admin',
  });
});

describe('GET what a legal hold preserves', () => {
  it('counts every store the hold covers, through the deletion predicate', async () => {
    const asked = harness(holdRow(), { web_conversations: 4, media_assets: 2 });

    const body = await (await call()).json();

    expect(body.preserved).toBe(6);
    expect(body.stores).toContainEqual({
      resourceType: 'conversation',
      table: 'web_conversations',
      preserved: 4,
      referenceOnly: 0,
    });
    expect(asked.map((entry) => entry.params[0])).toEqual([
      'conversation',
      'message',
      'project',
      'project_file',
      'file',
      'artifact',
      'work_run',
    ]);
    expect(asked.every((entry) => entry.params[1] === HOLD)).toBe(true);
    expect(asked.every((entry) => /legal_hold_custodians/.test(entry.sql))).toBe(true);
  });

  it('asks only about the stores a narrowed hold names', async () => {
    const asked = harness(holdRow({ resource_types: ['file'] }), { media_assets: 3 });

    const body = await (await call()).json();

    expect(asked).toHaveLength(1);
    expect(body.stores).toEqual([
      { resourceType: 'file', table: 'media_assets', preserved: 3, referenceOnly: 0 },
    ]);
  });

  it('says so when an active hold is preserving nothing at all', async () => {
    harness(holdRow());

    const body = await (await call()).json();

    expect(body.preserved).toBe(0);
    expect(body.preservesNothing).toBe(true);
  });

  it('does not call a released hold a hold that preserves nothing', async () => {
    harness(holdRow({ released_at: '2026-09-10T00:00:00.000Z' }));

    const body = await (await call()).json();

    expect(body.releasedAt).toBe('2026-09-10T00:00:00.000Z');
    expect(body.preservesNothing).toBe(false);
  });

  it('records the read in the workspace trail with what it returned', async () => {
    harness(holdRow(), { web_conversations: 4 });

    await call();

    expect(mocks.logAdminDataAccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ resourceType: 'legal_hold', resourceId: HOLD, count: 4 }),
    );
  });

  it('answers 404 for a hold in another workspace and counts nothing', async () => {
    const asked = harness(null);

    expect((await call()).status).toBe(404);
    expect(asked).toEqual([]);
  });

  it('refuses a caller without the governance permission before reading anything', async () => {
    const asked = harness(holdRow());
    mocks.resolveCaller.mockRejectedValue(createError.forbidden('no'));

    expect((await call()).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(asked).toEqual([]);
  });

  it('rejects a malformed hold id before authorizing', async () => {
    harness(holdRow());

    expect((await call('not-a-uuid')).status).toBe(400);
    expect(mocks.resolveCaller).not.toHaveBeenCalled();
  });
});
