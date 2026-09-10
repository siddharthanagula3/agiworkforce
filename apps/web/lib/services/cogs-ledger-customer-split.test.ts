import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: vi.fn(async () => []), execute: vi.fn(async () => 1) }),
}));

import { MICROUSD_PER_CREDIT } from '@agiworkforce/types';

import {
  recordProviderCostEvent,
  recordSettledProviderCost,
  resolveCustomerCanonicalMicrousd,
} from '@/lib/services/cogs-ledger-service';

function fakeDb() {
  return { query: vi.fn(async () => []), execute: vi.fn(async () => 1) };
}

function column(db: ReturnType<typeof fakeDb>, name: string): unknown {
  const [sql, params] = db.execute.mock.calls[0] as unknown as [string, unknown[]];
  const columns = (sql.match(/\(([^)]*)\)\s*values/i)?.[1] ?? '')
    .split(',')
    .map((entry) => entry.trim());
  const index = columns.indexOf(name);
  expect(index).toBeGreaterThanOrEqual(0);
  return params[index];
}

const SEARCH_EVENT = {
  capability: 'tool',
  provider: 'perplexity',
  unitBasis: 'request',
  units: 1,
  providerCostCents: 1,
  billedCents: 1,
  sourceRef: 'perplexity_search:turn-1',
} as const;

describe('resolveCustomerCanonicalMicrousd', () => {
  it('takes microUSD directly when the caller has it', () => {
    expect(resolveCustomerCanonicalMicrousd({ customerCanonicalMicrousd: 12_345 })).toBe(12_345);
  });

  it('converts a cents-only caller', () => {
    expect(resolveCustomerCanonicalMicrousd({ customerCanonicalCents: 3 })).toBe(30_000);
  });

  it('returns null rather than borrowing the provider figure', () => {
    expect(resolveCustomerCanonicalMicrousd({})).toBeNull();
    expect(resolveCustomerCanonicalMicrousd({ customerCanonicalMicrousd: -5 })).toBeNull();
  });
});

describe('recordProviderCostEvent · customer and provider columns', () => {
  it('writes the customer charge in microUSD and in credits', async () => {
    const db = fakeDb();
    await recordProviderCostEvent(
      { ...SEARCH_EVENT, userId: 'user-1', customerCanonicalCents: 1 },
      db as never,
    );

    expect(column(db, 'customer_canonical_microusd')).toBe(10_000);
    expect(column(db, 'customer_credits')).toBe(10_000 / MICROUSD_PER_CREDIT);
  });

  it('keeps billed_cents on its historical meaning for compatibility', async () => {
    const db = fakeDb();
    await recordProviderCostEvent(
      { ...SEARCH_EVENT, userId: 'user-1', customerCanonicalCents: 5 },
      db as never,
    );

    expect(column(db, 'billed_cents')).toBe(SEARCH_EVENT.billedCents);
    expect(column(db, 'provider_cost_cents')).toBe(SEARCH_EVENT.providerCostCents);
    expect(column(db, 'provider_estimated_cost_microusd')).toBe(10_000);
  });

  it('leaves the customer columns null when nobody was charged', async () => {
    const db = fakeDb();
    await recordProviderCostEvent({ ...SEARCH_EVENT, userId: 'user-1' }, db as never);

    expect(column(db, 'customer_canonical_microusd')).toBeNull();
    expect(column(db, 'customer_credits')).toBeNull();
  });

  it('records the slicing dimensions the ledger used to hide in metadata', async () => {
    const db = fakeDb();
    await recordProviderCostEvent(
      {
        ...SEARCH_EVENT,
        userId: 'user-1',
        feature: 'web_search_perplexity',
        routeId: 'route-1',
        surface: 'cli',
      },
      db as never,
    );

    expect(column(db, 'feature')).toBe('web_search_perplexity');
    expect(column(db, 'route_id')).toBe('route-1');
    expect(column(db, 'surface')).toBe('cli');
  });

  it('marks a row estimated until a provider figure arrives', async () => {
    const estimated = fakeDb();
    await recordProviderCostEvent({ ...SEARCH_EVENT, userId: 'user-1' }, estimated as never);
    expect(column(estimated, 'reconciliation_status')).toBe('estimated');
    expect(column(estimated, 'provider_reported_cost_microusd')).toBeNull();

    const reported = fakeDb();
    await recordProviderCostEvent(
      { ...SEARCH_EVENT, userId: 'user-1', providerReportedCostCents: 2 },
      reported as never,
    );
    expect(column(reported, 'reconciliation_status')).toBe('provider_reported');
    expect(column(reported, 'provider_reported_cost_microusd')).toBe(20_000);
  });
});

describe('recordSettledProviderCost · attribution defaults', () => {
  it('falls back to the retail figure when the caller passes no customer charge', async () => {
    const db = fakeDb();
    await recordSettledProviderCost({
      userId: 'user-1',
      provider: 'perplexity',
      actualCostCents: 1,
      sourceRef: 'perplexity_search:turn-2',
      usage: { operation: 'tool', requests: 1 },
      feature: 'web_search_perplexity',
      surface: 'api',
      db: db as never,
    });

    expect(column(db, 'feature')).toBe('web_search_perplexity');
    expect(column(db, 'surface')).toBe('api');
    expect(column(db, 'customer_canonical_microusd')).toBeNull();
  });

  it('prefers an explicit customer charge over the retail fallback', async () => {
    const db = fakeDb();
    await recordSettledProviderCost({
      userId: 'user-1',
      provider: 'perplexity',
      actualCostCents: 1,
      sourceRef: 'perplexity_search:turn-3',
      usage: { operation: 'tool', requests: 1 },
      customerCanonicalCents: 1,
      db: db as never,
    });

    expect(column(db, 'customer_canonical_microusd')).toBe(10_000);
  });

  it('leaves the token columns null on a capability that has no tokens', async () => {
    const db = fakeDb();
    await recordSettledProviderCost({
      userId: 'user-1',
      provider: 'perplexity',
      actualCostCents: 1,
      sourceRef: 'perplexity_search:turn-4',
      usage: { operation: 'tool', requests: 1 },
      db: db as never,
    });

    expect(column(db, 'input_tokens')).toBeNull();
    expect(column(db, 'output_tokens')).toBeNull();
  });

  it('splits a chat turn into its token classes', async () => {
    const db = fakeDb();
    await recordSettledProviderCost({
      userId: 'user-1',
      provider: 'anthropic',
      actualCostCents: 40,
      sourceRef: 'managed_usage:user-1:turn-5',
      usage: {
        operation: 'chat',
        inputTokens: 1_000,
        outputTokens: 200,
        cacheReadTokens: 700,
        reasoningTokens: 50,
      },
      db: db as never,
    });

    expect(column(db, 'input_tokens')).toBe(1_000);
    expect(column(db, 'output_tokens')).toBe(200);
    expect(column(db, 'cached_tokens')).toBe(700);
    expect(column(db, 'reasoning_tokens')).toBe(50);
  });
});
