import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: vi.fn(async () => []), execute: vi.fn(async () => 1) }),
}));

import { COGS_CAPABILITIES, COGS_UNIT_BASES } from '@/lib/services/cogs-ledger-service';
import {
  infrastructureCostMicrousd,
  recordCacheHitCostEvent,
  recordInfrastructureCostEvent,
  recordProviderCostEvent,
  resolveCogsCapability,
  resolveCogsUnits,
  type InfrastructureCogsCapability,
} from '@/lib/services/cogs-ledger-service';

const INFRASTRUCTURE: readonly InfrastructureCogsCapability[] = [
  'storage',
  'database',
  'vector',
  'notification',
  'email',
  'egress',
  'browser',
  'work_compute',
  'code_compute',
];

function fakeDb(rows: unknown[] = []) {
  return { query: vi.fn(async () => rows), execute: vi.fn(async () => 1) };
}

function insertedColumn(db: ReturnType<typeof fakeDb>, name: string): unknown {
  const [sql, params] = db.execute.mock.calls[0] as unknown as [string, unknown[]];
  const columns = (sql.match(/\(([^)]*)\)\s*values/i)?.[1] ?? '')
    .split(',')
    .map((entry) => entry.trim());
  const index = columns.indexOf(name);
  expect(index).toBeGreaterThanOrEqual(0);
  return params[index];
}

afterEach(() => {
  delete process.env['AGI_EGRESS_MICROUSD_PER_GIB'];
});

describe('cost of goods beyond inference', () => {
  it('enumerates every cost the platform carries, not only model calls', () => {
    for (const capability of INFRASTRUCTURE) {
      expect(COGS_CAPABILITIES).toContain(capability);
    }
    expect(COGS_UNIT_BASES).toContain('gibibyte');
    expect(COGS_UNIT_BASES).toContain('gibibyte_month');
  });

  it('meters each new capability in the unit its vendor bills', () => {
    expect(resolveCogsUnits('storage', { gibibyteMonths: 2.5 })).toEqual({
      unitBasis: 'gibibyte_month',
      units: 2.5,
    });
    expect(resolveCogsUnits('egress', { gibibytes: 0.5 })).toEqual({
      unitBasis: 'gibibyte',
      units: 0.5,
    });
    expect(resolveCogsUnits('database', { computeSeconds: 12 })).toEqual({
      unitBasis: 'second',
      units: 12,
    });
    expect(resolveCogsUnits('work_compute', { computeMinutes: 4 })).toEqual({
      unitBasis: 'minute',
      units: 4,
    });
    expect(resolveCogsUnits('email', {})).toEqual({ unitBasis: 'request', units: 1 });
  });

  it('recognises a named operation for each of them', () => {
    for (const capability of INFRASTRUCTURE) {
      expect(resolveCogsCapability({ operation: capability })).toBe(capability);
    }
  });

  it('records what was consumed even while the deployment publishes no rate', async () => {
    expect(infrastructureCostMicrousd('egress', 4)).toBeNull();
    const db = fakeDb();
    await recordInfrastructureCostEvent({
      userId: 'user_1',
      capability: 'egress',
      provider: 'object_storage',
      units: 4,
      sourceRef: 'egress:test-1',
      db: db as never,
    });
    expect(insertedColumn(db, 'units')).toBe(4);
    expect(insertedColumn(db, 'provider_cost_cents')).toBe(0);
    expect(insertedColumn(db, 'unit_basis')).toBe('gibibyte');
    expect(insertedColumn(db, 'feature')).toBe('network_egress_gib');
  });

  it('prices the same consumption once the deployment sets the rate', async () => {
    process.env['AGI_EGRESS_MICROUSD_PER_GIB'] = '90000';
    expect(infrastructureCostMicrousd('egress', 2)).toBe(180_000);
    const db = fakeDb();
    await recordInfrastructureCostEvent({
      userId: 'user_1',
      capability: 'egress',
      provider: 'object_storage',
      units: 2,
      sourceRef: 'egress:test-2',
      db: db as never,
    });
    expect(insertedColumn(db, 'provider_cost_cents')).toBe(18);
  });

  it('writes a cache hit as a zero-cost row carrying the call it replaced', async () => {
    const db = fakeDb();
    await recordCacheHitCostEvent({
      userId: 'user_1',
      provider: 'openai',
      model: 'some-model',
      mechanism: 'agi_semantic_response_cache',
      avoidedCostMicrousd: 12_345,
      sourceRef: 'support-cache:test',
      promptIds: ['support.system@1'],
      usage: { operation: 'chat', promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      db: db as never,
    });
    expect(insertedColumn(db, 'cache_hit')).toBe(true);
    expect(insertedColumn(db, 'avoided_cost_microusd')).toBe(12_345);
    expect(insertedColumn(db, 'provider_cost_cents')).toBe(0);
    expect(insertedColumn(db, 'billed_cents')).toBe(0);
    expect(insertedColumn(db, 'prompt_ids')).toEqual(['support.system@1']);
  });

  it('stamps the prompt manifest on an ordinary cost row and drops anything that is not a stamp', async () => {
    const db = fakeDb();
    await recordProviderCostEvent(
      {
        userId: 'user_1',
        capability: 'chat',
        provider: 'openai',
        unitBasis: 'token',
        units: 10,
        providerCostCents: 1,
        billedCents: 1,
        sourceRef: 'chat:test',
        promptIds: ['research.system@1', 'not a stamp'],
      },
      db as never,
    );
    expect(insertedColumn(db, 'prompt_ids')).toEqual(['research.system@1']);
    expect(insertedColumn(db, 'cache_hit')).toBe(false);
  });
});
