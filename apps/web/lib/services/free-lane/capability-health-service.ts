import 'server-only';

import {
  createCapabilityHealthStore,
  resolveCapabilityHealthConfig,
  unhonouredCapabilitiesByRoute,
  type CapabilityHealthByRoute,
  type CapabilityHealthKey,
  type CapabilityHealthStore,
  type ObservedCapability,
} from '@agiworkforce/routing';

import { logger } from '@/lib/logger';
import { getKeyValueStore } from '@/lib/server/key-value';
import { readRedisWithinBudget, wasRedisReadAbandoned } from '@/lib/server/bounded-redis-read';

export const TOOL_CALLING_CAPABILITY: ObservedCapability = 'functionCalling';
export const STRUCTURED_OUTPUT_CAPABILITY: ObservedCapability = 'structuredOutput';

let capabilityHealthStoreInstance: CapabilityHealthStore | null = null;

function capabilityHealthStore(): CapabilityHealthStore {
  capabilityHealthStoreInstance ??= createCapabilityHealthStore({
    store: getKeyValueStore(),
    config: resolveCapabilityHealthConfig(),
    boundedRead: async <T>(read: Promise<T>): Promise<T | null> => {
      const result = await readRedisWithinBudget(read);
      return wasRedisReadAbandoned(result) ? null : result;
    },
    onFailure: (event) => {
      logger.error(
        { failure: event.failure, keyCount: event.keys.length, error: event.error },
        '[capability-health] store degraded; every route reads as honouring',
      );
    },
  });
  return capabilityHealthStoreInstance;
}

export function resetCapabilityHealthStore(): void {
  capabilityHealthStoreInstance = null;
}

/**
 * The declared catalog flag still decides admission. This only records what the
 * serving path saw, so ranking can prefer a route that is still honouring the
 * capability a request actually carries.
 */
export async function recordCapabilityObservation(
  routeId: string,
  capability: ObservedCapability,
  honoured: boolean,
  nowMs: number = Date.now(),
): Promise<void> {
  if (!routeId) return;
  await capabilityHealthStore().recordObservation({ routeId, capability }, honoured, nowMs);
}

export async function getCapabilityHealthSnapshot(
  keys: readonly CapabilityHealthKey[],
  nowMs: number = Date.now(),
): Promise<CapabilityHealthByRoute> {
  return capabilityHealthStore().snapshots(keys, nowMs);
}

export async function getUnhonouredCapabilities(
  routeIds: readonly string[],
  capabilities: readonly ObservedCapability[],
  nowMs: number = Date.now(),
): Promise<Readonly<Record<string, readonly ObservedCapability[]>>> {
  if (routeIds.length === 0 || capabilities.length === 0) return {};
  const keys = routeIds.flatMap((routeId) =>
    capabilities.map((capability) => ({ routeId, capability })),
  );
  return unhonouredCapabilitiesByRoute(await getCapabilityHealthSnapshot(keys, nowMs));
}
