import { describe, expect, it } from 'vitest';

import { buildRouteHealthSnapshot, DEFAULT_ROUTE_HEALTH_CONFIG } from '../route-health-store';
import {
  breakerProfileForCredentialClass,
  credentialClassForProvider,
  DEFAULT_BREAKER_PROFILES,
  providerBreakerState,
  providerRouteHealthConfig,
  resilienceScopeForCategory,
  resolveCredentialClass,
  routeHealthConfigFromBreakerProfile,
  routeOutcomeClassForCategory,
  trustModesForProvider,
} from '../breaker-profiles';

const NOW = 1_700_000_000_000;

describe('credential class resolution', () => {
  it('reads local runtime off a registry trust mode, no override needed', () => {
    expect(resolveCredentialClass(['local'])).toBe('local_runtime');
    expect(resolveCredentialClass(['on_device'])).toBe('local_runtime');
  });

  it('defaults every other trust mode to a static API key', () => {
    expect(resolveCredentialClass(['managed_cloud', 'byok'])).toBe('api_key');
    expect(resolveCredentialClass([])).toBe('api_key');
  });

  it('lets an explicit override win, since the registry has no OAuth-session signal yet', () => {
    expect(resolveCredentialClass(['managed_cloud'], 'oauth_session')).toBe('oauth_session');
  });

  it('resolves a real local-runtime provider straight off the registry', () => {
    expect(trustModesForProvider('ollama')).toContain('local');
    expect(credentialClassForProvider('ollama')).toBe('local_runtime');
  });

  it('resolves a real managed provider to the API key default', () => {
    expect(credentialClassForProvider('anthropic')).toBe('api_key');
  });

  it('reports no trust modes for a provider the registry does not know', () => {
    expect(trustModesForProvider('not-a-real-provider')).toEqual([]);
  });
});

describe('breaker profile defaults', () => {
  it('orders every profile from most to least tolerant, matching the credential durability it protects', () => {
    const {
      api_key: apiKey,
      oauth_session: oauth,
      local_runtime: local,
    } = DEFAULT_BREAKER_PROFILES;
    expect(apiKey.openAtFailures).toBeGreaterThan(oauth.openAtFailures);
    expect(oauth.openAtFailures).toBeGreaterThan(local.openAtFailures);
    expect(apiKey.windowMs).toBeGreaterThan(oauth.windowMs);
    expect(oauth.windowMs).toBeGreaterThan(local.windowMs);
    expect(apiKey.resetMs).toBeGreaterThan(oauth.resetMs);
    expect(oauth.resetMs).toBeGreaterThan(local.resetMs);
  });

  it('keeps every degrade band strictly below its own open threshold', () => {
    for (const profile of Object.values(DEFAULT_BREAKER_PROFILES)) {
      expect(profile.degradeAtFailures).toBeLessThan(profile.openAtFailures);
    }
  });

  it('looks up a profile by credential class', () => {
    expect(breakerProfileForCredentialClass('local_runtime')).toEqual(
      DEFAULT_BREAKER_PROFILES.local_runtime,
    );
  });
});

describe('folding a profile into a route health config', () => {
  it('overrides window, trip threshold and cooldown, leaving the rate-trip fields alone', () => {
    const config = routeHealthConfigFromBreakerProfile(
      DEFAULT_BREAKER_PROFILES.local_runtime,
      DEFAULT_ROUTE_HEALTH_CONFIG,
    );
    expect(config.observationWindowMs).toBe(DEFAULT_BREAKER_PROFILES.local_runtime.windowMs);
    expect(config.consecutiveFailureThreshold).toBe(
      DEFAULT_BREAKER_PROFILES.local_runtime.openAtFailures,
    );
    expect(config.cooldownBaseMs).toBe(DEFAULT_BREAKER_PROFILES.local_runtime.resetMs);
    expect(config.failureRateThreshold).toBe(DEFAULT_ROUTE_HEALTH_CONFIG.failureRateThreshold);
    expect(config.minSamplesForRateTrip).toBe(DEFAULT_ROUTE_HEALTH_CONFIG.minSamplesForRateTrip);
  });

  it('trips a local-runtime provider after only two failures, unlike the api-key default', () => {
    const localConfig = providerRouteHealthConfig('ollama', DEFAULT_ROUTE_HEALTH_CONFIG);
    const snapshot = buildRouteHealthSnapshot(
      [
        { nowMs: NOW, class: 'server_error' },
        { nowMs: NOW + 1, class: 'server_error' },
      ],
      NOW + 2,
      localConfig,
    );
    expect(snapshot.available).toBe(false);
  });

  it('keeps a static-key provider closed after the same two failures', () => {
    const apiKeyConfig = providerRouteHealthConfig('anthropic', DEFAULT_ROUTE_HEALTH_CONFIG);
    const snapshot = buildRouteHealthSnapshot(
      [
        { nowMs: NOW, class: 'server_error' },
        { nowMs: NOW + 1, class: 'server_error' },
      ],
      NOW + 2,
      apiKeyConfig,
    );
    expect(snapshot.available).toBe(true);
  });
});

describe('degraded band via credential class', () => {
  it('marks degraded without opening, one failure short of the local-runtime open threshold', () => {
    const config = providerRouteHealthConfig('ollama', DEFAULT_ROUTE_HEALTH_CONFIG);
    const snapshot = buildRouteHealthSnapshot(
      [{ nowMs: NOW, class: 'server_error' }],
      NOW + 1,
      config,
    );
    expect(snapshot.available).toBe(true);
    expect(providerBreakerState(snapshot, 'local_runtime')).toBe('degraded');
  });

  it('reports closed under the degrade band for a fresh api-key provider', () => {
    expect(providerBreakerState(undefined, 'api_key')).toBe('closed');
  });
});

describe('classifying an error category into a resilience scope', () => {
  it('sends request-timeout and 5xx classes to the provider breaker', () => {
    expect(resilienceScopeForCategory('server_error')).toBe('provider');
    expect(resilienceScopeForCategory('server_overload')).toBe('provider');
    expect(resilienceScopeForCategory('api_timeout')).toBe('provider');
  });

  it('sends 429 and non-terminal credential rejections to the credential cooldown', () => {
    expect(resilienceScopeForCategory('rate_limit')).toBe('credential');
    expect(resilienceScopeForCategory('auth')).toBe('credential');
  });

  it('sends an unfunded account to the credential cooldown, not to the route', () => {
    expect(resilienceScopeForCategory('billing_exhausted')).toBe('credential');
  });

  it('sends model-specific rejections to the model lockout', () => {
    expect(resilienceScopeForCategory('invalid_model')).toBe('model');
    expect(resilienceScopeForCategory('context_overflow')).toBe('model');
  });

  it('leaves every other category unscoped rather than guessing', () => {
    expect(resilienceScopeForCategory('safety')).toBeNull();
    expect(resilienceScopeForCategory('aborted')).toBeNull();
    expect(resilienceScopeForCategory('quota_exhausted')).toBeNull();
  });
});

describe('classifying an error category into an outcome class', () => {
  it('gives an unfunded account its own class, not the scope default', () => {
    expect(routeOutcomeClassForCategory('billing_exhausted')).toBe('credential_unfunded');
    expect(routeOutcomeClassForCategory('rate_limit')).toBe('rate_limit');
  });

  it('falls back to the class the scope records under', () => {
    expect(routeOutcomeClassForCategory('server_error')).toBe('server_error');
    expect(routeOutcomeClassForCategory('api_timeout')).toBe('server_error');
    expect(routeOutcomeClassForCategory('auth')).toBe('rate_limit');
    expect(routeOutcomeClassForCategory('invalid_model')).toBe('model_rejected');
  });

  it('returns nothing for a category no scope claims, so nothing is recorded', () => {
    expect(routeOutcomeClassForCategory('safety')).toBeNull();
    expect(routeOutcomeClassForCategory('aborted')).toBeNull();
  });
});
