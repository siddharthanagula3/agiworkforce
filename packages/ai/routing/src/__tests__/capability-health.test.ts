import { describe, expect, it } from 'vitest';

import {
  buildCapabilityHealthSnapshot,
  capabilityHealthEventsKey,
  createCapabilityHealthStore,
  DEFAULT_CAPABILITY_HEALTH_CONFIG,
  resolveCapabilityHealthConfig,
  unhonouredCapabilitiesByRoute,
  CAPABILITY_HEALTH_MISS_THRESHOLD_ENV,
  CAPABILITY_HEALTH_WINDOW_ENV,
  type CapabilityHealthKey,
  type CapabilityHealthStoreFailureEvent,
  type CapabilityObservationEvent,
  type ObservedCapability,
} from '../capability-health';
import type { RouteHealthKeyValueBatch, RouteHealthKeyValueStore } from '../route-health-store';

const ROUTE_ID = 'provider-alpha/model-alpha';
const HEALTHY_ROUTE_ID = 'provider-beta/model-beta';
const TOOLS: ObservedCapability = 'functionCalling';
const STRUCTURED: ObservedCapability = 'structuredOutput';
const NOW = 1_700_000_000_000;
const THRESHOLD = DEFAULT_CAPABILITY_HEALTH_CONFIG.missThreshold;
const WINDOW_MS = DEFAULT_CAPABILITY_HEALTH_CONFIG.observationWindowMs;

const toolsKey: CapabilityHealthKey = { routeId: ROUTE_ID, capability: TOOLS };
const healthyToolsKey: CapabilityHealthKey = { routeId: HEALTHY_ROUTE_ID, capability: TOOLS };

function observations(honoured: readonly boolean[], startMs = NOW): CapabilityObservationEvent[] {
  return honoured.map((value, index) => ({ nowMs: startMs + index, honoured: value }));
}

type FakeBacking = Map<string, { score: number; member: string }[]>;

function createFakeStore(sets: FakeBacking = new Map()): RouteHealthKeyValueStore {
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

function throwingStore(): RouteHealthKeyValueStore {
  return {
    batch(): RouteHealthKeyValueBatch {
      const batch: RouteHealthKeyValueBatch = {
        sortedAdd: () => batch,
        sortedRemoveByScore: () => batch,
        sortedRangeByScore: () => batch,
        expire: () => batch,
        exec: async () => {
          throw new Error('key value store is down');
        },
      };
      return batch;
    },
  };
}

describe('capability health config', () => {
  it('defaults when the environment says nothing', () => {
    expect(resolveCapabilityHealthConfig({})).toEqual(DEFAULT_CAPABILITY_HEALTH_CONFIG);
  });

  it('reads the operator-tunable window and threshold', () => {
    expect(
      resolveCapabilityHealthConfig({
        [CAPABILITY_HEALTH_WINDOW_ENV]: '60000',
        [CAPABILITY_HEALTH_MISS_THRESHOLD_ENV]: '5',
      }),
    ).toEqual({ observationWindowMs: 60_000, missThreshold: 5 });
  });

  it('keeps the default rather than disabling the signal on an unparseable value', () => {
    expect(
      resolveCapabilityHealthConfig({
        [CAPABILITY_HEALTH_WINDOW_ENV]: 'soon',
        [CAPABILITY_HEALTH_MISS_THRESHOLD_ENV]: '0',
      }),
    ).toEqual(DEFAULT_CAPABILITY_HEALTH_CONFIG);
  });
});

describe('capability health snapshot', () => {
  it('reads honoured when nothing has been observed', () => {
    expect(buildCapabilityHealthSnapshot([], NOW)).toEqual({
      honoured: true,
      missCount: 0,
      sampleCount: 0,
    });
  });

  it('stays honoured below the miss threshold', () => {
    const snapshot = buildCapabilityHealthSnapshot(
      observations(Array.from({ length: THRESHOLD - 1 }, () => false)),
      NOW,
    );
    expect(snapshot.honoured).toBe(true);
    expect(snapshot.missCount).toBe(THRESHOLD - 1);
  });

  it('goes suspect at the miss threshold', () => {
    const snapshot = buildCapabilityHealthSnapshot(
      observations(Array.from({ length: THRESHOLD }, () => false)),
      NOW,
    );
    expect(snapshot.honoured).toBe(false);
    expect(snapshot.missCount).toBe(THRESHOLD);
    expect(snapshot.sampleCount).toBe(THRESHOLD);
  });

  it('recovers on the next honoured turn rather than waiting out the window', () => {
    const misses = Array.from({ length: THRESHOLD }, () => false);
    expect(buildCapabilityHealthSnapshot(observations([...misses, true]), NOW).honoured).toBe(true);
  });

  it('forgets misses that aged out of the window', () => {
    const stale = observations(
      Array.from({ length: THRESHOLD }, () => false),
      NOW - WINDOW_MS * 2,
    );
    expect(buildCapabilityHealthSnapshot(stale, NOW)).toEqual({
      honoured: true,
      missCount: 0,
      sampleCount: 0,
    });
  });
});

describe('unhonoured capabilities projection', () => {
  it('yields no entry for a route with no evidence', () => {
    expect(
      unhonouredCapabilitiesByRoute({
        [HEALTHY_ROUTE_ID]: { [TOOLS]: buildCapabilityHealthSnapshot([], NOW) },
      }),
    ).toEqual({});
  });

  it('names every capability a route stopped honouring', () => {
    const suspect = buildCapabilityHealthSnapshot(
      observations(Array.from({ length: THRESHOLD }, () => false)),
      NOW,
    );
    expect(
      unhonouredCapabilitiesByRoute({
        [ROUTE_ID]: { [TOOLS]: suspect, [STRUCTURED]: suspect },
      }),
    ).toEqual({ [ROUTE_ID]: [TOOLS, STRUCTURED].sort() });
  });
});

describe('capability health store', () => {
  it('keys events by route and capability so one loss does not shadow the other', () => {
    expect(capabilityHealthEventsKey(toolsKey)).not.toBe(
      capabilityHealthEventsKey({ routeId: ROUTE_ID, capability: STRUCTURED }),
    );
  });

  it('records honoured turns as well as misses', async () => {
    const store = createCapabilityHealthStore({ store: createFakeStore() });
    await store.recordObservation(toolsKey, true, NOW);
    const byRoute = await store.snapshots([toolsKey], NOW);
    expect(byRoute[ROUTE_ID]?.[TOOLS]).toMatchObject({ honoured: true, sampleCount: 1 });
  });

  it('ranks a route below a healthy one after three misses, read from another session', async () => {
    const backing: FakeBacking = new Map();
    const writer = createCapabilityHealthStore({ store: createFakeStore(backing) });
    for (let index = 0; index < THRESHOLD; index += 1) {
      await writer.recordObservation(toolsKey, false, NOW + index);
    }
    await writer.recordObservation(healthyToolsKey, true, NOW);

    const reader = createCapabilityHealthStore({ store: createFakeStore(backing) });
    const byRoute = await reader.snapshots([toolsKey, healthyToolsKey], NOW + THRESHOLD);

    expect(byRoute[ROUTE_ID]?.[TOOLS]?.honoured).toBe(false);
    expect(byRoute[ROUTE_ID]?.[TOOLS]?.missCount).toBe(THRESHOLD);
    expect(byRoute[HEALTHY_ROUTE_ID]?.[TOOLS]?.honoured).toBe(true);
    expect(unhonouredCapabilitiesByRoute(byRoute)).toEqual({ [ROUTE_ID]: [TOOLS] });
  });

  it('fails open and reports once when the store has no backend', async () => {
    const failures: CapabilityHealthStoreFailureEvent[] = [];
    const store = createCapabilityHealthStore({
      store: null,
      onFailure: (event) => failures.push(event),
    });
    await store.recordObservation(toolsKey, false, NOW);
    const byRoute = await store.snapshots([toolsKey], NOW);
    expect(byRoute[ROUTE_ID]?.[TOOLS]?.honoured).toBe(true);
    expect(failures.map((event) => event.failure)).toEqual([
      'store_unavailable',
      'store_unavailable',
    ]);
  });

  it('fails open when the read throws', async () => {
    const failures: CapabilityHealthStoreFailureEvent[] = [];
    const store = createCapabilityHealthStore({
      store: throwingStore(),
      onFailure: (event) => failures.push(event),
    });
    const byRoute = await store.snapshots([toolsKey], NOW);
    expect(byRoute[ROUTE_ID]?.[TOOLS]?.honoured).toBe(true);
    expect(failures[0]?.failure).toBe('read_failed');
  });

  it('fails open when the read outlives the caller budget', async () => {
    const failures: CapabilityHealthStoreFailureEvent[] = [];
    const store = createCapabilityHealthStore({
      store: createFakeStore(),
      boundedRead: async () => null,
      onFailure: (event) => failures.push(event),
    });
    const byRoute = await store.snapshots([toolsKey], NOW);
    expect(byRoute[ROUTE_ID]?.[TOOLS]?.honoured).toBe(true);
    expect(failures[0]?.failure).toBe('read_abandoned');
  });
});
