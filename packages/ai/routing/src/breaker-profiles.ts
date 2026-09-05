/**
 * Provider-breaker thresholds by credential class, and the classification
 * table that sorts an `ErrorCategory` into one of the three resilience
 * scopes `route-health-store.ts` now keeps separately.
 *
 * Ported from OmniRoute's per-credential-class provider breaker
 * (`docs/research/omniroute-learnings-2026-09-05.md` §4; upstream
 * `https://github.com/diegosouzapw/OmniRoute`, MIT, Copyright (c) 2026
 * diegosouzapw, `open-sse/config/constants.ts` `PROVIDER_PROFILES` and
 * `docs/architecture/RESILIENCE_GUIDE.md` §1). OmniRoute ran three profiles
 * because it dispatches to local inference; AGI Workforce's registry already
 * expresses that same distinction as `RoutingTrustMode`, so the credential
 * class is read off the registry rather than duplicated as a second taxonomy.
 *
 * @module routing/breaker-profiles
 * @packageDocumentation
 */
import { modelRegistry } from '@agiworkforce/model-registry';

import type { RouteHealthConfig } from './route-health-store';
import type { RouteHealthSnapshot } from './runtime-state';
import { routeBreakerStateWithDegradeBand, type RouteBreakerState } from './route-health-store';
import type { RoutingTrustMode } from './auto';

export type CredentialClass = 'api_key' | 'oauth_session' | 'local_runtime';

export interface BreakerProfile {
  /** Consecutive failures at which the provider is marked DEGRADED, never blocked. */
  degradeAtFailures: number;
  /** Consecutive failures at which the breaker OPENS and traffic is skipped. */
  openAtFailures: number;
  /** Rolling window the failure count is measured over. */
  windowMs: number;
  /** Cooldown before the breaker allows a HALF_OPEN probe. */
  resetMs: number;
}

const MINUTE_MS = 60_000;

/**
 * The sourced defaults. Three profiles, matching OmniRoute's
 * `PROVIDER_PROFILES`: a static API key tolerates the most failures over the
 * longest window before it costs the whole provider; an OAuth/session token
 * is treated as less durable (revocable mid-window); a local runtime is
 * assumed to be one crashed process away from healthy, so it trips fastest
 * and resets soonest.
 */
export const DEFAULT_BREAKER_PROFILES: Readonly<Record<CredentialClass, BreakerProfile>> = {
  api_key: {
    degradeAtFailures: 7,
    openAtFailures: 12,
    windowMs: 30 * MINUTE_MS,
    resetMs: 10 * MINUTE_MS,
  },
  oauth_session: {
    degradeAtFailures: 5,
    openAtFailures: 8,
    windowMs: 15 * MINUTE_MS,
    resetMs: 5 * MINUTE_MS,
  },
  local_runtime: {
    degradeAtFailures: 1,
    openAtFailures: 2,
    windowMs: 5 * MINUTE_MS,
    resetMs: 1 * MINUTE_MS,
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

/**
 * Every trust mode any harness for this provider declares.
 *
 * A provider can register more than one harness (a native route plus an
 * Anthropic-compatible bridge, for example); this unions them rather than
 * picking one arbitrarily, so a provider that has ANY local harness is never
 * misread as fully managed.
 */
export function trustModesForProvider(providerId: string): readonly RoutingTrustMode[] {
  const modes = new Set<RoutingTrustMode>();
  for (const harness of Object.values(harnessRecords)) {
    if (harness.provider !== providerId) continue;
    for (const mode of harness.trustModes) modes.add(mode as RoutingTrustMode);
  }
  return [...modes];
}

/**
 * The registry only distinguishes local execution from everything else
 * today (`RoutingTrustMode` has no OAuth-session member), so `oauth_session`
 * is reachable only through an explicit override, a caller that knows a
 * specific route runs on a revocable session token rather than a static key.
 * Every other route defaults to `api_key`, which every non-local harness in
 * the catalog uses.
 */
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

/**
 * Folds a credential-class profile into the provider breaker's config shape.
 *
 * Only the fields OmniRoute's profile actually governs move: the observation
 * window, the consecutive-failure trip threshold, and the reset/cooldown.
 * `failureRateThreshold` and `minSamplesForRateTrip` stay whatever the base
 * config already carries, the rate-based trip is a separate safety net this
 * port does not change.
 */
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

/**
 * Which of the three resilience scopes an `ErrorCategory` belongs to.
 *
 * `null` means the category is not a resilience-scope signal at all (an
 * abort, a safety refusal, a malformed request): those say something about
 * THIS request, not about the provider, the credential, or the model, and
 * recording them here would park healthy capacity on the caller's own input.
 *
 * Deliberately narrow per `docs/research/omniroute-learnings-2026-09-05.md`
 * §4: only request-timeout and 5xx classes trip the provider breaker; `429`
 * and non-terminal credential rejections cool the credential; a model-scoped
 * rejection locks out the model. `quota_exhausted` is excluded on purpose,
 * the free lane's own pool accounting already owns that signal
 * (`classifyFreeLaneFailure` in `runtime-state-service.ts`), and folding it
 * in here would let two independent mechanisms race to record the same
 * window-exhaustion fact.
 */
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
