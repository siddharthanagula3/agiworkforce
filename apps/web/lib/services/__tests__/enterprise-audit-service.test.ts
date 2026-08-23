import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  AUDIT_PAGE_SIZE_MAX,
  iterateAuditEventsForExport,
  listAuditEvents,
} from '../enterprise-audit-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';

function harness() {
  const query = vi.fn();
  return { db: { query, execute: vi.fn() } as unknown as DatabaseAdapter, query };
}

function row(i: number, createdAt = '2026-08-23T00:00:00.000Z') {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
    organization_id: ORG,
    actor_user_id: `user-${i}`,
    surface: 'web',
    action: 'admin_policy_changed',
    resource_type: 'organization_admin_policy',
    resource_id: ORG,
    outcome: 'success' as const,
    severity: 'info' as const,
    metadata: {},
    created_at: createdAt,
  };
}

function lastCall(query: ReturnType<typeof vi.fn>) {
  const call = query.mock.calls.at(-1);
  return { sql: String(call?.[0]), params: (call?.[1] ?? []) as unknown[] };
}

describe('listAuditEvents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('always pins the organization as the first bound parameter', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]);

    await listAuditEvents(h.db, ORG);

    const { sql, params } = lastCall(h.query);
    expect(params[0]).toBe(ORG);
    expect(sql).toContain('organization_id = $1');
    expect(sql).not.toContain(OTHER_ORG);
  });

  it('binds every filter rather than interpolating it into the SQL', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]);

    await listAuditEvents(h.db, ORG, {
      actorUserId: "user-1'; drop table x; --",
      action: 'member_removed',
      outcome: 'denied',
      severity: 'critical',
    });

    const { sql, params } = lastCall(h.query);
    expect(sql).not.toContain('drop table');
    expect(params).toContain("user-1'; drop table x; --");
    expect(params).toContain('member_removed');
    expect(params).toContain('denied');
    expect(params).toContain('critical');
  });

  it('orders by the total key so a page boundary cannot skip or repeat', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]);

    await listAuditEvents(h.db, ORG);

    expect(lastCall(h.query).sql).toContain('order by created_at desc, id desc');
  });

  it('returns a cursor only when another page exists', async () => {
    const h = harness();
    // limit 2 fetches 3; three rows back means there is more.
    h.query.mockResolvedValueOnce([row(1), row(2), row(3)]);

    const page = await listAuditEvents(h.db, ORG, {}, { limit: 2 });

    expect(page.events).toHaveLength(2);
    expect(page.nextCursor).toEqual({
      createdAt: '2026-08-23T00:00:00.000Z',
      id: row(2).id,
    });
  });

  it('reports no cursor on the final page', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([row(1), row(2)]);

    const page = await listAuditEvents(h.db, ORG, {}, { limit: 5 });

    expect(page.events).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('advances with a compound keyset rather than an offset', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]);

    await listAuditEvents(
      h.db,
      ORG,
      {},
      { cursor: { createdAt: '2026-08-23T00:00:00.000Z', id: row(9).id } },
    );

    const { sql, params } = lastCall(h.query);
    expect(sql).toContain('(created_at, id) <');
    expect(sql).not.toMatch(/\boffset\b/i);
    expect(params).toContain(row(9).id);
  });

  it('clamps the page size to the documented ceiling', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]);

    await listAuditEvents(h.db, ORG, {}, { limit: 100_000 });

    expect(lastCall(h.query).sql).toContain(`limit ${AUDIT_PAGE_SIZE_MAX + 1}`);
  });
});

describe('iterateAuditEventsForExport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('walks every batch and stops on a short one', async () => {
    const h = harness();
    const full = Array.from({ length: 3 }, (_, i) => row(i + 1));
    h.query.mockResolvedValueOnce(full).mockResolvedValueOnce([row(4), row(5)]);

    const seen: string[] = [];
    for await (const batch of iterateAuditEventsForExport(h.db, ORG, {}, 3)) {
      seen.push(...batch.map((e) => e.actorUserId ?? ''));
    }

    expect(seen).toEqual(['user-1', 'user-2', 'user-3', 'user-4', 'user-5']);
    expect(h.query).toHaveBeenCalledTimes(2);
  });

  it('never uses OFFSET, so concurrent writes cannot drop rows from an extract', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([row(1)]);

    for await (const _ of iterateAuditEventsForExport(h.db, ORG, {}, 5)) void _;

    expect(lastCall(h.query).sql).not.toMatch(/\boffset\b/i);
  });

  it('stops immediately on an empty first batch', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]);

    const batches = [];
    for await (const batch of iterateAuditEventsForExport(h.db, ORG)) batches.push(batch);

    expect(batches).toHaveLength(0);
    expect(h.query).toHaveBeenCalledTimes(1);
  });

  it('keeps the organization pinned on every batch', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([row(1), row(2)]).mockResolvedValueOnce([row(3)]);

    for await (const _ of iterateAuditEventsForExport(h.db, ORG, {}, 2)) void _;

    for (const call of h.query.mock.calls) {
      expect((call[1] as unknown[])[0]).toBe(ORG);
    }
  });
});
