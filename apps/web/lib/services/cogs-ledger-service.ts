import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  centsFromMicrousdCeil,
  creditsFromMicrousd,
  microusdFromCents,
  resolveFeatureRate,
  visualUsageCharge,
  visualUsageLines,
  VISUAL_USAGE_FEATURE,
  VISUAL_USAGE_OPERATION,
  type RateCardFeature,
  type VisualSessionUsage,
} from '@agiworkforce/types';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { resolveEnterpriseFundingOrganizationId } from '@/lib/services/enterprise-funding-organization';
import { normalizeUsageAttribution, type UsageAttribution } from '@/lib/billing/usage-attribution';
import { normalizePromptStamps } from '@/lib/prompts/prompt-stamp';
import { trackMeteredCapability } from '@/lib/server/product-analytics';

export const COGS_CAPABILITIES = [
  'chat',
  'image',
  'video',
  'transcription',
  'embedding',
  'computer_use',
  'sandbox',
  'tool',
  'storage',
  'database',
  'vector',
  'notification',
  'email',
  'egress',
  'browser',
  'work_compute',
  'code_compute',
  'connector',
  'artifact',
  'visual',
] as const;

export const COGS_UNIT_BASES = [
  'token',
  'image',
  'second',
  'minute',
  'request',
  'gibibyte',
  'gibibyte_month',
] as const;

export const COGS_ADJUSTMENT_KINDS = [
  'stripe_fee',
  'refund',
  'chargeback',
  'chargeback_reserve',
  'discount',
  'support_adjustment',
  'tax',
] as const;

export const COGS_TASK_OUTCOMES = ['delivered', 'undelivered'] as const;

export type CogsCapability = (typeof COGS_CAPABILITIES)[number];
export type CogsUnitBasis = (typeof COGS_UNIT_BASES)[number];
export type CogsAdjustmentKind = (typeof COGS_ADJUSTMENT_KINDS)[number];
export type CogsTaskOutcome = (typeof COGS_TASK_OUTCOMES)[number];

export interface TokenClassDimensions {
  cacheReadUnits: number;
  cacheWriteUnits: number;
  compactionSavedUnits: number;
  cacheSavingsCents: number;
  cacheWritePremiumCents: number;
}

export const COGS_RECONCILIATION_STATUSES = [
  'estimated',
  'provider_reported',
  'reconciled',
] as const;
export type CogsReconciliationStatus = (typeof COGS_RECONCILIATION_STATUSES)[number];

/**
 * The dimensions a margin question is sliced by, split out of `metadata` so a
 * query does not scan jsonb. Every field is optional: a caller that cannot
 * attribute one leaves the column null rather than writing a guess.
 */
export interface CostEventAttribution extends UsageAttribution {
  /** Canonical customer charge in microUSD. Falls back to `resolveRetailCostCents` when omitted. */
  customerCanonicalMicrousd?: number | null;
  /** The same charge in cents, for callers that only hold cents. */
  customerCanonicalCents?: number | null;
  /** What the provider itself later reported, when a report is in hand. */
  providerReportedCostCents?: number | null;
  providerEstimatedCostMicrousd?: number | null;
  providerReportedCostMicrousd?: number | null;
  feature?: RateCardFeature | null;
  routeId?: string | null;
  surface?: string | null;
  inputTokens?: number | null;
  cachedTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  /** Manifest stamps (`id@version`) of every prompt the turn sent to the model. */
  promptIds?: readonly string[] | null;
  /** True when the answer was served from a cache and no provider call was made. */
  cacheHit?: boolean;
  /** What that cache hit did not spend, in microUSD. */
  avoidedCostMicrousd?: number | null;
}

export interface ProviderCostEvent extends CostEventAttribution {
  userId?: string | null;
  organizationId?: string | null;
  /** The container the usage happened in, distinct from the plan that funds it. */
  workspaceId?: string | null;
  capability: CogsCapability;
  provider: string;
  model?: string | null;
  unitBasis: CogsUnitBasis;
  units: number;
  providerCostCents: number;
  billedCents: number;
  sourceRef: string;
  taskOutcome?: CogsTaskOutcome;
  taskRef?: string | null;
  metadata?: Record<string, unknown>;
  tokenClasses?: TokenClassDimensions;
}

export interface CogsAdjustment {
  userId?: string | null;
  kind: CogsAdjustmentKind;
  amountCents: number;
  currency?: string;
  sourceRef: string;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface CogsSummary {
  providerCostCents: number;
  billedCents: number;
  stripeFeeCents: number;
  refundCents: number;
  chargebackCents: number;
  chargebackReserveCents: number;
  discountCents: number;
  supportAdjustmentCents: number;
  taxCents: number;
  grossMarginCents: number;
  cacheReadUnits: number;
  cacheWriteUnits: number;
  compactionSavedUnits: number;
  cacheSavingsCents: number;
  cacheWritePremiumCents: number;
}

const CAPABILITY_BY_OPERATION: Record<string, CogsCapability> = {
  chat: 'chat',
  image: 'image',
  video: 'video',
  transcription: 'transcription',
  embeddings: 'embedding',
  embedding: 'embedding',
  computer_use: 'computer_use',
  sandbox: 'sandbox',
  tool: 'tool',
  storage: 'storage',
  database: 'database',
  vector: 'vector',
  notification: 'notification',
  email: 'email',
  egress: 'egress',
  browser: 'browser',
  work_compute: 'work_compute',
  code_compute: 'code_compute',
  connector: 'connector',
  artifact: 'artifact',
  [VISUAL_USAGE_OPERATION]: 'visual',
};

const UNIT_BASIS_BY_CAPABILITY: Record<CogsCapability, CogsUnitBasis> = {
  chat: 'token',
  image: 'image',
  video: 'second',
  transcription: 'minute',
  embedding: 'token',
  computer_use: 'request',
  sandbox: 'minute',
  tool: 'request',
  storage: 'gibibyte_month',
  database: 'second',
  vector: 'request',
  notification: 'request',
  email: 'request',
  egress: 'gibibyte',
  browser: 'minute',
  work_compute: 'minute',
  code_compute: 'minute',
  connector: 'request',
  artifact: 'gibibyte_month',
  visual: 'minute',
};

/**
 * The rate-card row each non-model capability is metered against. Every one of
 * them is `deployment_metered`, so the amount is whatever the deployment's own
 * override says and never a number stated here.
 */
const RATE_CARD_FEATURE_BY_CAPABILITY = {
  storage: 'object_storage_gib_month',
  database: 'database_compute_second',
  vector: 'vector_query_request',
  notification: 'notification_delivery_request',
  email: 'email_message_request',
  egress: 'network_egress_gib',
  browser: 'browser_session_minute',
  work_compute: 'work_compute_minute',
  code_compute: 'code_compute_minute',
  connector: 'connector_call_request',
  artifact: 'artifact_storage_gib_month',
} as const satisfies Partial<Record<CogsCapability, RateCardFeature>>;

export type InfrastructureCogsCapability = keyof typeof RATE_CARD_FEATURE_BY_CAPABILITY;

export function infrastructureRateCardFeature(
  capability: InfrastructureCogsCapability,
): RateCardFeature {
  return RATE_CARD_FEATURE_BY_CAPABILITY[capability];
}

export function infrastructureCostMicrousd(
  capability: InfrastructureCogsCapability,
  units: number,
): number | null {
  if (!Number.isFinite(units) || units < 0) return null;
  const rate = resolveFeatureRate(RATE_CARD_FEATURE_BY_CAPABILITY[capability]);
  return rate.providerCogsMicrousd === null ? null : rate.providerCogsMicrousd * units;
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function resolveCogsCapability(usage: Record<string, unknown>): CogsCapability {
  const named = text(usage['operation']) ?? text(usage['type']) ?? text(usage['quotaFeature']);
  if (named === null) return 'chat';
  return CAPABILITY_BY_OPERATION[named] ?? 'chat';
}

export function resolveCogsUnits(
  capability: CogsCapability,
  usage: Record<string, unknown>,
): { unitBasis: CogsUnitBasis; units: number } {
  const unitBasis = UNIT_BASIS_BY_CAPABILITY[capability];
  switch (capability) {
    case 'image':
      return { unitBasis, units: numeric(usage['outputCount']) ?? 0 };
    case 'video':
      return { unitBasis, units: numeric(usage['durationSecs']) ?? 0 };
    case 'transcription':
      return {
        unitBasis,
        units: (numeric(usage['audioSeconds']) ?? numeric(usage['estimatedSeconds']) ?? 0) / 60,
      };
    case 'computer_use':
    case 'tool':
    case 'vector':
    case 'notification':
    case 'email':
    case 'connector':
      return { unitBasis, units: numeric(usage['requests']) ?? 1 };
    case 'sandbox':
      return { unitBasis, units: numeric(usage['sandboxMinutes']) ?? 0 };
    case 'storage':
    case 'artifact':
      return { unitBasis, units: numeric(usage['gibibyteMonths']) ?? 0 };
    case 'egress':
      return { unitBasis, units: numeric(usage['gibibytes']) ?? 0 };
    case 'database':
      return { unitBasis, units: numeric(usage['computeSeconds']) ?? 0 };
    case 'browser':
    case 'work_compute':
    case 'code_compute':
      return { unitBasis, units: numeric(usage['computeMinutes']) ?? 0 };
    case 'visual':
      return { unitBasis, units: numeric(usage['visualMinutes']) ?? 0 };
    default: {
      const input = numeric(usage['promptTokens']) ?? numeric(usage['inputTokens']) ?? 0;
      const output = numeric(usage['completionTokens']) ?? numeric(usage['outputTokens']) ?? 0;
      return { unitBasis, units: numeric(usage['totalTokens']) ?? input + output };
    }
  }
}

const NO_TOKEN_CLASSES: TokenClassDimensions = {
  cacheReadUnits: 0,
  cacheWriteUnits: 0,
  compactionSavedUnits: 0,
  cacheSavingsCents: 0,
  cacheWritePremiumCents: 0,
};

function centsForTokens(tokens: number, ratePerMtok: number): number {
  return Math.max(0, Math.round((tokens / 1_000_000) * ratePerMtok * 100));
}

interface ExtractedChatTokens {
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheWriteTotalTokens: number;
  cacheWrite1hSubsetTokens: number;
}

function extractChatTokens(usage: Record<string, unknown>): ExtractedChatTokens {
  return {
    promptTokens: numeric(usage['inputTokens']) ?? numeric(usage['promptTokens']) ?? 0,
    completionTokens: numeric(usage['outputTokens']) ?? numeric(usage['completionTokens']) ?? 0,
    cacheReadTokens:
      numeric(usage['cacheReadTokens']) ?? numeric(usage['cacheReadInputTokens']) ?? 0,
    cacheWriteTotalTokens:
      numeric(usage['cacheWriteTokens']) ?? numeric(usage['cacheCreationInputTokens']) ?? 0,
    cacheWrite1hSubsetTokens:
      numeric(usage['cacheWrite1hTokens']) ?? numeric(usage['cacheCreation1hInputTokens']) ?? 0,
  };
}

function chatTokenUsageInput(tokens: ExtractedChatTokens): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  cacheCreation1hInputTokens: number;
} {
  return {
    promptTokens: tokens.promptTokens,
    completionTokens: tokens.completionTokens,
    totalTokens: tokens.promptTokens + tokens.completionTokens,
    cacheReadInputTokens: tokens.cacheReadTokens,
    cacheCreationInputTokens: tokens.cacheWriteTotalTokens,
    cacheCreation1hInputTokens: tokens.cacheWrite1hSubsetTokens,
  };
}

export function resolveTokenClassDimensions(input: {
  capability: CogsCapability;
  provider: string;
  model?: string | null;
  usage: Record<string, unknown>;
  pricedAt?: Date;
}): TokenClassDimensions {
  if (UNIT_BASIS_BY_CAPABILITY[input.capability] !== 'token') return { ...NO_TOKEN_CLASSES };

  const {
    promptTokens: inputTokens,
    cacheReadTokens: cacheReadUnits,
    cacheWriteTotalTokens: cacheWriteUnits,
  } = extractChatTokens(input.usage);
  const compactionSavedUnits = numeric(input.usage['compactionSavedTokens']) ?? 0;

  if (cacheReadUnits === 0 && cacheWriteUnits === 0) {
    return { ...NO_TOKEN_CLASSES, compactionSavedUnits };
  }

  const model = input.model ?? '';
  const pricedAt = input.pricedAt ?? new Date();
  const rateArgs = [
    input.provider,
    model,
    pricedAt,
    inputTokens,
    cacheReadUnits,
    cacheWriteUnits,
  ] as const;
  const inputRate = LLMCostCalculator.getInputCostPerMtok(...rateArgs);
  const cacheReadRate = LLMCostCalculator.getCacheReadCostPerMtok(...rateArgs);
  const cacheWriteRate = LLMCostCalculator.getCacheWriteCostPerMtok(...rateArgs);

  return {
    cacheReadUnits,
    cacheWriteUnits,
    compactionSavedUnits,
    cacheSavingsCents: centsForTokens(cacheReadUnits, Math.max(0, inputRate - cacheReadRate)),
    cacheWritePremiumCents: centsForTokens(
      cacheWriteUnits,
      Math.max(0, cacheWriteRate - inputRate),
    ),
  };
}

function sumRetailCostCentsFromObservations(
  observations: readonly unknown[],
  fallback: { provider: string; model: string },
  pricedAt: Date,
): number | null {
  let summedDollars = 0;
  let pricedCalls = 0;
  for (const raw of observations) {
    if (!raw || typeof raw !== 'object') continue;
    const observation = raw as Record<string, unknown>;
    const tokens = extractChatTokens(observation);
    if (tokens.promptTokens === 0 && tokens.completionTokens === 0) continue;
    pricedCalls += 1;
    const observedModel = text(observation['model']) ?? fallback.model;
    const list = LLMCostCalculator.listPriceRoute(observedModel);
    summedDollars += LLMCostCalculator.calculateCostDollars(
      list?.provider ?? text(observation['provider']) ?? fallback.provider,
      observedModel,
      chatTokenUsageInput(tokens),
      pricedAt,
      list?.routeId,
    );
  }
  if (pricedCalls === 0) return null;
  const summedCents = summedDollars * 100;
  return summedCents > 0 ? Math.max(1, Math.ceil(summedCents)) : 0;
}

export function resolveRetailCostCents(input: {
  capability: CogsCapability;
  provider: string;
  model?: string | null;
  usage: Record<string, unknown>;
  pricedAt?: Date;
}): number | null {
  if (UNIT_BASIS_BY_CAPABILITY[input.capability] !== 'token' || !input.model) return null;
  const model = input.model;
  const pricedAt = input.pricedAt ?? new Date();

  const observations = input.usage['providerCallObservations'];
  if (Array.isArray(observations) && observations.length > 0) {
    const perCall = sumRetailCostCentsFromObservations(
      observations,
      { provider: input.provider, model },
      pricedAt,
    );
    if (perCall !== null) return perCall;
  }

  const tokens = extractChatTokens(input.usage);
  const list = LLMCostCalculator.listPriceRoute(model);
  return LLMCostCalculator.calculateCost(
    list?.provider ?? input.provider,
    model,
    chatTokenUsageInput(tokens),
    pricedAt,
    list?.routeId,
  );
}

export function getValueMultiplierFromCostEvent(input: {
  metadata: Record<string, unknown> | null | undefined;
  actualCostCents: number;
}): number | null {
  const retailCostCents =
    typeof input.metadata?.['retailCostCents'] === 'number'
      ? (input.metadata['retailCostCents'] as number)
      : null;
  if (retailCostCents === null || !(input.actualCostCents > 0)) return null;
  return retailCostCents / input.actualCostCents;
}

function nonNegativeInt(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

/**
 * The customer's canonical charge in microUSD. A caller may hand it over in
 * either unit; a caller that hands over neither leaves the column null rather
 * than borrowing the provider figure, which is what `billed_cents` did.
 */
export function resolveCustomerCanonicalMicrousd(attribution: CostEventAttribution): number | null {
  const fromMicrousd = nonNegativeInt(attribution.customerCanonicalMicrousd);
  if (fromMicrousd !== null) return fromMicrousd;
  const fromCents = nonNegativeInt(attribution.customerCanonicalCents);
  return fromCents === null ? null : microusdFromCents(fromCents);
}

function reconciliationStatus(attribution: CostEventAttribution): CogsReconciliationStatus {
  return nonNegativeInt(attribution.providerReportedCostMicrousd) === null &&
    nonNegativeInt(attribution.providerReportedCostCents) === null
    ? 'estimated'
    : 'provider_reported';
}

function providerEstimatedMicrousd(event: ProviderCostEvent): number {
  return (
    nonNegativeInt(event.providerEstimatedCostMicrousd) ??
    microusdFromCents(Math.max(0, Math.round(event.providerCostCents)))
  );
}

function providerReportedMicrousd(event: ProviderCostEvent): number | null {
  const direct = nonNegativeInt(event.providerReportedCostMicrousd);
  if (direct !== null) return direct;
  const cents = nonNegativeInt(event.providerReportedCostCents);
  return cents === null ? null : microusdFromCents(cents);
}

export async function recordProviderCostEvent(
  event: ProviderCostEvent,
  db: DatabaseAdapter = getNeonDb(),
): Promise<void> {
  const tokenClasses = event.tokenClasses ?? NO_TOKEN_CLASSES;
  const attribution = normalizeUsageAttribution(event);
  const customerCanonicalMicrousd = resolveCustomerCanonicalMicrousd(event);
  await db.execute(
    `insert into public.provider_cost_events (
       user_id, capability, provider, model, unit_basis, units,
       provider_cost_cents, billed_cents, source_ref, metadata,
       cache_read_units, cache_write_units, compaction_saved_units,
       cache_savings_cents, cache_write_premium_cents,
       task_outcome, task_ref, organization_id,
       customer_canonical_microusd, customer_credits,
       provider_estimated_cost_microusd, provider_reported_cost_microusd,
       reconciliation_status, feature, route_id, surface,
       input_tokens, cached_tokens, output_tokens, reasoning_tokens,
       workload, project_id, session_id, prompt_ids, cache_hit, avoided_cost_microusd,
       workspace_id
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17,
               $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33,
               $34::text[], $35, $36, $37)
     on conflict (source_ref) do nothing`,
    [
      event.userId ?? null,
      event.capability,
      event.provider,
      event.model ?? null,
      event.unitBasis,
      Math.max(0, event.units),
      Math.max(0, Math.round(event.providerCostCents)),
      Math.max(0, Math.round(event.billedCents)),
      event.sourceRef,
      JSON.stringify(event.metadata ?? {}),
      Math.max(0, tokenClasses.cacheReadUnits),
      Math.max(0, tokenClasses.cacheWriteUnits),
      Math.max(0, tokenClasses.compactionSavedUnits),
      Math.max(0, Math.round(tokenClasses.cacheSavingsCents)),
      Math.max(0, Math.round(tokenClasses.cacheWritePremiumCents)),
      event.taskOutcome ?? 'delivered',
      event.taskRef ?? null,
      event.organizationId ?? null,
      customerCanonicalMicrousd,
      customerCanonicalMicrousd === null ? null : creditsFromMicrousd(customerCanonicalMicrousd),
      providerEstimatedMicrousd(event),
      providerReportedMicrousd(event),
      reconciliationStatus(event),
      event.feature ?? null,
      event.routeId ?? null,
      event.surface ?? null,
      nonNegativeInt(event.inputTokens),
      nonNegativeInt(event.cachedTokens),
      nonNegativeInt(event.outputTokens),
      nonNegativeInt(event.reasoningTokens),
      attribution.workload,
      attribution.projectId,
      attribution.sessionId,
      normalizePromptStamps(event.promptIds),
      event.cacheHit === true,
      nonNegativeInt(event.avoidedCostMicrousd),
      event.workspaceId ?? null,
    ],
  );

  trackMeteredCapability({
    userId: event.userId,
    organizationId: event.organizationId ?? null,
    capability: event.capability,
    surface: event.surface ?? null,
    taskOutcome: event.taskOutcome ?? 'delivered',
    provider: event.provider,
  });
}

/**
 * The accounting line for a turn a cache answered. Provider cost is zero
 * because no provider call was made; `avoided_cost_microusd` is what the call
 * that did not happen would have cost at list price, so the saving is a summed
 * column rather than an inference from missing rows.
 */
export async function recordCacheHitCostEvent(
  input: CostEventAttribution & {
    userId: string;
    organizationId?: string | null;
    workspaceId?: string | null;
    capability?: CogsCapability;
    provider: string;
    model?: string | null;
    mechanism: string;
    avoidedCostMicrousd: number;
    sourceRef: string;
    usage: Record<string, unknown>;
    db?: DatabaseAdapter;
  },
): Promise<void> {
  const capability = input.capability ?? resolveCogsCapability(input.usage);
  const { unitBasis, units } = resolveCogsUnits(capability, input.usage);
  const avoided = Math.max(0, Math.round(input.avoidedCostMicrousd));
  try {
    await recordProviderCostEvent(
      {
        ...input,
        capability,
        unitBasis,
        units,
        providerCostCents: 0,
        billedCents: 0,
        cacheHit: true,
        avoidedCostMicrousd: avoided,
        customerCanonicalMicrousd: resolveCustomerCanonicalMicrousd(input) ?? 0,
        metadata: { ...input.usage, cacheMechanism: input.mechanism },
      },
      input.db ?? getNeonDb(),
    );
  } catch (error) {
    logger.error(
      {
        event: 'cogs_cache_hit_event_lost',
        error: error instanceof Error ? error.message : String(error),
        mechanism: input.mechanism,
        sourceRef: input.sourceRef,
      },
      'Cache-hit accounting line could not be written; the saving is missing from the COGS ledger',
    );
  }
}

/**
 * One metered unit of infrastructure the platform bought for itself. The cost
 * is resolved from the rate card, which publishes no rate until the deployment
 * sets one, so an unpriced row still records what was consumed.
 */
export async function recordInfrastructureCostEvent(
  input: CostEventAttribution & {
    userId?: string | null;
    organizationId?: string | null;
    workspaceId?: string | null;
    capability: InfrastructureCogsCapability;
    provider: string;
    units: number;
    sourceRef: string;
    metadata?: Record<string, unknown>;
    db?: DatabaseAdapter;
  },
): Promise<void> {
  const units = Math.max(0, input.units);
  const costMicrousd = infrastructureCostMicrousd(input.capability, units);
  try {
    await recordProviderCostEvent(
      {
        ...input,
        feature: infrastructureRateCardFeature(input.capability),
        unitBasis: UNIT_BASIS_BY_CAPABILITY[input.capability],
        units,
        providerCostCents: costMicrousd === null ? 0 : centsFromMicrousdCeil(costMicrousd),
        billedCents: 0,
        customerCanonicalMicrousd: resolveCustomerCanonicalMicrousd(input) ?? 0,
        metadata: { ...(input.metadata ?? {}), priced: costMicrousd !== null },
      },
      input.db ?? getNeonDb(),
    );
  } catch (error) {
    logger.error(
      {
        event: 'cogs_infrastructure_event_lost',
        error: error instanceof Error ? error.message : String(error),
        capability: input.capability,
        sourceRef: input.sourceRef,
      },
      'Infrastructure cost event could not be written; this consumption is missing from the COGS ledger',
    );
  }
}

export async function recordCogsAdjustment(
  adjustment: CogsAdjustment,
  db: DatabaseAdapter = getNeonDb(),
): Promise<void> {
  await db.execute(
    `insert into public.cogs_adjustments (
       user_id, kind, amount_cents, currency, source_ref, occurred_at, metadata
     ) values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()), $7::jsonb)
     on conflict (kind, source_ref)
     do update set amount_cents = greatest(public.cogs_adjustments.amount_cents, excluded.amount_cents)`,
    [
      adjustment.userId ?? null,
      adjustment.kind,
      Math.max(0, Math.round(adjustment.amountCents)),
      (adjustment.currency ?? 'usd').toLowerCase(),
      adjustment.sourceRef,
      adjustment.occurredAt?.toISOString() ?? null,
      JSON.stringify(adjustment.metadata ?? {}),
    ],
  );
}

const BALANCE_TRANSACTION_PAGE = 100;

const ADJUSTMENT_KIND_BY_BALANCE_TYPE: Record<string, CogsAdjustmentKind> = {
  refund: 'refund',
  payment_refund: 'refund',
  payment_failure_refund: 'refund',
  adjustment: 'chargeback',
  reserve_transaction: 'chargeback_reserve',
  reserved_funds: 'chargeback_reserve',
  stripe_fee: 'stripe_fee',
  stripe_fx_fee: 'stripe_fee',
  tax_fee: 'tax',
};

export interface StripeCogsImportSummary {
  examined: number;
  feesRecorded: number;
  adjustmentsRecorded: number;
  discountsRecorded: number;
}

interface StripeCogsSource {
  balanceTransactions: {
    list(params: { created: { gte: number; lt: number }; limit: number }): {
      autoPagingEach(handler: (entry: StripeBalanceTransaction) => void): Promise<void>;
    };
  };
  invoices: {
    list(params: { created: { gte: number; lt: number }; limit: number }): {
      autoPagingEach(handler: (invoice: StripeInvoice) => void): Promise<void>;
    };
  };
}

interface StripeInvoice {
  id: string;
  currency: string;
  created: number;
  total_discount_amounts?: Array<{
    amount: number;
    discount: string | { id: string };
  }> | null;
}

interface StripeBalanceTransaction {
  id: string;
  amount: number;
  fee: number;
  currency: string;
  created: number;
  type: string;
}

export async function importStripeCogsAdjustments(input: {
  stripe: StripeCogsSource;
  since: Date;
  until: Date;
  db?: DatabaseAdapter;
}): Promise<StripeCogsImportSummary> {
  const db = input.db ?? getNeonDb();
  const pending: StripeBalanceTransaction[] = [];

  await input.stripe.balanceTransactions
    .list({
      created: {
        gte: Math.floor(input.since.getTime() / 1000),
        lt: Math.floor(input.until.getTime() / 1000),
      },
      limit: BALANCE_TRANSACTION_PAGE,
    })
    .autoPagingEach((entry) => {
      pending.push(entry);
    });

  let feesRecorded = 0;
  let adjustmentsRecorded = 0;

  for (const entry of pending) {
    const occurredAt = new Date(entry.created * 1000);
    if (entry.fee > 0) {
      await recordCogsAdjustment(
        {
          kind: 'stripe_fee',
          amountCents: entry.fee,
          currency: entry.currency,
          sourceRef: `balance_txn:${entry.id}`,
          occurredAt,
          metadata: { balanceTransactionType: entry.type },
        },
        db,
      );
      feesRecorded += 1;
    }

    const kind = ADJUSTMENT_KIND_BY_BALANCE_TYPE[entry.type];
    if (kind && kind !== 'stripe_fee' && entry.amount < 0) {
      await recordCogsAdjustment(
        {
          kind,
          amountCents: Math.abs(entry.amount),
          currency: entry.currency,
          sourceRef: `balance_txn:${entry.id}`,
          occurredAt,
          metadata: { balanceTransactionType: entry.type },
        },
        db,
      );
      adjustmentsRecorded += 1;
    }
  }

  const invoices: StripeInvoice[] = [];
  await input.stripe.invoices
    .list({
      created: {
        gte: Math.floor(input.since.getTime() / 1000),
        lt: Math.floor(input.until.getTime() / 1000),
      },
      limit: BALANCE_TRANSACTION_PAGE,
    })
    .autoPagingEach((invoice) => {
      invoices.push(invoice);
    });

  let discountsRecorded = 0;
  for (const invoice of invoices) {
    const lines = invoice.total_discount_amounts ?? [];
    const discountCents = lines.reduce((total, line) => total + Math.max(0, line.amount), 0);
    if (discountCents <= 0) continue;

    await recordCogsAdjustment(
      {
        kind: 'discount',
        amountCents: discountCents,
        currency: invoice.currency,
        sourceRef: `invoice:${invoice.id}`,
        occurredAt: new Date(invoice.created * 1000),
        metadata: {
          discountIds: lines.map((line) =>
            typeof line.discount === 'string' ? line.discount : line.discount.id,
          ),
        },
      },
      db,
    );
    discountsRecorded += 1;
  }

  return {
    examined: pending.length + invoices.length,
    feesRecorded,
    adjustmentsRecorded,
    discountsRecorded,
  };
}

export const VISUAL_SESSION_COST_SOURCE = 'visual_session';

/**
 * Settles a live camera or screen-share session on its own per-minute lines.
 * Frames sent into a turn are priced with that turn's tokens; these rows carry
 * the session itself, which no token count measures.
 */
export async function recordVisualSessionCost(input: {
  userId: string;
  organizationId?: string | null;
  workspaceId?: string | null;
  sessionId: string;
  provider: string;
  model?: string | null;
  surface?: string | null;
  usages: readonly VisualSessionUsage[];
  db?: DatabaseAdapter;
}): Promise<void> {
  for (const line of visualUsageLines(input.usages)) {
    const charge = visualUsageCharge(line);
    await recordSettledProviderCost({
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      workspaceId: input.workspaceId ?? null,
      provider: input.provider,
      model: input.model ?? null,
      actualCostCents:
        charge.providerCogsMicrousd === null
          ? 0
          : centsFromMicrousdCeil(charge.providerCogsMicrousd),
      // Keyed on the session and the source, so a retried close collides rather
      // than counting the same minutes twice.
      sourceRef: `${VISUAL_SESSION_COST_SOURCE}:${input.sessionId}:${line.source}`,
      taskOutcome: 'delivered',
      taskRef: `${VISUAL_SESSION_COST_SOURCE}:${input.sessionId}`,
      feature: line.feature,
      sessionId: input.sessionId,
      surface: input.surface ?? null,
      customerCanonicalMicrousd: charge.customerMicrousd,
      usage: {
        operation: VISUAL_USAGE_OPERATION,
        visualSource: line.source,
        visualMinutes: line.minutes,
        sampledFrames: line.sampledFrames,
        sentFrames: line.sentFrames,
      },
      ...(input.db ? { db: input.db } : {}),
    });
  }
}

/** Every minute of camera and screen share a usage limit must count. */
export function visualUsageFeatures(): readonly RateCardFeature[] {
  return [VISUAL_USAGE_FEATURE.camera, VISUAL_USAGE_FEATURE.screen];
}

export function getServedRouteIdFromCostEventMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  return typeof metadata?.['servedRouteId'] === 'string'
    ? (metadata['servedRouteId'] as string)
    : null;
}

export async function recordSettledProviderCost(
  input: CostEventAttribution & {
    userId: string;
    organizationId?: string | null;
    workspaceId?: string | null;
    provider: string;
    model?: string | null;
    routeId?: string | null;
    actualCostCents: number;
    sourceRef: string;
    taskOutcome?: CogsTaskOutcome;
    taskRef?: string | null;
    usage: Record<string, unknown>;
    db?: DatabaseAdapter;
  },
): Promise<void> {
  const db = input.db ?? getNeonDb();
  const capability = resolveCogsCapability(input.usage);
  const { unitBasis, units } = resolveCogsUnits(capability, input.usage);

  if (input.provider === 'unknown') {
    logger.error(
      { event: 'cogs_provider_unattributed', capability, sourceRef: input.sourceRef },
      'Settled managed usage carried no provider; the COGS row cannot be attributed',
    );
  }

  const retailCostCents = resolveRetailCostCents({
    capability,
    provider: input.provider,
    model: input.model,
    usage: input.usage,
  });

  const metadata =
    input.routeId || retailCostCents !== null
      ? {
          ...input.usage,
          ...(input.routeId ? { servedRouteId: input.routeId } : {}),
          ...(retailCostCents !== null ? { retailCostCents } : {}),
        }
      : input.usage;

  let organizationId = input.organizationId;
  if (organizationId === undefined) {
    try {
      organizationId = await resolveEnterpriseFundingOrganizationId(db, input.userId);
    } catch (error) {
      logger.error(
        {
          event: 'cogs_funding_organization_unresolved',
          error: error instanceof Error ? error.message : String(error),
          sourceRef: input.sourceRef,
        },
        'Funding organization lookup failed; cost event recorded without an organization',
      );
      organizationId = null;
    }
  }

  // A tool, image or video row has no token counts; leaving them null keeps a
  // per-token query from averaging zeros that were never measurements.
  const chatTokens = unitBasis === 'token' ? extractChatTokens(input.usage) : null;

  try {
    await recordProviderCostEvent(
      {
        userId: input.userId,
        organizationId,
        workspaceId: input.workspaceId ?? null,
        capability,
        provider: input.provider,
        model: input.model ?? null,
        unitBasis,
        units,
        providerCostCents: input.actualCostCents,
        billedCents: input.taskOutcome === 'undelivered' ? 0 : input.actualCostCents,
        sourceRef: input.sourceRef,
        taskOutcome: input.taskOutcome ?? 'delivered',
        taskRef: input.taskRef ?? null,
        metadata,
        customerCanonicalMicrousd:
          resolveCustomerCanonicalMicrousd(input) ??
          (retailCostCents === null ? null : microusdFromCents(retailCostCents)),
        providerReportedCostCents: input.providerReportedCostCents ?? null,
        feature: input.feature ?? null,
        routeId: input.routeId ?? null,
        surface: input.surface ?? null,
        workload: input.workload ?? null,
        projectId: input.projectId ?? null,
        sessionId: input.sessionId ?? null,
        promptIds: input.promptIds ?? null,
        inputTokens: input.inputTokens ?? chatTokens?.promptTokens ?? null,
        cachedTokens: input.cachedTokens ?? chatTokens?.cacheReadTokens ?? null,
        outputTokens: input.outputTokens ?? chatTokens?.completionTokens ?? null,
        reasoningTokens:
          input.reasoningTokens ??
          (chatTokens === null ? null : numeric(input.usage['reasoningTokens'])),
        tokenClasses: resolveTokenClassDimensions({
          capability,
          provider: input.provider,
          model: input.model ?? null,
          usage: input.usage,
        }),
      },
      db,
    );
  } catch (error) {
    logger.error(
      {
        event: 'cogs_provider_cost_event_lost',
        error: error instanceof Error ? error.message : String(error),
        capability,
        sourceRef: input.sourceRef,
      },
      'Provider cost event could not be written; this run is missing from the COGS ledger',
    );
  }
}

interface CogsSummaryRow {
  provider_cost_cents: number | string | null;
  billed_cents: number | string | null;
  stripe_fee_cents: number | string | null;
  refund_cents: number | string | null;
  chargeback_cents: number | string | null;
  chargeback_reserve_cents: number | string | null;
  discount_cents: number | string | null;
  support_adjustment_cents: number | string | null;
  tax_cents: number | string | null;
  gross_margin_cents: number | string | null;
  cache_read_units: number | string | null;
  cache_write_units: number | string | null;
  compaction_saved_units: number | string | null;
  cache_savings_cents: number | string | null;
  cache_write_premium_cents: number | string | null;
}

function numberFrom(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number(value) : (value ?? 0);
  return Number.isFinite(parsed) ? Number(parsed) : 0;
}

export async function summarizeCogs(
  periodStart: Date,
  periodEnd: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<CogsSummary> {
  const [row] = await db.query<CogsSummaryRow>('select * from public.cogs_summary($1, $2)', [
    periodStart.toISOString(),
    periodEnd.toISOString(),
  ]);

  return {
    providerCostCents: numberFrom(row?.provider_cost_cents),
    billedCents: numberFrom(row?.billed_cents),
    stripeFeeCents: numberFrom(row?.stripe_fee_cents),
    refundCents: numberFrom(row?.refund_cents),
    chargebackCents: numberFrom(row?.chargeback_cents),
    chargebackReserveCents: numberFrom(row?.chargeback_reserve_cents),
    discountCents: numberFrom(row?.discount_cents),
    supportAdjustmentCents: numberFrom(row?.support_adjustment_cents),
    taxCents: numberFrom(row?.tax_cents),
    grossMarginCents: numberFrom(row?.gross_margin_cents),
    cacheReadUnits: numberFrom(row?.cache_read_units),
    cacheWriteUnits: numberFrom(row?.cache_write_units),
    compactionSavedUnits: numberFrom(row?.compaction_saved_units),
    cacheSavingsCents: numberFrom(row?.cache_savings_cents),
    cacheWritePremiumCents: numberFrom(row?.cache_write_premium_cents),
  };
}

export const MANAGED_USAGE_COST_SOURCE_PREFIX = 'managed_usage:';

export const MANAGED_USAGE_RECONCILIATION_FINDINGS = [
  'cost_without_usage',
  'usage_without_cost',
  'negative_margin',
] as const;

export type ManagedUsageReconciliationFinding =
  (typeof MANAGED_USAGE_RECONCILIATION_FINDINGS)[number];

export interface SettledCostPosition {
  sourceRef: string;
  userId: string | null;
  provider: string;
  providerCostMicrousd: number;
  customerChargedMicrousd: number;
  occurredAt: string;
}

export interface DeliveredUsagePosition {
  sourceRef: string;
  userId: string;
  provider: string;
  customerChargedMicrousd: number;
  occurredAt: string;
}

export interface ManagedUsageReconciliationRow {
  finding: ManagedUsageReconciliationFinding;
  sourceRef: string;
  userId: string | null;
  provider: string;
  providerCostMicrousd: number;
  customerChargedMicrousd: number;
  marginMicrousd: number;
  occurredAt: string;
}

export function managedUsageCostSourceRef(request: {
  userId: string;
  idempotencyKey: string;
  requestHash: string;
}): string {
  return `${MANAGED_USAGE_COST_SOURCE_PREFIX}${request.userId}:${request.idempotencyKey}:${request.requestHash}`;
}

const SETTLED_COST_POSITIONS_SQL = `select e.source_ref, e.user_id, e.provider, e.provider_cost_cents,
          e.billed_cents, e.customer_canonical_microusd, e.created_at
     from public.provider_cost_events e
    where e.created_at >= $1::timestamptz
      and e.created_at < $2::timestamptz
      and e.source_ref like $3::text
    order by e.created_at asc`;

const DELIVERED_USAGE_POSITIONS_SQL = `select r.user_id, r.idempotency_key, r.request_hash, r.provider,
          r.actual_cost_cents, r.finalized_at
     from public.managed_usage_requests r
    where r.finalized_at >= $1::timestamptz
      and r.finalized_at < $2::timestamptz
      and r.status = 'completed'
      and coalesce(r.actual_cost_cents, 0) > 0
    order by r.finalized_at asc`;

interface SettledCostRow {
  source_ref: string;
  user_id: string | null;
  provider: string;
  provider_cost_cents: number | string | null;
  billed_cents: number | string | null;
  customer_canonical_microusd: number | string | null;
  created_at: string | Date;
}

interface DeliveredUsageRow {
  user_id: string;
  idempotency_key: string;
  request_hash: string;
  provider: string;
  actual_cost_cents: number | string | null;
  finalized_at: string | Date;
}

function isoOf(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export async function readSettledCostPositions(
  periodStart: Date,
  periodEnd: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<SettledCostPosition[]> {
  const rows = await db.query<SettledCostRow>(SETTLED_COST_POSITIONS_SQL, [
    periodStart.toISOString(),
    periodEnd.toISOString(),
    `${MANAGED_USAGE_COST_SOURCE_PREFIX}%`,
  ]);
  return rows.map((row) => ({
    sourceRef: row.source_ref,
    userId: row.user_id,
    provider: row.provider,
    providerCostMicrousd: microusdFromCents(numberFrom(row.provider_cost_cents)),
    customerChargedMicrousd:
      row.customer_canonical_microusd === null || row.customer_canonical_microusd === undefined
        ? microusdFromCents(numberFrom(row.billed_cents))
        : numberFrom(row.customer_canonical_microusd),
    occurredAt: isoOf(row.created_at),
  }));
}

export async function readDeliveredUsagePositions(
  periodStart: Date,
  periodEnd: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<DeliveredUsagePosition[]> {
  const rows = await db.query<DeliveredUsageRow>(DELIVERED_USAGE_POSITIONS_SQL, [
    periodStart.toISOString(),
    periodEnd.toISOString(),
  ]);
  return rows.map((row) => ({
    sourceRef: managedUsageCostSourceRef({
      userId: row.user_id,
      idempotencyKey: row.idempotency_key,
      requestHash: row.request_hash,
    }),
    userId: row.user_id,
    provider: row.provider,
    customerChargedMicrousd: microusdFromCents(numberFrom(row.actual_cost_cents)),
    occurredAt: isoOf(row.finalized_at),
  }));
}

/**
 * A settled turn writes two rows: what the customer was charged and what the
 * provider cost. Either one alone is a hole in the accounts, and a turn whose
 * charge is below its cost was sold at a loss. Both sides are matched on the
 * source reference the settlement itself writes, so nothing is paired by
 * guesswork.
 */
export function reconcileManagedUsage(
  costs: readonly SettledCostPosition[],
  delivered: readonly DeliveredUsagePosition[],
): ManagedUsageReconciliationRow[] {
  const deliveredBySourceRef = new Map(delivered.map((row) => [row.sourceRef, row]));
  const costBySourceRef = new Map(costs.map((row) => [row.sourceRef, row]));
  const findings: ManagedUsageReconciliationRow[] = [];

  for (const cost of costs) {
    const margin = cost.customerChargedMicrousd - cost.providerCostMicrousd;
    const finding: ManagedUsageReconciliationFinding | null = !deliveredBySourceRef.has(
      cost.sourceRef,
    )
      ? 'cost_without_usage'
      : margin < 0
        ? 'negative_margin'
        : null;
    if (finding === null) continue;
    findings.push({
      finding,
      sourceRef: cost.sourceRef,
      userId: cost.userId,
      provider: cost.provider,
      providerCostMicrousd: cost.providerCostMicrousd,
      customerChargedMicrousd: cost.customerChargedMicrousd,
      marginMicrousd: margin,
      occurredAt: cost.occurredAt,
    });
  }

  for (const usage of delivered) {
    if (costBySourceRef.has(usage.sourceRef)) continue;
    findings.push({
      finding: 'usage_without_cost',
      sourceRef: usage.sourceRef,
      userId: usage.userId,
      provider: usage.provider,
      providerCostMicrousd: 0,
      customerChargedMicrousd: usage.customerChargedMicrousd,
      marginMicrousd: usage.customerChargedMicrousd,
      occurredAt: usage.occurredAt,
    });
  }

  return findings.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

export async function reconcileManagedUsageCosts(
  periodStart: Date,
  periodEnd: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<ManagedUsageReconciliationRow[]> {
  const [costs, delivered] = await Promise.all([
    readSettledCostPositions(periodStart, periodEnd, db),
    readDeliveredUsagePositions(periodStart, periodEnd, db),
  ]);
  return reconcileManagedUsage(costs, delivered);
}

export interface TaskEconomics {
  deliveredTasks: number;
  deliveredTaskCostCents: number;
  costPerDeliveredTaskCents: number | null;
  repeatedTasks: number;
  repeatCostCents: number;
  undeliveredEvents: number;
  undeliveredCostCents: number;
  unattributedCostCents: number;
}

interface TaskEconomicsRow {
  delivered_tasks: number | string | null;
  delivered_task_cost_cents: number | string | null;
  repeated_tasks: number | string | null;
  repeat_cost_cents: number | string | null;
  undelivered_events: number | string | null;
  undelivered_cost_cents: number | string | null;
  unattributed_cost_cents: number | string | null;
}

export async function summarizeTaskEconomics(
  periodStart: Date,
  periodEnd: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<TaskEconomics> {
  const [row] = await db.query<TaskEconomicsRow>('select * from public.task_economics($1, $2)', [
    periodStart.toISOString(),
    periodEnd.toISOString(),
  ]);

  const deliveredTasks = numberFrom(row?.delivered_tasks);
  const deliveredTaskCostCents = numberFrom(row?.delivered_task_cost_cents);

  return {
    deliveredTasks,
    deliveredTaskCostCents,
    costPerDeliveredTaskCents: deliveredTasks > 0 ? deliveredTaskCostCents / deliveredTasks : null,
    repeatedTasks: numberFrom(row?.repeated_tasks),
    repeatCostCents: numberFrom(row?.repeat_cost_cents),
    undeliveredEvents: numberFrom(row?.undelivered_events),
    undeliveredCostCents: numberFrom(row?.undelivered_cost_cents),
    unattributedCostCents: numberFrom(row?.unattributed_cost_cents),
  };
}

interface CogsAccountAttributionRow {
  active_accounts: number | string | null;
  attributed_cost_cents: number | string | null;
  unattributed_cost_cents: number | string | null;
}

export interface CogsAccountAttribution {
  activeAccounts: number;
  attributedCostCents: number;
  unattributedCostCents: number;
}

/**
 * `user_id` is nullable on the ledger, so a cost per account taken over the
 * whole period total would divide money nobody can be attributed by a count of
 * accounts that never carried it. This returns both halves separately so the
 * quotient is exact and the remainder is visible rather than absorbed.
 */
export async function summarizeCogsAccountAttribution(
  periodStart: Date,
  periodEnd: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<CogsAccountAttribution> {
  const [row] = await db.query<CogsAccountAttributionRow>(
    `select count(distinct event.user_id)::bigint as active_accounts,
            coalesce(sum(event.provider_cost_cents)
              filter (where event.user_id is not null), 0)::bigint as attributed_cost_cents,
            coalesce(sum(event.provider_cost_cents)
              filter (where event.user_id is null), 0)::bigint as unattributed_cost_cents
       from public.provider_cost_events event
      where event.occurred_at >= $1::timestamptz
        and event.occurred_at < $2::timestamptz`,
    [periodStart.toISOString(), periodEnd.toISOString()],
  );
  return {
    activeAccounts: numberFrom(row?.active_accounts),
    attributedCostCents: numberFrom(row?.attributed_cost_cents),
    unattributedCostCents: numberFrom(row?.unattributed_cost_cents),
  };
}

interface FeatureUnitsRow {
  units: number | string | null;
}

/**
 * How many units of `features` this user has consumed since `since`, read from
 * the ledger's own typed `feature` column rather than from a jsonb scan. Units,
 * not rows: a single row can carry several calls.
 */
export async function countUserFeatureUnitsSince(
  userId: string,
  features: readonly RateCardFeature[],
  since: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<number> {
  const [row] = await db.query<FeatureUnitsRow>(
    `select coalesce(sum(event.units), 0)::numeric as units
       from public.provider_cost_events event
      where event.user_id = $1
        and event.feature = any($2::text[])
        and event.occurred_at >= $3::timestamptz`,
    [userId, features as unknown as string[], since.toISOString()],
  );
  return numberFrom(row?.units);
}

interface OrganizationSpendRow {
  spend_cents: number | string | null;
}

export interface OrganizationSpendPeriod {
  start: string;
  end: string;
}

function utcMonthPeriod(now: Date): OrganizationSpendPeriod {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1)).toISOString(),
    end: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  };
}

export async function getOrganizationMonthToDateSpendCents(
  organizationId: string,
  db: DatabaseAdapter = getNeonDb(),
  period: OrganizationSpendPeriod = utcMonthPeriod(new Date()),
): Promise<number> {
  const [row] = await db.query<OrganizationSpendRow>(
    `select coalesce(sum(event.provider_cost_cents), 0)::bigint as spend_cents
       from public.provider_cost_events event
      where event.organization_id = $1
        and event.occurred_at >= $2::timestamptz
        and event.occurred_at < $3::timestamptz`,
    [organizationId, period.start, period.end],
  );
  return numberFrom(row?.spend_cents);
}

/**
 * Spend by container rather than by payer. A personal workspace funds nothing
 * and so never appears in the organization total, which is why this cannot be
 * derived from the organization query.
 */
export async function getWorkspaceMonthToDateSpendCents(
  workspaceId: string,
  db: DatabaseAdapter = getNeonDb(),
  period: OrganizationSpendPeriod = utcMonthPeriod(new Date()),
): Promise<number> {
  const [row] = await db.query<OrganizationSpendRow>(
    `select coalesce(sum(event.provider_cost_cents), 0)::bigint as spend_cents
       from public.provider_cost_events event
      where event.workspace_id = $1
        and event.occurred_at >= $2::timestamptz
        and event.occurred_at < $3::timestamptz`,
    [workspaceId, period.start, period.end],
  );
  return numberFrom(row?.spend_cents);
}
