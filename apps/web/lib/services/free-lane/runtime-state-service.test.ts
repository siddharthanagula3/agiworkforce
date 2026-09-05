import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveFreeAutoRoute, type FreeAutoCandidate } from '@agiworkforce/routing';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

let redisClient: FakeRedis | null = null;
vi.mock('@/lib/server/key-value', () => ({
  getKeyValueStore: () =>
    redisClient ? createUpstashKeyValueStore(redisClient as unknown as UpstashRedisLike) : null,
}));

import { createUpstashKeyValueStore, type UpstashRedisLike } from '@agiworkforce/key-value';

import {
  classifyFreeLaneFailure,
  getFreeLaneRuntimeState,
  getRouteHealthSnapshot,
  getServedRouteAffinity,
  recordFreeLaneRouteFailure,
  recordFreeLaneRouteSuccess,
  recordFreeLaneUsage,
  recordRouteOutcome,
  recordServedRouteAffinity,
  resetFreeLaneRuntimeStateCache,
  resetRouteHealthSnapshotCache,
  routeAffinityTtlMs,
} from './runtime-state-service';
import type { FreePoolEntry, FreePoolsDocument } from '@/lib/server/free-pools';

const ROUTE_ID = 'free-alpha/model-large';
const POOL_ID = 'free-alpha-pool';
const PROVIDER = 'free-alpha';
const NOW_MS = Date.UTC(2026, 8, 1, 12, 30);
const DAY_START_MS = Date.UTC(2026, 8, 1);
const DAY_END_MS = Date.UTC(2026, 8, 2);
const HOUR_MS = 60 * 60 * 1000;
const POOL_LIMIT = 1000;
const HEALTH_ROUTE_ID = 'any-provider/model-y';
const MINUTE_MS = 60_000;

type PipelineOp = { command: string; args: unknown[] };

/**
 * Enough Upstash surface to exercise the read and write paths, and no more.
 *
 * `results` is what `pipeline.exec()` hands back, positionally: the assembler's
 * correctness depends on it reading the pipeline back in the order it queued it,
 * which a map-shaped fake would hide.
 */
class FakeRedis {
  ops: PipelineOp[] = [];
  execResults: unknown[] = [];
  hashes = new Map<string, Record<string, unknown>>();
  sortedSets = new Map<string, Map<string, number>>();
  failOnExec = false;
  failOnHgetall = false;

  pipeline() {
    const queued: PipelineOp[] = [];
    const record =
      (command: string) =>
      (...args: unknown[]) => {
        queued.push({ command, args });
        this.ops.push({ command, args });
      };
    return {
      get: record('get'),
      hgetall: record('hgetall'),
      incr: record('incr'),
      incrby: record('incrby'),
      set: record('set'),
      pexpireat: record('pexpireat'),
      pexpire: record('pexpire'),
      hset: record('hset'),
      expire: record('expire'),
      zadd: record('zadd'),
      zrange: record('zrange'),
      zremrangebyscore: record('zremrangebyscore'),
      exec: async () => {
        if (this.failOnExec) throw new Error('upstash unavailable');
        let legacyIndex = 0;
        return queued.map((op) => {
          if (op.command === 'zadd') return this.applyZadd(op.args);
          if (op.command === 'zremrangebyscore') return this.applyZremrangebyscore(op.args);
          if (op.command === 'zrange') return this.applyZrange(op.args);
          const result = this.execResults[legacyIndex];
          legacyIndex += 1;
          return result;
        });
      },
    };
  }

  private setFor(key: string): Map<string, number> {
    const existing = this.sortedSets.get(key);
    if (existing) return existing;
    const created = new Map<string, number>();
    this.sortedSets.set(key, created);
    return created;
  }

  private applyZadd(args: unknown[]): number {
    const [key, entryArg] = args as [string, { score: number; member: string }];
    const set = this.setFor(key);
    const isNew = !set.has(entryArg.member);
    set.set(entryArg.member, entryArg.score);
    return isNew ? 1 : 0;
  }

  private applyZremrangebyscore(args: unknown[]): number {
    const [key, min, max] = args as [string, number, number];
    const set = this.sortedSets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const [member, score] of [...set.entries()]) {
      if (score >= min && score <= max) {
        set.delete(member);
        removed += 1;
      }
    }
    return removed;
  }

  private applyZrange(args: unknown[]): string[] {
    const [key, min, max] = args as [string, number, string | number];
    const set = this.sortedSets.get(key);
    if (!set) return [];
    const upper = max === '+inf' ? Number.POSITIVE_INFINITY : Number(max);
    return [...set.entries()]
      .filter(([, score]) => score >= min && score <= upper)
      .sort((a, b) => a[1] - b[1])
      .map(([member]) => member);
  }

  async hgetall(key: string): Promise<Record<string, unknown> | null> {
    if (this.failOnHgetall) throw new Error('upstash unavailable');
    return this.hashes.get(key) ?? null;
  }
}

function entry(overrides: Partial<FreePoolEntry> = {}): FreePoolEntry {
  return {
    routeId: ROUTE_ID,
    poolId: POOL_ID,
    terms: {
      commercialUseAllowed: true,
      thirdPartyServingAllowed: true,
      proxyingAllowed: true,
      promptsExcludedFromTraining: true,
    },
    evidenceUrl: 'https://example.invalid/terms',
    reviewedBy: 'founder',
    verifiedAtMs: NOW_MS - HOUR_MS,
    expiresAtMs: NOW_MS + HOUR_MS,
    window: 'day',
    limit: POOL_LIMIT,
    unit: 'requests',
    hardStopsBeforePaid: true,
    ...overrides,
  };
}

function document(entries: FreePoolEntry[] = [entry()]): FreePoolsDocument {
  return { schemaVersion: 1, workbook: 'docs/research/workbook.md', entries };
}

function candidate(routeId = ROUTE_ID): FreeAutoCandidate {
  return { routeId, modelKey: 'model-large', provider: PROVIDER, harnessId: 'free-alpha/chat' };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetFreeLaneRuntimeStateCache();
  resetRouteHealthSnapshotCache();
  redisClient = new FakeRedis();
});

describe('snapshot assembly', () => {
  it('reads the whole free-route set in one pipeline', async () => {
    redisClient!.execResults = [0, null, null];
    await getFreeLaneRuntimeState(NOW_MS, document());
    expect(redisClient!.ops.map((op) => op.command)).toEqual(['get', 'hgetall', 'hgetall']);
  });

  it('derives headroom from the pool counter and names the window reset', async () => {
    redisClient!.execResults = [250, null, null];
    const state = await getFreeLaneRuntimeState(NOW_MS, document());
    expect(state.quotaPools[POOL_ID]).toMatchObject({
      headroomFraction: 0.75,
      resetsAtMs: DAY_END_MS,
      hardStopsBeforePaid: true,
      routeIds: [ROUTE_ID],
    });
  });

  it('keys the counter on the window start, so a new day starts empty', async () => {
    redisClient!.execResults = [0, null, null];
    await getFreeLaneRuntimeState(NOW_MS, document());
    const [get] = redisClient!.ops;
    expect(get!.args[0]).toBe(`agi-fpool:${POOL_ID}:${DAY_START_MS}`);
  });

  it('clamps headroom at zero when the counter overshot the limit', async () => {
    redisClient!.execResults = [POOL_LIMIT * 2, null, null];
    const state = await getFreeLaneRuntimeState(NOW_MS, document());
    expect(state.quotaPools[POOL_ID]!.headroomFraction).toBe(0);
  });

  it('condemns a shared pool when any route on it says the pool bills overage', async () => {
    redisClient!.execResults = [0, null, null, null];
    const state = await getFreeLaneRuntimeState(
      NOW_MS,
      document([entry(), entry({ routeId: 'free-alpha/model-small', hardStopsBeforePaid: false })]),
    );
    expect(state.quotaPools[POOL_ID]!.hardStopsBeforePaid).toBe(false);
  });

  it('omits a pool denominated in a unit it cannot meter', async () => {
    redisClient!.execResults = [null, null];
    const state = await getFreeLaneRuntimeState(NOW_MS, document([entry({ unit: 'neurons' })]));
    expect(state.quotaPools).toEqual({});
    expect(state.freeEligibility[ROUTE_ID]).toBeDefined();
  });

  it('caches the snapshot for the cache window and re-reads after it', async () => {
    redisClient!.execResults = [0, null, null];
    await getFreeLaneRuntimeState(NOW_MS, document());
    const afterFirst = redisClient!.ops.length;
    await getFreeLaneRuntimeState(NOW_MS + 1_000, document());
    expect(redisClient!.ops.length).toBe(afterFirst);
    await getFreeLaneRuntimeState(NOW_MS + 6_000, document());
    expect(redisClient!.ops.length).toBeGreaterThan(afterFirst);
  });
});

describe('health snapshot', () => {
  it('parks a route whose recorded reason has not expired', async () => {
    redisClient!.execResults = [
      0,
      { reason: 'rate_limited', availableAtMs: String(NOW_MS + 30_000) },
      null,
    ];
    const state = await getFreeLaneRuntimeState(NOW_MS, document());
    expect(state.routeHealth[ROUTE_ID]).toMatchObject({
      available: false,
      reason: 'rate_limited',
      availableAtMs: NOW_MS + 30_000,
    });
  });

  it('releases a route once its parking window has passed', async () => {
    redisClient!.execResults = [
      0,
      { reason: 'rate_limited', availableAtMs: String(NOW_MS - 1), successRate: '0.5' },
      null,
    ];
    const state = await getFreeLaneRuntimeState(NOW_MS, document());
    expect(state.routeHealth[ROUTE_ID]).toMatchObject({ available: true, successRate: 0.5 });
    expect(state.routeHealth[ROUTE_ID]!.reason).toBeUndefined();
  });

  it('applies provider-level unavailability to the whole provider', async () => {
    redisClient!.execResults = [0, null, { reason: 'credential_invalid' }];
    const state = await getFreeLaneRuntimeState(NOW_MS, document());
    expect(state.providerHealth[PROVIDER]).toMatchObject({
      available: false,
      reason: 'credential_invalid',
    });
  });
});

/**
 * The invariant this whole lane exists to protect: when the state store cannot
 * answer, the answer is "no free capacity", never "serve it anyway".
 */
describe('fail-closed on an unusable state store', () => {
  it('yields no pools when the pipeline throws, so routing strands', async () => {
    redisClient!.failOnExec = true;
    const state = await getFreeLaneRuntimeState(NOW_MS, document());

    expect(state.quotaPools).toEqual({});
    expect(state.freeEligibility[ROUTE_ID]).toBeDefined();

    const decision = resolveFreeAutoRoute({
      candidates: [candidate()],
      state,
      nowMs: NOW_MS,
    });
    expect(decision.status).toBe('free_capacity_unavailable');
    expect(decision.rejected).toEqual([{ routeId: ROUTE_ID, reason: 'quota_pool_unknown' }]);
  });

  it('yields no pools when there is no client at all', async () => {
    redisClient = null;
    const state = await getFreeLaneRuntimeState(NOW_MS, document());
    expect(state.quotaPools).toEqual({});

    const decision = resolveFreeAutoRoute({ candidates: [candidate()], state, nowMs: NOW_MS });
    expect(decision.status).toBe('free_capacity_unavailable');
  });

  it('never reports a route as usable on an outage', async () => {
    redisClient!.failOnExec = true;
    const state = await getFreeLaneRuntimeState(NOW_MS, document());
    const decision = resolveFreeAutoRoute({ candidates: [candidate()], state, nowMs: NOW_MS });
    expect(decision.status).not.toBe('selected');
  });

  it('strands an unverified route as not-verified rather than assuming free', async () => {
    redisClient!.execResults = [];
    const state = await getFreeLaneRuntimeState(
      NOW_MS,
      document([entry({ verifiedAtMs: null, reviewedBy: null })]),
    );
    const decision = resolveFreeAutoRoute({ candidates: [candidate()], state, nowMs: NOW_MS });
    expect(decision.rejected).toEqual([{ routeId: ROUTE_ID, reason: 'not_verified_free' }]);
  });
});

/** Three different pieces of work for an operator, so three different reasons. */
describe('rejection attribution', () => {
  it('names a lapsed review as expired, not as unverified', async () => {
    redisClient!.execResults = [0, null, null];
    const state = await getFreeLaneRuntimeState(
      NOW_MS,
      document([entry({ expiresAtMs: NOW_MS - 1 })]),
    );
    const decision = resolveFreeAutoRoute({ candidates: [candidate()], state, nowMs: NOW_MS });
    expect(decision.rejected).toEqual([{ routeId: ROUTE_ID, reason: 'verification_expired' }]);
  });

  it('names a failed terms check as incompatible, not as unverified', async () => {
    redisClient!.execResults = [0, null, null];
    const state = await getFreeLaneRuntimeState(
      NOW_MS,
      document([
        entry({
          terms: {
            commercialUseAllowed: true,
            thirdPartyServingAllowed: true,
            proxyingAllowed: true,
            promptsExcludedFromTraining: false,
          },
        }),
      ]),
    );
    const decision = resolveFreeAutoRoute({ candidates: [candidate()], state, nowMs: NOW_MS });
    expect(decision.rejected).toEqual([{ routeId: ROUTE_ID, reason: 'terms_incompatible' }]);
  });

  it('never selects a route on a lapsed or terms-failing record', async () => {
    redisClient!.execResults = [0, null, null];
    for (const bad of [entry({ expiresAtMs: NOW_MS - 1 }), entry({ hardStopsBeforePaid: false })]) {
      resetFreeLaneRuntimeStateCache();
      const state = await getFreeLaneRuntimeState(NOW_MS, document([bad]));
      expect(resolveFreeAutoRoute({ candidates: [candidate()], state, nowMs: NOW_MS }).status).toBe(
        'free_capacity_unavailable',
      );
    }
  });
});

describe('classifyFreeLaneFailure', () => {
  it.each([
    ['rate_limit', 'rate_limited', 'route'],
    ['quota_exhausted', 'quota_exhausted', 'route'],
    ['server_overload', 'provider_unhealthy', 'route'],
    ['server_error', 'provider_unhealthy', 'route'],
    ['connection', 'provider_unhealthy', 'route'],
    ['api_timeout', 'provider_unhealthy', 'route'],
    ['capacity_off_switch', 'provider_unhealthy', 'route'],
    ['invalid_model', 'model_unavailable', 'route'],
    ['auth', 'credential_invalid', 'provider'],
    ['billing_exhausted', 'billing_exhausted', 'provider'],
  ])('maps %s to %s at %s scope', (category, reason, scope) => {
    expect(classifyFreeLaneFailure(category, 'some_code')).toEqual({
      kind: 'health',
      reason,
      scope,
    });
  });

  it('treats a tier rejection as a terms fact, never as health', () => {
    expect(classifyFreeLaneFailure('invalid_model', 'model_tier_restricted')).toEqual({
      kind: 'terms',
    });
  });

  it.each(['aborted', 'safety', 'context_overflow', 'invalid_input', 'unknown', 'made_up'])(
    'does not blame the route for %s',
    (category) => {
      expect(classifyFreeLaneFailure(category, 'code')).toEqual({ kind: 'ignored' });
    },
  );
});

describe('recording a settled turn', () => {
  it('charges one unit per turn against a request-metered pool', async () => {
    await recordFreeLaneUsage({
      routeId: ROUTE_ID,
      nowMs: NOW_MS,
      usage: { inputTokens: 900, outputTokens: 100 },
      document: document(),
    });
    const incr = redisClient!.ops.find((op) => op.command === 'incrby');
    expect(incr!.args).toEqual([`agi-fpool:${POOL_ID}:${DAY_START_MS}`, 1]);
  });

  it('charges the token total against a token-metered pool', async () => {
    await recordFreeLaneUsage({
      routeId: ROUTE_ID,
      nowMs: NOW_MS,
      usage: { inputTokens: 900, outputTokens: 100 },
      document: document([entry({ unit: 'tokens' })]),
    });
    const incr = redisClient!.ops.find((op) => op.command === 'incrby');
    expect(incr!.args[1]).toBe(1000);
  });

  it('expires the counter at the end of its window', async () => {
    await recordFreeLaneUsage({
      routeId: ROUTE_ID,
      nowMs: NOW_MS,
      usage: { inputTokens: 1, outputTokens: 1 },
      document: document(),
    });
    const expireAt = redisClient!.ops.find((op) => op.command === 'pexpireat');
    expect(expireAt!.args[1]).toBe(DAY_END_MS);
  });

  it('charges nothing for a route with no pool record', async () => {
    await recordFreeLaneUsage({
      routeId: 'paid-beta/model-paid',
      nowMs: NOW_MS,
      usage: { inputTokens: 10, outputTokens: 10 },
      document: document(),
    });
    expect(redisClient!.ops).toEqual([]);
  });
});

describe('recording route health', () => {
  it('clears the parking and the failure streak on a success', async () => {
    redisClient!.hashes.set(`agi-fhealth:route:${ROUTE_ID}`, {
      consecutiveFailures: '2',
      successRate: '0.5',
    });
    await recordFreeLaneRouteSuccess({ routeId: ROUTE_ID, nowMs: NOW_MS, latencyMs: 400 });
    const hset = redisClient!.ops.find((op) => op.command === 'hset');
    expect(hset!.args[1]).toMatchObject({ consecutiveFailures: 0, reason: '', availableAtMs: '' });
    expect((hset!.args[1] as Record<string, number>)['successRate']).toBeGreaterThan(0.5);
  });

  it('parks the route and honours an upstream retry-after', async () => {
    await recordFreeLaneRouteFailure({
      routeId: ROUTE_ID,
      provider: PROVIDER,
      nowMs: NOW_MS,
      category: 'rate_limit',
      code: 'rate_limit_429',
      retryAfterSeconds: 45,
      document: document(),
    });
    const hset = redisClient!.ops.find((op) => op.command === 'hset');
    expect(hset!.args[0]).toBe(`agi-fhealth:route:${ROUTE_ID}`);
    expect(hset!.args[1]).toMatchObject({
      reason: 'rate_limited',
      consecutiveFailures: 1,
      availableAtMs: NOW_MS + 45_000,
    });
  });

  it('opens the circuit once the failure streak reaches the threshold', async () => {
    redisClient!.hashes.set(`agi-fhealth:route:${ROUTE_ID}`, { consecutiveFailures: '2' });
    await recordFreeLaneRouteFailure({
      routeId: ROUTE_ID,
      provider: PROVIDER,
      nowMs: NOW_MS,
      category: 'server_error',
      code: 'server_error_500',
      document: document(),
    });
    const hset = redisClient!.ops.find((op) => op.command === 'hset');
    expect(hset!.args[1]).toMatchObject({ reason: 'circuit_open', consecutiveFailures: 3 });
  });

  it('condemns the credential, not the route, on an auth rejection', async () => {
    await recordFreeLaneRouteFailure({
      routeId: ROUTE_ID,
      provider: PROVIDER,
      nowMs: NOW_MS,
      category: 'auth',
      code: 'auth_401',
      document: document(),
    });
    const hset = redisClient!.ops.find((op) => op.command === 'hset');
    expect(hset!.args[0]).toBe(`agi-fhealth:provider:${PROVIDER}`);
  });

  it('believes an upstream quota refusal over our own counter', async () => {
    await recordFreeLaneRouteFailure({
      routeId: ROUTE_ID,
      provider: PROVIDER,
      nowMs: NOW_MS,
      category: 'quota_exhausted',
      code: 'insufficient_quota',
      document: document(),
    });
    const set = redisClient!.ops.find((op) => op.command === 'set');
    expect(set!.args).toEqual([`agi-fpool:${POOL_ID}:${DAY_START_MS}`, POOL_LIMIT]);
  });

  it('writes no health at all for a tier rejection', async () => {
    await recordFreeLaneRouteFailure({
      routeId: ROUTE_ID,
      provider: PROVIDER,
      nowMs: NOW_MS,
      category: 'invalid_model',
      code: 'model_tier_restricted',
      document: document(),
    });
    expect(redisClient!.ops).toEqual([]);
  });

  it('writes no health for a request-shaped failure', async () => {
    await recordFreeLaneRouteFailure({
      routeId: ROUTE_ID,
      provider: PROVIDER,
      nowMs: NOW_MS,
      category: 'safety',
      code: 'safety_refusal',
      document: document(),
    });
    expect(redisClient!.ops).toEqual([]);
  });
});

describe('generic route outcome recording', () => {
  it('opens the breaker after a named threshold of consecutive failures', async () => {
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'server_error' }, NOW_MS);
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'server_error' }, NOW_MS + 1000);
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'server_error' }, NOW_MS + 2000);
    const snapshot = await getRouteHealthSnapshot([HEALTH_ROUTE_ID], NOW_MS + 3000);
    expect(snapshot[HEALTH_ROUTE_ID]).toMatchObject({
      available: false,
      halfOpen: false,
      consecutiveFailures: 3,
    });
    expect(snapshot[HEALTH_ROUTE_ID]!.cooldownUntilMs).toBe(NOW_MS + 2000 + 30_000);
  });

  it('opens the breaker on a failure ratio without three consecutive failures', async () => {
    const classes: Array<'success' | 'rate_limit'> = [
      'success',
      'rate_limit',
      'success',
      'rate_limit',
      'rate_limit',
    ];
    for (const [index, outcomeClass] of classes.entries()) {
      await recordRouteOutcome(HEALTH_ROUTE_ID, { class: outcomeClass }, NOW_MS + index * 1000);
    }
    const snapshot = await getRouteHealthSnapshot([HEALTH_ROUTE_ID], NOW_MS + 5000);
    expect(snapshot[HEALTH_ROUTE_ID]).toMatchObject({ available: false, consecutiveFailures: 2 });
  });

  it('does not trip a failure ratio below the minimum sample count', async () => {
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'rate_limit' }, NOW_MS);
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'rate_limit' }, NOW_MS + 1000);
    const snapshot = await getRouteHealthSnapshot([HEALTH_ROUTE_ID], NOW_MS + 2000);
    expect(snapshot[HEALTH_ROUTE_ID]).toMatchObject({ available: true, consecutiveFailures: 2 });
  });

  it('allows a half-open probe once the cooldown elapses', async () => {
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'server_error' }, NOW_MS);
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'server_error' }, NOW_MS + 1000);
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'server_error' }, NOW_MS + 2000);

    const stillCoolingDown = await getRouteHealthSnapshot(
      [HEALTH_ROUTE_ID],
      NOW_MS + 2000 + 30_000 - 1,
    );
    expect(stillCoolingDown[HEALTH_ROUTE_ID]).toMatchObject({ available: false, halfOpen: false });

    resetRouteHealthSnapshotCache();
    const halfOpen = await getRouteHealthSnapshot([HEALTH_ROUTE_ID], NOW_MS + 2000 + 30_000);
    expect(halfOpen[HEALTH_ROUTE_ID]).toMatchObject({ available: true, halfOpen: true });
  });

  it('closes the breaker the moment the most recent outcome succeeds', async () => {
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'server_error' }, NOW_MS);
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'server_error' }, NOW_MS + 1000);
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'server_error' }, NOW_MS + 2000);
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'success' }, NOW_MS + 3000);

    const snapshot = await getRouteHealthSnapshot([HEALTH_ROUTE_ID], NOW_MS + 3000);
    expect(snapshot[HEALTH_ROUTE_ID]).toMatchObject({
      available: true,
      halfOpen: false,
      consecutiveFailures: 0,
    });
    expect(snapshot[HEALTH_ROUTE_ID]!.cooldownUntilMs).toBeUndefined();
  });

  it('computes per-class rates, ttft percentiles and throughput over the window', async () => {
    await recordRouteOutcome(
      HEALTH_ROUTE_ID,
      { class: 'success', ttftMs: 100, durationMs: 1000, outputTokens: 100 },
      NOW_MS,
    );
    await recordRouteOutcome(
      HEALTH_ROUTE_ID,
      { class: 'success', ttftMs: 200, durationMs: 1000, outputTokens: 100 },
      NOW_MS + 1000,
    );
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'timeout' }, NOW_MS + 2000);

    const snapshot = await getRouteHealthSnapshot([HEALTH_ROUTE_ID], NOW_MS + 2000);
    expect(snapshot[HEALTH_ROUTE_ID]).toMatchObject({
      sampleCount: 3,
      successRate: 2 / 3,
      timeoutRate: 1 / 3,
      ttftP50Ms: 100,
      ttftP95Ms: 200,
      throughputTokensPerSecond: 100,
    });
  });

  it('excludes an unsupported-capability outcome from the breaker and the sample count', async () => {
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'success' }, NOW_MS);
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'unsupported_capability' }, NOW_MS + 1000);
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'unsupported_capability' }, NOW_MS + 2000);

    const snapshot = await getRouteHealthSnapshot([HEALTH_ROUTE_ID], NOW_MS + 2000);
    expect(snapshot[HEALTH_ROUTE_ID]).toMatchObject({
      available: true,
      sampleCount: 1,
      consecutiveFailures: 0,
    });
  });

  it('caches the read for the short cache window and refreshes after it', async () => {
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'success' }, NOW_MS);
    await getRouteHealthSnapshot([HEALTH_ROUTE_ID], NOW_MS + 1000);
    const afterFirst = redisClient!.ops.filter((op) => op.command === 'zrange').length;
    await getRouteHealthSnapshot([HEALTH_ROUTE_ID], NOW_MS + 1500);
    expect(redisClient!.ops.filter((op) => op.command === 'zrange').length).toBe(afterFirst);
    await getRouteHealthSnapshot([HEALTH_ROUTE_ID], NOW_MS + 7000);
    expect(redisClient!.ops.filter((op) => op.command === 'zrange').length).toBeGreaterThan(
      afterFirst,
    );
  });

  it('fails open with no route reporting unhealthy when there is no client', async () => {
    redisClient = null;
    const snapshot = await getRouteHealthSnapshot([HEALTH_ROUTE_ID], NOW_MS);
    expect(snapshot[HEALTH_ROUTE_ID]).toEqual({
      available: true,
      halfOpen: false,
      consecutiveFailures: 0,
      sampleCount: 0,
    });
  });

  it('fails open when the pipeline read throws', async () => {
    redisClient!.failOnExec = true;
    const snapshot = await getRouteHealthSnapshot([HEALTH_ROUTE_ID], NOW_MS);
    expect(snapshot[HEALTH_ROUTE_ID]).toMatchObject({ available: true });
  });

  it('does not throw when the outcome write fails', async () => {
    redisClient!.failOnExec = true;
    await expect(
      recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'server_error' }, NOW_MS),
    ).resolves.toBeUndefined();
  });

  it('drops an event older than the reporting window from the snapshot', async () => {
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'server_error' }, NOW_MS);
    const snapshot = await getRouteHealthSnapshot([HEALTH_ROUTE_ID], NOW_MS + 30 * MINUTE_MS + 1);
    expect(snapshot[HEALTH_ROUTE_ID]).toEqual({
      available: true,
      halfOpen: false,
      consecutiveFailures: 0,
      sampleCount: 0,
    });
  });
});

const CONVERSATION_ID = 'conversation-42';
const AFFINITY_KEY = `agi-raffinity:${CONVERSATION_ID}`;

describe('route affinity TTL by cache class', () => {
  it('gives an explicit provider cache and a gateway prompt cache the same hour-long ceiling', () => {
    expect(routeAffinityTtlMs('provider_explicit_prompt_cache')).toBe(
      routeAffinityTtlMs('gateway_prompt_cache'),
    );
    expect(routeAffinityTtlMs('provider_explicit_prompt_cache')).toBeGreaterThan(
      routeAffinityTtlMs('provider_implicit_prompt_cache'),
    );
  });

  it('records no affinity worth pinning for a route with no cache', () => {
    expect(routeAffinityTtlMs('no_provider_cache')).toBe(0);
    expect(routeAffinityTtlMs(undefined)).toBe(0);
  });
});

describe('served route affinity', () => {
  it('writes the served route and upstream provider with the given TTL', async () => {
    const ttlMs = routeAffinityTtlMs('gateway_prompt_cache');
    await recordServedRouteAffinity({
      conversationId: CONVERSATION_ID,
      routeId: HEALTH_ROUTE_ID,
      ttlMs,
      upstreamProvider: 'deepinfra',
    });

    const hset = redisClient!.ops.find((op) => op.command === 'hset');
    expect(hset!.args).toEqual([
      AFFINITY_KEY,
      { routeId: HEALTH_ROUTE_ID, upstreamProvider: 'deepinfra' },
    ]);
    const pexpire = redisClient!.ops.find((op) => op.command === 'pexpire');
    expect(pexpire!.args).toEqual([AFFINITY_KEY, ttlMs]);
  });

  it('records nothing for a route whose cache class buys no affinity', async () => {
    await recordServedRouteAffinity({
      conversationId: CONVERSATION_ID,
      routeId: HEALTH_ROUTE_ID,
      ttlMs: routeAffinityTtlMs('no_provider_cache'),
    });

    expect(redisClient!.ops).toEqual([]);
  });

  it('reads back a recorded affinity', async () => {
    redisClient!.hashes.set(AFFINITY_KEY, {
      routeId: HEALTH_ROUTE_ID,
      upstreamProvider: 'bedrock',
    });

    const affinity = await getServedRouteAffinity(CONVERSATION_ID);

    expect(affinity).toEqual({ routeId: HEALTH_ROUTE_ID, upstreamProvider: 'bedrock' });
  });

  it('has no affinity for an unknown conversation', async () => {
    const affinity = await getServedRouteAffinity('never-seen-conversation');
    expect(affinity).toBeNull();
  });

  it('fails open on a read error', async () => {
    redisClient!.failOnHgetall = true;
    const affinity = await getServedRouteAffinity(CONVERSATION_ID);
    expect(affinity).toBeNull();
  });
});

describe('redis key scoping', () => {
  it('scopes a served route affinity write to its own conversation', async () => {
    const ttlMs = routeAffinityTtlMs('gateway_prompt_cache');
    await recordServedRouteAffinity({
      conversationId: 'conversation-a',
      routeId: HEALTH_ROUTE_ID,
      ttlMs,
    });
    await recordServedRouteAffinity({
      conversationId: 'conversation-b',
      routeId: HEALTH_ROUTE_ID,
      ttlMs,
    });

    const keys = redisClient!.ops.filter((op) => op.command === 'hset').map((op) => op.args[0]);
    expect(keys).toEqual(['agi-raffinity:conversation-a', 'agi-raffinity:conversation-b']);
  });

  it("never reads one conversation's affinity for another, even when pinned to the same route", async () => {
    redisClient!.hashes.set('agi-raffinity:conversation-a', { routeId: HEALTH_ROUTE_ID });
    expect(await getServedRouteAffinity('conversation-b')).toBeNull();
    expect(await getServedRouteAffinity('conversation-a')).toEqual({ routeId: HEALTH_ROUTE_ID });
  });

  it('keys the shared quota pool by pool id and window, deliberately not by conversation or user', async () => {
    await recordFreeLaneUsage({
      routeId: ROUTE_ID,
      nowMs: NOW_MS,
      usage: { inputTokens: 1, outputTokens: 1 },
      document: document(),
    });
    const incr = redisClient!.ops.find((op) => op.command === 'incrby');
    expect((incr!.args[0] as string).split(':')).toEqual([
      'agi-fpool',
      POOL_ID,
      String(DAY_START_MS),
    ]);
  });

  it('keys route and provider health by id alone, deliberately not by conversation or user', async () => {
    await recordFreeLaneRouteFailure({
      routeId: ROUTE_ID,
      provider: PROVIDER,
      nowMs: NOW_MS,
      category: 'rate_limit',
      code: 'rate_limit_429',
      retryAfterSeconds: 1,
      document: document(),
    });
    const hset = redisClient!.ops.find((op) => op.command === 'hset');
    expect((hset!.args[0] as string).split(':')).toEqual(['agi-fhealth', 'route', ROUTE_ID]);
  });

  it('keys route outcome events by route id alone, deliberately not by conversation or user', async () => {
    await recordRouteOutcome(HEALTH_ROUTE_ID, { class: 'success' }, NOW_MS);
    const zadd = redisClient!.ops.find((op) => op.command === 'zadd');
    expect(zadd!.args[0]).toBe(`agi-rhealth:events:${HEALTH_ROUTE_ID}`);
  });
});
