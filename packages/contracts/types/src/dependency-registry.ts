/**
 * @file dependency-registry.ts
 * @module @agiworkforce/types/dependency-registry
 *
 * Which product capability depends on which outside service, who owns each, and
 * what happens when one is down. CODEOWNERS routes a diff to a reviewer, which
 * is not the same question: it cannot say that billing stops when Stripe does,
 * or that browsing and sandboxing share one vendor and therefore one outage.
 */

import registryJson from './dependency-registry.json' with { type: 'json' };

export const DEPENDENCY_KINDS = [
  'model-provider',
  'payments',
  'database',
  'cache',
  'auth',
  'sandbox',
  'browser',
  'object-storage',
  'email',
  'observability',
] as const;

export type DependencyKind = (typeof DEPENDENCY_KINDS)[number];

/** `routed` means another candidate serves the request; `none` means it stops. */
export const DEPENDENCY_FAILOVERS = ['routed', 'none'] as const;

export type DependencyFailover = (typeof DEPENDENCY_FAILOVERS)[number];

export interface UpstreamDependency {
  id: string;
  kind: DependencyKind;
  label: string;
  /** The module that owns the integration. Nothing else may talk to the vendor. */
  module: string;
  envVars: string[];
  owner: string;
  failover: DependencyFailover;
  failureMode: string;
  /** Another upstream served by the same vendor, so one outage takes both. */
  sharesVendorWith?: string;
}

export interface ProductCapability {
  id: string;
  label: string;
  domainPath: string;
  runtime: string;
  owner: string;
  upstreams: string[];
}

export interface DependencyRegistry {
  upstreams: UpstreamDependency[];
  capabilities: ProductCapability[];
}

export const DEPENDENCY_REGISTRY = registryJson as DependencyRegistry;

export const UPSTREAM_DEPENDENCIES: readonly UpstreamDependency[] = DEPENDENCY_REGISTRY.upstreams;

export const PRODUCT_CAPABILITIES: readonly ProductCapability[] = DEPENDENCY_REGISTRY.capabilities;

export function getUpstream(id: string): UpstreamDependency | null {
  return UPSTREAM_DEPENDENCIES.find((upstream) => upstream.id === id) ?? null;
}

export function getCapability(id: string): ProductCapability | null {
  return PRODUCT_CAPABILITIES.find((capability) => capability.id === id) ?? null;
}

export function upstreamsFor(capabilityId: string): UpstreamDependency[] {
  const capability = getCapability(capabilityId);
  if (capability === null) return [];
  return capability.upstreams.flatMap((id) => {
    const upstream = getUpstream(id);
    return upstream === null ? [] : [upstream];
  });
}

/** The capabilities that stop when one upstream does, including shared vendors. */
export function capabilitiesAffectedBy(upstreamId: string): ProductCapability[] {
  const shared = UPSTREAM_DEPENDENCIES.filter(
    (upstream) => upstream.sharesVendorWith === upstreamId || upstream.id === upstreamId,
  ).map((upstream) => upstream.id);
  return PRODUCT_CAPABILITIES.filter((capability) =>
    capability.upstreams.some((id) => shared.includes(id)),
  );
}

export function isDependencyKind(value: string): value is DependencyKind {
  return (DEPENDENCY_KINDS as readonly string[]).includes(value);
}
