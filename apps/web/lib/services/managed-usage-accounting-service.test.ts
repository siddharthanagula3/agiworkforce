import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    calculateCost: vi.fn(() => 9),
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

describe('managed usage accounting', () => {
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

    expect(LLMCostCalculator.calculateCost).toHaveBeenCalledWith('anthropic', 'claude-test', {
      promptTokens: 300,
      completionTokens: 50,
      totalTokens: 350,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheCreation1hInputTokens: 0,
    });
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
