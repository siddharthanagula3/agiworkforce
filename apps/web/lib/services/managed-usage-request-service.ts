import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  classifyManagedQuotaErrorCode,
  getNextUpgradeTier,
  isContractPricedPlan,
  isSelfServePaidPlanTier,
  normalizeBillingPlanTier,
} from '@agiworkforce/types';
import {
  getPlanFlagshipWeeklyUsageCapMicrousd,
  getPlanSessionUsageCapMicrousd,
  getPlanWeeklyUsageCapMicrousd,
} from '@/lib/server/managed-usage-policy';
import { logger } from '@/lib/logger';
import {
  getOrganizationMonthToDateSpendCents,
  recordSettledProviderCost,
} from '@/lib/services/cogs-ledger-service';
import {
  CreditService,
  ledgerCentsFromMicrousd,
  microusdFromLedgerCents,
  type CreditSettlementResult,
} from '@/lib/services/credit-service';
import { resolveEnterpriseFundingOrganizationId } from '@/lib/services/enterprise-funding-organization';
import { readOrganizationPolicy } from '@/lib/services/organization-policy-service';
import { evaluateOrganizationPolicy } from '@/lib/services/organization-policy-evaluator';
import { BLOCK_APPEAL_PATH, recordAuditEvent } from '@/lib/security-audit';

export const MANAGED_CHAT_CONTRACT_VERSION = '2026-07-15' as const;

export const TOP_UP_HREF = '/settings/billing';
export const UPGRADE_HREF = '/pricing';
export const USAGE_HREF = '/settings/usage';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const PROVIDER_OPERATION_KEY_PATTERN = /^provider:[1-9]\d{0,8}$/;

export class ManagedUsageRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly contractVersion: string = MANAGED_CHAT_CONTRACT_VERSION,
  ) {
    super(message);
    this.name = 'ManagedUsageRequestError';
  }
}

export interface ManagedQuotaRecovery {
  action: 'top_up' | 'upgrade' | 'view_usage' | 'contact_support';
  href: string;
}

export function resolveManagedQuotaRecovery(input: {
  code: string | null | undefined;
  planTier: string | null | undefined;
  billedByStripe: boolean;
}): ManagedQuotaRecovery | null {
  const block = classifyManagedQuotaErrorCode(input.code);
  if (!block) return null;
  const planTier = normalizeBillingPlanTier(input.planTier);
  if (block.clearedByCredits && input.billedByStripe && isSelfServePaidPlanTier(planTier)) {
    return { action: 'top_up', href: TOP_UP_HREF };
  }
  if (isContractPricedPlan(planTier)) {
    return { action: 'contact_support', href: BLOCK_APPEAL_PATH };
  }
  if (block.showUpgradeCta && getNextUpgradeTier(input.planTier) !== null) {
    return { action: 'upgrade', href: UPGRADE_HREF };
  }
  return { action: 'view_usage', href: USAGE_HREF };
}

export function createManagedUsageErrorBody(
  error: ManagedUsageRequestError,
  type: 'invalid_request_error' | 'insufficient_quota',
  recovery?: ManagedQuotaRecovery | null,
) {
  return {
    error: {
      message: error.message,
      type,
      code: error.code,
      contract_version: error.contractVersion,
      ...(recovery ? { recovery } : {}),
    },
  };
}

export interface ManagedUsageRequestReservation {
  db: DatabaseAdapter;
  userId: string;
  idempotencyKey: string;
  requestHash: string;
  leaseToken: string;
  /**
   * What the ledger reserved. The cents field is its round-half-up mirror.
   * Optional only so a reservation rebuilt from a record written before 0185
   * still satisfies the type; read it through `estimateMicrousdOf`, never
   * directly, so the cents fallback is always applied.
   */
  estimatedCostMicrousd?: number;
  estimatedCostCents: number;
  quotaFeature?: string;
  provider?: string;
  model?: string;
  routeId?: string | null;
}

/**
 * A caller supplies whichever unit it already holds. `*Cents` is the
 * deprecated alias: it is scaled by 10,000 and takes the same path, so a call
 * site that has not migrated bills exactly what it billed before 0185.
 */
export type ManagedUsageAmount =
  | { estimatedCostMicrousd: number; estimatedCostCents?: number }
  | { estimatedCostCents: number; estimatedCostMicrousd?: number };

/** The reserved amount in the ledger's unit, from whichever field carries it. */
export function estimateMicrousdOf(source: {
  estimatedCostMicrousd?: number | undefined;
  estimatedCostCents: number;
}): number {
  return source.estimatedCostMicrousd ?? microusdFromLedgerCents(source.estimatedCostCents);
}

function resolveEstimatedMicrousd(input: {
  estimatedCostMicrousd?: number | undefined;
  estimatedCostCents?: number | undefined;
}): number {
  if (input.estimatedCostMicrousd !== undefined) return Math.round(input.estimatedCostMicrousd);
  return microusdFromLedgerCents(input.estimatedCostCents ?? 0);
}

export interface ServedRoute {
  provider: string | null;
  model: string | null;
  routeId: string | null;
}

function buildRouteId(
  provider: string | null | undefined,
  model: string | null | undefined,
): string | null {
  return provider && model ? `${provider}/${model}` : null;
}

export function getServedRouteFromUsage(
  usage: Record<string, unknown> | null | undefined,
): ServedRoute {
  const provider =
    typeof usage?.['servedProvider'] === 'string' ? (usage['servedProvider'] as string) : null;
  const model =
    typeof usage?.['servedModel'] === 'string' ? (usage['servedModel'] as string) : null;
  const routeId =
    typeof usage?.['servedRouteId'] === 'string'
      ? (usage['servedRouteId'] as string)
      : buildRouteId(provider, model);
  return { provider, model, routeId };
}

function resolveServedRouteFromObservations(
  usage: Record<string, unknown> | null | undefined,
): ServedRoute | null {
  const observations = usage?.['providerCallObservations'];
  if (!Array.isArray(observations) || observations.length === 0) return null;

  const last = observations[observations.length - 1];
  if (!last || typeof last !== 'object') return null;

  const provider = (last as Record<string, unknown>)['provider'];
  if (typeof provider !== 'string' || provider.length === 0) return null;

  const model = (last as Record<string, unknown>)['model'];
  const modelId = typeof model === 'string' ? model : null;
  const observedRouteId = (last as Record<string, unknown>)['routeId'];
  const routeId =
    typeof observedRouteId === 'string' && observedRouteId.length > 0
      ? observedRouteId
      : buildRouteId(provider, modelId);
  return { provider, model: modelId, routeId };
}

export interface ManagedUsageFinalization {
  requestStatus: 'completed' | 'released' | 'outcome_unknown';
  operationResult: 'finalized' | 'already_finalized';
  settlementStatus: 'succeeded' | 'pending' | 'terminal' | null;
  actualCostMicrousd?: number;
  actualCostCents: number;
}

export interface ManagedUsageProviderStepReservation {
  operationResult: 'covered' | 'extended' | 'already_extended';
  estimatedCostMicrousd?: number;
  estimatedCostCents: number;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) result[key] = canonicalize(entry);
    }
    return result;
  }
  return value;
}

export function parseManagedUsageIdempotencyKey(header: string | null): string {
  if (header === null) {
    throw new ManagedUsageRequestError(
      'Idempotency-Key header is required for Managed Cloud chat. Reuse the same key only when retrying the same request body.',
      400,
      'idempotency_key_required',
    );
  }
  const key = header.trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new ManagedUsageRequestError(
      'Idempotency-Key must be 8-128 characters using letters, digits, dot, underscore, colon, or hyphen.',
      400,
      'invalid_idempotency_key',
    );
  }
  return key;
}

export function fingerprintManagedUsageRequest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

const QUERY_LOG_PREVIEW_CHARS = 80;

/** A bigint column arrives as a string once it exceeds 2^31. */
function ledgerAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function databaseErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

async function queryOne(
  db: DatabaseAdapter,
  sql: string,
  params: unknown[],
): Promise<Record<string, unknown>> {
  const statement = sql.slice(0, QUERY_LOG_PREVIEW_CHARS);
  try {
    const rows = await db.query<Record<string, unknown>>(sql, params);
    const row = rows[0];
    if (row) return row;
    logger.error({ statement }, '[managed-usage] usage query returned no row; billing unavailable');
  } catch (error) {
    if (error instanceof ManagedUsageRequestError) throw error;
    logger.error(
      { error, code: databaseErrorCode(error), statement },
      '[managed-usage] usage query failed; billing unavailable',
    );
  }
  throw new ManagedUsageRequestError(
    'Managed usage billing is temporarily unavailable.',
    503,
    'billing_unavailable',
  );
}

/**
 * The organization whose spend cap binds this turn.
 *
 * The caller's scoped organization is null on a personal-scope request, which
 * the caller selects with `x-agi-organization-id`. A member who has reached the
 * cap could otherwise send that header and keep spending, so an unscoped turn
 * falls back to the funding organization rather than to no cap at all.
 */
async function resolveSpendCapOrganizationId(
  db: DatabaseAdapter,
  organizationId: string | null | undefined,
  userId: string,
): Promise<string | null> {
  if (organizationId) return organizationId;
  try {
    return await resolveEnterpriseFundingOrganizationId(db, userId);
  } catch (error) {
    logger.error(
      { error, userId },
      '[managed-usage] funding organization lookup failed; spend cap treated as ungoverned',
    );
    return null;
  }
}

async function assertOrganizationSpendCap(
  db: DatabaseAdapter,
  organizationId: string,
  userId: string,
): Promise<void> {
  let policy;
  try {
    policy = await readOrganizationPolicy(db, organizationId);
  } catch (error) {
    logger.error(
      { error, organizationId, userId },
      '[managed-usage] organization policy read failed; spend cap treated as ungoverned',
    );
    return;
  }

  if (!policy || policy.monthlySpendCapCents === null) return;

  let monthToDateSpendCents: number;
  try {
    monthToDateSpendCents = await getOrganizationMonthToDateSpendCents(organizationId, db);
  } catch (error) {
    logger.error(
      { error, organizationId, userId },
      '[managed-usage] organization spend lookup failed; spend cap treated as ungoverned',
    );
    return;
  }

  const decision = evaluateOrganizationPolicy(policy, {
    resource: 'spend_cap',
    monthToDateSpendCents,
  });
  if (decision.allowed) return;

  await recordAuditEvent({
    userId,
    organizationId,
    eventType: 'spend_cap_exceeded',
    outcome: 'denied',
    severity: 'warning',
    detail: {
      resourceType: 'organization_spend_cap',
      status: 'exceeded',
      reason: decision.reason,
    },
  }).catch((error) => {
    logger.error(
      { error, organizationId },
      '[managed-usage] spend cap audit event could not be recorded',
    );
  });

  throw new ManagedUsageRequestError(decision.reason, 402, 'organization_spend_cap_reached');
}

function reservationError(decision: string): ManagedUsageRequestError {
  switch (decision) {
    case 'in_progress':
      return new ManagedUsageRequestError(
        'An identical Managed Cloud request is already in progress.',
        409,
        'idempotency_in_progress',
      );
    case 'completed':
    case 'released':
    case 'outcome_unknown':
      return new ManagedUsageRequestError(
        'This idempotency key has already reached a terminal state. Start a deliberate new turn with a new key.',
        409,
        'idempotency_replay',
      );
    case 'conflict':
      return new ManagedUsageRequestError(
        'This idempotency key was already used for a different request body.',
        409,
        'idempotency_conflict',
      );
    case 'declined':
      return new ManagedUsageRequestError(
        'Usage budget exhausted for this billing period. Upgrade your plan or add credits.',
        402,
        'insufficient_credits',
      );
    case 'session_limit':
      return new ManagedUsageRequestError(
        'Your rolling 5-hour usage limit is reached. Wait for earlier usage to leave the window or upgrade for a higher limit.',
        429,
        'rolling_five_hour_limit_reached',
      );
    case 'weekly_limit':
      return new ManagedUsageRequestError(
        'Your rolling weekly usage limit is reached. Wait for earlier usage to leave the window or upgrade for a higher limit.',
        429,
        'rolling_weekly_limit_reached',
      );
    case 'flagship_weekly_limit':
      return new ManagedUsageRequestError(
        'Your rolling flagship weekly usage limit is reached. Choose a standard model, wait for earlier usage to leave the window, or upgrade for a higher limit.',
        429,
        'flagship_weekly_limit_reached',
      );
    default:
      return new ManagedUsageRequestError(
        'Managed usage billing is temporarily unavailable.',
        503,
        'billing_unavailable',
      );
  }
}

/** Headroom is the lesser of what is left and what was purchased, never more. */
async function resolveOverageHeadroomMicrousd(
  db: DatabaseAdapter,
  userId: string,
): Promise<number> {
  try {
    const rows = await db.query<{ headroom_microusd: number | string | null }>(
      `select greatest(
                least(
                  credits.credits_allocated_microusd - credits.credits_used_microusd,
                  credits.top_up_allocated_microusd
                ), 0) as headroom_microusd
         from public.token_credits credits
         join public.subscriptions subscription on subscription.user_id = credits.user_id
        where credits.user_id = $1
          and credits.period_end > now()
          and subscription.overage_enabled
        order by credits.period_end desc
        limit 1`,
      [userId],
    );
    const value = Number(rows[0]?.headroom_microusd ?? 0);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch (error) {
    logger.warn({ error, userId }, 'Overage headroom lookup failed; treating as no headroom');
    return 0;
  }
}

export async function reserveManagedUsageRequest(
  input: {
    db: DatabaseAdapter;
    userId: string;
    organizationId?: string | null;
    idempotencyKey: string;
    requestHash: string;
    provider: string;
    model: string;
    leaseToken?: string;
    leaseSeconds?: number;
    planTier: string;
    isFlagship: boolean;
    quotaFeature?: string;
  } & ManagedUsageAmount,
): Promise<ManagedUsageRequestReservation> {
  const spendCapOrganizationId = await resolveSpendCapOrganizationId(
    input.db,
    input.organizationId,
    input.userId,
  );
  if (spendCapOrganizationId) {
    await assertOrganizationSpendCap(input.db, spendCapOrganizationId, input.userId);
  }

  const idempotencyKey = parseManagedUsageIdempotencyKey(input.idempotencyKey);
  const leaseToken = input.leaseToken ?? randomUUID();
  const sessionCapMicrousd = getPlanSessionUsageCapMicrousd(input.planTier);
  const weeklyCapMicrousd = getPlanWeeklyUsageCapMicrousd(input.planTier);
  const flagshipWeeklyCapMicrousd = getPlanFlagshipWeeklyUsageCapMicrousd(input.planTier);
  const topUpHeadroomMicrousd = await resolveOverageHeadroomMicrousd(input.db, input.userId);
  const row = await queryOne(
    input.db,
    `select * from public.reserve_managed_usage_request_with_limits_microusd(
      $1::text, $2::text, $3::text, $4::text, $5::text, $6::bigint,
      $7::text, $8::integer, $9::bigint, $10::bigint, $11::bigint, $12::boolean,
      $13::bigint
    )`,
    [
      input.userId,
      idempotencyKey,
      input.requestHash,
      input.provider,
      input.model,
      resolveEstimatedMicrousd(input),
      leaseToken,
      input.leaseSeconds ?? 900,
      sessionCapMicrousd,
      weeklyCapMicrousd,
      flagshipWeeklyCapMicrousd,
      input.isFlagship,
      topUpHeadroomMicrousd,
    ],
  );

  const decision =
    typeof row['reservation_decision'] === 'string' ? row['reservation_decision'] : '';
  if (decision !== 'acquired') throw reservationError(decision);
  const reservedMicrousd = ledgerAmount(row['estimated_cost_microusd']);
  if (
    row['request_status'] !== 'reserved' ||
    typeof row['lease_token'] !== 'string' ||
    reservedMicrousd === null
  ) {
    throw new ManagedUsageRequestError(
      'Managed usage billing returned an invalid reservation.',
      503,
      'billing_protocol_error',
    );
  }

  return {
    db: input.db,
    userId: input.userId,
    idempotencyKey,
    requestHash: input.requestHash,
    leaseToken: row['lease_token'],
    estimatedCostMicrousd: reservedMicrousd,
    estimatedCostCents: ledgerCentsFromMicrousd(reservedMicrousd),
    provider: input.provider,
    model: input.model,
    routeId: buildRouteId(input.provider, input.model),
    ...(input.quotaFeature ? { quotaFeature: input.quotaFeature } : {}),
  };
}

export async function reserveManagedUsageProviderStep(
  input: {
    reservation: ManagedUsageRequestReservation;
    operationKey: string;
    planTier: string;
    isFlagship: boolean;
  } & ManagedUsageAmount,
): Promise<ManagedUsageProviderStepReservation> {
  const stepMicrousd = resolveEstimatedMicrousd(input);
  if (
    !PROVIDER_OPERATION_KEY_PATTERN.test(input.operationKey) ||
    !Number.isInteger(stepMicrousd) ||
    stepMicrousd < 0
  ) {
    throw new ManagedUsageRequestError(
      'Managed usage provider-step reservation is invalid.',
      503,
      'billing_protocol_error',
    );
  }

  const sessionCapMicrousd = getPlanSessionUsageCapMicrousd(input.planTier);
  const weeklyCapMicrousd = getPlanWeeklyUsageCapMicrousd(input.planTier);
  const flagshipWeeklyCapMicrousd = getPlanFlagshipWeeklyUsageCapMicrousd(input.planTier);
  const reservation = input.reservation;
  const row = await queryOne(
    reservation.db,
    `select * from public.extend_managed_usage_request_provider_step_microusd(
      $1::text, $2::text, $3::text, $4::text, $5::text, $6::bigint,
      $7::bigint, $8::bigint, $9::bigint, $10::boolean
    )`,
    [
      reservation.userId,
      reservation.idempotencyKey,
      reservation.requestHash,
      reservation.leaseToken,
      input.operationKey,
      stepMicrousd,
      sessionCapMicrousd,
      weeklyCapMicrousd,
      flagshipWeeklyCapMicrousd,
      input.isFlagship,
    ],
  );

  const decision = typeof row['extension_decision'] === 'string' ? row['extension_decision'] : '';
  if (decision !== 'covered' && decision !== 'extended' && decision !== 'already_extended') {
    throw reservationError(decision);
  }
  const reservedMicrousd = ledgerAmount(row['estimated_cost_microusd']);
  if (row['request_status'] !== 'provider_started' || reservedMicrousd === null) {
    throw new ManagedUsageRequestError(
      'Managed usage billing returned an invalid provider-step reservation.',
      503,
      'billing_protocol_error',
    );
  }

  reservation.estimatedCostMicrousd = reservedMicrousd;
  reservation.estimatedCostCents = ledgerCentsFromMicrousd(reservedMicrousd);
  return {
    operationResult: decision,
    estimatedCostMicrousd: reservedMicrousd,
    estimatedCostCents: reservation.estimatedCostCents,
  };
}

async function transition(
  reservation: ManagedUsageRequestReservation,
  functionName: 'mark_managed_usage_provider_started' | 'mark_managed_usage_client_delivered',
): Promise<void> {
  const row = await queryOne(
    reservation.db,
    `select * from public.${functionName}($1::text, $2::text, $3::text, $4::text)`,
    [
      reservation.userId,
      reservation.idempotencyKey,
      reservation.requestHash,
      reservation.leaseToken,
    ],
  );
  if (row['operation_result'] !== 'updated' && row['operation_result'] !== 'already_updated') {
    throw new ManagedUsageRequestError(
      'Managed usage lifecycle transition was rejected.',
      409,
      'billing_state_conflict',
    );
  }
}

export function markManagedUsageProviderStarted(
  reservation: ManagedUsageRequestReservation,
): Promise<void> {
  return transition(reservation, 'mark_managed_usage_provider_started');
}

export function markManagedUsageClientDelivered(
  reservation: ManagedUsageRequestReservation,
): Promise<void> {
  return transition(reservation, 'mark_managed_usage_client_delivered');
}

/**
 * Recovery refunded the reservation because the lease expired, then the turn
 * delivered anyway. The user has the work; without this the company pays the
 * provider and bills nothing. A separate durable settlement is the only way to
 * charge it, because the request's own finalization key is already consumed.
 *
 * It carries no managed-usage `type`, so `enqueue_credit_settlement` routes it
 * down the ordinary deduction path rather than the lifecycle helper, whose
 * idempotency keys are derived from the request id and already spent.
 */
async function settleLateManagedUsage(
  input: ManagedUsageRequestReservation & { outcome: 'completed' | 'failed' },
  amountMicrousd: number,
): Promise<CreditSettlementResult | null> {
  try {
    const result = await CreditService.settleCreditsDurably(
      {
        userId: input.userId,
        amountMicrousd,
        description: 'Managed usage late settlement after recovery',
        metadata: {
          idempotency_key: input.idempotencyKey,
          request_hash: input.requestHash,
          is_late_settlement: true,
          ...(input.quotaFeature ? { quotaFeature: input.quotaFeature } : {}),
        },
        idempotencyKey: CreditService.generateIdempotencyKey(
          input.userId,
          'reconciliation',
          `${input.idempotencyKey}:late`,
        ),
      },
      input.db,
    );
    if (!result.success) {
      logger.error(
        {
          event: 'managed_usage_late_settlement_rejected',
          userId: input.userId,
          idempotencyKey: input.idempotencyKey,
          amountMicrousd,
          code: result.code ?? null,
          settlementStatus: result.status,
        },
        'Late settlement for a recovered managed usage turn was rejected; the cost stays absorbed',
      );
    }
    return result;
  } catch (error) {
    logger.error(
      {
        event: 'managed_usage_late_settlement_failed',
        error,
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
        amountMicrousd,
      },
      'Late settlement for a recovered managed usage turn could not be enqueued',
    );
    return null;
  }
}

export async function finalizeManagedUsageRequest(
  input: ManagedUsageRequestReservation & {
    outcome: 'completed' | 'failed';
    /**
     * What the user is billed: the model's official price for the usage.
     * `*Cents` is the deprecated alias, scaled by 10,000.
     */
    actualCostMicrousd?: number;
    actualCostCents?: number;
    /** What the served route cost the company; defaults to the billed amount. */
    providerCostMicrousd?: number;
    providerCostCents?: number;
    usage?: Record<string, unknown>;
  },
): Promise<ManagedUsageFinalization> {
  const billedMicrousd =
    input.actualCostMicrousd !== undefined
      ? Math.round(input.actualCostMicrousd)
      : microusdFromLedgerCents(input.actualCostCents ?? 0);
  const providerSuppliedMicrousd =
    input.providerCostMicrousd !== undefined
      ? Math.round(input.providerCostMicrousd)
      : input.providerCostCents !== undefined
        ? microusdFromLedgerCents(input.providerCostCents)
        : undefined;
  const actualCostMicrousd = input.outcome === 'failed' ? 0 : Math.max(0, billedMicrousd);
  const providerCostMicrousd =
    input.outcome === 'failed' ? 0 : Math.max(0, providerSuppliedMicrousd ?? actualCostMicrousd);
  const quotaTaggedUsage = input.quotaFeature
    ? { ...(input.usage ?? {}), quotaFeature: input.quotaFeature }
    : (input.usage ?? {});
  const servedRoute = resolveServedRouteFromObservations(quotaTaggedUsage);
  const usage = servedRoute
    ? {
        ...quotaTaggedUsage,
        servedProvider: servedRoute.provider,
        servedModel: servedRoute.model,
        servedRouteId: servedRoute.routeId,
        reservedProvider: input.provider ?? null,
        reservedModel: input.model ?? null,
        reservedRouteId: input.routeId ?? buildRouteId(input.provider, input.model),
      }
    : quotaTaggedUsage;
  const row = await queryOne(
    input.db,
    `select * from public.finalize_managed_usage_request_microusd(
      $1::text, $2::text, $3::text, $4::text, $5::text, $6::bigint, $7::jsonb
    )`,
    [
      input.userId,
      input.idempotencyKey,
      input.requestHash,
      input.leaseToken,
      input.outcome,
      actualCostMicrousd,
      JSON.stringify(usage),
    ],
  );

  const requestStatus = row['request_status'];
  const operationResult = row['operation_result'];
  const settlementStatus = row['settlement_status'];
  if (
    (requestStatus !== 'completed' &&
      requestStatus !== 'released' &&
      requestStatus !== 'outcome_unknown') ||
    (operationResult !== 'finalized' && operationResult !== 'already_finalized') ||
    (settlementStatus !== null &&
      settlementStatus !== undefined &&
      settlementStatus !== 'succeeded' &&
      settlementStatus !== 'pending' &&
      settlementStatus !== 'terminal')
  ) {
    throw new ManagedUsageRequestError(
      'Managed usage billing returned an invalid finalization.',
      503,
      'billing_protocol_error',
    );
  }

  const settledCostMicrousd = ledgerAmount(row['actual_cost_microusd']) ?? actualCostMicrousd;
  const settledCostCents = ledgerCentsFromMicrousd(settledCostMicrousd);

  // The request fingerprint is the task identity: a regenerated turn sends the
  // same payload and hashes the same, so the ledger can separate what the first
  // attempt cost from what repeating it cost.
  const settledTaskOutcome =
    requestStatus === 'completed'
      ? 'delivered'
      : requestStatus === 'outcome_unknown'
        ? 'undelivered'
        : null;

  // AGI-1. `already_finalized` against an `outcome_unknown` row is recovery
  // having reclaimed a turn that was in fact still running: the user was
  // refunded, the provider was not. Nothing branched on this status, so the
  // absorbed cost was invisible. Recording it under the same source ref the
  // delivered path uses keeps the COGS ledger honest, and `billedCents` is
  // already zero for an undelivered outcome, so no user is charged twice.
  if (operationResult === 'already_finalized' && requestStatus === 'outcome_unknown') {
    const lateSettlement =
      input.outcome === 'completed' && actualCostMicrousd > 0
        ? await settleLateManagedUsage(input, actualCostMicrousd)
        : null;

    logger.error(
      {
        event: 'managed_usage_finalize_after_recovery',
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
        provider: servedRoute?.provider ?? input.provider ?? 'unknown',
        model: servedRoute?.model ?? input.model ?? null,
        actualCostMicrousd,
        providerCostMicrousd,
        lateSettlementStatus: lateSettlement?.status ?? 'not_attempted',
        lateSettlementSucceeded: lateSettlement?.success ?? false,
      },
      lateSettlement?.success === true
        ? 'Managed usage turn completed after its lease was recovered; the delivered work was settled late'
        : 'Managed usage turn completed after its lease was recovered; provider cost absorbed and nothing billed',
    );
  }

  const recordsProviderCost =
    operationResult === 'finalized' ||
    (operationResult === 'already_finalized' && requestStatus === 'outcome_unknown');

  if (settledTaskOutcome !== null && recordsProviderCost) {
    await recordSettledProviderCost({
      userId: input.userId,
      provider: servedRoute?.provider ?? input.provider ?? 'unknown',
      model: servedRoute?.model ?? input.model ?? null,
      routeId: servedRoute?.routeId ?? input.routeId ?? buildRouteId(input.provider, input.model),
      actualCostCents: ledgerCentsFromMicrousd(
        providerSuppliedMicrousd === undefined ? settledCostMicrousd : providerCostMicrousd,
      ),
      // The customer side goes over in microUSD, which is the unit it is now
      // settled in. The provider side stays in cents: CostEventAttribution
      // declares no microUSD field for it, and providerReportedCostCents is
      // not it either, that column means the provider itself reported a
      // figure and setting it would mark an estimate as reconciled.
      customerCanonicalMicrousd: settledCostMicrousd,
      sourceRef: `managed_usage:${input.userId}:${input.idempotencyKey}:${input.requestHash}`,
      taskOutcome: settledTaskOutcome,
      taskRef: input.requestHash,
      usage,
    });
  }

  return {
    requestStatus,
    operationResult,
    settlementStatus: settlementStatus ?? null,
    actualCostMicrousd: settledCostMicrousd,
    actualCostCents: settledCostCents,
  };
}
