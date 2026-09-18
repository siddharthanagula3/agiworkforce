import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => {
    throw new Error('cost-rollups must not open a connection in a unit test');
  },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  COST_ROLLUP_DIMENSIONS,
  DEFAULT_LOOP_EVENT_THRESHOLD,
  detectCostLoops,
  isCostRollupDimension,
  readCostOperations,
  readCostRollup,
} from '../cost-rollups';

function fakeDb(rows: Record<string, unknown>[]): DatabaseAdapter & { sql: string[] } {
  const sql: string[] = [];
  return {
    sql,
    query: (async (text: string) => {
      sql.push(text);
      return rows;
    }) as DatabaseAdapter['query'],
  } as unknown as DatabaseAdapter & { sql: string[] };
}

function capturingDb(): { db: DatabaseAdapter; params: unknown[][] } {
  const params: unknown[][] = [];
  return {
    params,
    db: {
      query: (async (_text: string, values: unknown[]) => {
        params.push(values);
        return [];
      }) as DatabaseAdapter['query'],
    } as unknown as DatabaseAdapter,
  };
}

const window = { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-18T00:00:00Z') };

describe('cost rollups', () => {
  it('names one expression per dimension and rejects anything else', () => {
    expect([...COST_ROLLUP_DIMENSIONS]).toEqual(['workspace', 'capability', 'workload', 'day']);
    expect(isCostRollupDimension('workspace')).toBe(true);
    expect(isCostRollupDimension('provider')).toBe(false);
  });

  it('groups by the workspace column, falling back to the organization', async () => {
    const db = fakeDb([]);

    await readCostRollup({ ...window, dimension: 'workspace', db });

    expect(db.sql[0]).toContain('coalesce(e.workspace_id, e.organization_id');
    expect(db.sql[0]).toContain('e.occurred_at >= $1');
  });

  it('carries both cache mechanisms rather than collapsing them', async () => {
    const db = fakeDb([
      {
        key: 'chat',
        events: '4',
        provider_microusd: '300',
        customer_microusd: '900',
        cache_hits: '2',
        avoided_microusd: '100',
        cache_savings_cents: '2',
      },
    ]);

    const rollup = await readCostRollup({ ...window, dimension: 'capability', db });
    const [row] = rollup.rows;

    expect(row?.cacheAvoidedMicrousd).toBe(100);
    expect(row?.cacheSavingsMicrousd).toBe(20_000);
    expect(row?.cacheHits).toBe(2);
    expect(row?.cacheSavingsShare).toBeCloseTo(20_100 / 20_400, 10);
  });

  it('reports no savings share rather than zero when nothing was spent', async () => {
    const db = fakeDb([
      {
        key: 'embedding',
        events: '1',
        provider_microusd: '0',
        customer_microusd: '0',
        cache_hits: '0',
        avoided_microusd: '0',
        cache_savings_cents: '0',
      },
    ]);

    const rollup = await readCostRollup({ ...window, dimension: 'capability', db });

    expect(rollup.rows[0]?.cacheSavingsShare).toBeNull();
    expect(rollup.totals.cacheSavingsShare).toBeNull();
  });

  it('adds every group into the totals', async () => {
    const row = (key: string, provider: string) => ({
      key,
      events: '2',
      provider_microusd: provider,
      customer_microusd: '10',
      cache_hits: '1',
      avoided_microusd: '5',
      cache_savings_cents: '0',
    });
    const db = fakeDb([row('work', '100'), row('research', '250'), row('code', '50')]);

    const rollup = await readCostRollup({ ...window, dimension: 'workload', db });

    expect(rollup.rows).toHaveLength(3);
    expect(rollup.totals.providerCostMicrousd).toBe(400);
    expect(rollup.totals.events).toBe(6);
    expect(rollup.totals.cacheAvoidedMicrousd).toBe(15);
  });

  it('names an unattributed group rather than dropping its spend', async () => {
    const db = fakeDb([
      {
        key: null,
        events: '1',
        provider_microusd: '70',
        customer_microusd: '0',
        cache_hits: '0',
        avoided_microusd: '0',
        cache_savings_cents: '0',
      },
    ]);

    const rollup = await readCostRollup({ ...window, dimension: 'workspace', db });

    expect(rollup.rows[0]?.key).toBe('unattributed');
    expect(rollup.totals.providerCostMicrousd).toBe(70);
  });
});

describe('cost loop detection', () => {
  const suspectRow = {
    operation_id: 'task_7',
    scope: 'task',
    events: '120',
    distinct_minutes: '3',
    spent_microusd: '480000',
    delivered_events: '0',
    first_seen: '2026-09-18T12:00:00.000Z',
    last_seen: '2026-09-18T12:03:00.000Z',
  };

  it('correlates repeated spend by the operation id the ledger carries', async () => {
    const db = fakeDb([suspectRow]);

    const [suspect] = await detectCostLoops({ db, now: new Date('2026-09-18T12:05:00Z') });

    expect(db.sql[0]).toContain('coalesce(e.task_ref, e.session_id)');
    expect(suspect?.operationId).toBe('task_7');
    expect(suspect?.scope).toBe('task');
    expect(suspect?.deliveredEvents).toBe(0);
    expect(suspect?.events).toBe(120);
  });

  it('reads only the requested window', async () => {
    const captured = capturingDb();

    await detectCostLoops({
      db: captured.db,
      now: new Date('2026-09-18T12:05:00Z'),
      windowMinutes: 10,
    });

    expect((captured.params[0]?.[0] as Date).toISOString()).toBe('2026-09-18T11:55:00.000Z');
  });

  it('refuses a threshold that would flag every single event', async () => {
    const captured = capturingDb();

    await detectCostLoops({ db: captured.db, eventThreshold: 1 });
    await detectCostLoops({ db: captured.db });

    expect(captured.params[0]?.[1]).toBe(2);
    expect(captured.params[1]?.[1]).toBe(DEFAULT_LOOP_EVENT_THRESHOLD);
  });

  it('drops a row whose operation id is null instead of reporting an empty one', async () => {
    const db = fakeDb([{ ...suspectRow, operation_id: null }]);

    expect(await detectCostLoops({ db })).toEqual([]);
  });
});

describe('cost operations report', () => {
  it('carries the capability and workload vocabularies the ledger writes', async () => {
    const db = fakeDb([]);

    const report = await readCostOperations({ ...window, dimension: 'capability', db });

    expect(report.capabilities).toContain('chat');
    expect(report.workloads).toEqual(['chat', 'work', 'research', 'code', 'browser']);
    expect(report.rollup.dimension).toBe('capability');
    expect(report.loopSuspects).toEqual([]);
  });
});
