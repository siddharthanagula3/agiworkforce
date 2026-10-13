import { describe, expect, it } from 'vitest';

import { modelRegistry } from '@agiworkforce/model-registry';
import { getRoutingSlotModel } from '@agiworkforce/types';

import {
  developerJurisdictionAllowed,
  modelDeveloperJurisdiction,
  resolveAutoRoute,
  type AutoRoutingRequest,
} from '../auto';
import { listPickerChatModels } from '../model-picker';
import type { RoutingTaskType } from '../types';

const US_ONLY = new Set(['US']);
const PAID_TIERS = ['basic', 'pro', 'max', 'max_15x', 'enterprise'] as const;
const TASKS: readonly RoutingTaskType[] = [
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

function webAuto(overrides: Partial<AutoRoutingRequest>): AutoRoutingRequest {
  return {
    selection: 'auto',
    taskType: 'general',
    subscriptionTier: 'pro',
    trustMode: 'managed_cloud',
    runtimeProfileId: 'web/cloud-chat',
    enableTaskFamilyStage: false,
    ...overrides,
  };
}

const nonUsModel = Object.keys(modelRegistry.models).find((modelKey) => {
  const jurisdiction = modelDeveloperJurisdiction(modelKey);
  return jurisdiction !== null && jurisdiction !== 'US';
});

describe('developer jurisdiction switch', () => {
  it('records a developer country for the everyday models', () => {
    expect(modelDeveloperJurisdiction(getRoutingSlotModel('workhorse_general'))).toBe('US');
    expect(nonUsModel).toBeDefined();
  });

  it('changes nothing while no jurisdictions are passed', () => {
    for (const subscriptionTier of PAID_TIERS) {
      for (const taskType of TASKS) {
        const request = webAuto({ subscriptionTier, taskType });
        expect(resolveAutoRoute({ ...request, allowedDeveloperJurisdictions: undefined })).toEqual(
          resolveAutoRoute(request),
        );
      }
    }
  });

  it('serves only US-developed models on every paid tier and task once US-only is on', () => {
    let checked = 0;
    for (const subscriptionTier of PAID_TIERS) {
      for (const taskType of TASKS) {
        const off = resolveAutoRoute(webAuto({ subscriptionTier, taskType }));
        const on = resolveAutoRoute(
          webAuto({ subscriptionTier, taskType, allowedDeveloperJurisdictions: US_ONLY }),
        );
        if (off.status === 'selected') {
          expect(on.status, `${subscriptionTier}/${taskType} lost its route`).toBe('selected');
        }
        if (on.status !== 'selected') continue;
        checked += 1;
        for (const modelKey of [on.modelKey, ...on.fallbacks.map((entry) => entry.modelKey)]) {
          expect(modelDeveloperJurisdiction(modelKey), `${subscriptionTier}/${taskType}`).toBe(
            'US',
          );
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('keeps a US-developed backup in the everyday chain', () => {
    const decision = resolveAutoRoute(
      webAuto({ subscriptionTier: 'basic', allowedDeveloperJurisdictions: US_ONLY }),
    );
    if (decision.status !== 'selected') throw new Error('expected a selected route');
    const substitutes = decision.fallbacks.filter((entry) => entry.modelKey !== decision.modelKey);
    expect(substitutes.length).toBeGreaterThan(0);
  });

  it('refuses a named non-US model as not available in the region', () => {
    const decision = resolveAutoRoute(
      webAuto({ selection: nonUsModel!, allowedDeveloperJurisdictions: US_ONLY }),
    );
    expect(decision).toMatchObject({
      status: 'unavailable',
      code: 'model_not_available_in_region',
    });
  });

  it('fails closed for a model with no recorded developer country', () => {
    expect(developerJurisdictionAllowed('not-a-model', US_ONLY)).toBe(false);
    expect(developerJurisdictionAllowed('not-a-model', null)).toBe(true);
  });

  it('keeps Free on its own model under US-only, because that model is US-developed', () => {
    for (const taskType of ['simple_chat', 'general', 'coding', 'reasoning'] as const) {
      const on = resolveAutoRoute(
        webAuto({ subscriptionTier: 'free', taskType, allowedDeveloperJurisdictions: US_ONLY }),
      );
      expect(on, taskType).toMatchObject({
        status: 'selected',
        modelKey: getRoutingSlotModel('free_workhorse'),
      });
      if (on.status === 'selected') expect(on.reason).not.toBe('jurisdiction_fallback');
    }
  });

  it('keeps Qwen first for reasoning and steps to the balanced OpenAI model under US-only', () => {
    for (const subscriptionTier of ['pro', 'max'] as const) {
      const off = resolveAutoRoute(webAuto({ subscriptionTier, taskType: 'reasoning' }));
      expect(off).toMatchObject({ modelKey: getRoutingSlotModel('reasoning_balanced') });
      const on = resolveAutoRoute(
        webAuto({
          subscriptionTier,
          taskType: 'reasoning',
          allowedDeveloperJurisdictions: US_ONLY,
        }),
      );
      expect(on).toMatchObject({ modelKey: getRoutingSlotModel('general_balanced') });
    }
  });

  it('hides non-US models from the picker once US-only is on', () => {
    const all = listPickerChatModels();
    const usOnly = listPickerChatModels(US_ONLY);
    expect(usOnly.length).toBeGreaterThan(0);
    expect(usOnly.length).toBeLessThan(all.length);
    for (const model of usOnly) expect(modelDeveloperJurisdiction(model.id)).toBe('US');
  });
});
