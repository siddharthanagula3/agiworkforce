import { modelRegistry } from '@agiworkforce/model-registry';
import { describe, expect, it } from 'vitest';

import {
  observedRoutePenalty,
  previewAutoRoute,
  resolveAutoRoute,
  unhonouredCapabilityPenalty,
  type IntrinsicCapability,
  type ObservedRouteHealth,
  type RoutingTrustMode,
} from '../auto';
import type { RoutingTaskType } from '../types';

const TOOLS: IntrinsicCapability = 'functionCalling';
const STRUCTURED: IntrinsicCapability = 'structuredOutput';
const CARRYING_TOOLS: readonly IntrinsicCapability[] = [TOOLS];
const CARRYING_NOTHING: readonly IntrinsicCapability[] = [];
const TRUST_MODE: RoutingTrustMode = 'byok';
const WORST_OBSERVED: ObservedRouteHealth = { failureRate: 1, latencyP50Ms: 60_000 };
const LOST_TOOLS: ObservedRouteHealth = { unhonouredCapabilities: [TOOLS] };

const ALIASES = Object.keys(modelRegistry.policies.auto.aliases);
const TASKS = Object.keys(modelRegistry.policies.auto.tasks) as RoutingTaskType[];
const TIERS = Object.keys(modelRegistry.policies.auto.tierMaximumProfiles);

interface MovedCase {
  baseRouteId: string;
  penalisedRouteId: string;
  unpenalisedRouteId: string;
}

/**
 * The registry decides which model has a second admissible route, so nothing
 * here names a model, an alias or a provider.
 */
function firstCaseThatMoves(): MovedCase | undefined {
  for (const selection of ALIASES) {
    for (const taskType of TASKS) {
      for (const subscriptionTier of TIERS) {
        const request = {
          selection,
          taskType,
          subscriptionTier,
          trustMode: TRUST_MODE,
          enableTaskFamilyStage: false,
        } as const;
        const base = resolveAutoRoute(request);
        if (base.status !== 'selected') continue;
        const observedRouteHealth = { [base.routeId]: LOST_TOOLS };
        const penalised = resolveAutoRoute({
          ...request,
          observedRouteHealth,
          capabilitiesInUse: CARRYING_TOOLS,
        });
        const unpenalised = resolveAutoRoute({
          ...request,
          observedRouteHealth,
          capabilitiesInUse: CARRYING_NOTHING,
        });
        if (penalised.status !== 'selected' || unpenalised.status !== 'selected') continue;
        if (penalised.routeId === base.routeId) continue;
        return {
          baseRouteId: base.routeId,
          penalisedRouteId: penalised.routeId,
          unpenalisedRouteId: unpenalised.routeId,
        };
      }
    }
  }
  return undefined;
}

describe('unhonoured capability penalty', () => {
  it('is zero for a route nothing has been observed about', () => {
    expect(unhonouredCapabilityPenalty(undefined, CARRYING_TOOLS)).toBe(0);
  });

  it('is zero when the request carries no capability at all', () => {
    expect(unhonouredCapabilityPenalty(LOST_TOOLS, CARRYING_NOTHING)).toBe(0);
  });

  it('is zero when the request carries a different capability', () => {
    expect(unhonouredCapabilityPenalty(LOST_TOOLS, [STRUCTURED])).toBe(0);
  });

  it('applies when the request carries the capability the route stopped honouring', () => {
    expect(unhonouredCapabilityPenalty(LOST_TOOLS, CARRYING_TOOLS)).toBeGreaterThan(0);
  });

  it('outranks the worst failure and latency a healthy route can show', () => {
    const suspect = observedRoutePenalty({ ...LOST_TOOLS }, true, CARRYING_TOOLS);
    const worstHealthy = observedRoutePenalty(WORST_OBSERVED, true, CARRYING_TOOLS);
    expect(suspect).toBeGreaterThan(worstHealthy);
  });

  it('applies with the observed-health flag off, unlike the failure and latency bands', () => {
    expect(observedRoutePenalty(WORST_OBSERVED, false, CARRYING_TOOLS)).toBe(0);
    expect(observedRoutePenalty(LOST_TOOLS, false, CARRYING_TOOLS)).toBeGreaterThan(0);
  });

  it('leaves a route with no observation exactly where it was', () => {
    expect(observedRoutePenalty(undefined, false, CARRYING_TOOLS)).toBe(0);
    expect(observedRoutePenalty({}, true, CARRYING_TOOLS)).toBe(0);
  });
});

describe('a route that stopped honouring tools', () => {
  const moved = firstCaseThatMoves();

  it('has at least one registry case where a peer route exists to move to', () => {
    expect(moved).toBeDefined();
  });

  it('ranks below a healthy peer for a request that carries tools', () => {
    expect(moved?.penalisedRouteId).not.toBe(moved?.baseRouteId);
  });

  it('is left exactly where it was for a request that carries none', () => {
    expect(moved?.unpenalisedRouteId).toBe(moved?.baseRouteId);
  });

  it('is still selected when it is the only route, so admission never changes', () => {
    for (const selection of ALIASES) {
      const request = {
        selection,
        taskType: TASKS[0]!,
        subscriptionTier: TIERS[0]!,
        trustMode: TRUST_MODE,
        enableTaskFamilyStage: false,
      } as const;
      const base = resolveAutoRoute(request);
      if (base.status !== 'selected') continue;
      const everyRouteSuspect = Object.fromEntries(
        Object.keys(modelRegistry.routes).map((routeId) => [routeId, LOST_TOOLS]),
      );
      const penalised = resolveAutoRoute({
        ...request,
        observedRouteHealth: everyRouteSuspect,
        capabilitiesInUse: CARRYING_TOOLS,
      });
      expect(penalised.status).toBe('selected');
    }
  });
});

describe('route preview', () => {
  it('reports the capability penalty separately and says which capability was lost', () => {
    const moved = firstCaseThatMoves();
    expect(moved).toBeDefined();
    const preview = previewAutoRoute({
      selection: ALIASES[0]!,
      taskType: TASKS[0]!,
      subscriptionTier: TIERS[0]!,
      trustMode: TRUST_MODE,
      enableTaskFamilyStage: false,
      observedRouteHealth: { [moved!.baseRouteId]: LOST_TOOLS },
      capabilitiesInUse: CARRYING_TOOLS,
    });
    for (const candidate of preview.candidates) {
      const suspect = candidate.routeId === moved!.baseRouteId;
      expect(candidate.score.capabilityPenalty > 0).toBe(suspect);
      expect(candidate.reasons.some((reason) => reason.includes(TOOLS))).toBe(suspect);
    }
  });

  it('reports a zero capability penalty when the request carries nothing', () => {
    const preview = previewAutoRoute({
      selection: ALIASES[0]!,
      taskType: TASKS[0]!,
      subscriptionTier: TIERS[0]!,
      trustMode: TRUST_MODE,
      enableTaskFamilyStage: false,
    });
    for (const candidate of preview.candidates) {
      expect(candidate.score.capabilityPenalty).toBe(0);
    }
  });
});
