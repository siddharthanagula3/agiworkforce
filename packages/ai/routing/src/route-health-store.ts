/**
 * Cross-request outcome memory for routes and credentials.
 *
 * `runtime-state.ts` declares WHAT a health snapshot says; this module is where
 * one comes from. Routing itself stays pure: the `KeyValueStore` port is handed
 * in by the surface that owns the connection, and nothing here resolves a
 * backend, reads a connection string or holds module state.
 *
 * The route key shape is the one the free lane already writes, so this is one
 * store with two scopes rather than a second store beside it.
 *
 * @module routing/route-health-store
 * @packageDocumentation
 */
import type { RouteHealthSnapshot, RouteOutcome, RouteOutcomeClass } from './runtime-state';

/**
 * The slice of `@agiworkforce/key-value`'s `KeyValueStore` this module calls.
 *
 * Declared structurally rather than imported so `@agiworkforce/routing` keeps
 * no runtime dependency and stays callable from every surface. The real port
 * satisfies it, and `apps/web` passes exactly that.
 */
export interface RouteHealthKeyValueBatch {
  sortedAdd(key: string, entry: { score: number; member: string }): RouteHealthKeyValueBatch;
  sortedRemoveByScore(key: string, minScore: number, maxScore: number): RouteHealthKeyValueBatch;
  sortedRangeByScore(key: string, minScore: number, maxScore: number): RouteHealthKeyValueBatch;
  expire(key: string, ttlSeconds: number): RouteHealthKeyValueBatch;
  exec(): Promise<unknown[]>;
}

export interface RouteHealthKeyValueStore {
  batch(): RouteHealthKeyValueBatch;
}

/**
 * `shadow` is a third keyspace, not a flag on a route observation.
 *
 * A mirrored request was never served, so its outcome must never reach route
 * ranking or a breaker. Keeping it in its own key prefix makes that structural:
 * ranking reads the `route` scope and has no way to see a shadow event, rather
 * than relying on every future reader remembering to filter one out.
 */
export type RouteHealthScope = 'route' | 'provider' | 'credential' | 'shadow';

export type RouteBreakerState = 'closed' | 'degraded' | 'open' | 'half_open';

export const ROUTE_HEALTH_WINDOW_ENV = 'AGI_ROUTE_HEALTH_WINDOW_MS';
export const ROUTE_HEALTH_TRIP_WINDOW_ENV = 'AGI_ROUTE_HEALTH_TRIP_WINDOW_MS';
export const ROUTE_BREAKER_CONSECUTIVE_FAILURES_ENV = 'AGI_ROUTE_BREAKER_CONSECUTIVE_FAILURES';
export const ROUTE_BREAKER_FAILURE_RATE_ENV = 'AGI_ROUTE_BREAKER_FAILURE_RATE';
export const ROUTE_BREAKER_MIN_SAMPLES_ENV = 'AGI_ROUTE_BREAKER_MIN_SAMPLES';
export const ROUTE_BREAKER_COOLDOWN_ENV = 'AGI_ROUTE_BREAKER_COOLDOWN_MS';
export const ROUTE_BREAKER_MAX_COOLDOWN_ENV = 'AGI_ROUTE_BREAKER_MAX_COOLDOWN_MS';

export const MODEL_LOCKOUT_WINDOW_ENV = 'AGI_MODEL_LOCKOUT_WINDOW_MS';
export const MODEL_LOCKOUT_TRIP_WINDOW_ENV = 'AGI_MODEL_LOCKOUT_TRIP_WINDOW_MS';
export const MODEL_LOCKOUT_CONSECUTIVE_FAILURES_ENV = 'AGI_MODEL_LOCKOUT_CONSECUTIVE_FAILURES';
export const MODEL_LOCKOUT_FAILURE_RATE_ENV = 'AGI_MODEL_LOCKOUT_FAILURE_RATE';
export const MODEL_LOCKOUT_MIN_SAMPLES_ENV = 'AGI_MODEL_LOCKOUT_MIN_SAMPLES';
export const MODEL_LOCKOUT_COOLDOWN_ENV = 'AGI_MODEL_LOCKOUT_COOLDOWN_MS';
export const MODEL_LOCKOUT_MAX_COOLDOWN_ENV = 'AGI_MODEL_LOCKOUT_MAX_COOLDOWN_MS';

export const CREDENTIAL_COOLDOWN_WINDOW_ENV = 'AGI_CREDENTIAL_COOLDOWN_WINDOW_MS';
export const CREDENTIAL_COOLDOWN_TRIP_WINDOW_ENV = 'AGI_CREDENTIAL_COOLDOWN_TRIP_WINDOW_MS';
export const CREDENTIAL_COOLDOWN_CONSECUTIVE_FAILURES_ENV =
  'AGI_CREDENTIAL_COOLDOWN_CONSECUTIVE_FAILURES';
export const CREDENTIAL_COOLDOWN_FAILURE_RATE_ENV = 'AGI_CREDENTIAL_COOLDOWN_FAILURE_RATE';
export const CREDENTIAL_COOLDOWN_MIN_SAMPLES_ENV = 'AGI_CREDENTIAL_COOLDOWN_MIN_SAMPLES';
export const CREDENTIAL_COOLDOWN_BASE_ENV = 'AGI_CREDENTIAL_COOLDOWN_BASE_MS';
export const CREDENTIAL_COOLDOWN_MAX_ENV = 'AGI_CREDENTIAL_COOLDOWN_MAX_MS';

const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const OBSERVATION_WINDOW_MINUTES = 30;
const TRIP_WINDOW_MINUTES = 5;
const COOLDOWN_BASE_MINUTES = 0.5;
const COOLDOWN_MAX_MINUTES = 10;
const MINUTE_MS = SECONDS_PER_MINUTE * MS_PER_SECOND;

const DEFAULT_OBSERVATION_WINDOW_MS = OBSERVATION_WINDOW_MINUTES * MINUTE_MS;
const DEFAULT_TRIP_WINDOW_MS = TRIP_WINDOW_MINUTES * MINUTE_MS;
const DEFAULT_CONSECUTIVE_FAILURE_THRESHOLD = 3;
const DEFAULT_FAILURE_RATE_THRESHOLD = 0.5;
const DEFAULT_MIN_SAMPLES_FOR_RATE_TRIP = 5;
const DEFAULT_COOLDOWN_BASE_MS = COOLDOWN_BASE_MINUTES * MINUTE_MS;
const DEFAULT_COOLDOWN_MAX_MS = COOLDOWN_MAX_MINUTES * MINUTE_MS;

const DEFAULT_MODEL_LOCKOUT_CONFIG: RouteHealthConfig = {
  observationWindowMs: DEFAULT_OBSERVATION_WINDOW_MS,
  tripWindowMs: DEFAULT_TRIP_WINDOW_MS,
  consecutiveFailureThreshold: DEFAULT_CONSECUTIVE_FAILURE_THRESHOLD,
  failureRateThreshold: DEFAULT_FAILURE_RATE_THRESHOLD,
  minSamplesForRateTrip: DEFAULT_MIN_SAMPLES_FOR_RATE_TRIP,
  cooldownBaseMs: DEFAULT_COOLDOWN_BASE_MS,
  cooldownMaxMs: DEFAULT_COOLDOWN_MAX_MS,
};

const CREDENTIAL_COOLDOWN_WINDOW_MINUTES = 10;
const CREDENTIAL_COOLDOWN_TRIP_WINDOW_MINUTES = 2;
const CREDENTIAL_COOLDOWN_CONSECUTIVE_FAILURE_THRESHOLD = 2;
const CREDENTIAL_COOLDOWN_FAILURE_RATE_THRESHOLD = 0.5;
const CREDENTIAL_COOLDOWN_MIN_SAMPLES_FOR_RATE_TRIP = 3;
const CREDENTIAL_COOLDOWN_BASE_SECONDS = 5;
const CREDENTIAL_COOLDOWN_MAX_MINUTES = 5;

const DEFAULT_CREDENTIAL_COOLDOWN_CONFIG: RouteHealthConfig = {
  observationWindowMs: CREDENTIAL_COOLDOWN_WINDOW_MINUTES * MINUTE_MS,
  tripWindowMs: CREDENTIAL_COOLDOWN_TRIP_WINDOW_MINUTES * MINUTE_MS,
  consecutiveFailureThreshold: CREDENTIAL_COOLDOWN_CONSECUTIVE_FAILURE_THRESHOLD,
  failureRateThreshold: CREDENTIAL_COOLDOWN_FAILURE_RATE_THRESHOLD,
  minSamplesForRateTrip: CREDENTIAL_COOLDOWN_MIN_SAMPLES_FOR_RATE_TRIP,
  cooldownBaseMs: CREDENTIAL_COOLDOWN_BASE_SECONDS * MS_PER_SECOND,
  cooldownMaxMs: CREDENTIAL_COOLDOWN_MAX_MINUTES * MINUTE_MS,
};

const COOLDOWN_BACKOFF_MULTIPLIER = 2;
const EVENT_TTL_BUFFER_SECONDS = 60;
const EVENTS_RANGE_MIN = 0;
const EVENTS_RANGE_MAX = Number.POSITIVE_INFINITY;
const TTFT_P50_FRACTION = 0.5;
const TTFT_P95_FRACTION = 0.95;
const MINIMUM_WINDOW_MS = 1;
const MINIMUM_THRESHOLD = 1;
const RATE_MINIMUM = 0;
const RATE_MAXIMUM = 1;
const NONCE_RADIX = 36;
const NONCE_START_INDEX = 2;

const KEY_SEPARATOR = ':';
const ROUTE_EVENTS_KEY_PREFIX = 'agi-rhealth:events';
const PROVIDER_EVENTS_KEY_PREFIX = 'agi-rhealth:provider';
const CREDENTIAL_EVENTS_KEY_PREFIX = 'agi-rhealth:credential-cooldown';
const SHADOW_EVENTS_KEY_PREFIX = 'agi-rhealth:shadow';

const EVENTS_KEY_PREFIX_BY_SCOPE: Readonly<Record<RouteHealthScope, string>> = {
  route: ROUTE_EVENTS_KEY_PREFIX,
  provider: PROVIDER_EVENTS_KEY_PREFIX,
  credential: CREDENTIAL_EVENTS_KEY_PREFIX,
  shadow: SHADOW_EVENTS_KEY_PREFIX,
};

const EVENT_FIELD_NOW = 'nowMs';
const EVENT_FIELD_CLASS = 'class';
const EVENT_FIELD_TTFT = 'ttftMs';
const EVENT_FIELD_DURATION = 'durationMs';
const EVENT_FIELD_OUTPUT_TOKENS = 'outputTokens';
const EVENT_FIELD_NONCE = 'nonce';

const OUTCOME_CLASSES: ReadonlySet<RouteOutcomeClass> = new Set<RouteOutcomeClass>([
  'success',
  'rate_limit',
  'server_error',
  'timeout',
  'stream_corruption',
  'unsupported_capability',
  'credential_rejected',
  'model_rejected',
]);

/**
 * Classes that count against a route. `unsupported_capability` is deliberately
 * absent: the route answered honestly about what it cannot do, and parking it
 * for that would punish capacity for the request's own shape.
 */
const FAILURE_CLASSES: ReadonlySet<RouteOutcomeClass> = new Set<RouteOutcomeClass>([
  'rate_limit',
  'server_error',
  'timeout',
  'stream_corruption',
  'credential_rejected',
  'model_rejected',
]);

export interface RouteHealthConfig {
  observationWindowMs: number;
  tripWindowMs: number;
  consecutiveFailureThreshold: number;
  failureRateThreshold: number;
  minSamplesForRateTrip: number;
  cooldownBaseMs: number;
  cooldownMaxMs: number;
}

export const DEFAULT_ROUTE_HEALTH_CONFIG: RouteHealthConfig = {
  observationWindowMs: DEFAULT_OBSERVATION_WINDOW_MS,
  tripWindowMs: DEFAULT_TRIP_WINDOW_MS,
  consecutiveFailureThreshold: DEFAULT_CONSECUTIVE_FAILURE_THRESHOLD,
  failureRateThreshold: DEFAULT_FAILURE_RATE_THRESHOLD,
  minSamplesForRateTrip: DEFAULT_MIN_SAMPLES_FOR_RATE_TRIP,
  cooldownBaseMs: DEFAULT_COOLDOWN_BASE_MS,
  cooldownMaxMs: DEFAULT_COOLDOWN_MAX_MS,
};

const DEFAULT_CONFIG_BY_SCOPE: Readonly<Record<RouteHealthScope, RouteHealthConfig>> = {
  route: DEFAULT_MODEL_LOCKOUT_CONFIG,
  provider: DEFAULT_ROUTE_HEALTH_CONFIG,
  credential: DEFAULT_CREDENTIAL_COOLDOWN_CONFIG,
  shadow: DEFAULT_MODEL_LOCKOUT_CONFIG,
};

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function readPositiveInteger(
  environment: EnvironmentSource,
  name: string,
  fallback: number,
  minimum: number,
): number {
  const configured = environment[name]?.trim();
  if (!configured) return fallback;
  const parsed = Number(configured);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function readRate(environment: EnvironmentSource, name: string, fallback: number): number {
  const configured = environment[name]?.trim();
  if (!configured) return fallback;
  const parsed = Number(configured);
  return Number.isFinite(parsed) && parsed > RATE_MINIMUM && parsed <= RATE_MAXIMUM
    ? parsed
    : fallback;
}

function processEnvironment(): EnvironmentSource {
  return typeof process === 'undefined' ? {} : (process.env ?? {});
}

interface ScopedConfigEnvNames {
  window: string;
  tripWindow: string;
  consecutiveFailures: string;
  failureRate: string;
  minSamples: string;
  cooldown: string;
  maxCooldown: string;
}

/**
 * Every threshold is operator-tunable, because the right window for a route
 * that serves once a minute is not the right window for one under constant
 * load. An unparseable value keeps the default rather than disabling the
 * breaker, which is the one outcome a typo must not produce.
 */
function resolveScopedRouteHealthConfig(
  envNames: ScopedConfigEnvNames,
  defaults: RouteHealthConfig,
  environment: EnvironmentSource,
): RouteHealthConfig {
  const observationWindowMs = readPositiveInteger(
    environment,
    envNames.window,
    defaults.observationWindowMs,
    MINIMUM_WINDOW_MS,
  );
  const tripWindowMs = Math.min(
    observationWindowMs,
    readPositiveInteger(environment, envNames.tripWindow, defaults.tripWindowMs, MINIMUM_WINDOW_MS),
  );
  const cooldownBaseMs = readPositiveInteger(
    environment,
    envNames.cooldown,
    defaults.cooldownBaseMs,
    MINIMUM_WINDOW_MS,
  );
  return {
    observationWindowMs,
    tripWindowMs,
    consecutiveFailureThreshold: readPositiveInteger(
      environment,
      envNames.consecutiveFailures,
      defaults.consecutiveFailureThreshold,
      MINIMUM_THRESHOLD,
    ),
    failureRateThreshold: readRate(
      environment,
      envNames.failureRate,
      defaults.failureRateThreshold,
    ),
    minSamplesForRateTrip: readPositiveInteger(
      environment,
      envNames.minSamples,
      defaults.minSamplesForRateTrip,
      MINIMUM_THRESHOLD,
    ),
    cooldownBaseMs,
    cooldownMaxMs: Math.max(
      cooldownBaseMs,
      readPositiveInteger(
        environment,
        envNames.maxCooldown,
        defaults.cooldownMaxMs,
        MINIMUM_WINDOW_MS,
      ),
    ),
  };
}

const PROVIDER_BREAKER_ENV_NAMES: ScopedConfigEnvNames = {
  window: ROUTE_HEALTH_WINDOW_ENV,
  tripWindow: ROUTE_HEALTH_TRIP_WINDOW_ENV,
  consecutiveFailures: ROUTE_BREAKER_CONSECUTIVE_FAILURES_ENV,
  failureRate: ROUTE_BREAKER_FAILURE_RATE_ENV,
  minSamples: ROUTE_BREAKER_MIN_SAMPLES_ENV,
  cooldown: ROUTE_BREAKER_COOLDOWN_ENV,
  maxCooldown: ROUTE_BREAKER_MAX_COOLDOWN_ENV,
};

const MODEL_LOCKOUT_ENV_NAMES: ScopedConfigEnvNames = {
  window: MODEL_LOCKOUT_WINDOW_ENV,
  tripWindow: MODEL_LOCKOUT_TRIP_WINDOW_ENV,
  consecutiveFailures: MODEL_LOCKOUT_CONSECUTIVE_FAILURES_ENV,
  failureRate: MODEL_LOCKOUT_FAILURE_RATE_ENV,
  minSamples: MODEL_LOCKOUT_MIN_SAMPLES_ENV,
  cooldown: MODEL_LOCKOUT_COOLDOWN_ENV,
  maxCooldown: MODEL_LOCKOUT_MAX_COOLDOWN_ENV,
};

const CREDENTIAL_COOLDOWN_ENV_NAMES: ScopedConfigEnvNames = {
  window: CREDENTIAL_COOLDOWN_WINDOW_ENV,
  tripWindow: CREDENTIAL_COOLDOWN_TRIP_WINDOW_ENV,
  consecutiveFailures: CREDENTIAL_COOLDOWN_CONSECUTIVE_FAILURES_ENV,
  failureRate: CREDENTIAL_COOLDOWN_FAILURE_RATE_ENV,
  minSamples: CREDENTIAL_COOLDOWN_MIN_SAMPLES_ENV,
  cooldown: CREDENTIAL_COOLDOWN_BASE_ENV,
  maxCooldown: CREDENTIAL_COOLDOWN_MAX_ENV,
};

export function resolveRouteHealthConfig(
  environment: EnvironmentSource = processEnvironment(),
): RouteHealthConfig {
  return resolveScopedRouteHealthConfig(
    PROVIDER_BREAKER_ENV_NAMES,
    DEFAULT_ROUTE_HEALTH_CONFIG,
    environment,
  );
}

export function resolveModelLockoutConfig(
  environment: EnvironmentSource = processEnvironment(),
): RouteHealthConfig {
  return resolveScopedRouteHealthConfig(
    MODEL_LOCKOUT_ENV_NAMES,
    DEFAULT_MODEL_LOCKOUT_CONFIG,
    environment,
  );
}

export function resolveCredentialCooldownConfig(
  environment: EnvironmentSource = processEnvironment(),
): RouteHealthConfig {
  return resolveScopedRouteHealthConfig(
    CREDENTIAL_COOLDOWN_ENV_NAMES,
    DEFAULT_CREDENTIAL_COOLDOWN_CONFIG,
    environment,
  );
}

export function resolveRouteHealthConfigForScope(
  scope: RouteHealthScope,
  environment: EnvironmentSource = processEnvironment(),
): RouteHealthConfig {
  if (scope === 'route') return resolveModelLockoutConfig(environment);
  if (scope === 'credential') return resolveCredentialCooldownConfig(environment);
  return resolveRouteHealthConfig(environment);
}

export function routeHealthEventsKey(scope: RouteHealthScope, id: string): string {
  return [EVENTS_KEY_PREFIX_BY_SCOPE[scope], id].join(KEY_SEPARATOR);
}

export interface RouteOutcomeEvent {
  nowMs: number;
  class: RouteOutcomeClass;
  ttftMs?: number;
  durationMs?: number;
  outputTokens?: number;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isOutcomeClass(value: unknown): value is RouteOutcomeClass {
  return typeof value === 'string' && OUTCOME_CLASSES.has(value as RouteOutcomeClass);
}

function isFailureClass(value: RouteOutcomeClass): boolean {
  return FAILURE_CLASSES.has(value);
}

export function encodeRouteOutcomeEvent(
  outcome: RouteOutcome,
  nowMs: number,
  nonce: string,
): string {
  return JSON.stringify({
    [EVENT_FIELD_NOW]: nowMs,
    [EVENT_FIELD_CLASS]: outcome.class,
    ...(outcome.ttftMs !== undefined ? { [EVENT_FIELD_TTFT]: outcome.ttftMs } : {}),
    ...(outcome.durationMs !== undefined ? { [EVENT_FIELD_DURATION]: outcome.durationMs } : {}),
    ...(outcome.outputTokens !== undefined
      ? { [EVENT_FIELD_OUTPUT_TOKENS]: outcome.outputTokens }
      : {}),
    [EVENT_FIELD_NONCE]: nonce,
  });
}

function parseRouteOutcomeEvent(raw: unknown): RouteOutcomeEvent | undefined {
  const parsed = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  if (!parsed || typeof parsed !== 'object') return undefined;
  const record = parsed as Record<string, unknown>;
  const eventNowMs = toNumber(record[EVENT_FIELD_NOW]);
  if (eventNowMs === undefined || !isOutcomeClass(record[EVENT_FIELD_CLASS])) return undefined;
  const ttftMs = toNumber(record[EVENT_FIELD_TTFT]);
  const durationMs = toNumber(record[EVENT_FIELD_DURATION]);
  const outputTokens = toNumber(record[EVENT_FIELD_OUTPUT_TOKENS]);
  return {
    nowMs: eventNowMs,
    class: record[EVENT_FIELD_CLASS] as RouteOutcomeClass,
    ...(ttftMs !== undefined ? { ttftMs } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
  };
}

export function parseRouteOutcomeEvents(raw: unknown): readonly RouteOutcomeEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: RouteOutcomeEvent[] = [];
  for (const item of raw) {
    const event = parseRouteOutcomeEvent(item);
    if (event) events.push(event);
  }
  return events.sort((left, right) => left.nowMs - right.nowMs);
}

function cooldownMs(consecutiveFailures: number, config: RouteHealthConfig): number {
  const exponent = Math.max(0, consecutiveFailures - config.consecutiveFailureThreshold);
  return Math.min(
    config.cooldownMaxMs,
    config.cooldownBaseMs * COOLDOWN_BACKOFF_MULTIPLIER ** exponent,
  );
}

function consecutiveFailureStreak(events: readonly RouteOutcomeEvent[]): number {
  let streak = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (!isFailureClass(events[index]!.class)) break;
    streak += 1;
  }
  return streak;
}

function failureRatio(events: readonly RouteOutcomeEvent[]): number {
  if (events.length === 0) return 0;
  return events.filter((event) => isFailureClass(event.class)).length / events.length;
}

function countByClass(events: readonly RouteOutcomeEvent[]): Record<RouteOutcomeClass, number> {
  const counts: Record<RouteOutcomeClass, number> = {
    success: 0,
    rate_limit: 0,
    server_error: 0,
    timeout: 0,
    stream_corruption: 0,
    unsupported_capability: 0,
    credential_rejected: 0,
    model_rejected: 0,
  };
  for (const event of events) counts[event.class] += 1;
  return counts;
}

function percentileOf(sortedAscending: readonly number[], fraction: number): number {
  const rank = Math.max(1, Math.ceil(fraction * sortedAscending.length));
  return sortedAscending[Math.min(sortedAscending.length, rank) - 1]!;
}

function throughputTokensPerSecond(events: readonly RouteOutcomeEvent[]): number | undefined {
  let tokenSum = 0;
  let durationSumMs = 0;
  for (const event of events) {
    if (
      typeof event.outputTokens === 'number' &&
      typeof event.durationMs === 'number' &&
      event.durationMs > 0
    ) {
      tokenSum += event.outputTokens;
      durationSumMs += event.durationMs;
    }
  }
  return durationSumMs > 0 ? (tokenSum / durationSumMs) * MS_PER_SECOND : undefined;
}

export function healthyRouteHealthSnapshot(): RouteHealthSnapshot {
  return { available: true, halfOpen: false, consecutiveFailures: 0, sampleCount: 0 };
}

/**
 * Closed, open with a cooldown, half-open probe: the state a caller acts on.
 *
 * `halfOpen` means the cooldown has elapsed and the next dispatch is the probe
 * that decides whether the route comes back. It is deliberately dispatchable,
 * a route nobody ever probes never recovers.
 */
export function routeBreakerState(snapshot: RouteHealthSnapshot | undefined): RouteBreakerState {
  if (!snapshot) return 'closed';
  if (!snapshot.available) return 'open';
  return snapshot.halfOpen ? 'half_open' : 'closed';
}

export function isRouteBreakerOpen(snapshot: RouteHealthSnapshot | undefined): boolean {
  return routeBreakerState(snapshot) === 'open';
}

export function routeBreakerStateWithDegradeBand(
  snapshot: RouteHealthSnapshot | undefined,
  degradeAtFailures: number,
): RouteBreakerState {
  const state = routeBreakerState(snapshot);
  if (state !== 'closed' || !snapshot) return state;
  return snapshot.consecutiveFailures >= degradeAtFailures ? 'degraded' : 'closed';
}

export function isRouteHealthDegraded(
  snapshot: RouteHealthSnapshot | undefined,
  degradeAtFailures: number,
): boolean {
  return routeBreakerStateWithDegradeBand(snapshot, degradeAtFailures) === 'degraded';
}

export function buildRouteHealthSnapshot(
  rawEvents: readonly RouteOutcomeEvent[],
  nowMs: number,
  config: RouteHealthConfig = DEFAULT_ROUTE_HEALTH_CONFIG,
): RouteHealthSnapshot {
  const events = rawEvents.filter((event) => event.class !== 'unsupported_capability');
  if (events.length === 0) return healthyRouteHealthSnapshot();

  const tripWindowEvents = events.filter((event) => event.nowMs >= nowMs - config.tripWindowMs);
  const lastEvent = events[events.length - 1]!;
  const consecutiveFailures = consecutiveFailureStreak(events);
  const trippedByStreak = consecutiveFailures >= config.consecutiveFailureThreshold;
  const trippedByRate =
    tripWindowEvents.length >= config.minSamplesForRateTrip &&
    failureRatio(tripWindowEvents) >= config.failureRateThreshold;
  const tripped = isFailureClass(lastEvent.class) && (trippedByStreak || trippedByRate);

  const cooldownUntilMs = tripped
    ? lastEvent.nowMs + cooldownMs(consecutiveFailures, config)
    : undefined;
  const halfOpen = cooldownUntilMs !== undefined && nowMs >= cooldownUntilMs;
  const available = cooldownUntilMs === undefined || nowMs >= cooldownUntilMs;

  const counts = countByClass(events);
  const sampleCount = events.length;
  const ttftValues = events
    .map((event) => event.ttftMs)
    .filter((value): value is number => value !== undefined)
    .sort((left, right) => left - right);
  const throughput = throughputTokensPerSecond(events);

  return {
    available,
    halfOpen,
    ...(cooldownUntilMs !== undefined ? { cooldownUntilMs } : {}),
    consecutiveFailures,
    sampleCount,
    successRate: counts.success / sampleCount,
    rateLimitRate: counts.rate_limit / sampleCount,
    serverErrorRate: counts.server_error / sampleCount,
    timeoutRate: counts.timeout / sampleCount,
    streamCorruptionRate: counts.stream_corruption / sampleCount,
    ...(ttftValues.length > 0
      ? {
          ttftP50Ms: percentileOf(ttftValues, TTFT_P50_FRACTION),
          ttftP95Ms: percentileOf(ttftValues, TTFT_P95_FRACTION),
        }
      : {}),
    ...(throughput !== undefined ? { throughputTokensPerSecond: throughput } : {}),
  };
}

export type RouteHealthStoreFailure =
  | 'store_unavailable'
  | 'read_abandoned'
  | 'read_failed'
  | 'write_failed';

export interface RouteHealthStoreFailureEvent {
  failure: RouteHealthStoreFailure;
  scope: RouteHealthScope;
  ids: readonly string[];
  error?: unknown;
}

export interface RouteHealthStoreOptions {
  store: RouteHealthKeyValueStore | null;
  /** Per-scope defaults. A scope missing here falls back to its own built-in default. */
  configs?: Partial<Record<RouteHealthScope, RouteHealthConfig>>;
  /**
   * Per-id override, consulted before `configs`.
   *
   * A provider breaker's threshold depends on which credential class governs
   * that ONE provider (`breaker-profiles.ts`), not on the scope as a whole, so
   * the store needs a per-id hook rather than a single config per scope.
   * Returning `undefined` falls through to `configs[scope]` and then the
   * scope's built-in default.
   */
  configFor?: (scope: RouteHealthScope, id: string) => RouteHealthConfig | undefined;
  /** Returns `null` when the read outlived the caller's request-path budget. */
  boundedRead?: <T>(read: Promise<T>) => Promise<T | null>;
  onFailure?: (event: RouteHealthStoreFailureEvent) => void;
  nonce?: () => string;
}

export interface RouteHealthStore {
  readonly configs: Readonly<Record<RouteHealthScope, RouteHealthConfig>>;
  recordOutcome(
    scope: RouteHealthScope,
    id: string,
    outcome: RouteOutcome,
    nowMs?: number,
  ): Promise<void>;
  snapshots(
    scope: RouteHealthScope,
    ids: readonly string[],
    nowMs?: number,
  ): Promise<Readonly<Record<string, RouteHealthSnapshot>>>;
}

function defaultNonce(): string {
  return Math.random().toString(NONCE_RADIX).slice(NONCE_START_INDEX);
}

function healthySnapshots(ids: readonly string[]): Record<string, RouteHealthSnapshot> {
  const snapshots: Record<string, RouteHealthSnapshot> = {};
  for (const id of ids) snapshots[id] = healthyRouteHealthSnapshot();
  return snapshots;
}

/**
 * Fails OPEN on every store problem: a breaker that cannot read its own memory
 * must not become the outage. The caller is told once per failed operation
 * through `onFailure` so the one log line names the degradation.
 */
export function createRouteHealthStore(options: RouteHealthStoreOptions): RouteHealthStore {
  const configs: Readonly<Record<RouteHealthScope, RouteHealthConfig>> = {
    route: options.configs?.route ?? DEFAULT_CONFIG_BY_SCOPE.route,
    provider: options.configs?.provider ?? DEFAULT_CONFIG_BY_SCOPE.provider,
    credential: options.configs?.credential ?? DEFAULT_CONFIG_BY_SCOPE.credential,
    shadow: options.configs?.shadow ?? DEFAULT_CONFIG_BY_SCOPE.shadow,
  };
  const nonce = options.nonce ?? defaultNonce;

  const resolveConfig = (scope: RouteHealthScope, id: string): RouteHealthConfig =>
    options.configFor?.(scope, id) ?? configs[scope];

  const eventTtlSecondsFor = (config: RouteHealthConfig): number =>
    Math.ceil(config.observationWindowMs / MS_PER_SECOND) + EVENT_TTL_BUFFER_SECONDS;

  const report = (event: RouteHealthStoreFailureEvent): void => {
    options.onFailure?.(event);
  };

  return {
    configs,

    async recordOutcome(scope, id, outcome, nowMs = Date.now()): Promise<void> {
      const store = options.store;
      if (!store) {
        report({ failure: 'store_unavailable', scope, ids: [id] });
        return;
      }
      const config = resolveConfig(scope, id);
      const key = routeHealthEventsKey(scope, id);
      try {
        await store
          .batch()
          .sortedAdd(key, {
            score: nowMs,
            member: encodeRouteOutcomeEvent(outcome, nowMs, nonce()),
          })
          .sortedRemoveByScore(key, EVENTS_RANGE_MIN, nowMs - config.observationWindowMs)
          .expire(key, eventTtlSecondsFor(config))
          .exec();
      } catch (error) {
        report({ failure: 'write_failed', scope, ids: [id], error });
      }
    },

    async snapshots(scope, ids, nowMs = Date.now()) {
      if (ids.length === 0) return {};
      const store = options.store;
      if (!store) {
        report({ failure: 'store_unavailable', scope, ids });
        return healthySnapshots(ids);
      }

      try {
        const batch = store.batch();
        for (const id of ids) {
          const config = resolveConfig(scope, id);
          batch.sortedRangeByScore(
            routeHealthEventsKey(scope, id),
            nowMs - config.observationWindowMs,
            EVENTS_RANGE_MAX,
          );
        }
        const exec = batch.exec();
        const read = options.boundedRead ? await options.boundedRead(exec) : await exec;
        if (read === null) {
          report({ failure: 'read_abandoned', scope, ids });
          return healthySnapshots(ids);
        }

        const results = read as unknown[];
        const snapshots: Record<string, RouteHealthSnapshot> = {};
        ids.forEach((id, index) => {
          snapshots[id] = buildRouteHealthSnapshot(
            parseRouteOutcomeEvents(results[index]),
            nowMs,
            resolveConfig(scope, id),
          );
        });
        return snapshots;
      } catch (error) {
        report({ failure: 'read_failed', scope, ids, error });
        return healthySnapshots(ids);
      }
    },
  };
}
