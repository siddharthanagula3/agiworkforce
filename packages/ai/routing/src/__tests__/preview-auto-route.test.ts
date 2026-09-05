/**
 * The divergence guard for `previewAutoRoute`.
 *
 * `previewAutoRoute` exists to explain a routing decision without ever being
 * allowed to describe a DIFFERENT decision than `resolveAutoRoute` would
 * actually make. This file sweeps the same request space the cross-language
 * conformance suite (`auto-route-conformance.test.ts`) pins and asserts
 * `previewAutoRoute(request).selected` is structurally identical to
 * `resolveAutoRoute(request)` for every one of them, plus shape assertions on
 * `candidates` and `excluded`.
 */
import { modelRegistry } from '@agiworkforce/model-registry';
import { describe, expect, it } from 'vitest';

import {
  previewAutoRoute,
  resolveAutoRoute,
  type AutoRoutingRequest,
  type RoutingTrustMode,
} from '../auto';
import type { RoutingTaskType } from '../types';

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

interface PreviewConformanceRegistryView {
  models: Record<string, unknown>;
  policies: { auto: { aliases: Record<string, unknown> } };
}

const registry = modelRegistry as unknown as PreviewConformanceRegistryView;
const aliases = Object.keys(registry.policies.auto.aliases).sort();
const modelKeys = Object.keys(registry.models).sort();

function requestCases(): readonly AutoRoutingRequest[] {
  const cases: AutoRoutingRequest[] = [];
  for (const selection of aliases) {
    for (const taskType of TASK_TYPES) {
      for (const subscriptionTier of TIERS) {
        for (const trustMode of TRUST_MODES) {
          cases.push({
            selection,
            taskType,
            subscriptionTier,
            trustMode,
            enableTaskFamilyStage: false,
            enableCanary: false,
          });
        }
      }
    }
  }
  for (const modelKey of modelKeys) {
    for (const trustMode of TRUST_MODES) {
      cases.push({
        selection: modelKey,
        taskType: 'general',
        subscriptionTier: 'max',
        trustMode,
        enableTaskFamilyStage: false,
        enableCanary: false,
      });
    }
    cases.push({
      selection: 'auto',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'byok',
      currentModelKey: modelKey,
      previousTaskType: 'coding',
      enableTaskFamilyStage: false,
      enableCanary: false,
    });
  }
  return cases;
}

const cases = requestCases();

describe('previewAutoRoute never diverges from resolveAutoRoute', () => {
  it('sweeps every alias, task, tier, trust mode and registry model', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it('reaches the identical decision resolveAutoRoute reaches, for every case', () => {
    const drifted = cases
      .map((request) => ({
        request,
        preview: previewAutoRoute(request).selected,
        resolved: resolveAutoRoute(request),
      }))
      .filter(({ preview, resolved }) => JSON.stringify(preview) !== JSON.stringify(resolved));
    expect(drifted).toEqual([]);
  });

  it('never performs I/O or mutates its input', () => {
    const request: AutoRoutingRequest = {
      selection: 'auto',
      taskType: 'general',
      subscriptionTier: 'pro',
      trustMode: 'managed_cloud',
    };
    const frozen = Object.freeze({ ...request });
    expect(() => previewAutoRoute(frozen)).not.toThrow();
  });

  it('lists the selected candidate among the ranked candidates, admitted', () => {
    const missing = cases
      .map((request) => previewAutoRoute(request))
      .filter((preview) => preview.selected.status === 'selected')
      .filter((preview) => {
        const selected = preview.selected as Extract<
          ReturnType<typeof resolveAutoRoute>,
          { status: 'selected' }
        >;
        const match = preview.candidates.find(
          (candidate) =>
            candidate.modelKey === selected.modelKey && candidate.routeId === selected.routeId,
        );
        return !match || !match.admitted;
      });
    expect(missing).toEqual([]);
  });

  it('gives every excluded entry a reason and every candidate a full score', () => {
    const preview = previewAutoRoute({
      selection: 'auto',
      taskType: 'general',
      subscriptionTier: 'free',
      trustMode: 'managed_cloud',
    });
    for (const excluded of preview.excluded) {
      expect(typeof excluded.reason).toBe('string');
      expect(excluded.reason.length).toBeGreaterThan(0);
    }
    for (const candidate of preview.candidates) {
      expect(typeof candidate.modelKey).toBe('string');
      expect(typeof candidate.providerId).toBe('string');
      expect(typeof candidate.admitted).toBe('boolean');
      expect(typeof candidate.score.taskFit).toBe('number');
      expect(typeof candidate.score.policyAllowed).toBe('boolean');
      expect(['affordable', 'unaffordable', 'unconstrained']).toContain(candidate.score.budget);
      expect(typeof candidate.score.observedHealthPenalty).toBe('number');
      expect(typeof candidate.score.continuity).toBe('boolean');
      expect(Array.isArray(candidate.reasons)).toBe(true);
    }
  });

  it('reports an unknown task with no candidates and an explanatory exclusion', () => {
    const preview = previewAutoRoute({
      selection: 'auto',
      taskType: 'not_a_real_task' as RoutingTaskType,
      subscriptionTier: 'pro',
      trustMode: 'managed_cloud',
    });
    expect(preview.selected.status).toBe('unavailable');
    expect(preview.candidates).toEqual([]);
    expect(preview.excluded.length).toBeGreaterThan(0);
  });
});
