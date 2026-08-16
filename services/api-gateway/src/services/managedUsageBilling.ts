import { createHash, randomUUID } from 'node:crypto';

import {
  getModelMetadataById,
  normalizeModelId,
  resolveEffectiveModelPricingForInputTokens,
  SLOT_REGISTRY,
  type StreamChunkUsage,
} from '@agiworkforce/types';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;
const MAX_ESTIMATED_INPUT_TOKENS = 1_000_000;
const ESTIMATED_CHARS_PER_TOKEN = 3.5;
const BILLING_RPC_ATTEMPTS = 3;

const CACHE_WRITE_FALLBACK_MULTIPLIERS = {
  write5m: 1.25,
  write1h: 2,
} as const;

type ManagedUsageCapPolicy =
  | { readonly uncapped: true }
  /** Hard ceilings for the trailing five hours and trailing seven days. */
  | { readonly fiveHourCents: number; readonly weeklyCents: number };

const MANAGED_USAGE_CAPS: Readonly<Record<string, ManagedUsageCapPolicy>> = Object.freeze({
  free: { fiveHourCents: 0, weeklyCents: 0 },
  basic: { fiveHourCents: 10, weeklyCents: 50 }, // 20 / 100 internal units
  pro: { fiveHourCents: 50, weeklyCents: 250 }, // 100 / 500
  max: { fiveHourCents: 250, weeklyCents: 1_250 }, // 500 / 2_500
  max_15x: { fiveHourCents: 750, weeklyCents: 3_750 }, // 1_500 / 7_500
  team: { fiveHourCents: 50, weeklyCents: 250 }, // 100 / 500
  enterprise: { uncapped: true },
});

const FLAGSHIP_OF_WEEKLY_BUDGET_RATIO = 0.3;

const FLAGSHIP_MODEL_IDS: ReadonlySet<string> = new Set(
  Object.values(SLOT_REGISTRY)
    .filter((definition) => definition.slot.startsWith('flagship_'))
    .map((definition) => definition.modelId),
);

type ManagedUsageCapCents = number | null;

function capPolicy(planTier: string): ManagedUsageCapPolicy | null {
  const normalized = planTier.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(MANAGED_USAGE_CAPS, normalized)
    ? (MANAGED_USAGE_CAPS[normalized] ?? null)
    : null;
}

function planWindowCapCents(planTier: string, window: 'fiveHour' | 'weekly'): ManagedUsageCapCents {
  const policy = capPolicy(planTier);
  if (!policy) return 0;
  if ('uncapped' in policy) return null;
  return window === 'fiveHour' ? policy.fiveHourCents : policy.weeklyCents;
}

function planFlagshipWeeklyCapCents(planTier: string): ManagedUsageCapCents {
  const weekly = planWindowCapCents(planTier, 'weekly');
  return weekly === null ? null : Math.round(weekly * FLAGSHIP_OF_WEEKLY_BUDGET_RATIO);
}

function isFlagshipModel(model: string): boolean {
  const canonical = normalizeModelId(model);
  return canonical !== null && FLAGSHIP_MODEL_IDS.has(canonical);
}

export interface ManagedUsageRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>;
}

export interface ManagedUsageRequestBody {
  model: string;
  messages: Array<{ role: string; content: unknown; [key: string]: unknown }>;
  stream?: boolean;
  max_tokens?: number;
  [key: string]: unknown;
}

export interface ManagedUsageIdentity {
  client: ManagedUsageRpcClient;
  userId: string;
  idempotencyKey: string;
  requestHash: string;
  leaseToken: string;
}

export interface ManagedUsageReservation extends Omit<ManagedUsageIdentity, 'client' | 'userId'> {
  estimatedCostCents: number;
  requestStatus: 'reserved';
}

export interface ManagedUsageFinalizationResult {
  requestStatus: 'completed' | 'released' | 'outcome_unknown';
  operationResult: 'finalized' | 'already_finalized';
  settlementStatus: 'succeeded' | 'pending' | 'terminal' | null;
  actualCostCents: number;
}

export class ManagedUsageBillingError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ManagedUsageBillingError';
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
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

function firstRpcRow(data: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(data) ? data[0] : data;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  return candidate as Record<string, unknown>;
}

async function callBillingRpc(
  client: ManagedUsageRpcClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= BILLING_RPC_ATTEMPTS; attempt += 1) {
    try {
      const result = await client.rpc(functionName, args);
      if (!result.error) {
        const row = firstRpcRow(result.data);
        if (row) return row;
        lastError = new Error('billing RPC returned no row');
      } else {
        lastError = result.error;
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < BILLING_RPC_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** (attempt - 1)));
    }
  }

  void lastError;
  throw new ManagedUsageBillingError(
    'Managed usage billing is temporarily unavailable',
    503,
    'BILLING_UNAVAILABLE',
  );
}

function finiteNonNegative(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function dollarsToLedgerCents(costDollars: number): number {
  if (!Number.isFinite(costDollars) || costDollars <= 0) return 0;
  return Math.max(1, Math.ceil(costDollars * 100));
}

function modelPricing(model: string) {
  const metadata = getModelMetadataById(model);
  if (!metadata) {
    throw new ManagedUsageBillingError('Unsupported managed model', 400, 'UNSUPPORTED_MODEL');
  }
  return metadata;
}

export function parseManagedUsageIdempotencyKey(header: string | string[] | undefined): string {
  if (header === undefined) {
    throw new ManagedUsageBillingError(
      'Idempotency-Key header is required',
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
    );
  }
  if (Array.isArray(header)) {
    throw new ManagedUsageBillingError(
      'Idempotency-Key header is invalid',
      400,
      'INVALID_IDEMPOTENCY_KEY',
    );
  }
  const key = header.trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new ManagedUsageBillingError(
      'Idempotency-Key header is invalid',
      400,
      'INVALID_IDEMPOTENCY_KEY',
    );
  }
  return key;
}

export function fingerprintManagedUsageRequest(body: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(body)))
    .digest('hex');
}

export function calculateManagedUsageCostCents(
  model: string,
  usage: Omit<StreamChunkUsage, 'type'>,
  now: Date = new Date(),
): number {
  const metadata = modelPricing(model);
  const inputTokens = finiteNonNegative(usage.inputTokens);
  const outputTokens = finiteNonNegative(usage.outputTokens);
  const cacheReadTokens = finiteNonNegative(usage.cacheReadTokens);
  const cacheWriteTokens = finiteNonNegative(usage.cacheWriteTokens);
  const cacheWrite1hTokens = Math.min(
    cacheWriteTokens,
    finiteNonNegative(usage.cacheWrite1hTokens),
  );
  const cacheWrite5mTokens = cacheWriteTokens - cacheWrite1hTokens;
  const disjoint = metadata.provider === 'anthropic';
  const tierInputTokens = disjoint ? inputTokens + cacheReadTokens + cacheWriteTokens : inputTokens;
  const effective = resolveEffectiveModelPricingForInputTokens(metadata, now, tierInputTokens);
  const inputRate = effective.inputCost;
  const outputRate = effective.outputCost;
  const cachedInputRate = effective.cached_input;
  const cachedWriteRate = effective.cached_write;
  const cachedWrite1hRate = effective.cached_write_1h;

  const ordinaryInputTokens = disjoint
    ? inputTokens
    : Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);
  const cacheReadRate = cachedInputRate ?? inputRate;
  const cacheWrite5mRate =
    cachedWriteRate ??
    (disjoint ? inputRate * CACHE_WRITE_FALLBACK_MULTIPLIERS.write5m : inputRate);
  const cacheWrite1hRate =
    cachedWrite1hRate ??
    (disjoint ? inputRate * CACHE_WRITE_FALLBACK_MULTIPLIERS.write1h : inputRate);

  return dollarsToLedgerCents(
    (ordinaryInputTokens * inputRate +
      outputTokens * outputRate +
      cacheReadTokens * cacheReadRate +
      cacheWrite5mTokens * cacheWrite5mRate +
      cacheWrite1hTokens * cacheWrite1hRate) /
      1_000_000,
  );
}

function estimateRequestInputTokens(body: ManagedUsageRequestBody): number {
  const metadata = modelPricing(body.model);
  return Math.min(
    metadata.contextWindow || MAX_ESTIMATED_INPUT_TOKENS,
    MAX_ESTIMATED_INPUT_TOKENS,
    body.messages.reduce((total, message) => {
      const serializedContent = JSON.stringify(canonicalize(message.content)) ?? '';
      return total + Math.ceil(serializedContent.length / ESTIMATED_CHARS_PER_TOKEN) + 4;
    }, 0),
  );
}

export function estimateAbandonedStreamUsage(
  body: ManagedUsageRequestBody,
  servedOutputChars: number,
): Omit<StreamChunkUsage, 'type'> {
  return {
    inputTokens: estimateRequestInputTokens(body),
    outputTokens: Math.ceil(finiteNonNegative(servedOutputChars) / ESTIMATED_CHARS_PER_TOKEN),
  };
}

export function estimateManagedUsageCostCents(
  body: ManagedUsageRequestBody,
  now: Date = new Date(),
): number {
  const metadata = modelPricing(body.model);
  const estimatedInputTokens = estimateRequestInputTokens(body);
  const requestedOutputTokens = finiteNonNegative(body.max_tokens, DEFAULT_MAX_OUTPUT_TOKENS);
  const outputLimit = metadata.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS;
  const estimatedOutputTokens = Math.max(1, Math.min(requestedOutputTokens, outputLimit));

  return calculateManagedUsageCostCents(
    body.model,
    {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
    },
    now,
  );
}

function reservationDecisionError(decision: string): ManagedUsageBillingError {
  switch (decision) {
    case 'in_progress':
      return new ManagedUsageBillingError(
        'An identical managed request is already in progress',
        409,
        'IDEMPOTENCY_IN_PROGRESS',
      );
    case 'completed':
    case 'released':
    case 'outcome_unknown':
      return new ManagedUsageBillingError(
        'This idempotency key has already reached a terminal state',
        409,
        'IDEMPOTENCY_REPLAY',
      );
    case 'conflict':
      return new ManagedUsageBillingError(
        'This idempotency key belongs to a different request',
        409,
        'IDEMPOTENCY_CONFLICT',
      );
    case 'declined':
      return new ManagedUsageBillingError(
        'Insufficient credits for this managed request',
        402,
        'INSUFFICIENT_CREDITS',
      );
    case 'session_limit':
      return new ManagedUsageBillingError(
        'Your rolling 5-hour usage limit is reached. Wait for earlier usage to leave the window or upgrade for a higher limit.',
        429,
        'ROLLING_FIVE_HOUR_LIMIT_REACHED',
      );
    case 'weekly_limit':
      return new ManagedUsageBillingError(
        'Your rolling weekly usage limit is reached. Wait for earlier usage to leave the window or upgrade for a higher limit.',
        429,
        'ROLLING_WEEKLY_LIMIT_REACHED',
      );
    case 'flagship_weekly_limit':
      return new ManagedUsageBillingError(
        'Your rolling flagship weekly usage limit is reached. Choose a standard model, wait for earlier usage to leave the window, or upgrade for a higher limit.',
        429,
        'FLAGSHIP_WEEKLY_LIMIT_REACHED',
      );
    default:
      return new ManagedUsageBillingError(
        'Managed usage billing is temporarily unavailable',
        503,
        'BILLING_UNAVAILABLE',
      );
  }
}

export async function reserveManagedUsage(input: {
  client: ManagedUsageRpcClient;
  userId: string;
  idempotencyKey: string;
  provider: string;
  request: ManagedUsageRequestBody;
  planTier: string;
  leaseToken?: string;
}): Promise<ManagedUsageReservation> {
  const idempotencyKey = parseManagedUsageIdempotencyKey(input.idempotencyKey);
  const requestHash = fingerprintManagedUsageRequest(input.request);
  const estimatedCostCents = estimateManagedUsageCostCents(input.request);
  const leaseToken = input.leaseToken ?? randomUUID();

  const row = await callBillingRpc(input.client, 'reserve_managed_usage_request_with_limits', {
    p_user_id: input.userId,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    p_provider: input.provider,
    p_model: input.request.model,
    p_estimated_cost_cents: estimatedCostCents,
    p_lease_token: leaseToken,
    p_lease_seconds: 15 * 60,
    p_session_cap_cents: planWindowCapCents(input.planTier, 'fiveHour'),
    p_weekly_cap_cents: planWindowCapCents(input.planTier, 'weekly'),
    p_flagship_weekly_cap_cents: planFlagshipWeeklyCapCents(input.planTier),
    p_is_flagship: isFlagshipModel(input.request.model),
  });

  const decision = row['reservation_decision'];
  if (decision !== 'acquired') {
    throw reservationDecisionError(typeof decision === 'string' ? decision : 'unavailable');
  }
  if (
    row['request_status'] !== 'reserved' ||
    typeof row['lease_token'] !== 'string' ||
    typeof row['estimated_cost_cents'] !== 'number'
  ) {
    throw new ManagedUsageBillingError(
      'Managed usage billing returned an invalid reservation',
      503,
      'BILLING_PROTOCOL_ERROR',
    );
  }

  return {
    idempotencyKey,
    requestHash,
    leaseToken: row['lease_token'],
    estimatedCostCents: row['estimated_cost_cents'],
    requestStatus: 'reserved',
  };
}

async function lifecycleOperation(
  identity: ManagedUsageIdentity,
  functionName: string,
): Promise<void> {
  const row = await callBillingRpc(identity.client, functionName, {
    p_user_id: identity.userId,
    p_idempotency_key: identity.idempotencyKey,
    p_request_hash: identity.requestHash,
    p_lease_token: identity.leaseToken,
  });
  if (row['operation_result'] !== 'updated' && row['operation_result'] !== 'already_updated') {
    throw new ManagedUsageBillingError(
      'Managed usage lifecycle transition was rejected',
      409,
      'BILLING_STATE_CONFLICT',
    );
  }
}

export async function markManagedUsageProviderStarted(
  identity: ManagedUsageIdentity,
): Promise<void> {
  await lifecycleOperation(identity, 'mark_managed_usage_provider_started');
}

export async function markManagedUsageClientDelivered(
  identity: ManagedUsageIdentity,
): Promise<void> {
  await lifecycleOperation(identity, 'mark_managed_usage_client_delivered');
}

export async function finalizeManagedUsage(
  input: ManagedUsageIdentity & {
    outcome: 'completed' | 'failed';
    model: string;
    usage?: Omit<StreamChunkUsage, 'type'>;
    estimatedCostCents?: number;
    now?: Date;
  },
): Promise<ManagedUsageFinalizationResult> {
  const hasUsage =
    input.usage !== undefined &&
    (input.usage.inputTokens !== undefined || input.usage.outputTokens !== undefined);
  const actualCostCents =
    input.outcome === 'failed'
      ? 0
      : hasUsage
        ? calculateManagedUsageCostCents(input.model, input.usage ?? {}, input.now ?? new Date())
        : Math.max(0, input.estimatedCostCents ?? 0);
  const usage = input.usage ?? {};
  const row = await callBillingRpc(input.client, 'finalize_managed_usage_request', {
    p_user_id: input.userId,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_lease_token: input.leaseToken,
    p_outcome: input.outcome,
    p_actual_cost_cents: actualCostCents,
    p_usage: usage,
  });

  const status = row['request_status'];
  const operationResult = row['operation_result'];
  const settlementStatus = row['settlement_status'];
  if (
    (status !== 'completed' && status !== 'released' && status !== 'outcome_unknown') ||
    (operationResult !== 'finalized' && operationResult !== 'already_finalized') ||
    (settlementStatus !== null &&
      settlementStatus !== undefined &&
      settlementStatus !== 'succeeded' &&
      settlementStatus !== 'pending' &&
      settlementStatus !== 'terminal')
  ) {
    throw new ManagedUsageBillingError(
      'Managed usage billing returned an invalid finalization',
      503,
      'BILLING_PROTOCOL_ERROR',
    );
  }

  return {
    requestStatus: status,
    operationResult,
    settlementStatus: settlementStatus ?? null,
    actualCostCents:
      typeof row['actual_cost_cents'] === 'number' ? row['actual_cost_cents'] : actualCostCents,
  };
}
