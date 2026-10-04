import { describe, expect, it } from 'vitest';
import { modelRegistry, providerKeepsInputsOutOfTraining } from '@agiworkforce/model-registry';

import {
  resolveAutoRoute,
  type AutoRouteDecision,
  type AutoRoutingRequest,
  type RoutingTrustMode,
} from '../auto';
import { buildRoutingDecisionTrace } from '../routing-trace';

/**
 * `noTrainingOnly` is admission, not preference: narrowing
 * `availableProviderIds` only ranks routes and still returns a parked
 * may-train pick when nothing in the narrowed set is credentialed.
 *
 * Every assertion reads BOTH identities of a route: the vendor that owns the
 * model and the transport that serves it. A model whose vendor keeps inputs out
 * of training is still carried by transports that do not, so a check on either
 * identity alone passes while the other one leaks.
 */
interface RegistryView {
  models: Record<string, { identity: { provider: string } }>;
  routes: Record<string, { modelKey: string; provider: string }>;
  governance: Record<string, unknown>;
  policies: {
    auto: {
      aliases: Record<string, unknown>;
      tasks: Record<string, unknown>;
      tierAllowedSlots: Record<string, unknown>;
    };
  };
}

const registry = modelRegistry as unknown as RegistryView;

const MANAGED: RoutingTrustMode = 'managed_cloud';
const FREE_TIER = 'free';
const TIERS = Object.keys(registry.policies.auto.tierAllowedSlots);
const TASKS = Object.keys(registry.policies.auto.tasks) as AutoRoutingRequest['taskType'][];
const ALIASES = Object.keys(registry.policies.auto.aliases);
const MODEL_KEYS = Object.keys(registry.models);
const PROVIDER_IDS = Object.keys(registry.governance);
const MAY_TRAIN_PROVIDER_IDS = PROVIDER_IDS.filter(
  (providerId) => !providerKeepsInputsOutOfTraining(providerId),
);

interface ServedRoute {
  modelKey: string;
  routeId: string;
  provider: string;
}

function servedRoutes(decision: AutoRouteDecision): ServedRoute[] {
  if (decision.status !== 'selected') return [];
  return [decision, ...decision.fallbacks, ...(decision.shadow ? [decision.shadow] : [])].map(
    ({ modelKey, routeId, provider }) => ({ modelKey, routeId, provider }),
  );
}

function identitiesThatMayTrain(served: ServedRoute): string[] {
  const vendor = registry.models[served.modelKey]?.identity.provider ?? 'unregistered-vendor';
  const transport = registry.routes[served.routeId]?.provider ?? 'unregistered-transport';
  return [...new Set([vendor, transport, served.provider])].filter(
    (identity) => !providerKeepsInputsOutOfTraining(identity),
  );
}

function trainingOffences(decision: AutoRouteDecision): string[] {
  return servedRoutes(decision).flatMap((served) => {
    const identities = identitiesThatMayTrain(served);
    return identities.length > 0 ? [`${served.routeId} through ${identities.join(', ')}`] : [];
  });
}

function vendorMayTrain(modelKey: string): boolean {
  const vendor = registry.models[modelKey]?.identity.provider;
  return vendor === undefined || !providerKeepsInputsOutOfTraining(vendor);
}

describe('the probe: a free-plan request that must stay out of training', () => {
  const probeTasks: AutoRoutingRequest['taskType'][] = ['simple_chat', 'coding'];

  for (const taskType of probeTasks) {
    const request: AutoRoutingRequest = {
      selection: 'auto',
      taskType,
      subscriptionTier: FREE_TIER,
      trustMode: MANAGED,
    };

    it(`serves ${taskType} from a provider that may train when nothing asks otherwise`, () => {
      const decision = resolveAutoRoute(request);
      expect(decision.status).toBe('selected');
      expect(trainingOffences(decision)).not.toEqual([]);
    });

    it(`refuses ${taskType} instead of returning that route`, () => {
      const decision = resolveAutoRoute({ ...request, noTrainingOnly: true });
      expect(decision).toMatchObject({ status: 'unavailable', code: 'no_eligible_route' });
      if (decision.status !== 'unavailable') return;
      expect(decision.reasons.join(' ')).toContain('may train on inputs');
    });
  }

  it('is not rescued by a credential set that holds only may-train providers', () => {
    const decision = resolveAutoRoute({
      selection: 'auto',
      taskType: 'simple_chat',
      subscriptionTier: FREE_TIER,
      trustMode: MANAGED,
      noTrainingOnly: true,
      availableProviderIds: new Set(MAY_TRAIN_PROVIDER_IDS),
    });
    expect(decision).toMatchObject({ status: 'unavailable', code: 'no_eligible_route' });
  });
});

describe('every tier, task and alias with the rule on', () => {
  const credentialSets: readonly (ReadonlySet<string> | undefined)[] = [
    undefined,
    new Set(PROVIDER_IDS),
    new Set(MAY_TRAIN_PROVIDER_IDS),
  ];

  function sweep(): { request: AutoRoutingRequest; decision: AutoRouteDecision }[] {
    const results: { request: AutoRoutingRequest; decision: AutoRouteDecision }[] = [];
    for (const subscriptionTier of TIERS) {
      for (const taskType of TASKS) {
        for (const selection of ALIASES) {
          for (const availableProviderIds of credentialSets) {
            const request: AutoRoutingRequest = {
              selection,
              taskType,
              subscriptionTier,
              trustMode: MANAGED,
              noTrainingOnly: true,
              ...(availableProviderIds ? { availableProviderIds } : {}),
            };
            results.push({ request, decision: resolveAutoRoute(request) });
          }
        }
      }
    }
    return results;
  }

  const results = sweep();

  it('has a catalog in which the rule can bite', () => {
    expect(MAY_TRAIN_PROVIDER_IDS.length).toBeGreaterThan(0);
    expect(MAY_TRAIN_PROVIDER_IDS.length).toBeLessThan(PROVIDER_IDS.length);
  });

  it('never selects, falls back to or mirrors onto a vendor or transport that may train', () => {
    const offences = results.flatMap(({ request, decision }) =>
      trainingOffences(decision).map(
        (offence) =>
          `${request.selection}|${request.taskType}|${request.subscriptionTier}|${
            request.availableProviderIds ? [...request.availableProviderIds].length : 'any'
          } -> ${offence}`,
      ),
    );
    expect(offences).toEqual([]);
  });

  it('still serves a paid tier, so the rule is not passing by refusing everything', () => {
    const paidSelections = results.filter(
      ({ request, decision }) =>
        request.subscriptionTier !== FREE_TIER && decision.status === 'selected',
    );
    expect(paidSelections.length).toBeGreaterThan(0);
  });

  it('reaches a may-train route for some of the same paid requests without the rule', () => {
    const exposed = results.filter(({ request }) => {
      const { noTrainingOnly: _rule, ...unfiltered } = request;
      return (
        request.subscriptionTier !== FREE_TIER &&
        trainingOffences(resolveAutoRoute(unfiltered)).length > 0
      );
    });
    expect(exposed.length).toBeGreaterThan(0);
  });

  it('leaves a request that does not set the rule exactly as it was', () => {
    for (const { request } of results) {
      const { noTrainingOnly: _rule, ...unfiltered } = request;
      expect(resolveAutoRoute({ ...unfiltered, noTrainingOnly: false })).toEqual(
        resolveAutoRoute(unfiltered),
      );
    }
  });
});

describe('a model the user named', () => {
  function named(modelKey: string): AutoRoutingRequest {
    return {
      selection: modelKey,
      taskType: 'general',
      subscriptionTier: 'max',
      trustMode: MANAGED,
    };
  }

  it('is refused, with the reason stated, when its vendor may train', () => {
    const mayTrainModels = MODEL_KEYS.filter(vendorMayTrain);
    expect(mayTrainModels.length).toBeGreaterThan(0);
    const served: string[] = [];
    const unexplained: string[] = [];
    for (const modelKey of mayTrainModels) {
      const decision = resolveAutoRoute({ ...named(modelKey), noTrainingOnly: true });
      if (decision.status === 'selected' || decision.code !== 'explicit_model_ineligible') {
        served.push(modelKey);
        continue;
      }
      if (!decision.reasons.some((reason) => reason.includes('may train'))) {
        unexplained.push(modelKey);
      }
    }
    expect(served).toEqual([]);
    expect(unexplained).toEqual([]);
  });

  it('serves some of those models when the rule is off, so the refusal is the rule', () => {
    const servedWithoutRule = MODEL_KEYS.filter(
      (modelKey) =>
        vendorMayTrain(modelKey) && resolveAutoRoute(named(modelKey)).status === 'selected',
    );
    expect(servedWithoutRule.length).toBeGreaterThan(0);
  });

  it('keeps both identities out of training whenever it is served', () => {
    const offences: string[] = [];
    let selected = 0;
    for (const modelKey of MODEL_KEYS) {
      const decision = resolveAutoRoute({ ...named(modelKey), noTrainingOnly: true });
      if (decision.status !== 'selected') continue;
      selected += 1;
      expect(decision.modelKey).toBe(modelKey);
      offences.push(...trainingOffences(decision).map((offence) => `${modelKey} -> ${offence}`));
    }
    expect(selected).toBeGreaterThan(0);
    expect(offences).toEqual([]);
  });

  it('drops a may-train transport from a model whose own vendor keeps inputs out', () => {
    const carriedByMayTrainTransport = MODEL_KEYS.filter(
      (modelKey) =>
        !vendorMayTrain(modelKey) && trainingOffences(resolveAutoRoute(named(modelKey))).length > 0,
    );
    expect(carriedByMayTrainTransport.length).toBeGreaterThan(0);
    for (const modelKey of carriedByMayTrainTransport) {
      const decision = resolveAutoRoute({ ...named(modelKey), noTrainingOnly: true });
      expect(trainingOffences(decision), modelKey).toEqual([]);
      if (decision.status === 'unavailable') {
        expect(decision.reasons.join(' '), modelKey).toContain('may train on inputs through');
      }
    }
  });

  it('refuses a pinned route whose transport may train', () => {
    const pinned = Object.entries(registry.routes).find(
      ([routeId, route]) =>
        !vendorMayTrain(route.modelKey) &&
        !providerKeepsInputsOutOfTraining(route.provider) &&
        resolveAutoRoute({ ...named(route.modelKey), requiredRouteId: routeId }).status ===
          'selected',
    );
    expect(pinned).toBeDefined();
    if (!pinned) return;
    const [routeId, route] = pinned;
    expect(
      resolveAutoRoute({
        ...named(route.modelKey),
        requiredRouteId: routeId,
        noTrainingOnly: true,
      }),
    ).toMatchObject({ status: 'unavailable', code: 'explicit_route_ineligible' });
  });
});

describe('continuity', () => {
  function continuing(modelKey: string): AutoRoutingRequest {
    return {
      selection: 'auto',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: MANAGED,
      currentModelKey: modelKey,
      previousTaskType: 'coding',
    };
  }

  it('keeps a may-train current model when the rule is off, so there is something to refuse', () => {
    const kept = MODEL_KEYS.filter((modelKey) => {
      const decision = resolveAutoRoute(continuing(modelKey));
      return (
        decision.status === 'selected' &&
        decision.reason === 'continuity' &&
        trainingOffences(decision).length > 0
      );
    });
    expect(kept.length).toBeGreaterThan(0);
  });

  it('never keeps a current model whose vendor may train', () => {
    const kept: string[] = [];
    const offences: string[] = [];
    for (const modelKey of MODEL_KEYS) {
      const decision = resolveAutoRoute({ ...continuing(modelKey), noTrainingOnly: true });
      if (decision.status !== 'selected') continue;
      if (vendorMayTrain(modelKey) && decision.modelKey === modelKey) kept.push(modelKey);
      offences.push(...trainingOffences(decision).map((offence) => `${modelKey} -> ${offence}`));
    }
    expect(kept).toEqual([]);
    expect(offences).toEqual([]);
  });
});

describe('the routing trace', () => {
  const request: AutoRoutingRequest = {
    selection: 'auto',
    taskType: 'general',
    subscriptionTier: 'max',
    trustMode: MANAGED,
  };

  it('records that the rule was applied', () => {
    const flagged = { ...request, noTrainingOnly: true };
    expect(buildRoutingDecisionTrace(flagged, resolveAutoRoute(flagged)).inputs).toMatchObject({
      noTrainingOnly: true,
    });
  });

  it('records that it was not', () => {
    expect(buildRoutingDecisionTrace(request, resolveAutoRoute(request)).inputs).toMatchObject({
      noTrainingOnly: false,
    });
  });
});
