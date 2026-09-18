import { KeyValueConfigError } from './types';

const EMPTY_COUNT = 0;

/**
 * Where a cached value can always be rebuilt from. A cache with no source of
 * truth is storage, not a cache, and must not be declared here.
 */
export type CacheSourceOfTruth = 'postgres' | 'provider' | 'object-storage' | 'derived';

export type CacheInvalidationTrigger =
  'ttl' | 'workspace-switch' | 'membership-change' | 'policy-write' | 'record-write' | 'deletion';

export interface CacheDescriptor {
  id: string;
  /** Key prefix, without the trailing separator. */
  namespace: string;
  sourceOfTruth: CacheSourceOfTruth;
  workspaceScoped: boolean;
  invalidatedBy: readonly CacheInvalidationTrigger[];
  ttlSeconds?: number;
}

export interface CacheRegistry {
  readonly descriptors: readonly CacheDescriptor[];
  get(id: string): CacheDescriptor | undefined;
  workspaceScoped(): readonly CacheDescriptor[];
}

export function defineCacheRegistry(descriptors: readonly CacheDescriptor[]): CacheRegistry {
  const byId = new Map<string, CacheDescriptor>();
  const namespaces = new Set<string>();

  for (const descriptor of descriptors) {
    if (byId.has(descriptor.id)) {
      throw new KeyValueConfigError(`Duplicate cache id: ${descriptor.id}`);
    }
    if (namespaces.has(descriptor.namespace)) {
      throw new KeyValueConfigError(`Duplicate cache namespace: ${descriptor.namespace}`);
    }
    if (descriptor.invalidatedBy.length === EMPTY_COUNT) {
      throw new KeyValueConfigError(`Cache ${descriptor.id} declares no invalidation trigger`);
    }
    byId.set(descriptor.id, descriptor);
    namespaces.add(descriptor.namespace);
  }

  const frozen = Object.freeze([...descriptors]);
  return {
    descriptors: frozen,
    get: (id) => byId.get(id),
    workspaceScoped: () => frozen.filter((descriptor) => descriptor.workspaceScoped),
  };
}
