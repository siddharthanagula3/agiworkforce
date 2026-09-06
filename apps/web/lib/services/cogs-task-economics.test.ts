import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: vi.fn(async () => []), execute: vi.fn(async () => 1) }),
}));
vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/types')>();
  const fixture = {
    id: 'fixture-retail-model',
    provider: 'openai',
    inputCost: 2,
    outputCost: 8,
  };
  return {
    ...actual,
    getModelMetadataById: (id: string) =>
      id === fixture.id ? fixture : actual.getModelMetadataById(id),
  };
});

import {
  recordSettledProviderCost,
  summarizeTaskEconomics,
} from '@/lib/services/cogs-ledger-service';

const FIXTURE_RETAIL_MODEL = 'fixture-retail-model';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '../../db/neon/0129_cost_event_task_economics.sql'),
  'utf8',
);
const down = fs.readFileSync(
  path.resolve(import.meta.dirname, '../../db/neon/down/0129_cost_event_task_economics.down.sql'),
  'utf8',
);

function fakeDb(rows: unknown[] = []) {
  return {
    query: vi.fn(async (_sql: string, _params?: unknown[]) => rows),
    execute: vi.fn(async (_sql: string, _params: unknown[] = []) => 1),
  };
}

describe('cost events carry the task they bought and how it ended', () => {
  it('writes the outcome and the task identity with every settled cost', async () => {
    const db = fakeDb();

    await recordSettledProviderCost({
      userId: 'user_1',
      provider: 'openai',
      model: FIXTURE_RETAIL_MODEL,
      actualCostCents: 42,
      sourceRef: 'managed_usage:user_1:key-1:hash-1',
      taskOutcome: 'delivered',
      taskRef: 'hash-1',
      usage: { inputTokens: 100, outputTokens: 50 },
      db: db as never,
    });

    const [sql, params] = db.execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('task_outcome');
    expect(sql).toContain('task_ref');
    expect(params).toContain('delivered');
    expect(params).toContain('hash-1');
  });

  it('does not bill work the client never confirmed receiving, but still records its cost', async () => {
    const db = fakeDb();

    await recordSettledProviderCost({
      userId: 'user_1',
      provider: 'test-provider',
      actualCostCents: 37,
      sourceRef: 'managed_usage:user_1:key-2:hash-2',
      taskOutcome: 'undelivered',
      taskRef: 'hash-2',
      usage: { inputTokens: 10, outputTokens: 5 },
      db: db as never,
    });

    const [, params] = db.execute.mock.calls[0] as unknown as [string, unknown[]];
    const providerCostIndex = 6;
    const billedIndex = 7;
    expect(params[providerCostIndex]).toBe(37);
    expect(params[billedIndex]).toBe(0);
    expect(params).toContain('undelivered');
  });

  it('reads cost per delivered task, repeat cost and undelivered cost from one aggregate', async () => {
    const db = fakeDb([
      {
        delivered_tasks: 4,
        delivered_task_cost_cents: 200,
        repeated_tasks: 1,
        repeat_cost_cents: 60,
        undelivered_events: 2,
        undelivered_cost_cents: 25,
        unattributed_cost_cents: 5,
      },
    ]);

    const economics = await summarizeTaskEconomics(
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-09-01T00:00:00Z'),
      db as never,
    );

    expect(db.query.mock.calls[0]?.[0]).toContain('public.task_economics');
    expect(economics.costPerDeliveredTaskCents).toBe(50);
    expect(economics.repeatCostCents).toBe(60);
    expect(economics.undeliveredCostCents).toBe(25);
    expect(economics.unattributedCostCents).toBe(5);
  });
});

describe('task economics migration', () => {
  it('adds the task dimension to the existing cost ledger', () => {
    expect(migration).toContain('add column if not exists task_ref text');
    expect(migration).toContain('add column if not exists task_outcome text');
    expect(migration).toContain("check (task_outcome = any (array['delivered', 'undelivered']))");
  });

  it('separates first-attempt cost from repeat cost per task', () => {
    expect(migration).toContain('create or replace function public.task_economics');
    expect(migration).toContain('partition by event.task_ref');
    expect(migration).toContain('delivered_task_cost_cents bigint');
    expect(migration).toContain('repeat_cost_cents bigint');
    expect(migration).toContain('undelivered_cost_cents bigint');
  });

  it('provides a reversible down migration', () => {
    expect(down).toContain('drop function if exists public.task_economics');
    expect(down).toContain('drop column if exists task_outcome');
    expect(down).toContain("filename = '0129_cost_event_task_economics.sql'");
  });
});
