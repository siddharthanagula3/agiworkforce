import { describe, expect, it } from 'vitest';
import { modelRegistry } from '@agiworkforce/model-registry';

import { resolveAutoRoute, type AutoRoutingRequest, type RoutingTrustMode } from '../auto';

/**
 * Every admission rule `routeAdmissionRejections` and `evaluateEligibility`
 * apply, restated against the compiled registry rather than against the
 * resolver. A rule that only this file knows about would pass whatever the
 * resolver did, so each one is also mutated below and has to produce a refusal.
 */
interface RegistryView {
  models: Record<
    string,
    {
      identity: { provider: string };
      lifecycle: { availability: string; deprecated: boolean };
      residencyRegions: readonly string[] | null;
    }
  >;
  routes: Record<
    string,
    {
      modelKey: string;
      provider: string;
      harnessId: string;
      trustModes: readonly string[];
      availability: string;
      selectable: boolean;
      commercialStatus: string;
      dataRetention: string;
    }
  >;
  harnesses: Record<
    string,
    { features: Record<string, { implementation?: string } | undefined>; trustModes: string[] }
  >;
  capabilities: Record<string, Record<string, boolean | null>>;
  governance: Record<string, { residencyRegions?: readonly string[] | null }>;
  policies: { auto: { tierAllowedSlots: Record<string, unknown>; tasks: Record<string, unknown> } };
}

const registry = modelRegistry as unknown as RegistryView;

const TIERS = Object.keys(registry.policies.auto.tierAllowedSlots);
const TASKS = Object.keys(registry.policies.auto.tasks);
const TRUST_MODES: readonly RoutingTrustMode[] = ['managed_cloud', 'byok', 'local', 'on_device'];
const SELECTIONS = ['auto', 'auto-economy', 'auto-balanced', 'auto-premium'];
const REGIONS = [null, 'us', 'eu'];

const MANAGED: RoutingTrustMode = 'managed_cloud';

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state);
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn;
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(draw: () => number, values: readonly T[]): T {
  return values[Math.floor(draw() * values.length)] as T;
}

function sweepRequests(count: number): AutoRoutingRequest[] {
  const draw = seeded(0x5eed1234);
  const requests: AutoRoutingRequest[] = [];
  for (let index = 0; index < count; index += 1) {
    const trustMode = pick(draw, TRUST_MODES);
    const region = pick(draw, REGIONS);
    requests.push({
      selection: pick(draw, SELECTIONS),
      taskType: pick(draw, TASKS) as AutoRoutingRequest['taskType'],
      subscriptionTier: pick(draw, TIERS),
      trustMode,
      ...(region ? { region } : {}),
      ...(draw() < 0.25 ? { zeroDataRetentionOnly: true } : {}),
      ...(draw() < 0.25 ? { usOnly: true } : {}),
      ...(draw() < 0.2 ? { residencyRegion: pick(draw, ['us', 'eu']) } : {}),
      ...(draw() < 0.2 ? { excludedRouteHosts: new Set(['open_router']) } : {}),
      requestId: `sweep-${index}`,
    });
  }
  return requests;
}

/** Why this route may not serve this request, restated from the registry. */
function admissionFaults(routeId: string, request: AutoRoutingRequest): string[] {
  const faults: string[] = [];
  const route = registry.routes[routeId];
  if (!route) return ['route is not in the registry'];
  const model = registry.models[route.modelKey];
  if (!model) return ['route serves a model that is not in the registry'];

  if (!route.selectable || route.availability !== 'live') faults.push('route is not selectable');
  if (model.lifecycle.availability !== 'live') faults.push('model is not live');
  if (model.lifecycle.deprecated) faults.push('model is deprecated');
  if (!route.trustModes.includes(request.trustMode)) faults.push('route has no such trust mode');
  if (route.commercialStatus === 'blocked') faults.push('route is commercially blocked');
  if (route.commercialStatus === 'experimental_only' && request.trustMode === MANAGED) {
    faults.push('experimental route served managed traffic');
  }
  if (request.excludedRouteHosts?.has(route.provider)) faults.push('excluded transport');
  if (request.allowedHarnessIds && !request.allowedHarnessIds.includes(route.harnessId)) {
    faults.push('harness is not executable on this runtime');
  }

  if (request.zeroDataRetentionOnly) {
    const honoursPerRequest =
      route.dataRetention === 'conditional' &&
      registry.harnesses[route.harnessId]?.features['zeroDataRetentionOnRequest']
        ?.implementation === 'implemented';
    const permitted =
      route.dataRetention === 'zero_retention' ||
      honoursPerRequest ||
      (request.zeroDataRetentionProviders?.has(route.provider) ?? false);
    if (!permitted) faults.push('route does not guarantee zero data retention');
  }

  const transportRegions = registry.governance[route.provider]?.residencyRegions;
  if (request.region && Array.isArray(transportRegions) && transportRegions.length > 0) {
    if (!transportRegions.includes(request.region)) faults.push('transport is outside the region');
  }
  if (request.residencyRegion) {
    if (!transportRegions?.includes(request.residencyRegion)) {
      faults.push('transport does not publish the pinned region');
    }
    if (!model.residencyRegions?.includes(request.residencyRegion)) {
      faults.push('model does not publish the pinned region');
    }
  }

  for (const capability of request.requiredCapabilities ?? []) {
    if (registry.capabilities[route.modelKey]?.[capability] !== true) {
      faults.push(`model lacks ${capability}`);
    }
  }

  return faults;
}

const SWEEP = sweepRequests(600);

describe('the automatic router over a seeded sweep', () => {
  it('never answers from a route the registry does not admit', () => {
    const offences: string[] = [];
    for (const request of SWEEP) {
      const decision = resolveAutoRoute(request);
      if (decision.status !== 'selected') continue;
      const faults = admissionFaults(decision.routeId, request);
      if (faults.length > 0) {
        offences.push(`${request.requestId} -> ${decision.routeId}: ${faults.join('; ')}`);
      }
    }
    expect(offences).toEqual([]);
  });

  it('never answers with a different model than the route it selected serves', () => {
    for (const request of SWEEP) {
      const decision = resolveAutoRoute(request);
      if (decision.status !== 'selected') continue;
      expect(registry.routes[decision.routeId]?.modelKey).toBe(decision.modelKey);
      expect(registry.routes[decision.routeId]?.provider).toBe(decision.provider);
      expect(registry.routes[decision.routeId]?.harnessId).toBe(decision.harnessId);
    }
  });

  it('offers only admissible fallbacks, so no later hop can land on a refused route', () => {
    const offences: string[] = [];
    for (const request of SWEEP) {
      const decision = resolveAutoRoute(request);
      if (decision.status !== 'selected') continue;
      for (const fallback of decision.fallbacks) {
        const faults = admissionFaults(fallback.routeId, request);
        if (faults.length > 0) {
          offences.push(`${request.requestId} -> ${fallback.routeId}: ${faults.join('; ')}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it('refuses with a named code and a stated reason, never an anonymous failure', () => {
    for (const request of SWEEP) {
      const decision = resolveAutoRoute(request);
      if (decision.status === 'selected') continue;
      expect(decision.code).toBeTruthy();
      expect(decision.reasons.length).toBeGreaterThan(0);
      for (const reason of decision.reasons) expect(reason.trim().length).toBeGreaterThan(0);
    }
  });

  it('records no request content in the decision it returns', () => {
    const secret = 'sweep-private-prompt-text';
    const decision = resolveAutoRoute({
      selection: 'auto',
      taskType: 'general',
      subscriptionTier: 'pro',
      trustMode: MANAGED,
      requestId: secret,
    });
    const trace = JSON.stringify({ ...decision, requestedSelection: '' });
    expect(trace).not.toContain(secret);
  });

  it('decides the same way twice for the same request', () => {
    for (const request of SWEEP) {
      expect(resolveAutoRoute(request)).toEqual(resolveAutoRoute(request));
    }
  });
});

describe('each admission rule, mutated one at a time', () => {
  const baseline: AutoRoutingRequest = {
    selection: 'auto',
    taskType: 'general',
    subscriptionTier: 'max',
    trustMode: MANAGED,
    requestId: 'mutation-baseline',
  };

  function selectedRouteId(request: AutoRoutingRequest): string {
    const decision = resolveAutoRoute(request);
    if (decision.status !== 'selected')
      throw new Error(`baseline did not select: ${decision.code}`);
    return decision.routeId;
  }

  it('selects something to mutate away from', () => {
    expect(selectedRouteId(baseline)).toBeTruthy();
  });

  it('refuses the transport the caller excluded', () => {
    const routeId = selectedRouteId(baseline);
    const provider = registry.routes[routeId]!.provider;
    const decision = resolveAutoRoute({
      ...baseline,
      excludedRouteHosts: new Set([provider]),
    });
    if (decision.status === 'selected') {
      expect(registry.routes[decision.routeId]!.provider).not.toBe(provider);
    } else {
      expect(decision.reasons.join(' ')).toContain('excluded transport');
    }
  });

  it('refuses a harness the calling runtime cannot execute', () => {
    const decision = resolveAutoRoute({ ...baseline, allowedHarnessIds: ['harness/that-is-not'] });
    expect(decision.status).toBe('unavailable');
    if (decision.status === 'unavailable') {
      expect(decision.reasons.join(' ')).toContain('is not executable on the calling runtime');
    }
  });

  it('refuses a capability no model in the catalog has', () => {
    const decision = resolveAutoRoute({
      ...baseline,
      requiredCapabilities: [
        'videoOutput',
        'reranking',
      ] as AutoRoutingRequest['requiredCapabilities'],
    });
    expect(decision.status).toBe('unavailable');
  });

  it('refuses a trust mode the governing workspace does not permit', () => {
    const decision = resolveAutoRoute({ ...baseline, allowedTrustModes: ['local'] });
    expect(decision).toMatchObject({ status: 'unavailable', code: 'trust_mode_not_permitted' });
  });

  it('refuses a residency pin no route in the catalog publishes', () => {
    const decision = resolveAutoRoute({ ...baseline, residencyRegion: 'atlantis' });
    expect(decision.status).toBe('unavailable');
  });

  it('refuses every route when the workspace policy blocks every vendor', () => {
    const vendors = [
      ...new Set(Object.values(registry.models).map((model) => model.identity.provider)),
    ];
    const decision = resolveAutoRoute({
      ...baseline,
      organizationPolicy: { blockedProviders: vendors } as AutoRoutingRequest['organizationPolicy'],
    });
    expect(decision.status).toBe('unavailable');
  });

  it('keeps zero-retention requests on routes that guarantee it', () => {
    const decision = resolveAutoRoute({ ...baseline, zeroDataRetentionOnly: true });
    if (decision.status === 'selected') {
      expect(
        admissionFaults(decision.routeId, { ...baseline, zeroDataRetentionOnly: true }),
      ).toEqual([]);
    }
  });

  it('prefers a healthy route over one the store has parked', () => {
    const routeId = selectedRouteId(baseline);
    const decision = resolveAutoRoute({
      ...baseline,
      enableObservedHealthRanking: true,
      observedRouteHealth: { [routeId]: { credentialUnfunded: true } },
    });
    expect(decision.status).toBe('selected');
    if (decision.status === 'selected') expect(decision.routeId).not.toBe(routeId);
  });
});
