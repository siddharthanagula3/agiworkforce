import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: vi.fn(async () => []), execute: vi.fn(async () => 1) }),
}));

import { listCanonicalModels } from '@agiworkforce/types';

import {
  recordSettledProviderCost,
  resolveTokenClassDimensions,
  summarizeCogs,
} from '@/lib/services/cogs-ledger-service';

function fakeDb(rows: unknown[] = []) {
  return {
    query: vi.fn(async () => rows),
    execute: vi.fn(async () => 1),
  };
}

const cachedReadModel = listCanonicalModels().find(
  (model) =>
    typeof model.cached_input === 'number' &&
    typeof model.inputCost === 'number' &&
    model.cached_input > 0 &&
    model.cached_input < model.inputCost &&
    !model.inputTokenPricingTiers?.length,
);

function insertedRow(db: ReturnType<typeof fakeDb>): {
  sql: string;
  columns: string[];
  params: unknown[];
} {
  const [sql, params] = db.execute.mock.calls[0] as unknown as [string, unknown[]];
  const columns = (sql.match(/\(([^)]*)\)\s*values/i)?.[1] ?? '')
    .split(',')
    .map((column) => column.trim());
  return { sql, columns, params };
}

function dimension(db: ReturnType<typeof fakeDb>, column: string): unknown {
  const { columns, params } = insertedRow(db);
  const index = columns.indexOf(column);
  expect(index).toBeGreaterThanOrEqual(0);
  return params[index];
}

describe('cogs ledger · prompt-cache and compaction token classes', () => {
  it('records cache reads and cache writes as their own dimensions', async () => {
    const db = fakeDb();

    await recordSettledProviderCost({
      userId: 'user-1',
      provider: 'anthropic',
      model: 'fixture-chat-model',
      actualCostCents: 40,
      sourceRef: 'managed_usage:user-1:key:hash',
      taskOutcome: 'delivered',
      usage: {
        inputTokens: 1_000,
        outputTokens: 200,
        totalTokens: 1_200,
        cacheReadTokens: 700,
        cacheWriteTokens: 300,
      },
      db: db as never,
    });

    expect(dimension(db, 'cache_read_units')).toBe(700);
    expect(dimension(db, 'cache_write_units')).toBe(300);
  });

  it('does not add the cache classes on top of the metered units it already counted', async () => {
    const db = fakeDb();

    await recordSettledProviderCost({
      userId: 'user-1',
      provider: 'anthropic',
      model: 'fixture-chat-model',
      actualCostCents: 40,
      sourceRef: 'managed_usage:user-1:key:hash',
      taskOutcome: 'delivered',
      usage: {
        inputTokens: 1_000,
        outputTokens: 200,
        totalTokens: 1_200,
        cacheReadTokens: 700,
        cacheWriteTokens: 300,
      },
      db: db as never,
    });

    expect(dimension(db, 'units')).toBe(1_200);
    expect(dimension(db, 'provider_cost_cents')).toBe(40);
    expect(dimension(db, 'billed_cents')).toBe(40);
  });

  it('prices the cache hit against what the same tokens would have cost uncached', () => {
    expect(cachedReadModel).toBeDefined();
    const model = cachedReadModel!;

    const dimensions = resolveTokenClassDimensions({
      capability: 'chat',
      provider: model.provider,
      model: model.id,
      usage: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 1_000_000 },
    });

    const expectedSavingsCents = Math.round((model.inputCost - model.cached_input!) * 100);
    expect(dimensions.cacheReadUnits).toBe(1_000_000);
    expect(dimensions.cacheSavingsCents).toBe(expectedSavingsCents);
  });

  it('reports no saving when the model prices a cache hit like any other input token', () => {
    const dimensions = resolveTokenClassDimensions({
      capability: 'chat',
      provider: 'anthropic',
      model: 'fixture-chat-model',
      usage: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 1_000_000 },
    });

    expect(dimensions.cacheSavingsCents).toBe(0);
  });

  it('records the tokens compaction removed as its own dimension', async () => {
    const db = fakeDb();

    await recordSettledProviderCost({
      userId: 'user-1',
      provider: 'anthropic',
      model: 'fixture-chat-model',
      actualCostCents: 40,
      sourceRef: 'managed_usage:user-1:key:hash',
      taskOutcome: 'delivered',
      usage: {
        inputTokens: 1_000,
        outputTokens: 200,
        totalTokens: 1_200,
        compactionSavedTokens: 4_000,
      },
      db: db as never,
    });

    expect(dimension(db, 'compaction_saved_units')).toBe(4_000);
    expect(dimension(db, 'units')).toBe(1_200);
  });

  it('leaves the token classes at zero for a capability that is not metered in tokens', async () => {
    const db = fakeDb();

    await recordSettledProviderCost({
      userId: 'user-1',
      provider: 'openai',
      model: 'fixture-image-model',
      actualCostCents: 12,
      sourceRef: 'managed_usage:user-1:image:hash',
      taskOutcome: 'delivered',
      usage: { operation: 'image', outputCount: 2, cacheReadTokens: 500 },
      db: db as never,
    });

    expect(dimension(db, 'cache_read_units')).toBe(0);
    expect(dimension(db, 'cache_write_units')).toBe(0);
    expect(dimension(db, 'compaction_saved_units')).toBe(0);
  });

  it('reads the cache saving and compaction volume back out of the one summary', async () => {
    const db = fakeDb([
      {
        provider_cost_cents: '1000',
        billed_cents: '1500',
        stripe_fee_cents: '0',
        refund_cents: '0',
        chargeback_cents: '0',
        chargeback_reserve_cents: '0',
        discount_cents: '0',
        support_adjustment_cents: '0',
        tax_cents: '0',
        gross_margin_cents: '500',
        cache_read_units: '700',
        cache_write_units: '300',
        compaction_saved_units: '4000',
        cache_savings_cents: '210',
        cache_write_premium_cents: '15',
      },
    ]);

    const summary = await summarizeCogs(
      new Date('2026-06-01T00:00:00Z'),
      new Date('2026-07-01T00:00:00Z'),
      db as never,
    );

    expect(summary.cacheReadUnits).toBe(700);
    expect(summary.cacheWriteUnits).toBe(300);
    expect(summary.compactionSavedUnits).toBe(4_000);
    expect(summary.cacheSavingsCents).toBe(210);
    expect(summary.cacheWritePremiumCents).toBe(15);
    expect(summary.grossMarginCents).toBe(500);
  });
});
