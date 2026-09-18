/**
 * Requests-per-minute and tokens-per-minute budgets per provider and model
 * route, enforced before dispatch.
 *
 * The breaker in `route-health-store.ts` is reactive: it parks a route after the
 * provider has already answered 429, which costs a real turn to discover. This
 * is the other half, a ceiling the router holds itself to, so a route that is
 * out of budget is refused by name and the failover loop moves on rather than
 * spending an attempt learning the same thing from upstream.
 *
 * Authored in `packages/ai/model-registry/catalog/routing-policies.json` under
 * `rateLimits`; `ROUTE_RATE_LIMIT_POLICY` is the copy this package serves and
 * `rate-limits.test.ts` fails if the two drift.
 *
 * @module routing/rate-limits
 * @packageDocumentation
 */
import type { RouteHealthKeyValueStore, RouteHealthStoreFailure } from './route-health-store';

export const ROUTE_RPM_REFUSAL = 'route_rpm_budget_exhausted';
export const ROUTE_TPM_REFUSAL = 'route_tpm_budget_exhausted';

export type RouteRateRefusal = typeof ROUTE_RPM_REFUSAL | typeof ROUTE_TPM_REFUSAL;

export interface RouteRateLimit {
  readonly requestsPerMinute?: number;
  readonly tokensPerMinute?: number;
}

export interface RouteRateLimitPolicy {
  readonly windowMs: number;
  readonly defaults: RouteRateLimit;
  readonly byProvider: Readonly<Record<string, RouteRateLimit>>;
  readonly byRoute: Readonly<Record<string, RouteRateLimit>>;
}

const MINUTE_MS = 60_000;
const KEY_SEPARATOR = ':';
const ROUTE_RATE_KEY_PREFIX = 'agi-rrate:events';
const EVENT_TTL_BUFFER_SECONDS = 60;
const MS_PER_SECOND = 1_000;
const EVENTS_RANGE_MIN = 0;
const EVENTS_RANGE_MAX = Number.POSITIVE_INFINITY;
const NONCE_RADIX = 36;
const NONCE_START_INDEX = 2;
const EVENT_FIELD_NOW = 'nowMs';
const EVENT_FIELD_TOKENS = 'tokens';
const EVENT_FIELD_NONCE = 'nonce';

/**
 * The committed policy. Kept as a literal because the catalog file is not on an
 * export path any surface can import; the drift test is what keeps it honest.
 */
export const ROUTE_RATE_LIMIT_POLICY: RouteRateLimitPolicy = {
  windowMs: MINUTE_MS,
  defaults: { requestsPerMinute: 600, tokensPerMinute: 2_000_000 },
  byProvider: {},
  byRoute: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readCeiling(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : undefined;
}

function readLimit(raw: unknown): RouteRateLimit {
  if (!isRecord(raw)) return {};
  const requestsPerMinute = readCeiling(raw['requestsPerMinute']);
  const tokensPerMinute = readCeiling(raw['tokensPerMinute']);
  return {
    ...(requestsPerMinute === undefined ? {} : { requestsPerMinute }),
    ...(tokensPerMinute === undefined ? {} : { tokensPerMinute }),
  };
}

function readLimitMap(raw: unknown): Record<string, RouteRateLimit> {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, readLimit(value)]));
}

export function parseRouteRateLimitPolicy(raw: unknown): RouteRateLimitPolicy {
  const record = isRecord(raw) ? raw : {};
  return {
    windowMs: readCeiling(record['windowMs']) ?? MINUTE_MS,
    defaults: readLimit(record['defaults']),
    byProvider: readLimitMap(record['byProvider']),
    byRoute: readLimitMap(record['byRoute']),
  };
}

/**
 * Every way the authored policy would enforce nothing. An empty list means the
 * ceilings in the catalog are the ceilings this module applies.
 */
export function routeRateLimitPolicyProblems(raw: unknown): string[] {
  const problems: string[] = [];
  if (!isRecord(raw)) return ['the rate-limit policy is not an object'];
  if (raw['kind'] !== 'route_rate_limits') {
    problems.push(`rate-limit policy names kind ${String(raw['kind'])}`);
  }
  if (readCeiling(raw['windowMs']) === undefined) {
    problems.push('rate-limit policy has no positive windowMs');
  }
  const defaults = readLimit(raw['defaults']);
  if (defaults.requestsPerMinute === undefined && defaults.tokensPerMinute === undefined) {
    problems.push('rate-limit defaults set neither a request nor a token ceiling');
  }
  for (const scope of ['byProvider', 'byRoute'] as const) {
    const entries = raw[scope];
    if (entries !== undefined && !isRecord(entries)) {
      problems.push(`rate-limit ${scope} is not an object`);
      continue;
    }
    for (const [key, value] of Object.entries(isRecord(entries) ? entries : {})) {
      const limit = readLimit(value);
      if (limit.requestsPerMinute === undefined && limit.tokensPerMinute === undefined) {
        problems.push(`rate-limit ${scope} entry ${key} sets no ceiling`);
      }
    }
  }
  return problems;
}

export interface RouteRateKey {
  readonly provider: string;
  readonly modelKey: string;
}

export function routeRateLimitId(route: RouteRateKey): string {
  return `${route.provider}/${route.modelKey}`;
}

/**
 * Route first, provider second, defaults last. The narrower entry wins outright
 * rather than merging, so one override is the whole answer for that route.
 */
export function resolveRouteRateLimit(
  route: RouteRateKey,
  policy: RouteRateLimitPolicy = ROUTE_RATE_LIMIT_POLICY,
): RouteRateLimit {
  return (
    policy.byRoute[routeRateLimitId(route)] ?? policy.byProvider[route.provider] ?? policy.defaults
  );
}

export interface RouteRateEvent {
  readonly nowMs: number;
  readonly tokens: number;
}

export interface RouteRateBudget {
  readonly admitted: boolean;
  readonly refusal?: RouteRateRefusal;
  readonly retryAfterMs: number;
  readonly requestsInWindow: number;
  readonly tokensInWindow: number;
}

export interface RouteRateBudgetInput {
  readonly limit: RouteRateLimit;
  readonly events: readonly RouteRateEvent[];
  readonly nowMs: number;
  readonly windowMs?: number;
  /** Tokens this request is expected to spend, for the token ceiling. */
  readonly requestTokens?: number;
}

function retryAfter(
  events: readonly RouteRateEvent[],
  nowMs: number,
  windowMs: number,
  freeBy: number,
): number {
  const oldest = events[Math.max(0, freeBy - 1)];
  if (oldest === undefined) return windowMs;
  return Math.max(1, oldest.nowMs + windowMs - nowMs);
}

/**
 * Pure: the window is whatever the caller read, so the decision is testable
 * without a store and identical on every surface that holds the same events.
 */
export function evaluateRouteRateBudget(input: RouteRateBudgetInput): RouteRateBudget {
  const windowMs = input.windowMs ?? ROUTE_RATE_LIMIT_POLICY.windowMs;
  const requestTokens = Math.max(0, input.requestTokens ?? 0);
  const inWindow = input.events
    .filter((event) => event.nowMs > input.nowMs - windowMs)
    .sort((left, right) => left.nowMs - right.nowMs);
  const requestsInWindow = inWindow.length;
  const tokensInWindow = inWindow.reduce((total, event) => total + event.tokens, 0);

  const rpm = input.limit.requestsPerMinute;
  if (rpm !== undefined && requestsInWindow + 1 > rpm) {
    return {
      admitted: false,
      refusal: ROUTE_RPM_REFUSAL,
      retryAfterMs: retryAfter(inWindow, input.nowMs, windowMs, requestsInWindow + 1 - rpm),
      requestsInWindow,
      tokensInWindow,
    };
  }

  const tpm = input.limit.tokensPerMinute;
  if (tpm !== undefined && tokensInWindow + requestTokens > tpm) {
    return {
      admitted: false,
      refusal: ROUTE_TPM_REFUSAL,
      retryAfterMs: retryAfter(inWindow, input.nowMs, windowMs, 1),
      requestsInWindow,
      tokensInWindow,
    };
  }

  return { admitted: true, retryAfterMs: 0, requestsInWindow, tokensInWindow };
}

export function routeRateLimitKey(route: RouteRateKey): string {
  return [ROUTE_RATE_KEY_PREFIX, routeRateLimitId(route)].join(KEY_SEPARATOR);
}

function encodeRouteRateEvent(nowMs: number, tokens: number, nonce: string): string {
  return JSON.stringify({
    [EVENT_FIELD_NOW]: nowMs,
    [EVENT_FIELD_TOKENS]: tokens,
    [EVENT_FIELD_NONCE]: nonce,
  });
}

function parseRouteRateEvent(raw: unknown): RouteRateEvent | undefined {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!isRecord(parsed)) return undefined;
  const nowMs = parsed[EVENT_FIELD_NOW];
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return undefined;
  const tokens = parsed[EVENT_FIELD_TOKENS];
  return { nowMs, tokens: typeof tokens === 'number' && tokens > 0 ? tokens : 0 };
}

export function parseRouteRateEvents(raw: unknown): readonly RouteRateEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: RouteRateEvent[] = [];
  for (const entry of raw) {
    const event = parseRouteRateEvent(entry);
    if (event) events.push(event);
  }
  return events.sort((left, right) => left.nowMs - right.nowMs);
}

export interface RouteRateLimiterFailureEvent {
  readonly failure: RouteHealthStoreFailure;
  readonly routeId: string;
  readonly error?: unknown;
}

export interface RouteRateLimiterOptions {
  readonly store: RouteHealthKeyValueStore | null;
  readonly policy?: RouteRateLimitPolicy;
  readonly boundedRead?: <T>(read: Promise<T>) => Promise<T | null>;
  readonly onFailure?: (event: RouteRateLimiterFailureEvent) => void;
  readonly nonce?: () => string;
}

export interface RouteRateLimiter {
  readonly policy: RouteRateLimitPolicy;
  /** Reads the window and records the request when it is admitted. */
  admit(
    route: RouteRateKey,
    options?: { requestTokens?: number; nowMs?: number },
  ): Promise<RouteRateBudget>;
  budgets(
    routes: readonly RouteRateKey[],
    nowMs?: number,
  ): Promise<Readonly<Record<string, RouteRateBudget>>>;
}

function admittedBudget(): RouteRateBudget {
  return { admitted: true, retryAfterMs: 0, requestsInWindow: 0, tokensInWindow: 0 };
}

function defaultNonce(): string {
  return Math.random().toString(NONCE_RADIX).slice(NONCE_START_INDEX);
}

/**
 * Fails OPEN on every store problem, exactly as the breaker does: a ceiling that
 * cannot read its own window must not become the outage.
 */
export function createRouteRateLimiter(options: RouteRateLimiterOptions): RouteRateLimiter {
  const policy = options.policy ?? ROUTE_RATE_LIMIT_POLICY;
  const nonce = options.nonce ?? defaultNonce;
  const ttlSeconds = Math.ceil(policy.windowMs / MS_PER_SECOND) + EVENT_TTL_BUFFER_SECONDS;

  const report = (event: RouteRateLimiterFailureEvent): void => {
    options.onFailure?.(event);
  };

  const windows = async (
    routes: readonly RouteRateKey[],
    nowMs: number,
  ): Promise<Record<string, readonly RouteRateEvent[]> | null> => {
    const store = options.store;
    if (!store || routes.length === 0) {
      if (!store)
        report({ failure: 'store_unavailable', routeId: routes.map(routeRateLimitId).join(',') });
      return null;
    }
    try {
      const batch = store.batch();
      for (const route of routes) {
        batch.sortedRangeByScore(
          routeRateLimitKey(route),
          nowMs - policy.windowMs,
          EVENTS_RANGE_MAX,
        );
      }
      const exec = batch.exec();
      const read = options.boundedRead ? await options.boundedRead(exec) : await exec;
      if (read === null) {
        report({ failure: 'read_abandoned', routeId: routes.map(routeRateLimitId).join(',') });
        return null;
      }
      const results = read as unknown[];
      const byRoute: Record<string, readonly RouteRateEvent[]> = {};
      routes.forEach((route, index) => {
        byRoute[routeRateLimitId(route)] = parseRouteRateEvents(results[index]);
      });
      return byRoute;
    } catch (error) {
      report({
        failure: 'read_failed',
        routeId: routes.map(routeRateLimitId).join(','),
        error,
      });
      return null;
    }
  };

  return {
    policy,

    async budgets(routes, nowMs = Date.now()) {
      const read = await windows(routes, nowMs);
      const budgets: Record<string, RouteRateBudget> = {};
      for (const route of routes) {
        const routeId = routeRateLimitId(route);
        budgets[routeId] =
          read === null
            ? admittedBudget()
            : evaluateRouteRateBudget({
                limit: resolveRouteRateLimit(route, policy),
                events: read[routeId] ?? [],
                nowMs,
                windowMs: policy.windowMs,
              });
      }
      return budgets;
    },

    async admit(route, { requestTokens = 0, nowMs = Date.now() } = {}) {
      const store = options.store;
      const read = await windows([route], nowMs);
      if (read === null || !store) return admittedBudget();

      const budget = evaluateRouteRateBudget({
        limit: resolveRouteRateLimit(route, policy),
        events: read[routeRateLimitId(route)] ?? [],
        nowMs,
        windowMs: policy.windowMs,
        requestTokens,
      });
      if (!budget.admitted) return budget;

      const key = routeRateLimitKey(route);
      try {
        await store
          .batch()
          .sortedAdd(key, {
            score: nowMs,
            member: encodeRouteRateEvent(nowMs, requestTokens, nonce()),
          })
          .sortedRemoveByScore(key, EVENTS_RANGE_MIN, nowMs - policy.windowMs)
          .expire(key, ttlSeconds)
          .exec();
      } catch (error) {
        report({ failure: 'write_failed', routeId: routeRateLimitId(route), error });
      }
      return budget;
    },
  };
}
