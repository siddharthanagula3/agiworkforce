import { describe, expect, it, vi } from 'vitest';
import { listCanonicalModels } from '@agiworkforce/types';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<ManagedUsageRequestServiceModule>()),
  estimateMicrousdOf: (source: { estimatedCostMicrousd?: number }) =>
    source.estimatedCostMicrousd ?? 0,
  finalizeManagedUsageRequest: vi.fn(async (input) => ({
    requestStatus: 'completed',
    operationResult: 'finalized',
    settlementStatus: 'succeeded',
    actualCostMicrousd: input.actualCostMicrousd,
  })),
}));

import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import {
  getPlanSessionUsageCapMicrousd,
  MICROUSD_PER_LEDGER_CENT,
} from '@/lib/server/managed-usage-policy';
import { finalizeManagedUsageRequest } from '@/lib/services/managed-usage-request-service';
import {
  accumulateObservedProviderUsage,
  createObservedProviderUsage,
  finalizeObservedManagedUsage,
  observedListLedgerMicrousd,
} from '@/lib/services/managed-usage-accounting-service';

type ManagedUsageRequestServiceModule =
  typeof import('@/lib/services/managed-usage-request-service');

const model = listCanonicalModels().find(
  (candidate) =>
    candidate.provider === 'anthropic' &&
    candidate.qualityTier === 'fast' &&
    candidate.reasoning?.thinkingDefault === 'adaptive' &&
    candidate.reasoning?.supportsManualThinking === false,
);
if (!model) throw new Error('The canonical adaptive Haiku fixture model is missing.');
const pricing = { provider: model.provider, model: model.id };
const unexpectedDatabaseCall = (): never => {
  throw new Error('The observed-cost unit test must not access a database.');
};
const offlineDb: DatabaseAdapter = {
  query: async () => unexpectedDatabaseCall(),
  execute: async () => unexpectedDatabaseCall(),
  transaction: async () => unexpectedDatabaseCall(),
  withUser: unexpectedDatabaseCall,
  withOrg: unexpectedDatabaseCall,
  dispose: async () => unexpectedDatabaseCall(),
};

describe('observed managed usage uses the real precise cost owner', () => {
  it('finalizes the captured low-cost Haiku turn in microUSD instead of treating legacy cents as dollars', async () => {
    const usage = createObservedProviderUsage();
    accumulateObservedProviderUsage(usage, { inputTokens: 12761, outputTokens: 110 }, pricing);
    const expected = Math.ceil(12761 * model.inputCost + 110 * model.outputCost);
    expect(
      LLMCostCalculator.calculateListCost(model.id, {
        promptTokens: 12761,
        completionTokens: 110,
        totalTokens: 12871,
      }),
    ).toBe(1);
    expect(expected).toBeLessThan(MICROUSD_PER_LEDGER_CENT);
    expect(observedListLedgerMicrousd(usage, pricing)).toBe(expected);
    await finalizeObservedManagedUsage({
      reservation: {
        db: offlineDb,
        userId: 'fixture-user',
        idempotencyKey: 'fixture-cost-unit',
        requestHash: 'fixture-hash',
        leaseToken: 'fixture-lease',
        estimatedCostCents: 1,
        estimatedCostMicrousd: 1528,
      },
      ...pricing,
      usage,
      reason: 'fixture_unit_regression',
    });
    expect(vi.mocked(finalizeManagedUsageRequest).mock.calls.at(-1)?.[0]).toMatchObject({
      actualCostMicrousd: expected,
      providerCostMicrousd: expected,
    });
  });

  it.each([
    {
      inputTokens: 12761,
      outputTokens: 110,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheWrite1hTokens: 0,
    },
    {
      inputTokens: 761,
      outputTokens: 110,
      cacheReadTokens: 12000,
      cacheWriteTokens: 0,
      cacheWrite1hTokens: 0,
    },
    {
      inputTokens: 761,
      outputTokens: 110,
      cacheReadTokens: 0,
      cacheWriteTokens: 12000,
      cacheWrite1hTokens: 0,
    },
    {
      inputTokens: 761,
      outputTokens: 110,
      cacheReadTokens: 0,
      cacheWriteTokens: 12000,
      cacheWrite1hTokens: 12000,
    },
  ])('retains precise cache/non-cache units for %j', (observation) => {
    const usage = createObservedProviderUsage();
    accumulateObservedProviderUsage(usage, observation, pricing);
    const tokenUsage = {
      promptTokens: observation.inputTokens,
      completionTokens: observation.outputTokens,
      totalTokens: observation.inputTokens + observation.outputTokens,
      cacheReadInputTokens: observation.cacheReadTokens,
      cacheCreationInputTokens: observation.cacheWriteTokens,
      cacheCreation1hInputTokens: observation.cacheWrite1hTokens,
    };
    const expected = LLMCostCalculator.calculateListCostMicrousd(model.id, tokenUsage);
    expect(expected).not.toBeNull();
    expect(observedListLedgerMicrousd(usage, pricing)).toBe(expected);
  });

  it('also prices aggregate observations precisely when per-call receipts are unavailable', () => {
    const usage = {
      ...createObservedProviderUsage(),
      providerCalls: 1,
      inputTokens: 12761,
      outputTokens: 110,
    };
    expect(observedListLedgerMicrousd(usage, pricing)).toBe(
      Math.ceil(12761 * model.inputCost + 110 * model.outputCost),
    );
  });

  it('keeps the unchanged five-hour cap admitting inexpensive work after eight correctly priced calls', () => {
    const usage = createObservedProviderUsage();
    for (let index = 0; index < 8; index++)
      accumulateObservedProviderUsage(usage, { inputTokens: 12761, outputTokens: 110 }, pricing);
    const cap = getPlanSessionUsageCapMicrousd('max_15x');
    const next = LLMCostCalculator.estimateListCostMicrousd(model.id, 12761, 2048);
    expect(cap).not.toBeNull();
    expect(next).not.toBeNull();
    expect(observedListLedgerMicrousd(usage, pricing) + (next as number)).toBeLessThanOrEqual(
      cap as number,
    );
    const wrongDollars =
      8 *
      (LLMCostCalculator.calculateListCost(model.id, {
        promptTokens: 12761,
        completionTokens: 110,
        totalTokens: 12871,
      }) as number);
    expect(wrongDollars * 1_000_000 + (next as number)).toBeGreaterThan(cap as number);
  });

  it('sums exact per-call microUSD without another floating-point ceiling', () => {
    const usage = createObservedProviderUsage();
    accumulateObservedProviderUsage(usage, { inputTokens: 5511, outputTokens: 64 }, pricing);
    accumulateObservedProviderUsage(usage, { inputTokens: 5480, outputTokens: 462 }, pricing);
    const first = Math.ceil(5511 * model.inputCost + 64 * model.outputCost);
    const second = Math.ceil(5480 * model.inputCost + 462 * model.outputCost);
    expect(observedListLedgerMicrousd(usage, pricing)).toBe(first + second);
  });
});
