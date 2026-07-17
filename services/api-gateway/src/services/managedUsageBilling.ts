import { createHash, randomUUID } from 'node:crypto';

import { getModelMetadataById, normalizeModelId, type StreamChunkUsage } from '@agiworkforce/types';
import { isPromoExpired } from '@agiworkforce/routing';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;
const MAX_ESTIMATED_INPUT_TOKENS = 1_000_000;
const BILLING_RPC_ATTEMPTS = 3;

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

/**
 * The current canonical ledger is cent-denominated. Rounding every non-zero
 * managed request up to one cent prevents a stream of sub-cent calls from
 * bypassing metering until the planned micro-dollar ledger lands.
 */
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
  // isPromoExpired does its own by-id catalog lookup (packages/ai/routing/src/
  // pricing.ts), independent of modelPricing()'s alias resolution above --
  // canonicalize first, or an alias-referenced model would never be detected
  // as expired.
  const canonicalModelId = normalizeModelId(model) ?? model;
  // Once promo_expires_at has passed, bill every rate field -- input, output,
  // cached_input, cached_write -- from post_promo_prices together, not just
  // input/output (matches apps/web/lib/services/llm-cost-calculator.ts's
  // getPricing fix: a partial swap would keep undercharging cache reads/
  // writes after the headline rate already reverted). The 1h cache-write
  // rate is never read from the catalog at all -- it's derived below as 2x
  // whatever inputRate resolves to, so it inherits the switch automatically.
  const postPromo =
    metadata.post_promo_prices && isPromoExpired(canonicalModelId, now)
      ? metadata.post_promo_prices
      : undefined;
  const inputRate = postPromo?.input ?? metadata.inputCost;
  const outputRate = postPromo?.output ?? metadata.outputCost;
  const cachedInputRate = postPromo?.cached_input ?? metadata.cached_input;
  const cachedWriteRate = postPromo?.cached_write ?? metadata.cached_write;

  const inputTokens = finiteNonNegative(usage.inputTokens);
  const outputTokens = finiteNonNegative(usage.outputTokens);
  const cacheReadTokens = finiteNonNegative(usage.cacheReadTokens);
  const cacheWriteTokens = finiteNonNegative(usage.cacheWriteTokens);
  const cacheWrite1hTokens = Math.min(
    cacheWriteTokens,
    finiteNonNegative(usage.cacheWrite1hTokens),
  );
  const cacheWrite5mTokens = cacheWriteTokens - cacheWrite1hTokens;

  // Anthropic reports ordinary input disjoint from cache counters. OpenAI and
  // compatible providers report cache reads as a subset of input.
  const ordinaryInputTokens =
    metadata.provider === 'anthropic'
      ? inputTokens
      : Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);
  const cacheReadRate = cachedInputRate ?? inputRate * 0.1;
  const cacheWrite5mRate = cachedWriteRate ?? inputRate * 1.25;
  const cacheWrite1hRate = inputRate * 2;

  return dollarsToLedgerCents(
    (ordinaryInputTokens * inputRate +
      outputTokens * outputRate +
      cacheReadTokens * cacheReadRate +
      cacheWrite5mTokens * cacheWrite5mRate +
      cacheWrite1hTokens * cacheWrite1hRate) /
      1_000_000,
  );
}

export function estimateManagedUsageCostCents(
  body: ManagedUsageRequestBody,
  now: Date = new Date(),
): number {
  const metadata = modelPricing(body.model);
  const estimatedInputTokens = Math.min(
    metadata.contextWindow || MAX_ESTIMATED_INPUT_TOKENS,
    MAX_ESTIMATED_INPUT_TOKENS,
    body.messages.reduce((total, message) => {
      const serializedContent = JSON.stringify(canonicalize(message.content)) ?? '';
      return total + Math.ceil(serializedContent.length / 3.5) + 4;
    }, 0),
  );
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
  leaseToken?: string;
}): Promise<ManagedUsageReservation> {
  const idempotencyKey = parseManagedUsageIdempotencyKey(input.idempotencyKey);
  const requestHash = fingerprintManagedUsageRequest(input.request);
  const estimatedCostCents = estimateManagedUsageCostCents(input.request);
  const leaseToken = input.leaseToken ?? randomUUID();
  const row = await callBillingRpc(input.client, 'reserve_managed_usage_request', {
    p_user_id: input.userId,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    p_provider: input.provider,
    p_model: input.request.model,
    p_estimated_cost_cents: estimatedCostCents,
    p_lease_token: leaseToken,
    p_lease_seconds: 15 * 60,
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
    /** Injectable clock for deterministic post_promo_prices boundary tests. Defaults to the real time. */
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
