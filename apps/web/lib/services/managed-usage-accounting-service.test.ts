import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listCanonicalModels } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    calculateCostDollars: vi.fn(() => 0.09),
  },
}));

vi.mock('@/lib/services/managed-usage-request-service', () => ({
  finalizeManagedUsageRequest: vi.fn(async (input) => ({
    requestStatus: 'completed',
    operationResult: 'finalized',
    settlementStatus: 'succeeded',
    actualCostCents: input.actualCostCents,
  })),
}));

import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { finalizeManagedUsageRequest } from '@/lib/services/managed-usage-request-service';
import type { ManagedUsageRequestReservation } from '@/lib/services/managed-usage-request-service';
import {
  accumulateObservedProviderUsage,
  createObservedProviderUsage,
  finalizeObservedManagedUsage,
  hasObservedProviderUsage,
} from './managed-usage-accounting-service';

const reservation = {
  db: { query: vi.fn() },
  userId: 'user-1',
  idempotencyKey: 'agi.chat.web.send.message-1',
  requestHash: 'hash-1',
  leaseToken: 'lease-1',
  estimatedCostCents: 4,
} as unknown as ManagedUsageRequestReservation;

const TIERED_MODEL = (() => {
  const candidate = listCanonicalModels().find(
    (model) => (model.inputTokenPricingTiers?.length ?? 0) > 0,
  );
  const firstTier = candidate?.inputTokenPricingTiers?.[0];
  if (!candidate || !firstTier) throw new Error('Expected a catalog tiered-pricing fixture');
  return { ...candidate, firstTier };
})();

describe('managed usage accounting', () => {
  beforeEach(() => {
    vi.mocked(LLMCostCalculator.calculateCostDollars).mockReset().mockReturnValue(0.09);
    vi.mocked(finalizeManagedUsageRequest).mockClear();
  });

  it('aggregates each provider call including cache-token pricing dimensions', () => {
    const usage = createObservedProviderUsage();

    accumulateObservedProviderUsage(usage, {
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 40,
      cacheWriteTokens: 10,
      cacheWrite1hTokens: 3,
      reasoningTokens: 5,
    });
    accumulateObservedProviderUsage(usage, {
      inputTokens: 200,
      outputTokens: 30,
      cacheReadTokens: 50,
      cacheWriteTokens: 20,
      cacheWrite1hTokens: 4,
      reasoningTokens: 6,
    });

    expect(usage).toEqual({
      providerCalls: 2,
      inputTokens: 300,
      outputTokens: 50,
      cacheReadTokens: 90,
      cacheWriteTokens: 30,
      cacheWrite1hTokens: 7,
      reasoningTokens: 11,
      providerCallObservations: [
        {
          inputTokens: 100,
          outputTokens: 20,
          cacheReadTokens: 40,
          cacheWriteTokens: 10,
          cacheWrite1hTokens: 3,
          reasoningTokens: 5,
        },
        {
          inputTokens: 200,
          outputTokens: 30,
          cacheReadTokens: 50,
          cacheWriteTokens: 20,
          cacheWrite1hTokens: 4,
          reasoningTokens: 6,
        },
      ],
    });
    expect(hasObservedProviderUsage(usage)).toBe(true);
  });

  it('settles observed multi-call usage once through the managed lifecycle', async () => {
    const usage = createObservedProviderUsage();
    accumulateObservedProviderUsage(usage, { inputTokens: 300, outputTokens: 50 });

    await finalizeObservedManagedUsage({
      reservation,
      provider: 'anthropic',
      model: 'claude-test',
      usage,
      reason: 'tool_loop_completed',
    });

    expect(LLMCostCalculator.calculateCostDollars).toHaveBeenCalledWith(
      'anthropic',
      'claude-test',
      {
        promptTokens: 300,
        completionTokens: 50,
        totalTokens: 350,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheCreation1hInputTokens: 0,
      },
    );
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith({
      ...reservation,
      outcome: 'completed',
      actualCostCents: 9,
      usage: expect.objectContaining({
        accounting: 'observed_provider_usage',
        reason: 'tool_loop_completed',
        providerCalls: 1,
        inputTokens: 300,
        outputTokens: 50,
      }),
    });
  });

  it('prices provider calls independently, then rounds their exact sum once', async () => {
    const fixtureThreshold = 100;
    vi.mocked(LLMCostCalculator.calculateCostDollars).mockImplementation(
      (_provider, _model, usage) =>
        (usage.promptTokens / 20_000) * (usage.promptTokens > fixtureThreshold ? 2 : 1),
    );
    const pricing = { provider: 'fixture-provider', model: 'fixture-tiered-model' };

    const twoSubthresholdCalls = createObservedProviderUsage();
    accumulateObservedProviderUsage(
      twoSubthresholdCalls,
      { inputTokens: 75, outputTokens: 0 },
      pricing,
    );
    accumulateObservedProviderUsage(
      twoSubthresholdCalls,
      { inputTokens: 75, outputTokens: 0 },
      pricing,
    );
    await finalizeObservedManagedUsage({
      reservation,
      ...pricing,
      usage: twoSubthresholdCalls,
      reason: 'fixture_two_calls',
    });
    expect(vi.mocked(finalizeManagedUsageRequest).mock.calls.at(-1)?.[0].actualCostCents).toBe(1);

    const oneLongCall = createObservedProviderUsage();
    accumulateObservedProviderUsage(oneLongCall, { inputTokens: 150, outputTokens: 0 }, pricing);
    await finalizeObservedManagedUsage({
      reservation,
      ...pricing,
      usage: oneLongCall,
      reason: 'fixture_one_call',
    });
    expect(vi.mocked(finalizeManagedUsageRequest).mock.calls.at(-1)?.[0].actualCostCents).toBe(2);
    expect(
      vi
        .mocked(LLMCostCalculator.calculateCostDollars)
        .mock.calls.map((call) => call[2].promptTokens),
    ).toEqual([75, 75, 150]);
  });

  it('does not apply a catalog input tier across two request boundaries', async () => {
    const threshold = TIERED_MODEL.firstTier.thresholdTokens;
    const subthresholdTokens = Math.floor(threshold * 0.75);
    vi.mocked(LLMCostCalculator.calculateCostDollars).mockImplementation(
      (_provider, _model, usage) =>
        (usage.promptTokens / 1_000_000) *
        (usage.promptTokens > threshold
          ? TIERED_MODEL.firstTier.inputCost
          : TIERED_MODEL.inputCost),
    );
    const pricing = {
      provider: TIERED_MODEL.provider,
      model: TIERED_MODEL.id,
    };

    const twoSubthresholdCalls = createObservedProviderUsage();
    for (let call = 0; call < 2; call += 1) {
      accumulateObservedProviderUsage(
        twoSubthresholdCalls,
        { inputTokens: subthresholdTokens, outputTokens: 0 },
        pricing,
      );
    }
    await finalizeObservedManagedUsage({
      reservation,
      ...pricing,
      usage: twoSubthresholdCalls,
      reason: 'catalog_two_calls',
    });
    const twoCallCost = vi
      .mocked(finalizeManagedUsageRequest)
      .mock.calls.at(-1)?.[0].actualCostCents;

    const oneLongCall = createObservedProviderUsage();
    accumulateObservedProviderUsage(
      oneLongCall,
      { inputTokens: subthresholdTokens * 2, outputTokens: 0 },
      pricing,
    );
    await finalizeObservedManagedUsage({
      reservation,
      ...pricing,
      usage: oneLongCall,
      reason: 'catalog_one_call',
    });
    expect(
      vi.mocked(finalizeManagedUsageRequest).mock.calls.at(-1)?.[0].actualCostCents,
    ).toBeGreaterThan(twoCallCost ?? Number.POSITIVE_INFINITY);
  });

  it('uses the reservation estimate only when a provider emits no usage', async () => {
    const usage = createObservedProviderUsage();

    await finalizeObservedManagedUsage({
      reservation,
      provider: 'google',
      model: 'gemini-test',
      usage,
      reason: 'research_completed',
    });

    expect(finalizeManagedUsageRequest).toHaveBeenLastCalledWith({
      ...reservation,
      outcome: 'completed',
      actualCostCents: 4,
      usage: {
        accounting: 'reservation_estimate_no_provider_usage',
        reason: 'research_completed',
        providerCalls: 0,
      },
    });
  });

  it('releases a cancelled request only when no provider usage was observed', async () => {
    const usage = createObservedProviderUsage();

    await finalizeObservedManagedUsage({
      reservation,
      provider: 'openai',
      model: 'gpt-test',
      usage,
      reason: 'client_cancelled_tool_loop',
      cancelled: true,
    });

    expect(finalizeManagedUsageRequest).toHaveBeenLastCalledWith({
      ...reservation,
      outcome: 'failed',
      actualCostCents: 0,
      usage: {
        accounting: 'released_no_observed_provider_usage',
        reason: 'client_cancelled_tool_loop',
        providerCalls: 0,
      },
    });
  });

  /**
   * CPST Stage-0 telemetry, managed cloud only
   * (docs/design/execution-plan-contract-and-cpst-2026-08-05.md §4.3, phase 1).
   * The keys are additive and optional: omitting them must leave the usage
   * payload byte-identical to what this service wrote before CPST existed,
   * which the three assertions above already pin.
   */
  it('spreads caller-supplied CPST keys into the observed-usage payload', async () => {
    const usage = createObservedProviderUsage();
    accumulateObservedProviderUsage(usage, { inputTokens: 10, outputTokens: 4 });

    await finalizeObservedManagedUsage({
      reservation,
      provider: 'anthropic',
      model: 'claude-test',
      usage,
      reason: 'tool_loop_completed',
      cpst: {
        taskOutcome: 'unknown',
        verifierResult: 'skipped',
        fallbackUsed: false,
        routePlanId: 'interim:anthropic/messages:route-1:preferred_slot',
        taskFamily: 'agentic',
        taskFamilyConfidence: 0.9,
      },
    });

    const call = (finalizeManagedUsageRequest as ReturnType<typeof vi.fn>).mock.lastCall?.[0] as {
      usage: Record<string, unknown>;
    };
    const persisted = JSON.parse(JSON.stringify(call.usage));

    // Accounting keys are untouched by the additive spread.
    expect(persisted.accounting).toBe('observed_provider_usage');
    expect(persisted.reason).toBe('tool_loop_completed');
    expect(persisted.inputTokens).toBe(10);
    expect(persisted.totalTokens).toBe(14);

    expect(persisted.taskOutcome).toBe('unknown');
    expect(persisted.verifierResult).toBe('skipped');
    expect(persisted.fallbackUsed).toBe(false);
    expect(persisted.routePlanId).toBe('interim:anthropic/messages:route-1:preferred_slot');
    expect(persisted.taskFamily).toBe('agentic');
    expect(persisted.taskFamilyConfidence).toBe(0.9);
    expect('retries' in persisted).toBe(false);
  });

  it('spreads CPST keys into the released-cancellation payload too', async () => {
    const usage = createObservedProviderUsage();

    await finalizeObservedManagedUsage({
      reservation,
      provider: 'openai',
      model: 'gpt-test',
      usage,
      reason: 'client_cancelled_tool_loop',
      cancelled: true,
      cpst: { taskOutcome: 'abandoned', verifierResult: 'skipped' },
    });

    expect(finalizeManagedUsageRequest).toHaveBeenLastCalledWith({
      ...reservation,
      outcome: 'failed',
      actualCostCents: 0,
      usage: {
        accounting: 'released_no_observed_provider_usage',
        reason: 'client_cancelled_tool_loop',
        providerCalls: 0,
        taskOutcome: 'abandoned',
        verifierResult: 'skipped',
      },
    });
  });
});
