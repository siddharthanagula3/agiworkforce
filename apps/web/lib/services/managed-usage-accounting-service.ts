import 'server-only';

import { logger } from '@/lib/logger';
import { LLMCostCalculator, type TokenUsage } from '@/lib/services/llm-cost-calculator';
import type { CpstUsageFields } from '@/lib/cpst-telemetry';
import {
  estimateMicrousdOf,
  finalizeManagedUsageRequest,
  type ManagedUsageFinalization,
  type ManagedUsageRequestReservation,
} from '@/lib/services/managed-usage-request-service';

export interface ObservedProviderUsage {
  providerCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheWrite1hTokens: number;
  reasoningTokens: number;
  providerCostDollars?: number;
  providerCallObservations?: ProviderUsageObservation[];
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

export type ObservedCostSource = 'provider_reported' | 'estimated';

export interface ProviderUsageObservation {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheWrite1hTokens: number;
  reasoningTokens: number;
  provider?: string;
  model?: string;
  costDollars?: number;
  costSource?: ObservedCostSource;
  routeId?: string | null;
  upstreamProvider?: string;
  providerReportedCostUsd?: number;
}

type ProviderUsageObservationInput = Partial<
  Omit<ProviderUsageObservation, 'provider' | 'model' | 'costDollars' | 'costSource' | 'routeId'>
>;

export interface ProviderUsagePricingContext {
  provider: string;
  model: string;
  routeId?: string | null;
}

function nonNegative(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

function toTokenUsage(observation: ProviderUsageObservation): TokenUsage {
  return {
    promptTokens: observation.inputTokens,
    completionTokens: observation.outputTokens,
    totalTokens: observation.inputTokens + observation.outputTokens,
    reasoningTokens: observation.reasoningTokens,
    cacheReadInputTokens: observation.cacheReadTokens,
    cacheCreationInputTokens: observation.cacheWriteTokens,
    cacheCreation1hInputTokens: observation.cacheWrite1hTokens,
  };
}

function validReportedCost(value: number | undefined): number | undefined {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : undefined;
}

const REPORTED_COST_SANITY_BAND_MIN_MULTIPLE = 0.1;
const REPORTED_COST_SANITY_BAND_MAX_MULTIPLE = 10;

function isReportedCostWithinSanityBand(reportedCostUsd: number, estimateDollars: number): boolean {
  if (estimateDollars <= 0) return true;
  return (
    reportedCostUsd >= estimateDollars * REPORTED_COST_SANITY_BAND_MIN_MULTIPLE &&
    reportedCostUsd <= estimateDollars * REPORTED_COST_SANITY_BAND_MAX_MULTIPLE
  );
}

function normalizeObservation(
  observation: ProviderUsageObservationInput,
): ProviderUsageObservation {
  const providerReportedCostUsd = validReportedCost(observation.providerReportedCostUsd);
  return {
    inputTokens: nonNegative(observation.inputTokens),
    outputTokens: nonNegative(observation.outputTokens),
    cacheReadTokens: nonNegative(observation.cacheReadTokens),
    cacheWriteTokens: nonNegative(observation.cacheWriteTokens),
    cacheWrite1hTokens: nonNegative(observation.cacheWrite1hTokens),
    reasoningTokens: nonNegative(observation.reasoningTokens),
    ...(observation.upstreamProvider ? { upstreamProvider: observation.upstreamProvider } : {}),
    ...(providerReportedCostUsd !== undefined ? { providerReportedCostUsd } : {}),
  };
}

export function accumulateObservedProviderUsage(
  target: ObservedProviderUsage,
  observation: ProviderUsageObservationInput,
  pricing?: ProviderUsagePricingContext,
): void {
  const normalized = normalizeObservation(observation);
  target.providerCalls += 1;
  target.inputTokens += normalized.inputTokens;
  target.outputTokens += normalized.outputTokens;
  target.cacheReadTokens += normalized.cacheReadTokens;
  target.cacheWriteTokens += normalized.cacheWriteTokens;
  target.cacheWrite1hTokens += normalized.cacheWrite1hTokens;
  target.reasoningTokens += normalized.reasoningTokens;

  let priced: ProviderUsageObservation = normalized;
  if (pricing) {
    const estimateDollars = LLMCostCalculator.calculateCostDollars(
      pricing.provider,
      pricing.model,
      toTokenUsage(normalized),
      undefined,
      pricing.routeId,
    );
    const reportedCostUsd = normalized.providerReportedCostUsd;
    const reportedAdmitted =
      reportedCostUsd !== undefined &&
      isReportedCostWithinSanityBand(reportedCostUsd, estimateDollars);
    if (reportedCostUsd !== undefined && !reportedAdmitted) {
      logger.warn(
        { provider: pricing.provider, model: pricing.model, reportedCostUsd, estimateDollars },
        'Ignored provider-reported cost outside the catalog sanity band',
      );
    }
    const costSource: ObservedCostSource = reportedAdmitted ? 'provider_reported' : 'estimated';
    priced = {
      ...normalized,
      provider: pricing.provider,
      model: pricing.model,
      routeId: pricing.routeId ?? null,
      costDollars: reportedAdmitted ? (reportedCostUsd as number) : estimateDollars,
      costSource,
    };
  }
  (target.providerCallObservations ??= []).push(priced);
  if (priced.costDollars !== undefined) {
    target.providerCostDollars = nonNegative(target.providerCostDollars) + priced.costDollars;
  }
}

export function mergeObservedProviderUsage(
  target: ObservedProviderUsage | undefined,
  source: ObservedProviderUsage,
): void {
  if (!target) return;
  target.providerCalls += source.providerCalls;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.cacheWrite1hTokens += source.cacheWrite1hTokens;
  target.reasoningTokens += source.reasoningTokens;
  if (source.providerCallObservations?.length) {
    (target.providerCallObservations ??= []).push(
      ...source.providerCallObservations.map((observation) => ({ ...observation })),
    );
  }
  if (source.providerCostDollars !== undefined) {
    target.providerCostDollars =
      nonNegative(target.providerCostDollars) + nonNegative(source.providerCostDollars);
  }
}

export function calculateObservedProviderUsageCostDollars(
  usage: ObservedProviderUsage,
  fallbackPricing: ProviderUsagePricingContext,
): number {
  const observations = usage.providerCallObservations;
  if (observations?.length === usage.providerCalls && observations.length > 0) {
    return observations.reduce((total, observation) => {
      const recordedCost = observation.costDollars;
      if (Number.isFinite(recordedCost) && recordedCost !== undefined && recordedCost >= 0) {
        return total + recordedCost;
      }
      return (
        total +
        LLMCostCalculator.calculateCostDollars(
          observation.provider ?? fallbackPricing.provider,
          observation.model ?? fallbackPricing.model,
          toTokenUsage(observation),
          undefined,
          observation.routeId ?? fallbackPricing.routeId,
        )
      );
    }, 0);
  }

  return LLMCostCalculator.calculateCostDollars(
    fallbackPricing.provider,
    fallbackPricing.model,
    {
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens,
      totalTokens: usage.inputTokens + usage.outputTokens,
      cacheReadInputTokens: usage.cacheReadTokens,
      cacheCreationInputTokens: usage.cacheWriteTokens,
      cacheCreation1hInputTokens: usage.cacheWrite1hTokens,
    },
    undefined,
    fallbackPricing.routeId,
  );
}

/**
 * What the user owes for observed usage: the model's official list price,
 * whichever route actually served it.
 *
 * The chat paths have always billed `calculateListCost` and reported the served
 * route's cost separately as COGS. This path billed the served route's cost
 * itself, so the same turn cost a different amount depending on whether it ran
 * durably. An observation whose model has no published list sheet falls back to
 * its route cost, which is what the caller would have been charged anyway.
 */
export function calculateObservedListCostDollars(
  usage: ObservedProviderUsage,
  fallbackPricing: ProviderUsagePricingContext,
): number {
  const observations = usage.providerCallObservations;
  if (observations?.length === usage.providerCalls && observations.length > 0) {
    return observations.reduce((total, observation) => {
      const tokenUsage = toTokenUsage(observation);
      const listCost = LLMCostCalculator.calculateListCost(
        observation.model ?? fallbackPricing.model,
        tokenUsage,
      );
      if (listCost !== null) return total + listCost;
      const recordedCost = observation.costDollars;
      if (Number.isFinite(recordedCost) && recordedCost !== undefined && recordedCost >= 0) {
        return total + recordedCost;
      }
      return (
        total +
        LLMCostCalculator.calculateCostDollars(
          observation.provider ?? fallbackPricing.provider,
          observation.model ?? fallbackPricing.model,
          tokenUsage,
          undefined,
          observation.routeId ?? fallbackPricing.routeId,
        )
      );
    }, 0);
  }

  const aggregateUsage: TokenUsage = {
    promptTokens: usage.inputTokens,
    completionTokens: usage.outputTokens,
    totalTokens: usage.inputTokens + usage.outputTokens,
    cacheReadInputTokens: usage.cacheReadTokens,
    cacheCreationInputTokens: usage.cacheWriteTokens,
    cacheCreation1hInputTokens: usage.cacheWrite1hTokens,
  };
  const listCost = LLMCostCalculator.calculateListCost(fallbackPricing.model, aggregateUsage);
  if (listCost !== null) return listCost;
  return calculateObservedProviderUsageCostDollars(usage, fallbackPricing);
}

const MICROUSD_PER_USD = 1_000_000;
const MICROUSD_PER_LEDGER_CENT = 10_000;

/**
 * The ledger's unit since 0185. Work that produced nothing costs nothing, and
 * work that produced anything costs at least one microUSD. The one-cent floor
 * this replaced overcharged a sub-cent turn elevenfold and made a hundred
 * sub-cent turns cost more than a single call of the same total.
 */
function toLedgerMicrousd(dollars: number): number {
  return dollars > 0 ? Math.max(1, Math.ceil(dollars * MICROUSD_PER_USD)) : 0;
}

function toLedgerCents(microusd: number): number {
  return microusd > 0 ? Math.max(1, Math.ceil(microusd / MICROUSD_PER_LEDGER_CENT)) : 0;
}

export function observedListLedgerMicrousd(
  usage: ObservedProviderUsage,
  fallbackPricing: ProviderUsagePricingContext,
): number {
  return toLedgerMicrousd(calculateObservedListCostDollars(usage, fallbackPricing));
}

export function observedProviderUsageLedgerMicrousd(
  usage: ObservedProviderUsage,
  fallbackPricing: ProviderUsagePricingContext,
): number {
  return toLedgerMicrousd(calculateObservedProviderUsageCostDollars(usage, fallbackPricing));
}

export function observedListLedgerCents(
  usage: ObservedProviderUsage,
  fallbackPricing: ProviderUsagePricingContext,
): number {
  return toLedgerCents(observedListLedgerMicrousd(usage, fallbackPricing));
}

export function observedProviderUsageLedgerCents(
  usage: ObservedProviderUsage,
  fallbackPricing: ProviderUsagePricingContext,
): number {
  return toLedgerCents(observedProviderUsageLedgerMicrousd(usage, fallbackPricing));
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
  cancelled?: boolean;
  cpst?: CpstUsageFields;
}

export function finalizeObservedManagedUsage(
  input: FinalizeObservedManagedUsageInput,
): Promise<ManagedUsageFinalization> {
  const observed = hasObservedProviderUsage(input.usage);

  if (input.cancelled && !observed) {
    return finalizeManagedUsageRequest({
      ...input.reservation,
      outcome: 'failed',
      actualCostMicrousd: 0,
      usage: {
        accounting: 'released_no_observed_provider_usage',
        reason: input.reason,
        providerCalls: 0,
        ...input.cpst,
      },
    });
  }

  if (!observed) {
    return finalizeManagedUsageRequest({
      ...input.reservation,
      outcome: 'completed',
      actualCostMicrousd: estimateMicrousdOf(input.reservation),
      usage: {
        accounting: 'reservation_estimate_no_provider_usage',
        reason: input.reason,
        providerCalls: 0,
        ...input.cpst,
      },
    });
  }

  const totalTokens = input.usage.inputTokens + input.usage.outputTokens;
  const pricing: ProviderUsagePricingContext = {
    provider: input.provider,
    model: input.model,
  };
  const actualCostMicrousd = observedListLedgerMicrousd(input.usage, pricing);
  const providerCostMicrousd = observedProviderUsageLedgerMicrousd(input.usage, pricing);

  return finalizeManagedUsageRequest({
    ...input.reservation,
    outcome: 'completed',
    actualCostMicrousd,
    providerCostMicrousd,
    usage: {
      accounting: 'observed_provider_usage',
      reason: input.reason,
      ...input.usage,
      totalTokens,
      ...input.cpst,
    },
  });
}
