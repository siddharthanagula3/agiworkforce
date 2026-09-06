import 'server-only';

import {
  createRouteHealthStore,
  credentialClassForProvider,
  emptyRuntimeState,
  providerRouteHealthConfig,
  resolveCredentialCooldownConfig,
  resolveModelLockoutConfig,
  resolveRouteHealthConfig,
  type CredentialClass,
  type QuotaPool,
  type RouteCacheClass,
  type RouteHealth,
  type RouteHealthSnapshot,
  type RouteHealthStore,
  type RouteOutcome,
  type RouteUnavailabilityReason,
  type RoutingRuntimeState,
  type RoutingTaskType,
} from '@agiworkforce/routing';
import type { ErrorCategory } from '@agiworkforce/provider-runtime';

import { logger } from '@/lib/logger';
import { getKeyValueStore } from '@/lib/server/key-value';
import { readRedisWithinBudget, wasRedisReadAbandoned } from '@/lib/server/bounded-redis-read';
import {
  loadFreePools,
  toFreeEligibility,
  type FreePoolEntry,
  type FreePoolsDocument,
} from '@/lib/server/free-pools';

const POOL_KEY_PREFIX = 'agi-fpool';
const ROUTE_HEALTH_KEY_PREFIX = 'agi-fhealth:route';
const PROVIDER_HEALTH_KEY_PREFIX = 'agi-fhealth:provider';
const KEY_SEPARATOR = ':';
const ROUTE_ID_SEPARATOR = '/';

const HEALTH_FIELD_REASON = 'reason';
const HEALTH_FIELD_AVAILABLE_AT = 'availableAtMs';
const HEALTH_FIELD_SUCCESS_RATE = 'successRate';
const HEALTH_FIELD_LATENCY = 'latencyP50Ms';
const HEALTH_FIELD_CONSECUTIVE_FAILURES = 'consecutiveFailures';

const SNAPSHOT_CACHE_TTL_MS = 5_000;
const HEALTH_KEY_TTL_SECONDS = 24 * 60 * 60;
const HEALTH_EWMA_ALPHA = 0.3;
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_BASE_BACKOFF_MS = 30_000;
const CIRCUIT_MAX_BACKOFF_MS = 10 * 60_000;
const MS_PER_SECOND = 1_000;

const HEADROOM_MIN = 0;
const HEADROOM_MAX = 1;
const SUCCESS_RATE_ON_SUCCESS = 1;
const SUCCESS_RATE_ON_FAILURE = 0;

const REQUESTS_PER_SETTLED_TURN = 1;

type QuotaWindow = FreePoolEntry['window'];
type QuotaUnit = FreePoolEntry['unit'];

const ALLOCATION_WINDOW_START_MS = 0;
const WINDOW_DURATION_MS: Readonly<Record<Exclude<QuotaWindow, 'month' | 'allocation'>, number>> = {
  minute: 60_000,
  hour: 60 * 60_000,
  day: 24 * 60 * 60_000,
};

/**
 * Units this service can actually meter from a settled turn.
 *
 * A pool denominated in anything else is omitted from the snapshot rather than
 * assumed empty: routing then reports `quota_pool_unknown` and strands, which is
 * the correct answer for capacity we cannot count. Guessing would spend it.
 */
const METERABLE_UNITS: ReadonlySet<QuotaUnit> = new Set<QuotaUnit>(['requests', 'tokens']);

export interface FreeLaneSettledUsage {
  inputTokens: number;
  outputTokens: number;
}

export type FreeLaneFailureSignal =
  | { kind: 'health'; reason: RouteUnavailabilityReason; scope: 'route' | 'provider' }
  | { kind: 'terms' }
  | { kind: 'ignored' };

const TIER_RESTRICTED_CODE = 'model_tier_restricted';

/**
 * `ErrorCategory` → `RouteUnavailabilityReason`, the mapping `runtime-state.ts`
 * says its taxonomy was shaped to accept.
 *
 * A category absent from this table is NOT a route-availability signal, an
 * abort, a context overflow, a safety stop and a malformed request all say
 * something about the request, not about whether the route can serve. Blaming
 * the route for them would park healthy free capacity on the user's own input.
 */
const HEALTH_REASON_BY_CATEGORY: Readonly<
  Partial<Record<ErrorCategory, RouteUnavailabilityReason>>
> = {
  rate_limit: 'rate_limited',
  quota_exhausted: 'quota_exhausted',
  billing_exhausted: 'billing_exhausted',
  auth: 'credential_invalid',
  server_overload: 'provider_unhealthy',
  server_error: 'provider_unhealthy',
  connection: 'provider_unhealthy',
  api_timeout: 'provider_unhealthy',
  capacity_off_switch: 'provider_unhealthy',
  invalid_model: 'model_unavailable',
};

/**
 * Reasons that condemn the credential rather than the route.
 *
 * A rejected or unfunded managed key is an account-level fact: every route on
 * that provider answers to the same key, so recording it per-route would make
 * the request walk the whole provider one 401 at a time.
 */
const PROVIDER_SCOPED_REASONS: ReadonlySet<RouteUnavailabilityReason> =
  new Set<RouteUnavailabilityReason>(['credential_invalid', 'billing_exhausted']);

/**
 * A tier rejection is a terms fact, never a health fact.
 *
 * `model_tier_restricted` means the account is not entitled to the model, the
 * free-pool record claims capacity the credential does not have. Parking the
 * route as "unhealthy" would let it silently return when the circuit expires;
 * the honest repair is a terms re-review, so this is surfaced and the health
 * store is left alone.
 */
export function classifyFreeLaneFailure(
  category: string,
  code: string | undefined,
): FreeLaneFailureSignal {
  if (code === TIER_RESTRICTED_CODE) return { kind: 'terms' };
  const reason = (
    HEALTH_REASON_BY_CATEGORY as Readonly<Record<string, RouteUnavailabilityReason | undefined>>
  )[category];
  if (!reason) return { kind: 'ignored' };
  return {
    kind: 'health',
    reason,
    scope: PROVIDER_SCOPED_REASONS.has(reason) ? 'provider' : 'route',
  };
}

export function providerOfRouteId(routeId: string): string {
  const separatorIndex = routeId.indexOf(ROUTE_ID_SEPARATOR);
  return separatorIndex === -1 ? routeId : routeId.slice(0, separatorIndex);
}

function windowStartMs(window: QuotaWindow, nowMs: number): number {
  const at = new Date(nowMs);
  switch (window) {
    case 'allocation':
      return ALLOCATION_WINDOW_START_MS;
    case 'month':
      return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1);
    case 'day':
      return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
    case 'hour':
      return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), at.getUTCHours());
    case 'minute':
      return Date.UTC(
        at.getUTCFullYear(),
        at.getUTCMonth(),
        at.getUTCDate(),
        at.getUTCHours(),
        at.getUTCMinutes(),
      );
  }
}

function windowEndMs(window: QuotaWindow, startMs: number, expiresAtMs?: number): number {
  if (window === 'allocation') return expiresAtMs ?? Number.MAX_SAFE_INTEGER;
  if (window === 'month') {
    const start = new Date(startMs);
    return Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
  }
  return startMs + WINDOW_DURATION_MS[window];
}

function poolKey(poolId: string, windowStart: number): string {
  return [POOL_KEY_PREFIX, poolId, String(windowStart)].join(KEY_SEPARATOR);
}

function routeHealthKey(routeId: string): string {
  return [ROUTE_HEALTH_KEY_PREFIX, routeId].join(KEY_SEPARATOR);
}

function providerHealthKey(providerId: string): string {
  return [PROVIDER_HEALTH_KEY_PREFIX, providerId].join(KEY_SEPARATOR);
}

interface PoolAccount {
  id: string;
  routeIds: string[];
  window: QuotaWindow;
  unit: QuotaUnit;
  limit: number;
  hardStopsBeforePaid: boolean;
  expiresAtMs?: number;
}

/**
 * Collapse per-route config rows into the pools they actually draw on.
 *
 * `hardStopsBeforePaid` is ANDed across the rows sharing a pool: one route
 * asserting the pool bills past its allowance condemns the whole pool, because
 * they are spending the same allowance.
 */
function accountsByPool(entries: readonly FreePoolEntry[]): Map<string, PoolAccount> {
  const accounts = new Map<string, PoolAccount>();
  for (const entry of entries) {
    const existing = accounts.get(entry.poolId);
    if (!existing) {
      accounts.set(entry.poolId, {
        id: entry.poolId,
        routeIds: [entry.routeId],
        window: entry.window,
        unit: entry.unit,
        limit: entry.limit,
        hardStopsBeforePaid: entry.hardStopsBeforePaid,
        ...(entry.expiresAtMs === null ? {} : { expiresAtMs: entry.expiresAtMs }),
      });
      continue;
    }
    existing.routeIds.push(entry.routeId);
    existing.hardStopsBeforePaid = existing.hardStopsBeforePaid && entry.hardStopsBeforePaid;
  }
  return accounts;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toReason(value: unknown): RouteUnavailabilityReason | undefined {
  return typeof value === 'string' && value.length > 0
    ? (value as RouteUnavailabilityReason)
    : undefined;
}

function parseHealth(raw: unknown, nowMs: number): RouteHealth | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const reason = toReason(record[HEALTH_FIELD_REASON]);
  const availableAtMs = toNumber(record[HEALTH_FIELD_AVAILABLE_AT]);
  const successRate = toNumber(record[HEALTH_FIELD_SUCCESS_RATE]);
  const latencyP50Ms = toNumber(record[HEALTH_FIELD_LATENCY]);
  const consecutiveFailures = toNumber(record[HEALTH_FIELD_CONSECUTIVE_FAILURES]);
  const parked = reason !== undefined && (availableAtMs === undefined || availableAtMs > nowMs);

  return {
    available: !parked,
    ...(parked ? { reason } : {}),
    ...(parked && availableAtMs !== undefined ? { availableAtMs } : {}),
    ...(successRate !== undefined ? { successRate } : {}),
    ...(latencyP50Ms !== undefined ? { latencyP50Ms } : {}),
    ...(consecutiveFailures !== undefined ? { consecutiveFailures } : {}),
  };
}

function clampHeadroom(value: number): number {
  return Math.min(HEADROOM_MAX, Math.max(HEADROOM_MIN, value));
}

/**
 * The snapshot a caller gets when the state store cannot answer.
 *
 * Eligibility survives: it comes from the reviewed config file and needs no
 * I/O: but every pool is dropped, so `resolveFreeAutoRoute` reports
 * `quota_pool_unknown` and strands. That asymmetry is the point: we still know
 * the terms are clean, and we no longer know whether the allowance is spent.
 * Spending on that uncertainty is the one outcome this lane may not produce.
 */
function unknownCapacityState(
  nowMs: number,
  freeEligibility: RoutingRuntimeState['freeEligibility'],
): RoutingRuntimeState {
  return { ...emptyRuntimeState(nowMs), freeEligibility };
}

let cachedSnapshot: { state: RoutingRuntimeState; expiresAtMs: number } | null = null;

export function resetFreeLaneRuntimeStateCache(): void {
  cachedSnapshot = null;
}

/**
 * Every record a reviewer actually signed, expired ones included.
 *
 * Adjudicating expiry and terms here would collapse three distinct answers into
 * "not verified". `resolveFreeAutoRoute` gates on both and refuses either way,
 * so handing it the signed record costs no safety and buys the difference
 * between "nobody reviewed this", "the review lapsed" and "the terms forbid it"
 *, which are three different pieces of work for whoever reads the rejection.
 *
 * A row with no reviewer or no timestamp is still dropped: there is no record to
 * hand over, and absence is what `not_verified_free` correctly describes.
 */
function declaredFreeEligibility(
  document: FreePoolsDocument,
): RoutingRuntimeState['freeEligibility'] {
  const records: Record<string, ReturnType<typeof toFreeEligibility>> = {};
  for (const entry of document.entries) {
    const record = toFreeEligibility(entry);
    if (record) records[entry.routeId] = record;
  }
  return records as RoutingRuntimeState['freeEligibility'];
}

async function readRuntimeState(
  nowMs: number,
  document: FreePoolsDocument,
): Promise<RoutingRuntimeState> {
  const freeEligibility = declaredFreeEligibility(document);
  const routeIds = Object.keys(freeEligibility);
  if (routeIds.length === 0) return unknownCapacityState(nowMs, freeEligibility);

  const store = getKeyValueStore();
  if (!store) {
    logger.error(
      { routeCount: routeIds.length },
      '[free-lane] no shared store; every free pool is unknown and the lane will strand',
    );
    return unknownCapacityState(nowMs, freeEligibility);
  }

  // Pools are assembled from EVERY row that draws on them, not just the eligible
  // ones. A row excluded for billing past its allowance is evidence about the
  // shared allowance itself, and dropping it here would let a sibling route on
  // the same credential spend exactly the capacity that row condemned.
  const eligiblePoolIds = new Set(
    document.entries.filter((entry) => freeEligibility[entry.routeId]).map((entry) => entry.poolId),
  );
  const pooledEntries = document.entries.filter((entry) => eligiblePoolIds.has(entry.poolId));
  const accounts = [...accountsByPool(pooledEntries).values()].filter((account) => {
    if (METERABLE_UNITS.has(account.unit)) return true;
    logger.error(
      { poolId: account.id, unit: account.unit },
      '[free-lane] pool is denominated in a unit this service cannot meter; treating it as unknown',
    );
    return false;
  });
  const providerIds = [...new Set(routeIds.map(providerOfRouteId))];

  try {
    const batch = store.batch();
    const windowStarts = accounts.map((account) => windowStartMs(account.window, nowMs));
    accounts.forEach((account, index) => {
      batch.get(poolKey(account.id, windowStarts[index]!));
    });
    for (const routeId of routeIds) batch.hashGetAll(routeHealthKey(routeId));
    for (const providerId of providerIds) batch.hashGetAll(providerHealthKey(providerId));

    const read = await readRedisWithinBudget(batch.exec());
    if (wasRedisReadAbandoned(read)) {
      logger.error(
        { routeCount: routeIds.length },
        '[free-lane] runtime state read outlived its budget; every free pool is unknown and the lane will strand',
      );
      return unknownCapacityState(nowMs, freeEligibility);
    }
    const results = read as unknown[];

    const quotaPools: Record<string, QuotaPool> = {};
    accounts.forEach((account, index) => {
      const used = toNumber(results[index]) ?? 0;
      const startMs = windowStarts[index]!;
      quotaPools[account.id] = {
        id: account.id,
        routeIds: account.routeIds,
        headroomFraction: clampHeadroom((account.limit - used) / account.limit),
        resetsAtMs: windowEndMs(account.window, startMs, account.expiresAtMs),
        hardStopsBeforePaid: account.hardStopsBeforePaid,
      };
    });

    const routeHealth: Record<string, RouteHealth> = {};
    routeIds.forEach((routeId, index) => {
      const health = parseHealth(results[accounts.length + index], nowMs);
      if (health) routeHealth[routeId] = health;
    });

    const providerHealth: Record<string, RouteHealth> = {};
    providerIds.forEach((providerId, index) => {
      const health = parseHealth(results[accounts.length + routeIds.length + index], nowMs);
      if (health) providerHealth[providerId] = health;
    });

    return { routeHealth, providerHealth, quotaPools, freeEligibility, capturedAtMs: nowMs };
  } catch (error) {
    logger.error(
      { error, routeCount: routeIds.length },
      '[free-lane] runtime state read failed; every free pool is unknown and the lane will strand',
    );
    return unknownCapacityState(nowMs, freeEligibility);
  }
}

export async function getFreeLaneRuntimeState(
  nowMs: number,
  document: FreePoolsDocument = loadFreePools(),
): Promise<RoutingRuntimeState> {
  if (cachedSnapshot && cachedSnapshot.expiresAtMs > nowMs) return cachedSnapshot.state;
  const state = await readRuntimeState(nowMs, document);
  cachedSnapshot = { state, expiresAtMs: nowMs + SNAPSHOT_CACHE_TTL_MS };
  return state;
}

function settledUnits(unit: QuotaUnit, usage: FreeLaneSettledUsage): number | null {
  if (unit === 'requests') return REQUESTS_PER_SETTLED_TURN;
  if (unit === 'tokens') return Math.max(0, usage.inputTokens) + Math.max(0, usage.outputTokens);
  return null;
}

function entryForRoute(routeId: string, document: FreePoolsDocument): FreePoolEntry | undefined {
  return document.entries.find((candidate) => candidate.routeId === routeId);
}

/**
 * Charge a settled turn against its pool.
 *
 * Deliberately after settlement rather than on dispatch: a request that never
 * reached the provider consumed no allowance, and counting it would shrink the
 * pool on our own failures.
 */
export async function recordFreeLaneUsage(input: {
  routeId: string;
  nowMs: number;
  usage: FreeLaneSettledUsage;
  document?: FreePoolsDocument;
}): Promise<void> {
  const document = input.document ?? loadFreePools();
  const entry = entryForRoute(input.routeId, document);
  if (!entry) return;
  const units = settledUnits(entry.unit, input.usage);
  if (units === null || units <= 0) return;

  const store = getKeyValueStore();
  if (!store) return;

  const startMs = windowStartMs(entry.window, input.nowMs);
  const key = poolKey(entry.poolId, startMs);
  try {
    await store
      .batch()
      .increment(key, units)
      .expireAt(key, windowEndMs(entry.window, startMs, entry.expiresAtMs ?? undefined))
      .exec();
  } catch (error) {
    logger.error(
      { error, routeId: input.routeId, poolId: entry.poolId },
      '[free-lane] pool usage was not recorded; headroom now reads high',
    );
  }
}

function circuitBackoffMs(consecutiveFailures: number): number {
  const exponent = Math.max(0, consecutiveFailures - CIRCUIT_FAILURE_THRESHOLD);
  return Math.min(CIRCUIT_MAX_BACKOFF_MS, CIRCUIT_BASE_BACKOFF_MS * 2 ** exponent);
}

function nextEwma(previous: number | undefined, sample: number): number {
  if (previous === undefined) return sample;
  return previous * (1 - HEALTH_EWMA_ALPHA) + sample * HEALTH_EWMA_ALPHA;
}

async function updateHealth(
  key: string,
  nowMs: number,
  next: (current: RouteHealth | undefined) => Record<string, string | number>,
): Promise<void> {
  const store = getKeyValueStore();
  if (!store) return;
  try {
    const current = parseHealth(await store.hashGetAll(key), nowMs);
    await store.batch().hashSet(key, next(current)).expire(key, HEALTH_KEY_TTL_SECONDS).exec();
  } catch (error) {
    logger.error({ error, key }, '[free-lane] route health was not recorded');
  }
}

export async function recordFreeLaneRouteSuccess(input: {
  routeId: string;
  nowMs: number;
  latencyMs?: number;
}): Promise<void> {
  await updateHealth(routeHealthKey(input.routeId), input.nowMs, (current) => ({
    [HEALTH_FIELD_SUCCESS_RATE]: nextEwma(current?.successRate, SUCCESS_RATE_ON_SUCCESS),
    ...(input.latencyMs !== undefined
      ? { [HEALTH_FIELD_LATENCY]: nextEwma(current?.latencyP50Ms, input.latencyMs) }
      : {}),
    [HEALTH_FIELD_CONSECUTIVE_FAILURES]: 0,
    [HEALTH_FIELD_REASON]: '',
    [HEALTH_FIELD_AVAILABLE_AT]: '',
  }));
}

/**
 * Take a route (or its provider's credential) out of service.
 *
 * `retryAfterSeconds` from a 429 is honoured verbatim when the provider gave
 * one, it knows when its own window reopens better than a backoff curve does.
 */
export async function recordFreeLaneRouteFailure(input: {
  routeId: string;
  provider: string;
  nowMs: number;
  category: string;
  code?: string;
  retryAfterSeconds?: number;
  document?: FreePoolsDocument;
}): Promise<void> {
  const signal = classifyFreeLaneFailure(input.category, input.code);
  if (signal.kind === 'terms') {
    logger.error(
      { routeId: input.routeId, provider: input.provider, code: input.code },
      '[free-lane] route refused on tier grounds; the pool record claims entitlement the credential lacks',
    );
    return;
  }
  if (signal.kind === 'ignored') return;

  if (signal.reason === 'quota_exhausted')
    await markPoolSpent(input.routeId, input.nowMs, input.document);

  const key =
    signal.scope === 'provider' ? providerHealthKey(input.provider) : routeHealthKey(input.routeId);

  await updateHealth(key, input.nowMs, (current) => {
    const consecutiveFailures = (current?.consecutiveFailures ?? 0) + 1;
    const tripped = consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD;
    const reason: RouteUnavailabilityReason = tripped ? 'circuit_open' : signal.reason;
    const availableAtMs =
      input.retryAfterSeconds !== undefined
        ? input.nowMs + input.retryAfterSeconds * MS_PER_SECOND
        : input.nowMs + circuitBackoffMs(consecutiveFailures);

    return {
      [HEALTH_FIELD_SUCCESS_RATE]: nextEwma(current?.successRate, SUCCESS_RATE_ON_FAILURE),
      [HEALTH_FIELD_CONSECUTIVE_FAILURES]: consecutiveFailures,
      [HEALTH_FIELD_REASON]: reason,
      [HEALTH_FIELD_AVAILABLE_AT]: availableAtMs,
    };
  });
}

/**
 * Believe the upstream over our own counter.
 *
 * Our counter only sees turns this deployment settled; the provider's window is
 * shared with anything else on the same credential. When it says the allowance
 * is gone, the pool is gone until it resets, whatever we counted.
 */
async function markPoolSpent(
  routeId: string,
  nowMs: number,
  document: FreePoolsDocument = loadFreePools(),
): Promise<void> {
  const entry = entryForRoute(routeId, document);
  if (!entry) return;
  const store = getKeyValueStore();
  if (!store) return;
  const startMs = windowStartMs(entry.window, nowMs);
  const key = poolKey(entry.poolId, startMs);
  try {
    await store
      .batch()
      .set(key, entry.limit)
      .expireAt(key, windowEndMs(entry.window, startMs, entry.expiresAtMs ?? undefined))
      .exec();
  } catch (error) {
    logger.error(
      { error, routeId, poolId: entry.poolId },
      '[free-lane] pool could not be marked spent after an upstream quota refusal',
    );
  }
}

/**
 * Record an attempt failure without making the caller wait for Redis.
 *
 * Health is telemetry that shapes the NEXT request's ranking; blocking this
 * request's error path on a state write would trade a real user's latency for a
 * statistic. Failures are logged, never rethrown.
 */
export function observeFreeLaneAttemptFailure(failure: {
  provider: string;
  routeId: string | null;
  category: string;
  code: string;
  retryAfterSeconds?: number;
}): void {
  if (!failure.routeId) return;
  void recordFreeLaneRouteFailure({
    routeId: failure.routeId,
    provider: failure.provider,
    nowMs: Date.now(),
    category: failure.category,
    code: failure.code,
    ...(failure.retryAfterSeconds !== undefined
      ? { retryAfterSeconds: failure.retryAfterSeconds }
      : {}),
  }).catch((error: unknown) => {
    logger.error({ error, routeId: failure.routeId }, '[free-lane] failure observation was lost');
  });
}

/**
 * Charge and credit a settled free-lane turn.
 *
 * Called after billing settles rather than on dispatch, so a turn that never
 * reached the provider neither shrinks the pool nor counts as a success.
 */
export function observeFreeLaneSettlement(input: {
  routeId: string;
  usage: FreeLaneSettledUsage;
  succeeded: boolean;
  latencyMs?: number;
}): void {
  const nowMs = Date.now();
  void Promise.all([
    recordFreeLaneUsage({ routeId: input.routeId, nowMs, usage: input.usage }),
    input.succeeded
      ? recordFreeLaneRouteSuccess({
          routeId: input.routeId,
          nowMs,
          ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
        })
      : Promise.resolve(),
  ]).catch((error: unknown) => {
    logger.error({ error, routeId: input.routeId }, '[free-lane] settlement observation was lost');
  });
}

const ROUTE_HEALTH_SNAPSHOT_CACHE_KEY_SEPARATOR = '\u0000';

let routeHealthStoreInstance: RouteHealthStore | null = null;

function routeHealthStore(): RouteHealthStore {
  const providerBreakerConfig = resolveRouteHealthConfig();
  routeHealthStoreInstance ??= createRouteHealthStore({
    store: getKeyValueStore(),
    configs: {
      route: resolveModelLockoutConfig(),
      provider: providerBreakerConfig,
      credential: resolveCredentialCooldownConfig(),
    },
    configFor: (scope, id) =>
      scope === 'provider' ? providerRouteHealthConfig(id, providerBreakerConfig) : undefined,
    boundedRead: async <T>(read: Promise<T>): Promise<T | null> => {
      const result = await readRedisWithinBudget(read);
      return wasRedisReadAbandoned(result) ? null : result;
    },
    onFailure: (event) => {
      logger.error(
        {
          failure: event.failure,
          scope: event.scope,
          idCount: event.ids.length,
          error: event.error,
        },
        '[route-health] store degraded; every route reads healthy',
      );
    },
  });
  return routeHealthStoreInstance;
}

let cachedRouteHealthSnapshots: {
  key: string;
  snapshots: Readonly<Record<string, RouteHealthSnapshot>>;
  expiresAtMs: number;
} | null = null;

export function resetRouteHealthSnapshotCache(): void {
  cachedRouteHealthSnapshots = null;
  routeHealthStoreInstance = null;
}

/**
 * A success is forwarded to the route's CREDENTIAL as well.
 *
 * That is what closes a credential breaker: the key demonstrably works, so a
 * cooldown opened by earlier refusals must not keep a live provider parked. A
 * route FAILURE is deliberately not forwarded, one model returning a 500 says
 * nothing about the account's key.
 */
export async function recordRouteOutcome(
  routeId: string,
  outcome: RouteOutcome,
  nowMs: number = Date.now(),
): Promise<void> {
  const store = routeHealthStore();
  await store.recordOutcome('route', routeId, outcome, nowMs);
  if (outcome.class !== 'success') return;
  await store.recordOutcome('provider', providerOfRouteId(routeId), { class: 'success' }, nowMs);
}

export async function recordCredentialOutcome(
  credentialId: string,
  outcome: RouteOutcome,
  nowMs: number = Date.now(),
): Promise<void> {
  await routeHealthStore().recordOutcome('provider', credentialId, outcome, nowMs);
}

export async function getCredentialHealthSnapshot(
  credentialIds: readonly string[],
  nowMs: number = Date.now(),
): Promise<Readonly<Record<string, RouteHealthSnapshot>>> {
  return routeHealthStore().snapshots('provider', credentialIds, nowMs);
}

export async function recordCredentialCooldownOutcome(
  credentialId: string,
  outcome: RouteOutcome,
  nowMs: number = Date.now(),
): Promise<void> {
  await routeHealthStore().recordOutcome('credential', credentialId, outcome, nowMs);
}

export async function getCredentialCooldownSnapshot(
  credentialIds: readonly string[],
  nowMs: number = Date.now(),
): Promise<Readonly<Record<string, RouteHealthSnapshot>>> {
  return routeHealthStore().snapshots('credential', credentialIds, nowMs);
}

export async function getRouteHealthSnapshot(
  routeIds: readonly string[],
  nowMs: number = Date.now(),
): Promise<Readonly<Record<string, RouteHealthSnapshot>>> {
  if (routeIds.length === 0) return {};

  const cacheKey = [...routeIds].sort().join(ROUTE_HEALTH_SNAPSHOT_CACHE_KEY_SEPARATOR);
  if (
    cachedRouteHealthSnapshots &&
    cachedRouteHealthSnapshots.key === cacheKey &&
    cachedRouteHealthSnapshots.expiresAtMs > nowMs
  ) {
    return cachedRouteHealthSnapshots.snapshots;
  }

  const snapshots = await routeHealthStore().snapshots('route', routeIds, nowMs);
  cachedRouteHealthSnapshots = {
    key: cacheKey,
    snapshots,
    expiresAtMs: nowMs + SNAPSHOT_CACHE_TTL_MS,
  };
  return snapshots;
}

export interface ResilienceScopeSnapshot {
  provider: Readonly<Record<string, RouteHealthSnapshot>>;
  credential: Readonly<Record<string, RouteHealthSnapshot>>;
  model: Readonly<Record<string, RouteHealthSnapshot>>;
}

export async function getResilienceScopeSnapshot(
  ids: {
    providerIds: readonly string[];
    credentialIds: readonly string[];
    routeIds: readonly string[];
  },
  nowMs: number = Date.now(),
): Promise<ResilienceScopeSnapshot> {
  const [provider, credential, model] = await Promise.all([
    getCredentialHealthSnapshot(ids.providerIds, nowMs),
    getCredentialCooldownSnapshot(ids.credentialIds, nowMs),
    getRouteHealthSnapshot(ids.routeIds, nowMs),
  ]);
  return { provider, credential, model };
}

export function resolveProviderCredentialClass(providerId: string): CredentialClass {
  return credentialClassForProvider(providerId);
}

const ROUTE_AFFINITY_KEY_PREFIX = 'agi-raffinity';
const AFFINITY_FIELD_ROUTE_ID = 'routeId';
const AFFINITY_FIELD_UPSTREAM_PROVIDER = 'upstreamProvider';
const AFFINITY_FIELD_MODEL_KEY = 'modelKey';
const AFFINITY_FIELD_TASK_TYPE = 'taskType';

const PROVIDER_PROMPT_CACHE_TTL_MS = 5 * 60 * MS_PER_SECOND;
const EXTENDED_PROMPT_CACHE_TTL_MS = 60 * 60 * MS_PER_SECOND;
const RESPONSE_CACHE_TTL_MS = 5 * 60 * MS_PER_SECOND;
const NO_CACHE_AFFINITY_TTL_MS = 0;

const ROUTE_CACHE_CLASS_AFFINITY_TTL_MS: Readonly<Record<RouteCacheClass, number>> = {
  provider_implicit_prompt_cache: PROVIDER_PROMPT_CACHE_TTL_MS,
  provider_explicit_prompt_cache: EXTENDED_PROMPT_CACHE_TTL_MS,
  gateway_prompt_cache: EXTENDED_PROMPT_CACHE_TTL_MS,
  gateway_response_cache: RESPONSE_CACHE_TTL_MS,
  no_provider_cache: NO_CACHE_AFFINITY_TTL_MS,
};

export function routeAffinityTtlMs(cacheClass: RouteCacheClass | undefined): number {
  return cacheClass ? ROUTE_CACHE_CLASS_AFFINITY_TTL_MS[cacheClass] : NO_CACHE_AFFINITY_TTL_MS;
}

function routeAffinityKey(conversationId: string): string {
  return [ROUTE_AFFINITY_KEY_PREFIX, conversationId].join(KEY_SEPARATOR);
}

export interface ServedRouteAffinity {
  routeId: string;
  upstreamProvider?: string;
  modelKey?: string;
  taskType?: RoutingTaskType;
}

export async function recordServedRouteAffinity(input: {
  conversationId: string;
  routeId: string;
  ttlMs: number;
  upstreamProvider?: string;
  modelKey?: string;
  taskType?: RoutingTaskType;
}): Promise<void> {
  if (input.ttlMs <= 0) return;
  const store = getKeyValueStore();
  if (!store) return;
  const key = routeAffinityKey(input.conversationId);
  try {
    await store
      .batch()
      .hashSet(key, {
        [AFFINITY_FIELD_ROUTE_ID]: input.routeId,
        ...(input.upstreamProvider
          ? { [AFFINITY_FIELD_UPSTREAM_PROVIDER]: input.upstreamProvider }
          : {}),
        ...(input.modelKey ? { [AFFINITY_FIELD_MODEL_KEY]: input.modelKey } : {}),
        ...(input.taskType ? { [AFFINITY_FIELD_TASK_TYPE]: input.taskType } : {}),
      })
      .expireIn(key, input.ttlMs)
      .exec();
  } catch (error) {
    logger.error(
      { error, conversationId: input.conversationId },
      '[route-affinity] served route was not recorded',
    );
  }
}

export async function getServedRouteAffinity(
  conversationId: string,
): Promise<ServedRouteAffinity | null> {
  const store = getKeyValueStore();
  if (!store) return null;
  try {
    const raw = await readRedisWithinBudget(store.hashGetAll(routeAffinityKey(conversationId)));
    if (wasRedisReadAbandoned(raw)) {
      logger.error(
        { conversationId },
        '[route-affinity] read outlived its budget; the turn has no affinity',
      );
      return null;
    }
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as Record<string, unknown>;
    const routeId = record[AFFINITY_FIELD_ROUTE_ID];
    if (typeof routeId !== 'string' || routeId.length === 0) return null;
    const upstreamProvider = record[AFFINITY_FIELD_UPSTREAM_PROVIDER];
    const modelKey = record[AFFINITY_FIELD_MODEL_KEY];
    const taskType = record[AFFINITY_FIELD_TASK_TYPE];
    return {
      routeId,
      ...(typeof upstreamProvider === 'string' && upstreamProvider.length > 0
        ? { upstreamProvider }
        : {}),
      ...(typeof modelKey === 'string' && modelKey.length > 0 ? { modelKey } : {}),
      ...(typeof taskType === 'string' && taskType.length > 0
        ? { taskType: taskType as RoutingTaskType }
        : {}),
    };
  } catch (error) {
    logger.error(
      { error, conversationId },
      '[route-affinity] read failed; the turn has no affinity',
    );
    return null;
  }
}
