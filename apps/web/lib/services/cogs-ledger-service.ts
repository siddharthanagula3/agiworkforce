import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { resolveEnterpriseFundingOrganizationId } from '@/lib/services/enterprise-funding-organization';

export const COGS_CAPABILITIES = [
  'chat',
  'image',
  'video',
  'transcription',
  'embedding',
  'computer_use',
  'sandbox',
  'tool',
] as const;

export const COGS_UNIT_BASES = ['token', 'image', 'second', 'minute', 'request'] as const;

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

export interface ProviderCostEvent {
  userId?: string | null;
  organizationId?: string | null;
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
};

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
      return { unitBasis, units: numeric(usage['requests']) ?? 1 };
    case 'sandbox':
      return { unitBasis, units: numeric(usage['sandboxMinutes']) ?? 0 };
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
    summedDollars += LLMCostCalculator.calculateCostDollars(
      text(observation['provider']) ?? fallback.provider,
      text(observation['model']) ?? fallback.model,
      chatTokenUsageInput(tokens),
      pricedAt,
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
  return LLMCostCalculator.calculateCost(
    input.provider,
    model,
    chatTokenUsageInput(tokens),
    pricedAt,
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

export async function recordProviderCostEvent(
  event: ProviderCostEvent,
  db: DatabaseAdapter = getNeonDb(),
): Promise<void> {
  const tokenClasses = event.tokenClasses ?? NO_TOKEN_CLASSES;
  await db.execute(
    `insert into public.provider_cost_events (
       user_id, capability, provider, model, unit_basis, units,
       provider_cost_cents, billed_cents, source_ref, metadata,
       cache_read_units, cache_write_units, compaction_saved_units,
       cache_savings_cents, cache_write_premium_cents,
       task_outcome, task_ref, organization_id
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18)
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
    ],
  );
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

export function getServedRouteIdFromCostEventMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  return typeof metadata?.['servedRouteId'] === 'string'
    ? (metadata['servedRouteId'] as string)
    : null;
}

export async function recordSettledProviderCost(input: {
  userId: string;
  organizationId?: string | null;
  provider: string;
  model?: string | null;
  routeId?: string | null;
  actualCostCents: number;
  sourceRef: string;
  taskOutcome?: CogsTaskOutcome;
  taskRef?: string | null;
  usage: Record<string, unknown>;
  db?: DatabaseAdapter;
}): Promise<void> {
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

  try {
    await recordProviderCostEvent(
      {
        userId: input.userId,
        organizationId,
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
