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

import { resolveAutoRoute, type RoutingTrustMode } from '../auto';
import type { RoutingTaskType } from '../types';

const FIXTURE_INDENT = 2;

const FIXTURE_PATH = fileURLToPath(
  new URL('./fixtures/auto-route-conformance.json', import.meta.url),
);

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

describe('auto-route cross-language conformance', () => {
  const computed = computeCases();

  if (process.env.AGI_UPDATE_ROUTING_CONFORMANCE === '1') {
    it('regenerates the conformance fixture', () => {
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(computed, null, FIXTURE_INDENT)}\n`);
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
});
