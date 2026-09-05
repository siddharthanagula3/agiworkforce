import { modelRegistry } from '@agiworkforce/model-registry';

import type { RouteHealthConfig } from './route-health-store';
import type { RouteHealthSnapshot } from './runtime-state';
import { routeBreakerStateWithDegradeBand, type RouteBreakerState } from './route-health-store';
import type { RoutingTrustMode } from './auto';

export type CredentialClass = 'api_key' | 'oauth_session' | 'local_runtime';

export interface BreakerProfile {
  degradeAtFailures: number;
  openAtFailures: number;
  windowMs: number;
  resetMs: number;
}

const MINUTE_MS = 60_000;

const API_KEY_DEGRADE_AT_FAILURES = 7;
const API_KEY_OPEN_AT_FAILURES = 12;
const API_KEY_WINDOW_MINUTES = 30;
const API_KEY_RESET_MINUTES = 10;

const OAUTH_SESSION_DEGRADE_AT_FAILURES = 5;
const OAUTH_SESSION_OPEN_AT_FAILURES = 8;
const OAUTH_SESSION_WINDOW_MINUTES = 15;
const OAUTH_SESSION_RESET_MINUTES = 5;

const LOCAL_RUNTIME_DEGRADE_AT_FAILURES = 1;
const LOCAL_RUNTIME_OPEN_AT_FAILURES = 2;
const LOCAL_RUNTIME_WINDOW_MINUTES = 5;
const LOCAL_RUNTIME_RESET_MINUTES = 1;

export const DEFAULT_BREAKER_PROFILES: Readonly<Record<CredentialClass, BreakerProfile>> = {
  api_key: {
    degradeAtFailures: API_KEY_DEGRADE_AT_FAILURES,
    openAtFailures: API_KEY_OPEN_AT_FAILURES,
    windowMs: API_KEY_WINDOW_MINUTES * MINUTE_MS,
    resetMs: API_KEY_RESET_MINUTES * MINUTE_MS,
  },
  oauth_session: {
    degradeAtFailures: OAUTH_SESSION_DEGRADE_AT_FAILURES,
    openAtFailures: OAUTH_SESSION_OPEN_AT_FAILURES,
    windowMs: OAUTH_SESSION_WINDOW_MINUTES * MINUTE_MS,
    resetMs: OAUTH_SESSION_RESET_MINUTES * MINUTE_MS,
  },
  local_runtime: {
    degradeAtFailures: LOCAL_RUNTIME_DEGRADE_AT_FAILURES,
    openAtFailures: LOCAL_RUNTIME_OPEN_AT_FAILURES,
    windowMs: LOCAL_RUNTIME_WINDOW_MINUTES * MINUTE_MS,
    resetMs: LOCAL_RUNTIME_RESET_MINUTES * MINUTE_MS,
  },
};

const LOCAL_TRUST_MODES: ReadonlySet<RoutingTrustMode> = new Set(['local', 'on_device']);

interface RegistryHarnessRecord {
  provider: string;
  trustModes: readonly string[];
}

const harnessRecords = modelRegistry.harnesses as unknown as Readonly<
  Record<string, RegistryHarnessRecord>
>;

export function trustModesForProvider(providerId: string): readonly RoutingTrustMode[] {
  const modes = new Set<RoutingTrustMode>();
  for (const harness of Object.values(harnessRecords)) {
    if (harness.provider !== providerId) continue;
    for (const mode of harness.trustModes) modes.add(mode as RoutingTrustMode);
  }
  return [...modes];
}

export function resolveCredentialClass(
  trustModes: readonly RoutingTrustMode[],
  override?: CredentialClass,
): CredentialClass {
  if (override) return override;
  return trustModes.some((mode) => LOCAL_TRUST_MODES.has(mode)) ? 'local_runtime' : 'api_key';
}

export function credentialClassForProvider(
  providerId: string,
  override?: CredentialClass,
): CredentialClass {
  return resolveCredentialClass(trustModesForProvider(providerId), override);
}

export function breakerProfileForCredentialClass(
  credentialClass: CredentialClass,
  profiles: Readonly<Record<CredentialClass, BreakerProfile>> = DEFAULT_BREAKER_PROFILES,
): BreakerProfile {
  return profiles[credentialClass];
}

export function routeHealthConfigFromBreakerProfile(
  profile: BreakerProfile,
  base: RouteHealthConfig,
): RouteHealthConfig {
  return {
    ...base,
    observationWindowMs: profile.windowMs,
    tripWindowMs: Math.min(base.tripWindowMs, profile.windowMs),
    consecutiveFailureThreshold: profile.openAtFailures,
    cooldownBaseMs: profile.resetMs,
    cooldownMaxMs: Math.max(base.cooldownMaxMs, profile.resetMs),
  };
}

export function providerRouteHealthConfig(
  providerId: string,
  base: RouteHealthConfig,
  options: {
    override?: CredentialClass;
    profiles?: Readonly<Record<CredentialClass, BreakerProfile>>;
  } = {},
): RouteHealthConfig {
  const credentialClass = credentialClassForProvider(providerId, options.override);
  const profile = breakerProfileForCredentialClass(credentialClass, options.profiles);
  return routeHealthConfigFromBreakerProfile(profile, base);
}

export function providerBreakerState(
  snapshot: RouteHealthSnapshot | undefined,
  credentialClass: CredentialClass,
  profiles: Readonly<Record<CredentialClass, BreakerProfile>> = DEFAULT_BREAKER_PROFILES,
): RouteBreakerState {
  return routeBreakerStateWithDegradeBand(
    snapshot,
    breakerProfileForCredentialClass(credentialClass, profiles).degradeAtFailures,
  );
}

export type ResilienceScope = 'provider' | 'credential' | 'model';

const PROVIDER_BREAKER_CATEGORIES: ReadonlySet<string> = new Set([
  'server_error',
  'server_overload',
  'api_timeout',
]);

const CREDENTIAL_COOLDOWN_CATEGORIES: ReadonlySet<string> = new Set(['rate_limit', 'auth']);

const MODEL_LOCKOUT_CATEGORIES: ReadonlySet<string> = new Set([
  'invalid_model',
  'context_overflow',
]);

export function resilienceScopeForCategory(category: string): ResilienceScope | null {
  if (PROVIDER_BREAKER_CATEGORIES.has(category)) return 'provider';
  if (CREDENTIAL_COOLDOWN_CATEGORIES.has(category)) return 'credential';
  if (MODEL_LOCKOUT_CATEGORIES.has(category)) return 'model';
  return null;
}
