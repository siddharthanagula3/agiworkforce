/**
 * The TypeScript half of the cross-language Auto-routing conformance contract.
 *
 * `packages/ai/routing/src/auto.ts` and `crates/agiworkforce-model-registry`
 * are two independent resolvers over one generated policy. Design-doc **OQ-1
 * (which of them is canonical) is undecided**, so neither may be treated as the
 * other's reference, but a routing-policy or resolver change must not silently
 * make them disagree. `fixtures/auto-route-conformance.json` records the
 * decision both are required to reach, and the crate's
 * `tests/auto_route_conformance.rs` replays the same file. The fixture is the
 * contract; neither implementation is.
 *
 * Regenerate with `AGI_UPDATE_ROUTING_CONFORMANCE=1`, then re-run the Rust
 * test: a case only this side changed surfaces there as a failure.
 *
 * Cases stay inside the request surface BOTH resolvers implement. Budgets,
 * session capability documents and the task-family stage are TypeScript-only
 * (see `task-family-routing.ts`) and are excluded rather than pinned to one
 * side's behaviour.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { modelRegistry } from '@agiworkforce/model-registry';
import { describe, expect, it } from 'vitest';

import { resolveAutoRoute, type ObservedRouteHealth, type RoutingTrustMode } from '../auto';
import type { ModelAccessPolicy } from '../model-policy';
import type { RoutingTaskType } from '../types';

const FIXTURE_INDENT = 2;

const FIXTURE_PATH = fileURLToPath(
  new URL('./fixtures/auto-route-conformance.json', import.meta.url),
);

/**
 * Observed-health ranking is a TypeScript-only stage, for the same reason
 * `runtimeState`, `preferSlots` and `preferredRouteId` are: it consumes live
 * measurements the Rust resolver has no store to read. Pinning it in the shared
 * fixture would make the crate replay a decision it cannot compute, so it gets
 * its own file rather than one side's behaviour recorded as a cross-language
 * contract.
 *
 * What IS pinned across both: every flag-off case here must equal the shared
 * fixture's case for the same request, byte for byte.
 */
const OBSERVED_HEALTH_FIXTURE_PATH = fileURLToPath(
  new URL('./fixtures/auto-route-observed-health.json', import.meta.url),
);

/**
 * Organization policy is a TypeScript-only admission input, for the same reason
 * observed health is: its evaluator carries a hand-maintained provider-synonym
 * table, and mirroring that table into the crate would duplicate exactly the
 * data the no-hardcoding rule forbids duplicating. The Rust resolver has no
 * workspace to be governed by, so its cases live here rather than in the shared
 * file. Every ungoverned case is asserted equal to the shared fixture.
 */
const POLICY_FIXTURE_PATH = fileURLToPath(
  new URL('./fixtures/auto-route-policy.json', import.meta.url),
);

const OBSERVED_TRUST_MODE: RoutingTrustMode = 'managed_cloud';
const PENALISED_FAILURE_RATE = 0.9;
const PENALISED_LATENCY_MS = 4_000;
const FLAG_ON_SUFFIX = 'flag_on';
const FLAG_OFF_SUFFIX = 'flag_off';

const TASK_TYPES: readonly RoutingTaskType[] = [
  'simple_chat',
  'general',
  'coding',
  'reasoning',
  'creative_writing',
  'multimodal',
  'long_context',
  'research',
  'agentic',
  'computer-use',
  'image_generation',
];
const TIERS = ['free', 'pro', 'max', 'enterprise', 'byok'] as const;
const TRUST_MODES: readonly RoutingTrustMode[] = ['local', 'on_device', 'byok', 'managed_cloud'];

interface ConformanceRegistryView {
  models: Record<string, unknown>;
  policies: {
    auto: {
      aliases: Record<string, unknown>;
      providerPolicies: { usOnly: { allowedTiers: string[] } };
    };
  };
}

const registry = modelRegistry as unknown as ConformanceRegistryView;
const aliases = Object.keys(registry.policies.auto.aliases).sort();
const modelKeys = Object.keys(registry.models).sort();
const usOnlyTiers = TIERS.filter((tier) =>
  registry.policies.auto.providerPolicies.usOnly.allowedTiers.includes(tier),
);

function encode(decision: ReturnType<typeof resolveAutoRoute>): string {
  const profiles = `${decision.requestedProfile ?? '~'};${decision.effectiveProfile ?? '~'}`;
  if (decision.status === 'unavailable') {
    return `unavailable;~;~;${decision.code};${profiles};`;
  }
  return [
    'selected',
    decision.modelKey,
    decision.routeId,
    decision.reason,
    profiles,
    decision.fallbacks.map((fallback) => fallback.modelKey).join(','),
  ].join(';');
}

/**
 * Every case is keyed by a string the Rust side re-parses into the same
 * request, so the two suites cannot drift in what they compare.
 */
function computeCases(): Record<string, string> {
  const cases: Record<string, string> = {};
  const record = (key: string, request: Parameters<typeof resolveAutoRoute>[0]): void => {
    cases[key] = encode(resolveAutoRoute({ ...request, enableTaskFamilyStage: false }));
  };

  for (const selection of aliases) {
    for (const taskType of TASK_TYPES) {
      for (const subscriptionTier of TIERS) {
        for (const trustMode of TRUST_MODES) {
          record(`alias|${selection}|${taskType}|${subscriptionTier}|${trustMode}|any`, {
            selection,
            taskType,
            subscriptionTier,
            trustMode,
          });
          if (usOnlyTiers.includes(subscriptionTier)) {
            record(`alias|${selection}|${taskType}|${subscriptionTier}|${trustMode}|us_only`, {
              selection,
              taskType,
              subscriptionTier,
              trustMode,
              usOnly: true,
            });
          }
        }
      }
    }
  }

  for (const modelKey of modelKeys) {
    for (const trustMode of TRUST_MODES) {
      record(`explicit|${modelKey}|${trustMode}`, {
        selection: modelKey,
        taskType: 'general',
        subscriptionTier: 'max',
        trustMode,
      });
    }
    record(`continuity|${modelKey}`, {
      selection: 'auto',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'byok',
      currentModelKey: modelKey,
      previousTaskType: 'coding',
    });
  }

  return cases;
}

function observedCaseKey(
  selection: string,
  taskType: RoutingTaskType,
  subscriptionTier: string,
  suffix: string,
): string {
  return `observed|${selection}|${taskType}|${subscriptionTier}|${OBSERVED_TRUST_MODE}|${suffix}`;
}

function sharedCaseKey(
  selection: string,
  taskType: RoutingTaskType,
  subscriptionTier: string,
): string {
  return `alias|${selection}|${taskType}|${subscriptionTier}|${OBSERVED_TRUST_MODE}|any`;
}

/**
 * Penalise whatever route the flag-off decision chose, then record what the
 * ranker does with that. A model with a second admissible route moves; one
 * without keeps its route, which is the correct answer and worth pinning too.
 */
function computeObservedCases(): Record<string, string> {
  const cases: Record<string, string> = {};
  for (const selection of aliases) {
    for (const taskType of TASK_TYPES) {
      for (const subscriptionTier of TIERS) {
        const request = {
          selection,
          taskType,
          subscriptionTier,
          trustMode: OBSERVED_TRUST_MODE,
          enableTaskFamilyStage: false,
        } as const;
        const base = resolveAutoRoute(request);
        if (base.status !== 'selected') continue;
        const observedRouteHealth: Record<string, ObservedRouteHealth> = {
          [base.routeId]: {
            failureRate: PENALISED_FAILURE_RATE,
            latencyP50Ms: PENALISED_LATENCY_MS,
          },
        };
        cases[observedCaseKey(selection, taskType, subscriptionTier, FLAG_ON_SUFFIX)] = encode(
          resolveAutoRoute({
            ...request,
            observedRouteHealth,
            enableObservedHealthRanking: true,
          }),
        );
        cases[observedCaseKey(selection, taskType, subscriptionTier, FLAG_OFF_SUFFIX)] = encode(
          resolveAutoRoute({
            ...request,
            observedRouteHealth,
            enableObservedHealthRanking: false,
          }),
        );
      }
    }
  }
  return cases;
}

interface PolicyScenario {
  suffix: string;
  policy: (vendor: string, modelKey: string) => ModelAccessPolicy | null;
}

const POLICY_SCENARIOS: readonly PolicyScenario[] = [
  { suffix: 'ungoverned', policy: () => null },
  {
    suffix: 'blocked_vendor',
    policy: (vendor) => ({
      allowedProviders: [],
      blockedProviders: [vendor],
      allowedModels: [],
      blockedModels: [],
    }),
  },
  {
    suffix: 'blocked_model',
    policy: (_vendor, modelKey) => ({
      allowedProviders: [],
      blockedProviders: [],
      allowedModels: [],
      blockedModels: [modelKey],
    }),
  },
  {
    suffix: 'vendor_allowlist',
    policy: (vendor) => ({
      allowedProviders: [vendor],
      blockedProviders: [],
      allowedModels: [],
      blockedModels: [],
    }),
  },
  {
    suffix: 'model_allow_over_vendor_block',
    policy: (vendor, modelKey) => ({
      allowedProviders: [],
      blockedProviders: [vendor],
      allowedModels: [modelKey],
      blockedModels: [],
    }),
  },
];

function policyCaseKey(
  selection: string,
  taskType: RoutingTaskType,
  subscriptionTier: string,
  suffix: string,
): string {
  return `policy|${selection}|${taskType}|${subscriptionTier}|${OBSERVED_TRUST_MODE}|${suffix}`;
}

/**
 * Every policy is written against whatever the ungoverned decision picked, so
 * the cases stay catalog-driven: no provider or model id is named here.
 */
function computePolicyCases(): Record<string, string> {
  const cases: Record<string, string> = {};
  for (const selection of aliases) {
    for (const taskType of TASK_TYPES) {
      for (const subscriptionTier of TIERS) {
        const request = {
          selection,
          taskType,
          subscriptionTier,
          trustMode: OBSERVED_TRUST_MODE,
          enableTaskFamilyStage: false,
        } as const;
        const base = resolveAutoRoute(request);
        if (base.status !== 'selected') continue;
        const vendor = base.routeId.slice(0, base.routeId.indexOf('/'));
        for (const scenario of POLICY_SCENARIOS) {
          cases[policyCaseKey(selection, taskType, subscriptionTier, scenario.suffix)] = encode(
            resolveAutoRoute({
              ...request,
              organizationPolicy: scenario.policy(vendor, base.modelKey),
            }),
          );
        }
      }
    }
  }
  return cases;
}

describe('auto-route cross-language conformance', () => {
  const computed = computeCases();

  if (process.env.AGI_UPDATE_ROUTING_CONFORMANCE === '1') {
    it('regenerates the conformance fixture', () => {
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(computed, null, FIXTURE_INDENT)}\n`);
      writeFileSync(
        OBSERVED_HEALTH_FIXTURE_PATH,
        `${JSON.stringify(computeObservedCases(), null, FIXTURE_INDENT)}\n`,
      );
      writeFileSync(
        POLICY_FIXTURE_PATH,
        `${JSON.stringify(computePolicyCases(), null, FIXTURE_INDENT)}\n`,
      );
      expect(Object.keys(computed).length).toBeGreaterThan(0);
    });
    return;
  }

  const recorded = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Record<string, string>;

  it('covers every alias, task, tier, trust mode and registry model', () => {
    expect(Object.keys(computed).sort()).toEqual(Object.keys(recorded).sort());
  });

  it('reaches the recorded decision for every case', () => {
    const drifted = Object.entries(computed).filter(([key, value]) => recorded[key] !== value);
    expect(drifted).toEqual([]);
  });

  describe('observed-health ranking conformance', () => {
    const observedComputed = computeObservedCases();
    const observedRecorded = JSON.parse(
      readFileSync(OBSERVED_HEALTH_FIXTURE_PATH, 'utf8'),
    ) as Record<string, string>;
    it('covers the same cases the fixture records', () => {
      expect(Object.keys(observedComputed).sort()).toEqual(Object.keys(observedRecorded).sort());
    });

    it('reaches the recorded decision for every case', () => {
      const drifted = Object.entries(observedComputed).filter(
        ([key, value]) => observedRecorded[key] !== value,
      );
      expect(drifted).toEqual([]);
    });

    it('reproduces the shared fixture byte for byte with the flag off', () => {
      const drifted = Object.entries(observedRecorded)
        .filter(([key]) => key.endsWith(FLAG_OFF_SUFFIX))
        .map(([key, value]) => {
          const [, selection, taskType, subscriptionTier] = key.split('|');
          return [
            key,
            value,
            recorded[sharedCaseKey(selection!, taskType as RoutingTaskType, subscriptionTier!)],
          ] as const;
        })
        .filter(([, observed, sharedValue]) => observed !== sharedValue);
      expect(drifted).toEqual([]);
    });

    it('changes at least one head route when the flag is on', () => {
      const moved = Object.entries(observedRecorded).filter(([key, value]) => {
        if (!key.endsWith(FLAG_ON_SUFFIX)) return false;
        return observedRecorded[key.replace(FLAG_ON_SUFFIX, FLAG_OFF_SUFFIX)] !== value;
      });
      expect(moved.length).toBeGreaterThan(0);
    });
  });

  describe('organization policy conformance', () => {
    const policyComputed = computePolicyCases();
    const policyRecorded = JSON.parse(readFileSync(POLICY_FIXTURE_PATH, 'utf8')) as Record<
      string,
      string
    >;

    it('covers the same cases the fixture records', () => {
      expect(Object.keys(policyComputed).sort()).toEqual(Object.keys(policyRecorded).sort());
    });

    it('reaches the recorded decision for every case', () => {
      const drifted = Object.entries(policyComputed).filter(
        ([key, value]) => policyRecorded[key] !== value,
      );
      expect(drifted).toEqual([]);
    });

    it('reproduces the shared fixture byte for byte when ungoverned', () => {
      const drifted = Object.entries(policyRecorded)
        .filter(([key]) => key.endsWith('ungoverned'))
        .map(([key, value]) => {
          const [, selection, taskType, subscriptionTier] = key.split('|');
          return [
            key,
            value,
            recorded[sharedCaseKey(selection!, taskType as RoutingTaskType, subscriptionTier!)],
          ] as const;
        })
        .filter(([, governed, sharedValue]) => governed !== sharedValue);
      expect(drifted).toEqual([]);
    });

    it('never serves a route the workspace blocked', () => {
      const served = Object.entries(policyRecorded).filter(
        ([key, value]) => key.endsWith('blocked_vendor') && value.startsWith('selected'),
      );
      const leaked = served.filter(([key, value]) => {
        const ungoverned = policyRecorded[key.replace('blocked_vendor', 'ungoverned')] ?? '';
        const blockedVendor = ungoverned.split(';')[2]?.split('/')[0];
        return value.split(';')[2]?.startsWith(`${blockedVendor}/`);
      });
      expect(leaked).toEqual([]);
    });

    /**
     * The HEAD only. An allowlist naming one model makes every other model
     * `model_not_allowed`, so the fallback tail correctly empties out; what must
     * survive is the model the administrator explicitly approved.
     */
    it('lets an explicit model allow survive a block on its vendor', () => {
      const head = (decision: string | undefined): string =>
        (decision ?? '').split(';').slice(0, 3).join(';');
      const drifted = Object.entries(policyRecorded)
        .filter(([key]) => key.endsWith('model_allow_over_vendor_block'))
        .filter(
          ([key, value]) =>
            head(policyRecorded[key.replace('model_allow_over_vendor_block', 'ungoverned')]) !==
            head(value),
        );
      expect(drifted).toEqual([]);
    });
  });
});
