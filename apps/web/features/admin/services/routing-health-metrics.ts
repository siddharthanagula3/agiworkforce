import 'server-only';

import { modelRegistry } from '@agiworkforce/model-registry';
import {
  breakerProfileForCredentialClass,
  credentialClassForProvider,
  isCredentialUnfunded,
  providerBreakerState,
  resolveModelLockoutConfig,
  routeBreakerState,
  type CredentialClass,
  type RouteBreakerState,
  type RouteHealthSnapshot,
} from '@agiworkforce/routing';

import {
  getCredentialCooldownSnapshot,
  getCredentialHealthSnapshot,
  getRouteHealthSnapshot,
} from '@/lib/services/free-lane/runtime-state-service';

const LIVE_AVAILABILITY = 'live';

interface RegistryRouteRecord {
  provider: string;
  modelKey: string;
  availability: string;
}

const routeRecords = modelRegistry.routes as unknown as Readonly<
  Record<string, RegistryRouteRecord>
>;

export interface RouteHealthObservations {
  sampleCount: number;
  consecutiveFailures: number;
  successRate: number | null;
  rateLimitRate: number | null;
  serverErrorRate: number | null;
  timeoutRate: number | null;
  streamCorruptionRate: number | null;
  cooldownUntil: string | null;
}

export interface ProviderHealthRow {
  provider: string;
  credentialClass: CredentialClass;
  liveRoutes: number;
  degradeAtFailures: number;
  openAtFailures: number;
  observationWindowMs: number;
  resetMs: number;
  providerState: RouteBreakerState;
  credentialState: RouteBreakerState;
  /**
   * Read from the CREDENTIAL scope snapshot only, which is the sole scope that
   * sets it, and reported beside the breaker state rather than folded into it:
   * a credential whose account is out of funds serves nothing until someone
   * pays, which is true even while its cooldown reads closed.
   */
  credentialUnfunded: boolean;
  providerObservations: RouteHealthObservations;
  credentialObservations: RouteHealthObservations;
}

export interface RouteScopeHealthRow {
  routeId: string;
  provider: string;
  modelKey: string;
  state: RouteBreakerState;
  observations: RouteHealthObservations;
}

export interface RoutingHealthSummary {
  providers: ProviderHealthRow[];
  lockoutWindowMs: number;
  lockoutOpenAtFailures: number;
}

function liveRouteEntries(): Array<[string, RegistryRouteRecord]> {
  return Object.entries(routeRecords).filter(
    ([, record]) => record.availability === LIVE_AVAILABILITY,
  );
}

function toObservations(snapshot: RouteHealthSnapshot | undefined): RouteHealthObservations {
  return {
    sampleCount: snapshot?.sampleCount ?? 0,
    consecutiveFailures: snapshot?.consecutiveFailures ?? 0,
    successRate: snapshot?.successRate ?? null,
    rateLimitRate: snapshot?.rateLimitRate ?? null,
    serverErrorRate: snapshot?.serverErrorRate ?? null,
    timeoutRate: snapshot?.timeoutRate ?? null,
    streamCorruptionRate: snapshot?.streamCorruptionRate ?? null,
    cooldownUntil:
      snapshot?.cooldownUntilMs !== undefined
        ? new Date(snapshot.cooldownUntilMs).toISOString()
        : null,
  };
}

/**
 * One row per provider the registry can actually dispatch to, over the two
 * scopes that stop traffic: the provider breaker and the credential cooldown.
 * Route-scope lockouts are read separately, per provider, so an operator page
 * never asks the store for every live route at once.
 */
export async function readRoutingHealth(nowMs: number = Date.now()): Promise<RoutingHealthSummary> {
  const liveRoutesByProvider = new Map<string, number>();
  for (const [, record] of liveRouteEntries()) {
    liveRoutesByProvider.set(record.provider, (liveRoutesByProvider.get(record.provider) ?? 0) + 1);
  }

  const providerIds = [...liveRoutesByProvider.keys()].sort();
  const [providerSnapshots, credentialSnapshots] = await Promise.all([
    getCredentialHealthSnapshot(providerIds, nowMs),
    getCredentialCooldownSnapshot(providerIds, nowMs),
  ]);

  const lockoutConfig = resolveModelLockoutConfig();

  return {
    lockoutWindowMs: lockoutConfig.observationWindowMs,
    lockoutOpenAtFailures: lockoutConfig.consecutiveFailureThreshold,
    providers: providerIds.map((provider) => {
      const credentialClass = credentialClassForProvider(provider);
      const profile = breakerProfileForCredentialClass(credentialClass);
      return {
        provider,
        credentialClass,
        liveRoutes: liveRoutesByProvider.get(provider) ?? 0,
        degradeAtFailures: profile.degradeAtFailures,
        openAtFailures: profile.openAtFailures,
        observationWindowMs: profile.windowMs,
        resetMs: profile.resetMs,
        providerState: providerBreakerState(providerSnapshots[provider], credentialClass),
        credentialState: providerBreakerState(credentialSnapshots[provider], credentialClass),
        credentialUnfunded: isCredentialUnfunded(credentialSnapshots[provider]),
        providerObservations: toObservations(providerSnapshots[provider]),
        credentialObservations: toObservations(credentialSnapshots[provider]),
      };
    }),
  };
}

export function isKnownRoutingProvider(provider: string): boolean {
  return liveRouteEntries().some(([, record]) => record.provider === provider);
}

export async function readProviderRouteHealth(
  provider: string,
  nowMs: number = Date.now(),
): Promise<RouteScopeHealthRow[]> {
  const entries = liveRouteEntries()
    .filter(([, record]) => record.provider === provider)
    .sort(([left], [right]) => left.localeCompare(right));

  const snapshots = await getRouteHealthSnapshot(
    entries.map(([routeId]) => routeId),
    nowMs,
  );

  return entries.map(([routeId, record]) => ({
    routeId,
    provider: record.provider,
    modelKey: record.modelKey,
    state: routeBreakerState(snapshots[routeId]),
    observations: toObservations(snapshots[routeId]),
  }));
}
