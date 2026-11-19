import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const cogsMocks = vi.hoisted(() => ({
  recordSettledProviderCost: vi.fn(async () => undefined),
  getOrganizationMonthToDateSpendCents: vi.fn(async () => 0),
}));
vi.mock('@/lib/services/cogs-ledger-service', () => cogsMocks);
vi.mock('@/lib/services/auto-reload-service', () => ({ maybeTriggerAutoReload: vi.fn() }));

const { finalizeManagedUsageRequest } = await import('../managed-usage-request-service');

function dbSettling(actualCostMicrousd: number) {
  const query = vi.fn(async () => [
    {
      request_status: 'completed',
      operation_result: 'finalized',
      settlement_status: 'succeeded',
      actual_cost_microusd: actualCostMicrousd,
    },
  ]);
  return { query, execute: vi.fn(async () => undefined) } as never;
}

function finalization(db: unknown, overrides: Record<string, unknown> = {}) {
  return {
    db,
    userId: 'user-1',
    idempotencyKey: 'request-00000001',
    requestHash: 'hash-1',
    leaseToken: 'lease-1',
    estimatedCostCents: 1,
    provider: 'anthropic',
    model: 'served-model',
    outcome: 'completed',
    attempt: null,
    ...overrides,
  } as Parameters<typeof finalizeManagedUsageRequest>[0];
}

function recordedCostEvent(): Record<string, unknown> {
  const calls = cogsMocks.recordSettledProviderCost.mock.calls as unknown as Array<
    [Record<string, unknown>]
  >;
  expect(calls).toHaveLength(1);
  return calls[0]![0];
}

beforeEach(() => vi.clearAllMocks());

describe('finalizeManagedUsageRequest hands the cost ledger the exact provider cost', () => {
  it('records a turn settled at 4,999 microUSD as 4,999, not as the rounded cents', async () => {
    await finalizeManagedUsageRequest(
      finalization(dbSettling(4_999), { actualCostMicrousd: 4_999 }),
    );

    expect(recordedCostEvent()).toMatchObject({ providerEstimatedCostMicrousd: 4_999 });
  });

  it('records a turn settled at 5,000 microUSD as 5,000, not as a whole cent', async () => {
    await finalizeManagedUsageRequest(
      finalization(dbSettling(5_000), { actualCostMicrousd: 5_000 }),
    );

    expect(recordedCostEvent()).toMatchObject({ providerEstimatedCostMicrousd: 5_000 });
  });

  it('records the route cost the caller supplied when it differs from what the customer paid', async () => {
    await finalizeManagedUsageRequest(
      finalization(dbSettling(4_999), { actualCostMicrousd: 4_999, providerCostMicrousd: 1_234 }),
    );

    expect(recordedCostEvent()).toMatchObject({ providerEstimatedCostMicrousd: 1_234 });
  });

  it('never marks the estimate as reported by the provider', async () => {
    await finalizeManagedUsageRequest(
      finalization(dbSettling(4_999), { actualCostMicrousd: 4_999 }),
    );

    const event = recordedCostEvent();
    expect(event['providerReportedCostMicrousd']).toBeUndefined();
    expect(event['providerReportedCostCents']).toBeUndefined();
  });
});
