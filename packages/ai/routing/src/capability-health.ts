/**
 * Whether a route still honours a capability its catalog entry declares.
 *
 * The declared flag stays the only thing that admits a route. This keyspace
 * records what the serving path actually observed, so a route that quietly
 * stopped honouring tool calls can be ranked below its healthy peers for the
 * requests that carry tools, without ever being parked and without diluting the
 * outcome rates every other request reads.
 *
 * The `route`, `provider` and `credential` scopes in `route-health-store.ts` all
 * feed a breaker whose trip parks a route, and `RouteOutcomeClass` has no member
 * that means "the model did not honour a tool call". So this is its own keyspace
 * over the same `KeyValueStore` port, with the same window, TTL and fail-open
 * discipline.
 *
 * @module routing/capability-health
 * @packageDocumentation
 */
import type { IntrinsicCapabilityName } from '@agiworkforce/model-registry';

import type { RouteHealthKeyValueStore, RouteHealthStoreFailure } from './route-health-store';

export type ObservedCapability = IntrinsicCapabilityName;

export const CAPABILITY_HEALTH_WINDOW_ENV = 'AGI_CAPABILITY_HEALTH_WINDOW_MS';
export const CAPABILITY_HEALTH_MISS_THRESHOLD_ENV = 'AGI_CAPABILITY_HEALTH_MISS_THRESHOLD';

const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTE_MS = SECONDS_PER_MINUTE * MS_PER_SECOND;
const OBSERVATION_WINDOW_MINUTES = 30;
const DEFAULT_MISS_THRESHOLD = 3;
const MINIMUM_WINDOW_MS = 1;
const MINIMUM_THRESHOLD = 1;
const EVENT_TTL_BUFFER_SECONDS = 60;
const EVENTS_RANGE_MIN = 0;
const EVENTS_RANGE_MAX = Number.POSITIVE_INFINITY;
const NONCE_RADIX = 36;
const NONCE_START_INDEX = 2;

const KEY_SEPARATOR = ':';
const CAPABILITY_KEY_SEPARATOR = '#';
const CAPABILITY_EVENTS_KEY_PREFIX = 'agi-caphealth:events';

const EVENT_FIELD_NOW = 'nowMs';
const EVENT_FIELD_HONOURED = 'honoured';
const EVENT_FIELD_NONCE = 'nonce';

export interface CapabilityHealthConfig {
  observationWindowMs: number;
  missThreshold: number;
}

export const DEFAULT_CAPABILITY_HEALTH_CONFIG: CapabilityHealthConfig = {
  observationWindowMs: OBSERVATION_WINDOW_MINUTES * MINUTE_MS,
  missThreshold: DEFAULT_MISS_THRESHOLD,
};

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function processEnvironment(): EnvironmentSource {
  return typeof process === 'undefined' ? {} : (process.env ?? {});
}

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

export function resolveCapabilityHealthConfig(
  environment: EnvironmentSource = processEnvironment(),
): CapabilityHealthConfig {
  return {
    observationWindowMs: readPositiveInteger(
      environment,
      CAPABILITY_HEALTH_WINDOW_ENV,
      DEFAULT_CAPABILITY_HEALTH_CONFIG.observationWindowMs,
      MINIMUM_WINDOW_MS,
    ),
    missThreshold: readPositiveInteger(
      environment,
      CAPABILITY_HEALTH_MISS_THRESHOLD_ENV,
      DEFAULT_CAPABILITY_HEALTH_CONFIG.missThreshold,
      MINIMUM_THRESHOLD,
    ),
  };
}

export interface CapabilityHealthKey {
  routeId: string;
  capability: ObservedCapability;
}

export function capabilityHealthEventsKey(key: CapabilityHealthKey): string {
  return [
    CAPABILITY_EVENTS_KEY_PREFIX,
    [key.routeId, key.capability].join(CAPABILITY_KEY_SEPARATOR),
  ].join(KEY_SEPARATOR);
}

export interface CapabilityObservationEvent {
  nowMs: number;
  honoured: boolean;
}

export function encodeCapabilityObservation(
  honoured: boolean,
  nowMs: number,
  nonce: string,
): string {
  return JSON.stringify({
    [EVENT_FIELD_NOW]: nowMs,
    [EVENT_FIELD_HONOURED]: honoured,
    [EVENT_FIELD_NONCE]: nonce,
  });
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function parseCapabilityObservation(raw: unknown): CapabilityObservationEvent | undefined {
  const parsed = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  if (!parsed || typeof parsed !== 'object') return undefined;
  const record = parsed as Record<string, unknown>;
  const nowMs = record[EVENT_FIELD_NOW];
  const honoured = record[EVENT_FIELD_HONOURED];
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return undefined;
  if (typeof honoured !== 'boolean') return undefined;
  return { nowMs, honoured };
}

export function parseCapabilityObservations(raw: unknown): readonly CapabilityObservationEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: CapabilityObservationEvent[] = [];
  for (const item of raw) {
    const event = parseCapabilityObservation(item);
    if (event) events.push(event);
  }
  return events.sort((left, right) => left.nowMs - right.nowMs);
}

export interface CapabilityHealthSnapshot {
  honoured: boolean;
  missCount: number;
  sampleCount: number;
  lastObservedMs?: number;
}

export function honouredCapabilitySnapshot(): CapabilityHealthSnapshot {
  return { honoured: true, missCount: 0, sampleCount: 0 };
}

/**
 * Suspect only while the misses in the window have reached the threshold AND
 * the most recent observation is still a miss, so one honoured turn brings a
 * route back rather than making it wait out the whole window.
 */
export function buildCapabilityHealthSnapshot(
  events: readonly CapabilityObservationEvent[],
  nowMs: number,
  config: CapabilityHealthConfig = DEFAULT_CAPABILITY_HEALTH_CONFIG,
): CapabilityHealthSnapshot {
  const inWindow = events.filter((event) => event.nowMs >= nowMs - config.observationWindowMs);
  if (inWindow.length === 0) return honouredCapabilitySnapshot();
  const last = inWindow[inWindow.length - 1]!;
  const missCount = inWindow.filter((event) => !event.honoured).length;
  return {
    honoured: !(missCount >= config.missThreshold && !last.honoured),
    missCount,
    sampleCount: inWindow.length,
    lastObservedMs: last.nowMs,
  };
}

export type CapabilityHealthByRoute = Readonly<
  Record<string, Readonly<Partial<Record<ObservedCapability, CapabilityHealthSnapshot>>>>
>;

/**
 * The ranking input `auto.ts` reads: per route, the capabilities the serving
 * path has evidence it stopped honouring. A route with no evidence yields no
 * entry, so absence of signal never penalises anything.
 */
export function unhonouredCapabilitiesByRoute(
  byRoute: CapabilityHealthByRoute,
): Readonly<Record<string, readonly ObservedCapability[]>> {
  const unhonoured: Record<string, readonly ObservedCapability[]> = {};
  for (const [routeId, capabilities] of Object.entries(byRoute)) {
    const lost = Object.entries(capabilities)
      .filter(([, snapshot]) => snapshot?.honoured === false)
      .map(([capability]) => capability as ObservedCapability)
      .sort();
    if (lost.length > 0) unhonoured[routeId] = lost;
  }
  return unhonoured;
}

export interface CapabilityHealthStoreFailureEvent {
  failure: RouteHealthStoreFailure;
  keys: readonly CapabilityHealthKey[];
  error?: unknown;
}

export interface CapabilityHealthStoreOptions {
  store: RouteHealthKeyValueStore | null;
  config?: CapabilityHealthConfig;
  boundedRead?: <T>(read: Promise<T>) => Promise<T | null>;
  onFailure?: (event: CapabilityHealthStoreFailureEvent) => void;
  nonce?: () => string;
}

export interface CapabilityHealthStore {
  readonly config: CapabilityHealthConfig;
  recordObservation(key: CapabilityHealthKey, honoured: boolean, nowMs?: number): Promise<void>;
  snapshots(keys: readonly CapabilityHealthKey[], nowMs?: number): Promise<CapabilityHealthByRoute>;
}

function defaultNonce(): string {
  return Math.random().toString(NONCE_RADIX).slice(NONCE_START_INDEX);
}

function honouredByRoute(keys: readonly CapabilityHealthKey[]): CapabilityHealthByRoute {
  const byRoute: Record<string, Partial<Record<ObservedCapability, CapabilityHealthSnapshot>>> = {};
  for (const key of keys) {
    byRoute[key.routeId] = {
      ...byRoute[key.routeId],
      [key.capability]: honouredCapabilitySnapshot(),
    };
  }
  return byRoute;
}

/**
 * Fails open on every store problem, for the same reason the route health store
 * does: a signal that cannot read its own memory must not become the outage.
 */
export function createCapabilityHealthStore(
  options: CapabilityHealthStoreOptions,
): CapabilityHealthStore {
  const config = options.config ?? DEFAULT_CAPABILITY_HEALTH_CONFIG;
  const nonce = options.nonce ?? defaultNonce;
  const eventTtlSeconds =
    Math.ceil(config.observationWindowMs / MS_PER_SECOND) + EVENT_TTL_BUFFER_SECONDS;

  const report = (event: CapabilityHealthStoreFailureEvent): void => {
    options.onFailure?.(event);
  };

  return {
    config,

    async recordObservation(key, honoured, nowMs = Date.now()): Promise<void> {
      const store = options.store;
      if (!store) {
        report({ failure: 'store_unavailable', keys: [key] });
        return;
      }
      const eventsKey = capabilityHealthEventsKey(key);
      try {
        await store
          .batch()
          .sortedAdd(eventsKey, {
            score: nowMs,
            member: encodeCapabilityObservation(honoured, nowMs, nonce()),
          })
          .sortedRemoveByScore(eventsKey, EVENTS_RANGE_MIN, nowMs - config.observationWindowMs)
          .expire(eventsKey, eventTtlSeconds)
          .exec();
      } catch (error) {
        report({ failure: 'write_failed', keys: [key], error });
      }
    },

    async snapshots(keys, nowMs = Date.now()): Promise<CapabilityHealthByRoute> {
      if (keys.length === 0) return {};
      const store = options.store;
      if (!store) {
        report({ failure: 'store_unavailable', keys });
        return honouredByRoute(keys);
      }

      try {
        const batch = store.batch();
        for (const key of keys) {
          batch.sortedRangeByScore(
            capabilityHealthEventsKey(key),
            nowMs - config.observationWindowMs,
            EVENTS_RANGE_MAX,
          );
        }
        const exec = batch.exec();
        const read = options.boundedRead ? await options.boundedRead(exec) : await exec;
        if (read === null) {
          report({ failure: 'read_abandoned', keys });
          return honouredByRoute(keys);
        }

        const results = read as unknown[];
        const byRoute: Record<
          string,
          Partial<Record<ObservedCapability, CapabilityHealthSnapshot>>
        > = {};
        keys.forEach((key, index) => {
          byRoute[key.routeId] = {
            ...byRoute[key.routeId],
            [key.capability]: buildCapabilityHealthSnapshot(
              parseCapabilityObservations(results[index]),
              nowMs,
              config,
            ),
          };
        });
        return byRoute;
      } catch (error) {
        report({ failure: 'read_failed', keys, error });
        return honouredByRoute(keys);
      }
    },
  };
}
