import { createHash, randomUUID } from 'node:crypto';

import {
  getModelMetadataById,
  normalizeModelId,
  resolveEffectiveModelPricing,
  SLOT_REGISTRY,
  type StreamChunkUsage,
} from '@agiworkforce/types';
import { isPromoExpired } from '@agiworkforce/routing';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;
const MAX_ESTIMATED_INPUT_TOKENS = 1_000_000;
/** Coarse tokenizer-free approximation, shared by every pre-measurement estimate. */
const ESTIMATED_CHARS_PER_TOKEN = 3.5;
const BILLING_RPC_ATTEMPTS = 3;

/**
 * Rolling spend ceilings in paid-ledger cents, mirrored from the canonical
 * table in `apps/web/lib/server/managed-usage-policy.ts`. That module is
 * `server-only` and lives inside the Next app, so this service cannot import
 * it — the two tables must be changed together. Canonical stores internal
 * usage units at two units per cent; the units are quoted per line so the two
 * tables can be diffed by eye, and
 * `__tests__/services/managedUsageBilling.test.ts` fails the build if the
 * billing catalog admits a tier to managed compute that is missing here.
 *
 * Only tiers that can actually reach a reservation appear. `local-only` and
 * `byok` are absent because `enforcePlanTier` (routes/llm.ts) refuses both via
 * `canUseBillingPlanCapability` before any reservation is attempted, and an
 * absent tier denies below in any case.
 *
 * A zero is a DENIAL, not a bypass: migration 0070 guards each ceiling on
 * `is not null`, so only `uncapped` — which resolves to `null` below — reserves
 * without a ceiling.
 */
type ManagedUsageCapPolicy =
  /** Negotiated contract that declares no configured ceiling. */
  | { readonly uncapped: true }
  /** Hard ceilings for the trailing five hours and trailing seven days. */
  | { readonly fiveHourCents: number; readonly weeklyCents: number };

const MANAGED_USAGE_CAPS: Readonly<Record<string, ManagedUsageCapPolicy>> = Object.freeze({
  // Free's real allowance lives in the micro-USD trial ledger, which this
  // gateway path has no notion of; against the paid cents ledger it is 0, the
  // same value canonical `getPlanSessionUsageBudgetCents` returns for it.
  free: { fiveHourCents: 0, weeklyCents: 0 },
  basic: { fiveHourCents: 10, weeklyCents: 50 }, // 20 / 100 internal units
  pro: { fiveHourCents: 50, weeklyCents: 250 }, // 100 / 500
  max: { fiveHourCents: 250, weeklyCents: 1_250 }, // 500 / 2_500
  max_15x: { fiveHourCents: 750, weeklyCents: 3_750 }, // 1_500 / 7_500
  team: { fiveHourCents: 50, weeklyCents: 250 }, // 100 / 500
  enterprise: { uncapped: true },
});

const FLAGSHIP_OF_WEEKLY_BUDGET_RATIO = 0.3;

/**
 * Models that back a flagship routing slot.
 *
 * Derived from the slot registry rather than `getSlotForModel`, which answers
 * with the FIRST slot a model appears in — `claude-opus-5` resolves to
 * `flagship_coding`, never to `flagship_coding_pro_plus`, so matching on the
 * pro-plus slot names alone tags nothing and the flagship window never binds.
 */
const FLAGSHIP_MODEL_IDS: ReadonlySet<string> = new Set(
  Object.values(SLOT_REGISTRY)
    .filter((definition) => definition.slot.startsWith('flagship_'))
    .map((definition) => definition.modelId),
);

/** A resolved ceiling in paid-ledger cents; `null` is explicitly uncapped. */
type ManagedUsageCapCents = number | null;

function capPolicy(planTier: string): ManagedUsageCapPolicy | null {
  const normalized = planTier.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(MANAGED_USAGE_CAPS, normalized)
    ? (MANAGED_USAGE_CAPS[normalized] ?? null)
    : null;
}

function planWindowCapCents(planTier: string, window: 'fiveHour' | 'weekly'): ManagedUsageCapCents {
  const policy = capPolicy(planTier);
  // Backstop, not the gate: `enforcePlanTier` already rejects every tier that
  // is not a key above, so this only catches a future caller of the exported
  // reservation that reserves without going through plan admission. It denies
  // rather than reserving uncapped.
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
  // Dated pricing resolves FIRST: a model may carry `pricingSchedule` windows
  // (UTC calendar days, both bounds inclusive), and every rate field moves
  // together -- input, output, cache read, and both cache-write tiers. No model
  // schedules a price today; the mechanism exists for an announced PRODUCT
  // price change. The older two-phase promo block is layered on top for models
  // that still use one. This mirrors apps/web/lib/services/llm-cost-calculator
  // .ts's getPricing exactly: the ledger and the product must resolve the same
  // rate for the same date.
  const effective = resolveEffectiveModelPricing(metadata, now);
  const postPromo =
    metadata.post_promo_prices && isPromoExpired(canonicalModelId, now)
      ? metadata.post_promo_prices
      : undefined;
  const inputRate = postPromo?.input ?? effective.inputCost;
  const outputRate = postPromo?.output ?? effective.outputCost;
  const cachedInputRate = postPromo?.cached_input ?? effective.cached_input;
  const cachedWriteRate = postPromo?.cached_write ?? effective.cached_write;
  const cachedWrite1hRate = postPromo?.cached_write_1h ?? effective.cached_write_1h;

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
  // compatible providers report cache reads AND writes as a subset of input.
  const disjoint = metadata.provider === 'anthropic';
  const ordinaryInputTokens = disjoint
    ? inputTokens
    : Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);
  const cacheReadRate = cachedInputRate ?? inputRate * 0.1;
  // Catalog-declared write rates win. The fallback is provider-shaped: with
  // disjoint accounting the written tokens are billed ONLY here, so an
  // undeclared rate falls back to Anthropic's published 1.25x (5m) / 2x (1h)
  // surcharges. With subset accounting the written tokens were just removed
  // from ordinaryInputTokens, so an undeclared rate falls back to the plain
  // input rate -- billed once, no surcharge. That is the free-cache-write case
  // every pre-GPT-5.6 OpenAI model is in; the GPT-5.6 family declares
  // cached_write (1.25x uncached input) and is charged for it.
  const cacheWrite5mRate = cachedWriteRate ?? (disjoint ? inputRate * 1.25 : inputRate);
  const cacheWrite1hRate = cachedWrite1hRate ?? (disjoint ? inputRate * 2 : inputRate);

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

/**
 * Usage for a stream the client abandoned before the provider reported its own
 * counts.
 *
 * Providers report token counts in a final usage event an abandoned stream
 * never reaches, so tokens the provider was already paid to generate would
 * otherwise settle at zero. The prompt is charged in full — the provider bills
 * it the moment generation starts — and the generated side is derived from the
 * output bytes the gateway actually forwarded, using the same approximation as
 * the pre-flight estimate. Falling back to the reservation estimate instead
 * would charge the requested `max_tokens` for a response cut off after a few
 * words.
 *
 * Callers settle a zero-output abandonment as `failed` instead of calling this,
 * so `servedOutputChars` is expected to be at least one character; passing zero
 * yields zero output tokens and bills the prompt alone.
 */
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
  /** Required: every rolling ceiling below is per-tier, so a reservation
   * without a tier cannot be capped. */
  planTier: string;
  leaseToken?: string;
}): Promise<ManagedUsageReservation> {
  const idempotencyKey = parseManagedUsageIdempotencyKey(input.idempotencyKey);
  const requestHash = fingerprintManagedUsageRequest(input.request);
  const estimatedCostCents = estimateManagedUsageCostCents(input.request);
  const leaseToken = input.leaseToken ?? randomUUID();

  /**
   * `_with_limits`, not the bare `reserve_managed_usage_request`.
   *
   * The legacy eight-argument function takes no ceilings and does no rolling
   * accounting, so this path — the one desktop, the CLI and the VS Code
   * extension all use — admitted every request the credit balance could cover,
   * with no five-hour, weekly or flagship window at all. The capped function
   * delegates to the legacy one after checking, so this is the same durable
   * reservation with the ceilings restored.
   *
   * `p_is_flagship` also matters beyond this request: the tag is stamped onto
   * the settlement metadata only inside `_with_limits`, and the flagship
   * weekly window sums on that tag. Reserving through the legacy function left
   * gateway spend invisible to the flagship ceiling everywhere else too.
   *
   * KNOWN GAP, not closed here: the tag is computed from the REQUESTED model.
   * `routes/llm.ts` can rotate to a client-supplied fallback model after a
   * provider failure without re-reserving, so a request that fails over from a
   * standard model to a flagship one is billed at the served model's cost but
   * stays tagged `is_flagship=false`, invisible to the flagship window. The
   * five-hour and weekly ceilings are tag-independent and still bind. Closing
   * it needs the failover path to extend the reservation
   * (`extend_managed_usage_request_provider_step`, which rejects a changed
   * flagship tag as a conflict), which is not this call site.
   */
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
    /** Injectable clock for deterministic post_promo_prices boundary tests. Defaults to the real time. */
    now?: Date;
  },
): Promise<ManagedUsageFinalizationResult> {
  const hasUsage =
    input.usage !== undefined &&
    (input.usage.inputTokens !== undefined || input.usage.outputTokens !== undefined);
  // `failed` is a full release: the reservation is refunded and the request
  // leaves no trace in the rolling windows. A stream the client abandoned after
  // the provider generated output is NOT that case — routes/llm.ts settles it
  // as `completed` with `estimateAbandonedStreamUsage`.
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
