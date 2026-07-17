import 'server-only';

import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import {
  finalizeManagedUsageRequest,
  type ManagedUsageFinalization,
  type ManagedUsageRequestReservation,
} from '@/lib/services/managed-usage-request-service';

/**
 * Canonical provider usage accumulated across every model call in one managed
 * request. `providerCalls` distinguishes a real zero-cost/low-token response
 * from a provider that emitted no usage telemetry at all.
 */
export interface ObservedProviderUsage {
  providerCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheWrite1hTokens: number;
  reasoningTokens: number;
}

export function createObservedProviderUsage(): ObservedProviderUsage {
  return {
    providerCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheWrite1hTokens: 0,
    reasoningTokens: 0,
  };
}

type ProviderUsageObservation = Partial<Omit<ObservedProviderUsage, 'providerCalls'>>;

function nonNegative(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

/** Add one provider call's final usage counters to a request accumulator. */
export function accumulateObservedProviderUsage(
  target: ObservedProviderUsage,
  observation: ProviderUsageObservation,
): void {
  target.providerCalls += 1;
  target.inputTokens += nonNegative(observation.inputTokens);
  target.outputTokens += nonNegative(observation.outputTokens);
  target.cacheReadTokens += nonNegative(observation.cacheReadTokens);
  target.cacheWriteTokens += nonNegative(observation.cacheWriteTokens);
  target.cacheWrite1hTokens += nonNegative(observation.cacheWrite1hTokens);
  target.reasoningTokens += nonNegative(observation.reasoningTokens);
}

export function hasObservedProviderUsage(usage: ObservedProviderUsage): boolean {
  return usage.providerCalls > 0;
}

export interface FinalizeObservedManagedUsageInput {
  reservation: ManagedUsageRequestReservation;
  provider: string;
  model: string;
  usage: ObservedProviderUsage;
  reason: string;
  /** A cancellation releases the reservation only when no provider usage exists. */
  cancelled?: boolean;
}

/**
 * Close one managed request from canonical provider usage. This is the sole
 * financial owner for custom multi-turn research/tool streams; callers must
 * not perform a second legacy credit delta reconciliation.
 */
export function finalizeObservedManagedUsage(
  input: FinalizeObservedManagedUsageInput,
): Promise<ManagedUsageFinalization> {
  const observed = hasObservedProviderUsage(input.usage);

  if (input.cancelled && !observed) {
    return finalizeManagedUsageRequest({
      ...input.reservation,
      outcome: 'failed',
      actualCostCents: 0,
      usage: {
        accounting: 'released_no_observed_provider_usage',
        reason: input.reason,
        providerCalls: 0,
      },
    });
  }

  if (!observed) {
    return finalizeManagedUsageRequest({
      ...input.reservation,
      outcome: 'completed',
      actualCostCents: input.reservation.estimatedCostCents,
      usage: {
        accounting: 'reservation_estimate_no_provider_usage',
        reason: input.reason,
        providerCalls: 0,
      },
    });
  }

  const totalTokens = input.usage.inputTokens + input.usage.outputTokens;
  const actualCostCents = LLMCostCalculator.calculateCost(input.provider, input.model, {
    promptTokens: input.usage.inputTokens,
    completionTokens: input.usage.outputTokens,
    totalTokens,
    cacheReadInputTokens: input.usage.cacheReadTokens,
    cacheCreationInputTokens: input.usage.cacheWriteTokens,
    cacheCreation1hInputTokens: input.usage.cacheWrite1hTokens,
  });

  return finalizeManagedUsageRequest({
    ...input.reservation,
    outcome: 'completed',
    actualCostCents,
    usage: {
      accounting: 'observed_provider_usage',
      reason: input.reason,
      ...input.usage,
      totalTokens,
    },
  });
}
