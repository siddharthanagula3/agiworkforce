import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  isSwept,
  listLegalHolds,
  releaseLegalHold,
  sweepOrganizationRetention,
  RETENTION_SWEEP_BATCH,
} from '../retention-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-08-23T00:00:00.000Z');

interface Fixture {
  policy?: { retention_days: number; retention_enforced: boolean } | null;
  holds?: Record<string, unknown>[];
  holdsThrow?: boolean;
  deleted?: { id: string }[];
  deleteThrows?: boolean;
  heldCount?: number;
  dueCount?: number;
}

function hold(over: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    organization_id: ORG,
    name: 'Matter 41',
    reason: null,
    scope: 'member',
    subject_user_id: 'user-held',
    created_by_user_id: 'user-admin',
    released_at: null,
    released_by_user_id: null,
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

function harness(fixture: Fixture = {}) {
  const sweepInserts: unknown[][] = [];
  const deletes: string[] = [];

  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    const text = String(sql);

    if (/from public\.organization_admin_policies/i.test(text)) {
      return fixture.policy === undefined
        ? [{ retention_days: 90, retention_enforced: true }]
        : fixture.policy
          ? [fixture.policy]
          : [];
    }
    if (/from public\.legal_holds/i.test(text)) {
      if (fixture.holdsThrow) throw new Error('connection reset');
      return fixture.holds ?? [];
    }
    if (/insert into public\.organization_retention_sweeps/i.test(text)) {
      sweepInserts.push(params ?? []);
      return [];
    }
    if (/delete from public\.web_conversations/i.test(text)) {
      if (fixture.deleteThrows) throw new Error('deadlock detected');
      deletes.push(text);
      return fixture.deleted ?? [{ id: 'c1' }, { id: 'c2' }];
    }
    if (/count\(\*\)/i.test(text) && /user_id = any/i.test(text)) {
      return [
        {
          count: /not \(user_id = any/i.test(text)
            ? (fixture.dueCount ?? 3)
            : (fixture.heldCount ?? 0),
        },
      ];
    }
    return [];
  });

  return {
    db: { query, execute: vi.fn() } as unknown as DatabaseAdapter,
    query,
    sweepInserts,
    deletes,
  };
}

function sweepRow(inserts: unknown[][]) {
  const row = inserts.at(-1);
  if (!row) throw new Error('no sweep recorded');
  return {
    organizationId: row[0],
    retentionDays: row[1],
    cutoff: row[2],
    outcome: row[3],
    deleted: row[4],
    held: row[5],
    activeHolds: row[6],
    dryRun: row[7],
    error: row[8],
  };
}

describe('sweepOrganizationRetention', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not sweep a workspace with no policy row', async () => {
    // No policy means ungoverned, not governed-by-column-defaults. Sweeping
    // here would delete data on the strength of a default nobody chose.
    const h = harness({ policy: null });
    const result = await sweepOrganizationRetention(h.db, ORG, { now: NOW });

    expect(result.outcome).toBe('not_enforced');
    expect(h.deletes).toEqual([]);
    expect(h.sweepInserts).toEqual([]);
  });

  it('does not sweep a workspace that has not opted in', async () => {
    const h = harness({ policy: { retention_days: 30, retention_enforced: false } });
    const result = await sweepOrganizationRetention(h.db, ORG, { now: NOW });

    expect(result.outcome).toBe('not_enforced');
    expect(h.deletes).toEqual([]);
  });

  it('DELETES NOTHING when the legal holds cannot be read', async () => {
    // The single most important behaviour in this file. A missed sweep costs a
    // day of retention drift; a sweep that deletes records under legal hold
    // destroys evidence and cannot be undone.
    const h = harness({ holdsThrow: true });
    const result = await sweepOrganizationRetention(h.db, ORG, { now: NOW });

    expect(result.outcome).toBe('aborted');
    expect(h.deletes).toEqual([]);
    expect(sweepRow(h.sweepInserts).outcome).toBe('aborted');
    expect(String(sweepRow(h.sweepInserts).error)).toMatch(/nothing was deleted/i);
  });

  it('deletes nothing while an organization-wide hold is active', async () => {
    const h = harness({
      holds: [hold({ scope: 'organization', subject_user_id: null })],
    });
    const result = await sweepOrganizationRetention(h.db, ORG, { now: NOW });

    expect(result.outcome).toBe('held');
    expect(h.deletes).toEqual([]);
    expect(sweepRow(h.sweepInserts).outcome).toBe('held');
  });

  it('excludes a held member from the delete, and counts what it withheld', async () => {
    const h = harness({ holds: [hold()], heldCount: 4 });
    const result = await sweepOrganizationRetention(h.db, ORG, { now: NOW });

    expect(isSwept(result) && result.outcome).toBe('deleted');
    expect(isSwept(result) && result.conversationsHeld).toBe(4);
    expect(h.deletes[0]).toMatch(/not \(user_id = any/);

    const heldParam = h.query.mock.calls
      .map((call) => call[1] as unknown[])
      .find((params) => Array.isArray(params?.[2]));
    expect(heldParam?.[2]).toEqual(['user-held']);
  });

  it('measures retention from last activity, not from creation', async () => {
    // An old conversation someone is still working in has not been dormant for
    // the retention window; deleting it reads as data loss, not as policy.
    const h = harness();
    await sweepOrganizationRetention(h.db, ORG, { now: NOW });

    expect(h.deletes[0]).toMatch(/updated_at </);
    expect(h.deletes[0]).not.toMatch(/created_at </);
  });

  it('computes the cutoff from the workspace retention window', async () => {
    const h = harness({ policy: { retention_days: 90, retention_enforced: true } });
    const result = await sweepOrganizationRetention(h.db, ORG, { now: NOW });

    expect(isSwept(result) && result.cutoff).toBe('2026-05-25T00:00:00.000Z');
  });

  it('bounds one run so a backlog cannot pin the connection', async () => {
    const h = harness();
    await sweepOrganizationRetention(h.db, ORG, { now: NOW });

    const deleteParams = h.query.mock.calls.find((call) =>
      /delete from public\.web_conversations/i.test(String(call[0])),
    )?.[1] as unknown[];
    expect(deleteParams?.[3]).toBe(RETENTION_SWEEP_BATCH);
  });

  it('a dry run deletes nothing and records nothing as deleted', async () => {
    const h = harness({ dueCount: 7 });
    const result = await sweepOrganizationRetention(h.db, ORG, { now: NOW, dryRun: true });

    expect(h.deletes).toEqual([]);
    expect(isSwept(result) && result.conversationsDeleted).toBe(0);
    expect(sweepRow(h.sweepInserts).dryRun).toBe(true);
    expect(sweepRow(h.sweepInserts).deleted).toBe(0);
    expect(String(sweepRow(h.sweepInserts).error)).toContain('7 conversation(s) would be deleted');
  });

  it('records a failure rather than reporting a clean run', async () => {
    const h = harness({ deleteThrows: true });
    const result = await sweepOrganizationRetention(h.db, ORG, { now: NOW });

    expect(result.outcome).toBe('failed');
    expect(isSwept(result) && result.error).toContain('deadlock');
    expect(sweepRow(h.sweepInserts).outcome).toBe('failed');
  });

  it('distinguishes an empty window from a sweep that did work', async () => {
    const h = harness({ deleted: [] });
    const result = await sweepOrganizationRetention(h.db, ORG, { now: NOW });

    expect(result.outcome).toBe('nothing_due');
    expect(isSwept(result) && result.conversationsDeleted).toBe(0);
  });

  it('always binds the organization as the first parameter of every read', async () => {
    const h = harness();
    await sweepOrganizationRetention(h.db, ORG, { now: NOW });

    for (const [sql, params] of h.query.mock.calls) {
      if (/insert into/i.test(String(sql))) continue;
      expect((params as unknown[])[0]).toBe(ORG);
    }
  });
});

describe('legal holds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hides released holds unless they are asked for', async () => {
    const h = harness();
    await listLegalHolds(h.db, ORG);
    expect(String(h.query.mock.calls[0]?.[0])).toContain('released_at is null');

    h.query.mockClear();
    await listLegalHolds(h.db, ORG, { includeReleased: true });
    expect(String(h.query.mock.calls[0]?.[0])).not.toContain('released_at is null');
  });

  it('will not release a hold belonging to another organization', async () => {
    const h = harness();
    const released = await releaseLegalHold(h.db, ORG, 'some-id', 'user-admin');

    expect(released).toBeNull();
    expect(String(h.query.mock.calls[0]?.[0])).toContain('organization_id = $1');
  });

  it('will not re-release an already released hold', async () => {
    const h = harness();
    await releaseLegalHold(h.db, ORG, 'some-id', 'user-admin');
    expect(String(h.query.mock.calls[0]?.[0])).toContain('released_at is null');
  });
});
