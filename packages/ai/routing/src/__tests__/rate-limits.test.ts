import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  createRouteRateLimiter,
  evaluateRouteRateBudget,
  parseRouteRateLimitPolicy,
  resolveRouteRateLimit,
  routeRateLimitId,
  routeRateLimitKey,
  routeRateLimitPolicyProblems,
  ROUTE_RATE_LIMIT_POLICY,
  ROUTE_RPM_REFUSAL,
  ROUTE_TPM_REFUSAL,
  type RouteRateEvent,
  type RouteRateLimitPolicy,
} from '../rate-limits';
import type { RouteHealthKeyValueBatch, RouteHealthKeyValueStore } from '../route-health-store';

const CATALOG_FILE = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'model-registry',
  'catalog',
  'routing-policies.json',
);

const authored = (JSON.parse(readFileSync(CATALOG_FILE, 'utf8')) as { rateLimits: unknown })
  .rateLimits;

const ROUTE = { provider: 'openai', modelKey: 'workhorse' };
const NOW = 1_800_000_000_000;

function events(count: number, tokens = 0, spacingMs = 100): RouteRateEvent[] {
  return [...Array(count).keys()].map((index) => ({
    nowMs: NOW - (count - index) * spacingMs,
    tokens,
  }));
}

/** A sorted-set store just real enough to exercise the window and the write. */
function fakeStore(seed: readonly RouteRateEvent[] = []): {
  store: RouteHealthKeyValueStore;
  members: Map<string, { score: number; member: string }[]>;
  writes: number;
} {
  const members = new Map<string, { score: number; member: string }[]>();
  members.set(
    routeRateLimitKey(ROUTE),
    seed.map((event) => ({
      score: event.nowMs,
      member: JSON.stringify({ nowMs: event.nowMs, tokens: event.tokens, nonce: 'seed' }),
    })),
  );
  const state = { writes: 0 };

  const store: RouteHealthKeyValueStore = {
    batch() {
      const reads: string[] = [];
      const results: unknown[] = [];
      const batch: RouteHealthKeyValueBatch = {
        sortedAdd(key, entry) {
          state.writes += 1;
          members.set(key, [...(members.get(key) ?? []), entry]);
          return batch;
        },
        sortedRemoveByScore(key, minScore, maxScore) {
          members.set(
            key,
            (members.get(key) ?? []).filter(
              (entry) => entry.score < minScore || entry.score > maxScore,
            ),
          );
          return batch;
        },
        sortedRangeByScore(key, minScore, maxScore) {
          reads.push(key);
          results.push(
            (members.get(key) ?? [])
              .filter((entry) => entry.score >= minScore && entry.score <= maxScore)
              .map((entry) => entry.member),
          );
          return batch;
        },
        expire() {
          return batch;
        },
        async exec() {
          return results;
        },
      };
      return batch;
    },
  };
  return { store, members, writes: state.writes };
}

describe('the authored rate-limit policy', () => {
  it('is well formed and is what the routing package serves', () => {
    expect(routeRateLimitPolicyProblems(authored)).toEqual([]);
    expect(parseRouteRateLimitPolicy(authored)).toEqual(ROUTE_RATE_LIMIT_POLICY);
  });

  it('names every way a policy would enforce nothing', () => {
    expect(routeRateLimitPolicyProblems({ kind: 'other', windowMs: 0, defaults: {} })).toEqual([
      'rate-limit policy names kind other',
      'rate-limit policy has no positive windowMs',
      'rate-limit defaults set neither a request nor a token ceiling',
    ]);
    expect(
      routeRateLimitPolicyProblems({
        kind: 'route_rate_limits',
        windowMs: 60_000,
        defaults: { requestsPerMinute: 10 },
        byRoute: { 'openai/x': {} },
      }),
    ).toEqual(['rate-limit byRoute entry openai/x sets no ceiling']);
  });
});

describe('resolveRouteRateLimit', () => {
  const policy: RouteRateLimitPolicy = {
    windowMs: 60_000,
    defaults: { requestsPerMinute: 100 },
    byProvider: { openai: { requestsPerMinute: 20 } },
    byRoute: { 'openai/workhorse': { requestsPerMinute: 3, tokensPerMinute: 900 } },
  };

  it('prefers the route entry, then the provider, then the defaults', () => {
    expect(resolveRouteRateLimit(ROUTE, policy)).toEqual({
      requestsPerMinute: 3,
      tokensPerMinute: 900,
    });
    expect(resolveRouteRateLimit({ provider: 'openai', modelKey: 'other' }, policy)).toEqual({
      requestsPerMinute: 20,
    });
    expect(resolveRouteRateLimit({ provider: 'elsewhere', modelKey: 'other' }, policy)).toEqual({
      requestsPerMinute: 100,
    });
  });

  it('keys a route by provider and model, so two models of one provider are separate', () => {
    expect(routeRateLimitId(ROUTE)).toBe('openai/workhorse');
    expect(routeRateLimitId({ provider: 'openai', modelKey: 'other' })).toBe('openai/other');
  });
});

describe('evaluateRouteRateBudget', () => {
  it('admits the Nth request of an RPM of N and refuses the N+1th by name', () => {
    const limit = { requestsPerMinute: 3 };

    expect(evaluateRouteRateBudget({ limit, events: events(2), nowMs: NOW }).admitted).toBe(true);

    const refused = evaluateRouteRateBudget({ limit, events: events(3), nowMs: NOW });
    expect(refused.admitted).toBe(false);
    expect(refused.refusal).toBe(ROUTE_RPM_REFUSAL);
    expect(refused.requestsInWindow).toBe(3);
    expect(refused.retryAfterMs).toBeGreaterThan(0);
  });

  it('forgets requests that fell out of the window', () => {
    const limit = { requestsPerMinute: 3 };
    const stale = events(3, 0, 40_000);

    expect(evaluateRouteRateBudget({ limit, events: stale, nowMs: NOW }).admitted).toBe(true);
  });

  it('refuses on the token ceiling before the provider ever sees the request', () => {
    const limit = { tokensPerMinute: 1_000 };
    const refused = evaluateRouteRateBudget({
      limit,
      events: events(2, 400),
      nowMs: NOW,
      requestTokens: 300,
    });

    expect(refused.admitted).toBe(false);
    expect(refused.refusal).toBe(ROUTE_TPM_REFUSAL);
    expect(refused.tokensInWindow).toBe(800);
  });

  it('admits everything when the route declares no ceiling', () => {
    expect(evaluateRouteRateBudget({ limit: {}, events: events(500), nowMs: NOW })).toMatchObject({
      admitted: true,
      retryAfterMs: 0,
    });
  });
});

describe('createRouteRateLimiter', () => {
  const policy: RouteRateLimitPolicy = {
    windowMs: 60_000,
    defaults: {},
    byProvider: {},
    byRoute: { 'openai/workhorse': { requestsPerMinute: 2 } },
  };

  it('rejects the N+1th request of an RPM of N without recording it', async () => {
    const fake = fakeStore();
    const limiter = createRouteRateLimiter({ store: fake.store, policy, nonce: () => 'n' });

    expect((await limiter.admit(ROUTE, { nowMs: NOW })).admitted).toBe(true);
    expect((await limiter.admit(ROUTE, { nowMs: NOW + 1 })).admitted).toBe(true);

    const refused = await limiter.admit(ROUTE, { nowMs: NOW + 2 });
    expect(refused.admitted).toBe(false);
    expect(refused.refusal).toBe(ROUTE_RPM_REFUSAL);
    expect(fake.members.get(routeRateLimitKey(ROUTE))).toHaveLength(2);
  });

  it('reports a budget per route without spending one', async () => {
    const fake = fakeStore(events(2));
    const limiter = createRouteRateLimiter({ store: fake.store, policy });

    const budgets = await limiter.budgets([ROUTE], NOW);

    expect(budgets['openai/workhorse']?.admitted).toBe(false);
    expect(fake.members.get(routeRateLimitKey(ROUTE))).toHaveLength(2);
  });

  it('fails open when the store is missing, and says so once', async () => {
    const failures: string[] = [];
    const limiter = createRouteRateLimiter({
      store: null,
      policy,
      onFailure: (event) => failures.push(event.failure),
    });

    expect((await limiter.admit(ROUTE, { nowMs: NOW })).admitted).toBe(true);
    expect(failures).toEqual(['store_unavailable']);
  });

  it('fails open when the read throws', async () => {
    const throwing: RouteHealthKeyValueStore = {
      batch() {
        throw new Error('store is down');
      },
    };
    const failures: string[] = [];
    const limiter = createRouteRateLimiter({
      store: throwing,
      policy,
      onFailure: (event) => failures.push(event.failure),
    });

    expect((await limiter.admit(ROUTE, { nowMs: NOW })).admitted).toBe(true);
    expect(failures).toEqual(['read_failed']);
  });
});
