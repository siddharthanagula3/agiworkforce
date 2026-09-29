import 'server-only';

import { chargeMicrousdForProviderCost } from '@agiworkforce/types';

import {
  hostedCodeExecutionProviderOf,
  priceHostedCodeExecution,
} from '@/lib/e2b/hosted-code-execution';
import { logger } from '@/lib/logger';
import {
  LLMCostCalculator,
  normalizeProviderId,
  type TokenUsage,
} from '@/lib/services/llm-cost-calculator';
import { nativeServerToolMicrousdPerRequest } from '@/lib/web-search/native-search-pricing';
import type { CpstUsageFields } from '@/lib/cpst-telemetry';
import type { GenerationAttempt } from '@/lib/services/generation-attempt';
import {
  estimateMicrousdOf,
  finalizeManagedUsageRequest,
  type ManagedUsageFinalization,
  type ManagedUsageRequestReservation,
} from '@/lib/services/managed-usage-request-service';

export interface HostedCodeExecutionEvidence {
  provider: string;
  requests: number;
  containerIds: string[];
  elapsedMs: number;
}

export interface ObservedProviderUsage {
  providerCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheWrite1hTokens: number;
  reasoningTokens: number;
  webSearchRequests?: number;
  webFetchRequests?: number;
  hostedCodeExecution?: HostedCodeExecutionEvidence;
  toolSpendMicrousd?: number;
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
  speed?: 'standard' | 'fast';
}

export interface ServerToolUsageInput {
  webSearchRequests?: number;
  webFetchRequests?: number;
  codeExecutionRequests?: number;
  codeExecutionContainerIds?: readonly string[];
  elapsedMs?: number;
  dynamicFilteringWebTool?: boolean;
}

type ProviderUsageObservationInput = Partial<
  Omit<ProviderUsageObservation, 'provider' | 'model' | 'costDollars' | 'costSource' | 'routeId'>
> &
  ServerToolUsageInput;

export interface ProviderUsagePricingContext {
  provider: string;
  model: string;
  routeId?: string | null;
}

function nonNegative(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

export function hostedCodeExecutionEvidence(
  provider: string,
  usage: ServerToolUsageInput,
): HostedCodeExecutionEvidence | undefined {
  const requests = nonNegative(usage.codeExecutionRequests);
  const containerIds = [...new Set(usage.codeExecutionContainerIds ?? [])];
  if (requests === 0 && containerIds.length === 0) return undefined;
  return { provider, requests, containerIds, elapsedMs: nonNegative(usage.elapsedMs) };
}

function hostedCodeExecutionMicrousd(
  evidence: HostedCodeExecutionEvidence,
  dynamicFilteringWebTool: boolean,
): number {
  const normalized = normalizeProviderId(evidence.provider);
  const provider = normalized ? hostedCodeExecutionProviderOf(normalized) : null;
  if (!provider) return 0;
  return priceHostedCodeExecution({
    provider,
    usage: { server_tool_use: { code_execution_requests: evidence.requests } },
    container: evidence.containerIds,
    requestHadWebSearchOrFetch: dynamicFilteringWebTool,
    elapsedMs: evidence.elapsedMs,
  }).microusd;
}

function mergeHostedCodeExecution(
  current: HostedCodeExecutionEvidence | undefined,
  next: HostedCodeExecutionEvidence,
): HostedCodeExecutionEvidence {
  if (!current) return { ...next, containerIds: [...next.containerIds] };
  return {
    provider: next.provider,
    requests: current.requests + next.requests,
    containerIds: [...new Set([...current.containerIds, ...next.containerIds])],
    elapsedMs: current.elapsedMs + next.elapsedMs,
  };
}

export interface ServerToolCharge {
  providerMicrousd: number;
  chargeMicrousd: number;
}

export function priceServerToolUsage(input: {
  provider: string;
  webSearchRequests?: number;
  webFetchRequests?: number;
  hostedCodeExecution?: HostedCodeExecutionEvidence;
  dynamicFilteringWebTool?: boolean;
}): ServerToolCharge {
  const providerId = normalizeProviderId(input.provider) ?? '';
  const providerMicrousd =
    nonNegative(input.webSearchRequests) *
      nativeServerToolMicrousdPerRequest(providerId, 'web_search') +
    nonNegative(input.webFetchRequests) *
      nativeServerToolMicrousdPerRequest(providerId, 'web_fetch') +
    (input.hostedCodeExecution
      ? hostedCodeExecutionMicrousd(
          input.hostedCodeExecution,
          input.dynamicFilteringWebTool === true,
        )
      : 0);
  return { providerMicrousd, chargeMicrousd: chargeMicrousdForProviderCost(providerMicrousd) };
}

function addServerToolCounts(
  target: ObservedProviderUsage,
  source: Pick<ObservedProviderUsage, 'webSearchRequests' | 'webFetchRequests'>,
): void {
  const webSearchRequests =
    nonNegative(target.webSearchRequests) + nonNegative(source.webSearchRequests);
  if (webSearchRequests > 0) target.webSearchRequests = webSearchRequests;
  const webFetchRequests =
    nonNegative(target.webFetchRequests) + nonNegative(source.webFetchRequests);
  if (webFetchRequests > 0) target.webFetchRequests = webFetchRequests;
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
    ...(observation.speed ? { speed: observation.speed } : {}),
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
    ...(observation.speed ? { speed: observation.speed } : {}),
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
  addServerToolCounts(target, observation);
  const evidence = pricing ? hostedCodeExecutionEvidence(pricing.provider, observation) : undefined;
  if (
    evidence &&
    hostedCodeExecutionMicrousd(evidence, observation.dynamicFilteringWebTool === true) > 0
  ) {
    target.hostedCodeExecution = mergeHostedCodeExecution(target.hostedCodeExecution, evidence);
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
  addServerToolCounts(target, source);
  if (source.hostedCodeExecution) {
    target.hostedCodeExecution = mergeHostedCodeExecution(
      target.hostedCodeExecution,
      source.hostedCodeExecution,
    );
  }
  addToolSpend(target, source.toolSpendMicrousd);
}

export function addToolSpend(target: ObservedProviderUsage, microusd: number | undefined): void {
  const toolSpendMicrousd = nonNegative(target.toolSpendMicrousd) + nonNegative(microusd);
  if (toolSpendMicrousd > 0) target.toolSpendMicrousd = toolSpendMicrousd;
}

/**
 * The aggregate split for pricing when calls were not all observed: each call
 * observed as fast is priced on its own at its tier, and the rest of the tokens
 * at the standard rate, so one fast call never reprices the whole turn.
 */
function splitAggregateBySpeed(usage: ObservedProviderUsage): {
  fast: ProviderUsageObservation[];
  standard: TokenUsage;
} {
  const fast = (usage.providerCallObservations ?? []).filter(
    (observation) => observation.speed === 'fast',
  );
  const less = (total: number, pick: (observation: ProviderUsageObservation) => number) =>
    nonNegative(total - fast.reduce((sum, observation) => sum + pick(observation), 0));
  const inputTokens = less(usage.inputTokens, (observation) => observation.inputTokens);
  const outputTokens = less(usage.outputTokens, (observation) => observation.outputTokens);
  return {
    fast,
    standard: {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
      cacheReadInputTokens: less(
        usage.cacheReadTokens,
        (observation) => observation.cacheReadTokens,
      ),
      cacheCreationInputTokens: less(
        usage.cacheWriteTokens,
        (observation) => observation.cacheWriteTokens,
      ),
      cacheCreation1hInputTokens: less(
        usage.cacheWrite1hTokens,
        (observation) => observation.cacheWrite1hTokens,
      ),
    },
  };
}

function observedCallProviderCostDollars(
  observation: ProviderUsageObservation,
  fallbackPricing: ProviderUsagePricingContext,
): number {
  const recordedCost = observation.costDollars;
  if (Number.isFinite(recordedCost) && recordedCost !== undefined && recordedCost >= 0) {
    return recordedCost;
  }
  return LLMCostCalculator.calculateCostDollars(
    observation.provider ?? fallbackPricing.provider,
    observation.model ?? fallbackPricing.model,
    toTokenUsage(observation),
    undefined,
    observation.routeId ?? fallbackPricing.routeId,
  );
}

export function calculateObservedProviderUsageCostDollars(
  usage: ObservedProviderUsage,
  fallbackPricing: ProviderUsagePricingContext,
): number {
  const observations = usage.providerCallObservations;
  if (observations?.length === usage.providerCalls && observations.length > 0) {
    return observations.reduce(
      (total, observation) => total + observedCallProviderCostDollars(observation, fallbackPricing),
      0,
    );
  }

  const { fast, standard } = splitAggregateBySpeed(usage);
  return (
    fast.reduce(
      (total, observation) => total + observedCallProviderCostDollars(observation, fallbackPricing),
      0,
    ) +
    LLMCostCalculator.calculateCostDollars(
      fallbackPricing.provider,
      fallbackPricing.model,
      standard,
      undefined,
      fallbackPricing.routeId,
    )
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
  const observedCallListCost = (observation: ProviderUsageObservation): number =>
    LLMCostCalculator.calculateListCost(
      observation.model ?? fallbackPricing.model,
      toTokenUsage(observation),
    ) ?? observedCallProviderCostDollars(observation, fallbackPricing);

  const observations = usage.providerCallObservations;
  if (observations?.length === usage.providerCalls && observations.length > 0) {
    return observations.reduce(
      (total, observation) => total + observedCallListCost(observation),
      0,
    );
  }

  const { fast, standard } = splitAggregateBySpeed(usage);
  const standardList = LLMCostCalculator.calculateListCost(fallbackPricing.model, standard);
  if (standardList === null && fast.length === 0) {
    return calculateObservedProviderUsageCostDollars(usage, fallbackPricing);
  }
  return (
    fast.reduce((total, observation) => total + observedCallListCost(observation), 0) +
    (standardList ??
      LLMCostCalculator.calculateCostDollars(
        fallbackPricing.provider,
        fallbackPricing.model,
        standard,
        undefined,
        fallbackPricing.routeId,
      ))
  );
}

const MICROUSD_PER_USD = 1_000_000;
const MICROUSD_PER_LEDGER_CENT = 10_000;

/**
 * The ledger's unit since 0182. Work that produced nothing costs nothing, and
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

export function observedTurnCost(
  usage: ObservedProviderUsage,
  pricing: ProviderUsagePricingContext,
): { tokenMicrousd: number; toolMicrousd: number } {
  return {
    tokenMicrousd: observedProviderUsageLedgerMicrousd(usage, pricing),
    toolMicrousd:
      priceServerToolUsage({
        provider: pricing.provider,
        webSearchRequests: usage.webSearchRequests,
        webFetchRequests: usage.webFetchRequests,
        hostedCodeExecution: usage.hostedCodeExecution,
      }).providerMicrousd + nonNegative(usage.toolSpendMicrousd),
  };
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
  attempt?: GenerationAttempt | null;
}

export function finalizeObservedManagedUsage(
  input: FinalizeObservedManagedUsageInput,
): Promise<ManagedUsageFinalization> {
  const observed = hasObservedProviderUsage(input.usage);

  if (input.cancelled && !observed) {
    return finalizeManagedUsageRequest({
      ...input.reservation,
      ...(input.attempt !== undefined ? { attempt: input.attempt } : {}),
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
      ...(input.attempt !== undefined ? { attempt: input.attempt } : {}),
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
  const serverTools = priceServerToolUsage({
    provider: input.provider,
    webSearchRequests: input.usage.webSearchRequests,
    webFetchRequests: input.usage.webFetchRequests,
    hostedCodeExecution: input.usage.hostedCodeExecution,
  });
  const actualCostMicrousd =
    observedListLedgerMicrousd(input.usage, pricing) + serverTools.chargeMicrousd;
  const providerCostMicrousd =
    observedProviderUsageLedgerMicrousd(input.usage, pricing) + serverTools.providerMicrousd;

  return finalizeManagedUsageRequest({
    ...input.reservation,
    ...(input.attempt !== undefined ? { attempt: input.attempt } : {}),
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
