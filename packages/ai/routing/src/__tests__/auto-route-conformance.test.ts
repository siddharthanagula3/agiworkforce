import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { modelRegistry } from '@agiworkforce/model-registry';
import { describe, expect, it } from 'vitest';

import { resolveAutoRoute, type RoutingTrustMode } from '../auto';
import type { RoutingTaskType } from '../types';

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
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(computed, null, 1)}\n`);
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
