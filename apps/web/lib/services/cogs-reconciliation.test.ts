import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: loggerMocks }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn() }));
vi.mock('@/lib/server/product-analytics', () => ({ trackMeteredCapability: vi.fn() }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { MICROUSD_PER_CENT } from '@agiworkforce/types';

import {
  MANAGED_USAGE_COST_SOURCE_PREFIX,
  MANAGED_USAGE_RECONCILIATION_FINDINGS,
  managedUsageCostSourceRef,
  readDeliveredUsagePositions,
  readSettledCostPositions,
  reconcileManagedUsage,
  reconcileManagedUsageCosts,
  type DeliveredUsagePosition,
  type SettledCostPosition,
} from './cogs-ledger-service';

const WINDOW_START = new Date('2026-09-01T00:00:00.000Z');
const WINDOW_END = new Date('2026-10-01T00:00:00.000Z');

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function costPosition(overrides: Partial<SettledCostPosition> = {}): SettledCostPosition {
  return {
    sourceRef: managedUsageCostSourceRef({
      userId: 'user_1',
      idempotencyKey: 'idem-00000001',
      requestHash: HASH_A,
    }),
    userId: 'user_1',
    provider: 'anthropic',
    providerCostMicrousd: 40_000,
    customerChargedMicrousd: 90_000,
    occurredAt: '2026-09-10T00:00:00.000Z',
    ...overrides,
  };
}

function usagePosition(overrides: Partial<DeliveredUsagePosition> = {}): DeliveredUsagePosition {
  return {
    sourceRef: managedUsageCostSourceRef({
      userId: 'user_1',
      idempotencyKey: 'idem-00000001',
      requestHash: HASH_A,
    }),
    userId: 'user_1',
    provider: 'anthropic',
    customerChargedMicrousd: 90_000,
    occurredAt: '2026-09-10T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the two sides of a settled turn have to agree', () => {
  it('reports nothing when every cost has its usage and every turn is sold above cost', () => {
    expect(reconcileManagedUsage([costPosition()], [usagePosition()])).toEqual([]);
  });

  it('surfaces a cost event whose usage row does not exist', () => {
    const findings = reconcileManagedUsage([costPosition()], []);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.finding).toBe('cost_without_usage');
    expect(findings[0]?.providerCostMicrousd).toBe(40_000);
    expect(findings[0]?.marginMicrousd).toBe(50_000);
  });

  it('surfaces a delivered turn that never wrote a cost event', () => {
    const findings = reconcileManagedUsage([], [usagePosition()]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.finding).toBe('usage_without_cost');
    expect(findings[0]?.providerCostMicrousd).toBe(0);
    expect(findings[0]?.sourceRef).toContain(MANAGED_USAGE_COST_SOURCE_PREFIX);
  });

  it('surfaces a turn charged below what the provider cost', () => {
    const findings = reconcileManagedUsage(
      [costPosition({ providerCostMicrousd: 120_000, customerChargedMicrousd: 90_000 })],
      [usagePosition()],
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.finding).toBe('negative_margin');
    expect(findings[0]?.marginMicrousd).toBe(-30_000);
  });

  it('does not call a turn sold at exactly cost a loss', () => {
    expect(
      reconcileManagedUsage(
        [costPosition({ providerCostMicrousd: 90_000, customerChargedMicrousd: 90_000 })],
        [usagePosition()],
      ),
    ).toEqual([]);
  });

  it('pairs each side only on the source reference the settlement writes', () => {
    const otherHash = managedUsageCostSourceRef({
      userId: 'user_1',
      idempotencyKey: 'idem-00000001',
      requestHash: HASH_B,
    });
    const findings = reconcileManagedUsage(
      [costPosition()],
      [usagePosition({ sourceRef: otherHash })],
    );

    expect(findings.map((finding) => finding.finding).sort()).toEqual([
      'cost_without_usage',
      'usage_without_cost',
    ]);
  });

  it('reports every finding kind it declares, and nothing outside them', () => {
    const findings = reconcileManagedUsage(
      [
        costPosition(),
        costPosition({
          sourceRef: managedUsageCostSourceRef({
            userId: 'user_2',
            idempotencyKey: 'idem-00000002',
            requestHash: HASH_B,
          }),
          userId: 'user_2',
          occurredAt: '2026-09-11T00:00:00.000Z',
        }),
        costPosition({
          sourceRef: managedUsageCostSourceRef({
            userId: 'user_3',
            idempotencyKey: 'idem-00000003',
            requestHash: HASH_C,
          }),
          userId: 'user_3',
          providerCostMicrousd: 500_000,
          customerChargedMicrousd: 10_000,
          occurredAt: '2026-09-12T00:00:00.000Z',
        }),
      ],
      [
        usagePosition(),
        usagePosition({
          sourceRef: managedUsageCostSourceRef({
            userId: 'user_3',
            idempotencyKey: 'idem-00000003',
            requestHash: HASH_C,
          }),
          userId: 'user_3',
          occurredAt: '2026-09-12T00:00:00.000Z',
        }),
        usagePosition({
          sourceRef: managedUsageCostSourceRef({
            userId: 'user_4',
            idempotencyKey: 'idem-00000004',
            requestHash: HASH_A,
          }),
          userId: 'user_4',
          occurredAt: '2026-09-13T00:00:00.000Z',
        }),
      ],
    );

    expect(new Set(findings.map((finding) => finding.finding))).toEqual(
      new Set(MANAGED_USAGE_RECONCILIATION_FINDINGS),
    );
    for (const finding of findings) {
      expect(MANAGED_USAGE_RECONCILIATION_FINDINGS).toContain(finding.finding);
    }
    expect(findings.map((finding) => finding.occurredAt)).toEqual([
      '2026-09-11T00:00:00.000Z',
      '2026-09-12T00:00:00.000Z',
      '2026-09-13T00:00:00.000Z',
    ]);
  });
});

describe('both sides are read in whole microUSD out of the period asked for', () => {
  function makeDb(rowsFor: (sql: string, params: unknown[]) => unknown[]) {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const record = async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return rowsFor(sql, params);
    };
    const db = { query: vi.fn(record), execute: vi.fn(record) } as unknown as DatabaseAdapter;
    return { db, calls };
  }

  it('reads only managed-usage cost events inside the window', async () => {
    const { db, calls } = makeDb((sql) => {
      if (!sql.includes('from public.provider_cost_events')) return [];
      return [
        {
          source_ref: managedUsageCostSourceRef({
            userId: 'user_1',
            idempotencyKey: 'idem-00000001',
            requestHash: HASH_A,
          }),
          user_id: 'user_1',
          provider: 'anthropic',
          provider_cost_cents: '4',
          billed_cents: '9',
          customer_canonical_microusd: null,
          created_at: new Date('2026-09-10T00:00:00.000Z'),
        },
      ];
    });

    const positions = await readSettledCostPositions(WINDOW_START, WINDOW_END, db);

    expect(calls[0]?.params).toEqual([
      WINDOW_START.toISOString(),
      WINDOW_END.toISOString(),
      `${MANAGED_USAGE_COST_SOURCE_PREFIX}%`,
    ]);
    expect(calls[0]?.sql).toContain('e.source_ref like $3::text');
    expect(positions[0]?.providerCostMicrousd).toBe(4 * MICROUSD_PER_CENT);
    expect(positions[0]?.customerChargedMicrousd).toBe(9 * MICROUSD_PER_CENT);
  });

  it('prefers the canonical customer charge over the cents mirror when it is recorded', async () => {
    const { db } = makeDb((sql) => {
      if (!sql.includes('from public.provider_cost_events')) return [];
      return [
        {
          source_ref: 'managed_usage:user_1:idem-00000001:' + HASH_A,
          user_id: 'user_1',
          provider: 'anthropic',
          provider_cost_cents: '4',
          billed_cents: '9',
          customer_canonical_microusd: '86500',
          created_at: '2026-09-10T00:00:00.000Z',
        },
      ];
    });

    const positions = await readSettledCostPositions(WINDOW_START, WINDOW_END, db);

    expect(positions[0]?.customerChargedMicrousd).toBe(86_500);
  });

  it('reads only delivered turns, and rebuilds their source reference', async () => {
    const { db, calls } = makeDb((sql) => {
      if (!sql.includes('from public.managed_usage_requests')) return [];
      return [
        {
          user_id: 'user_9',
          idempotency_key: 'idem-00000009',
          request_hash: HASH_B,
          provider: 'openai',
          actual_cost_cents: '12',
          finalized_at: new Date('2026-09-14T00:00:00.000Z'),
        },
      ];
    });

    const positions = await readDeliveredUsagePositions(WINDOW_START, WINDOW_END, db);

    expect(calls[0]?.sql).toContain("r.status = 'completed'");
    expect(calls[0]?.sql).toContain('coalesce(r.actual_cost_cents, 0) > 0');
    expect(positions[0]?.sourceRef).toBe(
      `${MANAGED_USAGE_COST_SOURCE_PREFIX}user_9:idem-00000009:${HASH_B}`,
    );
    expect(positions[0]?.customerChargedMicrousd).toBe(12 * MICROUSD_PER_CENT);
  });

  it('joins the two reads into findings over one window', async () => {
    const { db } = makeDb((sql) => {
      if (sql.includes('from public.provider_cost_events')) {
        return [
          {
            source_ref: `${MANAGED_USAGE_COST_SOURCE_PREFIX}user_1:idem-00000001:${HASH_A}`,
            user_id: 'user_1',
            provider: 'anthropic',
            provider_cost_cents: '40',
            billed_cents: '1',
            customer_canonical_microusd: '10000',
            created_at: '2026-09-10T00:00:00.000Z',
          },
        ];
      }
      if (sql.includes('from public.managed_usage_requests')) {
        return [
          {
            user_id: 'user_1',
            idempotency_key: 'idem-00000001',
            request_hash: HASH_A,
            provider: 'anthropic',
            actual_cost_cents: '1',
            finalized_at: '2026-09-10T00:00:00.000Z',
          },
        ];
      }
      return [];
    });

    const findings = await reconcileManagedUsageCosts(WINDOW_START, WINDOW_END, db);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.finding).toBe('negative_margin');
    expect(findings[0]?.marginMicrousd).toBe(10_000 - 40 * MICROUSD_PER_CENT);
  });
});
