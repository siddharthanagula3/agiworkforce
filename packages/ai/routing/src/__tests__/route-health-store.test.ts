import { describe, expect, it } from 'vitest';

import {
  buildRouteHealthSnapshot,
  createRouteHealthStore,
  DEFAULT_ROUTE_HEALTH_CONFIG,
  isRouteBreakerOpen,
  isRouteHealthDegraded,
  resolveCredentialCooldownConfig,
  resolveModelLockoutConfig,
  resolveRouteHealthConfig,
  resolveRouteHealthConfigForScope,
  routeBreakerState,
  routeBreakerStateWithDegradeBand,
  routeHealthEventsKey,
  ROUTE_BREAKER_CONSECUTIVE_FAILURES_ENV,
  ROUTE_BREAKER_COOLDOWN_ENV,
  ROUTE_BREAKER_FAILURE_RATE_ENV,
  ROUTE_BREAKER_MAX_COOLDOWN_ENV,
  ROUTE_BREAKER_MIN_SAMPLES_ENV,
  ROUTE_HEALTH_TRIP_WINDOW_ENV,
  ROUTE_HEALTH_WINDOW_ENV,
  MODEL_LOCKOUT_CONSECUTIVE_FAILURES_ENV,
  CREDENTIAL_COOLDOWN_CONSECUTIVE_FAILURES_ENV,
  type RouteHealthKeyValueBatch,
  type RouteHealthKeyValueStore,
  type RouteHealthStoreFailureEvent,
  type RouteOutcomeEvent,
} from '../route-health-store';
import type { RouteOutcomeClass } from '../runtime-state';

const ROUTE_ID = 'provider-alpha/model-alpha';
const PROVIDER_ID = 'provider-alpha';
const CREDENTIAL_ID = 'provider-alpha';
const NOW = 1_700_000_000_000;

function events(classes: readonly RouteOutcomeClass[], startMs = NOW): RouteOutcomeEvent[] {
  return classes.map((outcomeClass, index) => ({
    nowMs: startMs + index,
    class: outcomeClass,
  }));
}

/**
 * Sorted-set semantics only, which is the whole of what this module asks a
 * store for. `apps/web` proves the real port satisfies the same slice.
 */
function createFakeStore(): RouteHealthKeyValueStore {
  const sets = new Map<string, { score: number; member: string }[]>();
  return {
    batch(): RouteHealthKeyValueBatch {
      const queued: (() => unknown)[] = [];
      const batch: RouteHealthKeyValueBatch = {
        sortedAdd(key, entry) {
          queued.push(() => {
            const entries = sets.get(key) ?? [];
            entries.push(entry);
            sets.set(key, entries);
          });
          return batch;
        },
        sortedRemoveByScore(key, minScore, maxScore) {
          queued.push(() => {
            sets.set(
              key,
              (sets.get(key) ?? []).filter(
                (entry) => entry.score < minScore || entry.score > maxScore,
              ),
            );
          });
          return batch;
        },
        sortedRangeByScore(key, minScore, maxScore) {
          queued.push(() =>
            (sets.get(key) ?? [])
              .filter((entry) => entry.score >= minScore && entry.score <= maxScore)
              .sort((left, right) => left.score - right.score)
              .map((entry) => entry.member),
          );
          return batch;
        },
        expire() {
          queued.push(() => undefined);
          return batch;
        },
        exec: async () => queued.map((run) => run()),
      };
      return batch;
    },
  };
}

function store(overrides: Partial<Parameters<typeof createRouteHealthStore>[0]> = {}) {
  const failures: RouteHealthStoreFailureEvent[] = [];
  const memory = createFakeStore();
  const health = createRouteHealthStore({
    store: memory,
    onFailure: (event) => failures.push(event),
    ...overrides,
  });
  return { failures, memory, health };
}

describe('route health key shape', () => {
  it('keeps the key the free lane already writes for route scope', () => {
    expect(routeHealthEventsKey('route', ROUTE_ID)).toBe(`agi-rhealth:events:${ROUTE_ID}`);
  });

  it('gives the provider breaker its own namespace, distinct from the old shared one', () => {
    expect(routeHealthEventsKey('provider', PROVIDER_ID)).toBe(
      `agi-rhealth:provider:${PROVIDER_ID}`,
    );
  });

  it('gives the credential cooldown its own namespace, distinct from the provider breaker', () => {
    expect(routeHealthEventsKey('credential', CREDENTIAL_ID)).toBe(
      `agi-rhealth:credential-cooldown:${CREDENTIAL_ID}`,
    );
    expect(routeHealthEventsKey('credential', CREDENTIAL_ID)).not.toBe(
      routeHealthEventsKey('provider', PROVIDER_ID),
    );
  });

  it('puts shadow observations somewhere route ranking cannot read them', () => {
    expect(routeHealthEventsKey('shadow', ROUTE_ID)).toBe(`agi-rhealth:shadow:${ROUTE_ID}`);
    expect(routeHealthEventsKey('shadow', ROUTE_ID)).not.toBe(
      routeHealthEventsKey('route', ROUTE_ID),
    );
  });
});

describe('shadow observations', () => {
  it('records a mirrored failure without touching the route the ranker reads', async () => {
    const { health } = store();
    await health.recordOutcome('shadow', ROUTE_ID, { class: 'server_error' }, NOW);
    await health.recordOutcome('shadow', ROUTE_ID, { class: 'server_error' }, NOW + 1);
    await health.recordOutcome('shadow', ROUTE_ID, { class: 'server_error' }, NOW + 2);

    const routeSnapshots = await health.snapshots('route', [ROUTE_ID], NOW + 3);
    expect(routeSnapshots[ROUTE_ID]).toMatchObject({ available: true, sampleCount: 0 });
  });

  it('reads back on its own scope, so a mirror is still measurable', async () => {
    const { health } = store();
    await health.recordOutcome('shadow', ROUTE_ID, { class: 'success', ttftMs: 100 }, NOW);

    const shadowSnapshots = await health.snapshots('shadow', [ROUTE_ID], NOW + 1);
    expect(shadowSnapshots[ROUTE_ID]).toMatchObject({ sampleCount: 1, successRate: 1 });
  });
});

describe('snapshot construction', () => {
  it('reads healthy with no events', () => {
    const snapshot = buildRouteHealthSnapshot([], NOW);
    expect(snapshot).toEqual({
      available: true,
      halfOpen: false,
      consecutiveFailures: 0,
      sampleCount: 0,
    });
    expect(routeBreakerState(snapshot)).toBe('closed');
  });

  it('trips on the consecutive failure threshold and reports a cooldown', () => {
    const snapshot = buildRouteHealthSnapshot(
      events(['server_error', 'server_error', 'server_error']),
      NOW,
    );
    expect(snapshot.available).toBe(false);
    expect(snapshot.consecutiveFailures).toBe(
      DEFAULT_ROUTE_HEALTH_CONFIG.consecutiveFailureThreshold,
    );
    expect(snapshot.cooldownUntilMs).toBeGreaterThan(NOW);
    expect(routeBreakerState(snapshot)).toBe('open');
    expect(isRouteBreakerOpen(snapshot)).toBe(true);
  });

  it('half-opens once the cooldown has elapsed', () => {
    const raw = events(['timeout', 'timeout', 'timeout']);
    const tripped = buildRouteHealthSnapshot(raw, NOW);
    const probing = buildRouteHealthSnapshot(raw, tripped.cooldownUntilMs ?? NOW);
    expect(probing.available).toBe(true);
    expect(probing.halfOpen).toBe(true);
    expect(routeBreakerState(probing)).toBe('half_open');
  });

  it('closes again after a success even inside the window', () => {
    const snapshot = buildRouteHealthSnapshot(
      events(['server_error', 'server_error', 'server_error', 'success']),
      NOW,
    );
    expect(snapshot.available).toBe(true);
    expect(snapshot.halfOpen).toBe(false);
    expect(snapshot.consecutiveFailures).toBe(0);
    expect(routeBreakerState(snapshot)).toBe('closed');
  });

  it('trips on the failure rate once the sample floor is met', () => {
    const snapshot = buildRouteHealthSnapshot(
      events(['success', 'rate_limit', 'success', 'rate_limit', 'rate_limit']),
      NOW,
    );
    expect(snapshot.available).toBe(false);
    expect(snapshot.sampleCount).toBe(5);
    expect(snapshot.rateLimitRate).toBeCloseTo(0.6);
  });

  it('never counts a capability refusal against the route', () => {
    const snapshot = buildRouteHealthSnapshot(
      events([
        'unsupported_capability',
        'unsupported_capability',
        'unsupported_capability',
        'unsupported_capability',
      ]),
      NOW,
    );
    expect(snapshot.available).toBe(true);
    expect(snapshot.sampleCount).toBe(0);
  });

  it('reports latency percentiles and throughput when the events carry them', () => {
    const snapshot = buildRouteHealthSnapshot(
      [
        { nowMs: NOW, class: 'success', ttftMs: 100, durationMs: 1_000, outputTokens: 50 },
        { nowMs: NOW + 1, class: 'success', ttftMs: 900, durationMs: 1_000, outputTokens: 150 },
      ],
      NOW + 2,
    );
    expect(snapshot.ttftP50Ms).toBe(100);
    expect(snapshot.ttftP95Ms).toBe(900);
    expect(snapshot.throughputTokensPerSecond).toBeCloseTo(100);
  });
});

describe('degrade band', () => {
  it('marks a closed breaker degraded once consecutive failures cross the band, without blocking it', () => {
    const snapshot = buildRouteHealthSnapshot(events(['server_error', 'server_error']), NOW);
    expect(snapshot.available).toBe(true);
    expect(routeBreakerStateWithDegradeBand(snapshot, 2)).toBe('degraded');
    expect(isRouteHealthDegraded(snapshot, 2)).toBe(true);
  });

  it('never reports degraded once the breaker has actually opened', () => {
    const snapshot = buildRouteHealthSnapshot(
      events(['server_error', 'server_error', 'server_error']),
      NOW,
    );
    expect(snapshot.available).toBe(false);
    expect(routeBreakerStateWithDegradeBand(snapshot, 1)).toBe('open');
    expect(isRouteHealthDegraded(snapshot, 1)).toBe(false);
  });

  it('stays closed below the degrade band', () => {
    const snapshot = buildRouteHealthSnapshot(events(['server_error']), NOW);
    expect(routeBreakerStateWithDegradeBand(snapshot, 5)).toBe('closed');
  });
});

describe('configuration', () => {
  it('defaults every threshold when nothing is set', () => {
    expect(resolveRouteHealthConfig({})).toEqual(DEFAULT_ROUTE_HEALTH_CONFIG);
  });

  it('reads every threshold from its documented env name', () => {
    expect(
      resolveRouteHealthConfig({
        [ROUTE_HEALTH_WINDOW_ENV]: '60000',
        [ROUTE_HEALTH_TRIP_WINDOW_ENV]: '10000',
        [ROUTE_BREAKER_CONSECUTIVE_FAILURES_ENV]: '7',
        [ROUTE_BREAKER_FAILURE_RATE_ENV]: '0.25',
        [ROUTE_BREAKER_MIN_SAMPLES_ENV]: '2',
        [ROUTE_BREAKER_COOLDOWN_ENV]: '5000',
        [ROUTE_BREAKER_MAX_COOLDOWN_ENV]: '20000',
      }),
    ).toEqual({
      observationWindowMs: 60_000,
      tripWindowMs: 10_000,
      consecutiveFailureThreshold: 7,
      failureRateThreshold: 0.25,
      minSamplesForRateTrip: 2,
      cooldownBaseMs: 5_000,
      cooldownMaxMs: 20_000,
    });
  });

  it('keeps the default rather than disabling the breaker on an unparseable value', () => {
    const config = resolveRouteHealthConfig({
      [ROUTE_BREAKER_CONSECUTIVE_FAILURES_ENV]: 'off',
      [ROUTE_BREAKER_FAILURE_RATE_ENV]: '4',
    });
    expect(config.consecutiveFailureThreshold).toBe(
      DEFAULT_ROUTE_HEALTH_CONFIG.consecutiveFailureThreshold,
    );
    expect(config.failureRateThreshold).toBe(DEFAULT_ROUTE_HEALTH_CONFIG.failureRateThreshold);
  });

  it('gives the model lockout scope its own env names, independent of the provider breaker', () => {
    const config = resolveModelLockoutConfig({
      [MODEL_LOCKOUT_CONSECUTIVE_FAILURES_ENV]: '9',
      [ROUTE_BREAKER_CONSECUTIVE_FAILURES_ENV]: '1',
    });
    expect(config.consecutiveFailureThreshold).toBe(9);
  });

  it('gives the credential cooldown scope its own, faster-tripping defaults', () => {
    const config = resolveCredentialCooldownConfig({});
    expect(config.consecutiveFailureThreshold).toBeLessThan(
      DEFAULT_ROUTE_HEALTH_CONFIG.consecutiveFailureThreshold,
    );
    expect(config.cooldownBaseMs).toBeLessThan(DEFAULT_ROUTE_HEALTH_CONFIG.cooldownBaseMs);
  });

  it('reads the credential cooldown scope from its own documented env name', () => {
    const config = resolveCredentialCooldownConfig({
      [CREDENTIAL_COOLDOWN_CONSECUTIVE_FAILURES_ENV]: '4',
    });
    expect(config.consecutiveFailureThreshold).toBe(4);
  });

  it('routes each scope to its own resolver', () => {
    expect(resolveRouteHealthConfigForScope('provider', {})).toEqual(resolveRouteHealthConfig({}));
    expect(resolveRouteHealthConfigForScope('route', {})).toEqual(resolveModelLockoutConfig({}));
    expect(resolveRouteHealthConfigForScope('credential', {})).toEqual(
      resolveCredentialCooldownConfig({}),
    );
  });
});

describe('store over the key-value port', () => {
  it('remembers outcomes across reads for both scopes', async () => {
    const { health } = store();
    await health.recordOutcome('route', ROUTE_ID, { class: 'server_error' }, NOW);
    await health.recordOutcome('route', ROUTE_ID, { class: 'server_error' }, NOW + 1);
    await health.recordOutcome('route', ROUTE_ID, { class: 'server_error' }, NOW + 2);
    await health.recordOutcome('provider', PROVIDER_ID, { class: 'success' }, NOW);

    const routes = await health.snapshots('route', [ROUTE_ID], NOW + 3);
    const providers = await health.snapshots('provider', [PROVIDER_ID], NOW + 3);

    expect(routes[ROUTE_ID]?.available).toBe(false);
    expect(providers[PROVIDER_ID]?.available).toBe(true);
  });

  it('keeps route and provider memory separate', async () => {
    const { health } = store();
    for (let index = 0; index < 3; index += 1) {
      await health.recordOutcome('provider', PROVIDER_ID, { class: 'server_error' }, NOW + index);
    }
    const routes = await health.snapshots('route', [PROVIDER_ID], NOW + 3);
    const providers = await health.snapshots('provider', [PROVIDER_ID], NOW + 3);
    expect(routes[PROVIDER_ID]?.available).toBe(true);
    expect(providers[PROVIDER_ID]?.available).toBe(false);
  });

  it('keeps the credential cooldown scope separate from both route and provider', async () => {
    const { health } = store();
    for (let index = 0; index < 2; index += 1) {
      await health.recordOutcome('credential', CREDENTIAL_ID, { class: 'rate_limit' }, NOW + index);
    }
    const credentials = await health.snapshots('credential', [CREDENTIAL_ID], NOW + 2);
    const providers = await health.snapshots('provider', [CREDENTIAL_ID], NOW + 2);
    expect(credentials[CREDENTIAL_ID]?.available).toBe(false);
    expect(providers[CREDENTIAL_ID]?.available).toBe(true);
  });

  it('applies a per-id config override for the same scope', async () => {
    const { health } = store({
      configFor: (scope, id) =>
        scope === 'provider' && id === PROVIDER_ID
          ? { ...DEFAULT_ROUTE_HEALTH_CONFIG, consecutiveFailureThreshold: 1 }
          : undefined,
    });
    await health.recordOutcome('provider', PROVIDER_ID, { class: 'server_error' }, NOW);
    const providers = await health.snapshots('provider', [PROVIDER_ID], NOW + 1);
    expect(providers[PROVIDER_ID]?.available).toBe(false);
  });

  it('drops events that fall out of the observation window', async () => {
    const { health } = store();
    const stale = NOW - DEFAULT_ROUTE_HEALTH_CONFIG.observationWindowMs * 2;
    await health.recordOutcome('route', ROUTE_ID, { class: 'server_error' }, stale);
    const snapshots = await health.snapshots('route', [ROUTE_ID], NOW);
    expect(snapshots[ROUTE_ID]?.sampleCount).toBe(0);
  });

  it('fails open and reports once when there is no store', async () => {
    const { health, failures } = store({ store: null });
    await health.recordOutcome('route', ROUTE_ID, { class: 'server_error' }, NOW);
    const snapshots = await health.snapshots('route', [ROUTE_ID], NOW);
    expect(snapshots[ROUTE_ID]?.available).toBe(true);
    expect(failures.map((failure) => failure.failure)).toEqual([
      'store_unavailable',
      'store_unavailable',
    ]);
  });

  it('fails open and reports when the read outlives its budget', async () => {
    const { health, failures } = store({ boundedRead: async () => null });
    const snapshots = await health.snapshots('route', [ROUTE_ID], NOW);
    expect(snapshots[ROUTE_ID]?.available).toBe(true);
    expect(failures[0]?.failure).toBe('read_abandoned');
  });

  it('fails open and reports when the read throws', async () => {
    const failures: RouteHealthStoreFailureEvent[] = [];
    const health = createRouteHealthStore({
      store: {
        batch: () => {
          throw new Error('store is down');
        },
      },
      onFailure: (event) => failures.push(event),
    });
    const snapshots = await health.snapshots('route', [ROUTE_ID], NOW);
    expect(snapshots[ROUTE_ID]?.available).toBe(true);
    expect(failures[0]?.failure).toBe('read_failed');
  });
});
