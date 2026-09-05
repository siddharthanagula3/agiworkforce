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
  getPlanFlagshipWeeklyUsageCapCents,
  getPlanSessionUsageCapCents,
  getPlanWeeklyUsageCapCents,
} from '@/lib/server/managed-usage-policy';
import { logger } from '@/lib/logger';
import {
  getOrganizationMonthToDateSpendCents,
  recordSettledProviderCost,
} from '@/lib/services/cogs-ledger-service';
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
  estimatedCostCents: number;
  quotaFeature?: string;
  provider?: string;
  model?: string;
  routeId?: string | null;
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
  actualCostCents: number;
}

export interface ManagedUsageProviderStepReservation {
  operationResult: 'covered' | 'extended' | 'already_extended';
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

async function resolveOverageHeadroomCents(db: DatabaseAdapter, userId: string): Promise<number> {
  try {
    const rows = await db.query<{ headroom_cents: number | string | null }>(
      `select greatest(
                least(
                  credits.credits_allocated_cents - credits.credits_used_cents,
                  credits.top_up_allocated_cents
                ), 0)::integer as headroom_cents
         from public.token_credits credits
         join public.subscriptions subscription on subscription.user_id = credits.user_id
        where credits.user_id = $1
          and credits.period_end > now()
          and subscription.overage_enabled
        order by credits.period_end desc
        limit 1`,
      [userId],
    );
    const value = Number(rows[0]?.headroom_cents ?? 0);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch (error) {
    logger.warn({ error, userId }, 'Overage headroom lookup failed; treating as no headroom');
    return 0;
  }
}

export async function reserveManagedUsageRequest(input: {
  db: DatabaseAdapter;
  userId: string;
  organizationId?: string | null;
  idempotencyKey: string;
  requestHash: string;
  provider: string;
  model: string;
  estimatedCostCents: number;
  leaseToken?: string;
  leaseSeconds?: number;
  planTier: string;
  isFlagship: boolean;
  quotaFeature?: string;
}): Promise<ManagedUsageRequestReservation> {
  if (input.organizationId) {
    await assertOrganizationSpendCap(input.db, input.organizationId, input.userId);
  }

  const idempotencyKey = parseManagedUsageIdempotencyKey(input.idempotencyKey);
  const leaseToken = input.leaseToken ?? randomUUID();
  const sessionCapCents = getPlanSessionUsageCapCents(input.planTier);
  const weeklyCapCents = getPlanWeeklyUsageCapCents(input.planTier);
  const flagshipWeeklyCapCents = getPlanFlagshipWeeklyUsageCapCents(input.planTier);
  const topUpHeadroomCents = await resolveOverageHeadroomCents(input.db, input.userId);
  const row = await queryOne(
    input.db,
    `select * from public.reserve_managed_usage_request_with_limits(
      $1::text, $2::text, $3::text, $4::text, $5::text, $6::integer,
      $7::text, $8::integer, $9::integer, $10::integer, $11::integer, $12::boolean,
      $13::integer
    )`,
    [
      input.userId,
      idempotencyKey,
      input.requestHash,
      input.provider,
      input.model,
      input.estimatedCostCents,
      leaseToken,
      input.leaseSeconds ?? 900,
      sessionCapCents,
      weeklyCapCents,
      flagshipWeeklyCapCents,
      input.isFlagship,
      topUpHeadroomCents,
    ],
  );

  const decision =
    typeof row['reservation_decision'] === 'string' ? row['reservation_decision'] : '';
  if (decision !== 'acquired') throw reservationError(decision);
  if (
    row['request_status'] !== 'reserved' ||
    typeof row['lease_token'] !== 'string' ||
    typeof row['estimated_cost_cents'] !== 'number'
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
    estimatedCostCents: row['estimated_cost_cents'],
    provider: input.provider,
    model: input.model,
    routeId: buildRouteId(input.provider, input.model),
    ...(input.quotaFeature ? { quotaFeature: input.quotaFeature } : {}),
  };
}

export async function reserveManagedUsageProviderStep(input: {
  reservation: ManagedUsageRequestReservation;
  operationKey: string;
  estimatedCostCents: number;
  planTier: string;
  isFlagship: boolean;
}): Promise<ManagedUsageProviderStepReservation> {
  if (
    !PROVIDER_OPERATION_KEY_PATTERN.test(input.operationKey) ||
    !Number.isInteger(input.estimatedCostCents) ||
    input.estimatedCostCents < 0
  ) {
    throw new ManagedUsageRequestError(
      'Managed usage provider-step reservation is invalid.',
      503,
      'billing_protocol_error',
    );
  }

  const sessionCapCents = getPlanSessionUsageCapCents(input.planTier);
  const weeklyCapCents = getPlanWeeklyUsageCapCents(input.planTier);
  const flagshipWeeklyCapCents = getPlanFlagshipWeeklyUsageCapCents(input.planTier);
  const reservation = input.reservation;
  const row = await queryOne(
    reservation.db,
    `select * from public.extend_managed_usage_request_provider_step(
      $1::text, $2::text, $3::text, $4::text, $5::text, $6::integer,
      $7::integer, $8::integer, $9::integer, $10::boolean
    )`,
    [
      reservation.userId,
      reservation.idempotencyKey,
      reservation.requestHash,
      reservation.leaseToken,
      input.operationKey,
      input.estimatedCostCents,
      sessionCapCents,
      weeklyCapCents,
      flagshipWeeklyCapCents,
      input.isFlagship,
    ],
  );

  const decision = typeof row['extension_decision'] === 'string' ? row['extension_decision'] : '';
  if (decision !== 'covered' && decision !== 'extended' && decision !== 'already_extended') {
    throw reservationError(decision);
  }
  if (
    row['request_status'] !== 'provider_started' ||
    typeof row['estimated_cost_cents'] !== 'number'
  ) {
    throw new ManagedUsageRequestError(
      'Managed usage billing returned an invalid provider-step reservation.',
      503,
      'billing_protocol_error',
    );
  }

  reservation.estimatedCostCents = row['estimated_cost_cents'];
  return {
    operationResult: decision,
    estimatedCostCents: row['estimated_cost_cents'],
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

export async function finalizeManagedUsageRequest(
  input: ManagedUsageRequestReservation & {
    outcome: 'completed' | 'failed';
    actualCostCents: number;
    usage?: Record<string, unknown>;
  },
): Promise<ManagedUsageFinalization> {
  const actualCostCents = input.outcome === 'failed' ? 0 : Math.max(0, input.actualCostCents);
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
    `select * from public.finalize_managed_usage_request(
      $1::text, $2::text, $3::text, $4::text, $5::text, $6::integer, $7::jsonb
    )`,
    [
      input.userId,
      input.idempotencyKey,
      input.requestHash,
      input.leaseToken,
      input.outcome,
      actualCostCents,
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

  const settledCostCents =
    typeof row['actual_cost_cents'] === 'number' ? row['actual_cost_cents'] : actualCostCents;

  // The request fingerprint is the task identity: a regenerated turn sends the
  // same payload and hashes the same, so the ledger can separate what the first
  // attempt cost from what repeating it cost.
  const settledTaskOutcome =
    requestStatus === 'completed'
      ? 'delivered'
      : requestStatus === 'outcome_unknown'
        ? 'undelivered'
        : null;

  if (settledTaskOutcome !== null && operationResult === 'finalized') {
    await recordSettledProviderCost({
      userId: input.userId,
      provider: servedRoute?.provider ?? input.provider ?? 'unknown',
      model: servedRoute?.model ?? input.model ?? null,
      routeId: servedRoute?.routeId ?? input.routeId ?? buildRouteId(input.provider, input.model),
      actualCostCents: settledCostCents,
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
    actualCostCents: settledCostCents,
  };
}
