import { describe, expect, it } from 'vitest';
import {
  CHAT_MODEL_TYPES,
  getModelEffortOptions,
  getModelsForTierAndSurface,
  getPickerModels,
  getRoutingSlotModel,
  resolveModelEffort,
} from '@agiworkforce/types';
import {
  formatManagedTierLabel,
  getManagedEffortControlState,
  getManagedModelBadgeLabel,
  getManagedModelPickerOptions,
  getManagedOutboundEffort,
  isFreeManagedTier,
  reconcileManagedModelSelection,
} from '../src/features/cloud-bridge/managedModelPicker';

const admittedModel = getRoutingSlotModel('general_fast');

describe('managed model picker', () => {
  it('shows only Auto before authenticated admission is loaded', () => {
    expect(getManagedModelPickerOptions(null)).toEqual([{ value: 'auto', label: 'Best (auto)' }]);
  });

  it('intersects server admission with the bundled capability catalog', () => {
    const options = getManagedModelPickerOptions({
      subscriptionTier: 'pro',
      modelIds: [admittedModel, 'provider/future-model-not-in-this-build'],
      allowedAutoModes: ['auto-economy', 'auto-balanced'],
    });

    expect(options.map((option) => option.value)).toEqual(['auto', admittedModel]);
    expect(options[1]).toMatchObject({ provider: expect.any(String), label: expect.any(String) });
  });

  it('keeps every model the shared owner admits for this surface and plan', () => {
    const subscriptionTier = 'max';
    const modelIds = getModelsForTierAndSurface(subscriptionTier, 'chrome/managed-chat', {
      modelTypes: [...CHAT_MODEL_TYPES],
    }).map((model) => model.id);
    const options = getManagedModelPickerOptions({
      subscriptionTier,
      modelIds,
      allowedAutoModes: [],
    });

    expect(modelIds.length).toBeGreaterThan(0);
    expect(options.map((option) => option.value).slice(1)).toEqual(modelIds);
    for (const modelId of modelIds) {
      expect(
        reconcileManagedModelSelection(modelId, {
          subscriptionTier,
          modelIds,
          allowedAutoModes: [],
        }),
      ).toBe(modelId);
    }
  });

  it('resets stale manual and named Auto selections while preserving admitted choices', () => {
    const access = {
      subscriptionTier: 'pro',
      modelIds: [admittedModel],
      allowedAutoModes: ['auto-economy'],
    };

    expect(reconcileManagedModelSelection('auto', access)).toBe('auto');
    expect(reconcileManagedModelSelection(admittedModel, access)).toBe(admittedModel);
    expect(reconcileManagedModelSelection('auto-economy', access)).toBe('auto-economy');
    expect(reconcileManagedModelSelection('auto-premium', access)).toBe('auto');
    expect(reconcileManagedModelSelection('provider/removed', access)).toBe('auto');
    expect(reconcileManagedModelSelection(admittedModel, null)).toBe('auto');
  });

  it('derives labels and free-tier behavior without UI hardcoding', () => {
    expect(getManagedModelBadgeLabel(admittedModel)).not.toBe(admittedModel);
    expect(isFreeManagedTier('FREE')).toBe(true);
    expect(isFreeManagedTier('hobby')).toBe(false);
    expect(isFreeManagedTier('pro')).toBe(false);
    expect(formatManagedTierLabel('enterprise')).toBe('Enterprise plan');
  });

  it('keeps Auto effort explicitly unresolved until a concrete route exists', () => {
    expect(getManagedEffortControlState('auto', undefined, undefined)).toEqual({
      status: 'awaiting-route',
      options: [],
      description: 'Auto chooses reasoning effort after routing to a model.',
    });
  });

  it('derives the exact effort ladder and default from routed model metadata', () => {
    const model = getPickerModels().find((candidate) => getModelEffortOptions(candidate.id).length);
    expect(model).toBeDefined();
    const modelId = model!.id;
    const options = getModelEffortOptions(modelId);
    const state = getManagedEffortControlState('auto', modelId, 'not-supported');

    expect(state).toMatchObject({
      status: 'ready',
      modelId,
      options,
      effort: resolveModelEffort(modelId, 'not-supported'),
    });
  });

  it('omits latent effort for unresolved Auto and reconciles it after a concrete route', () => {
    const model = getPickerModels().find((candidate) => getModelEffortOptions(candidate.id).length);
    expect(model).toBeDefined();
    const modelId = model!.id;

    expect(getManagedOutboundEffort('auto', undefined, 'high')).toBeUndefined();
    expect(getManagedOutboundEffort('auto-economy', undefined, 'high')).toBeUndefined();
    expect(getManagedOutboundEffort('auto', modelId, 'not-supported')).toBe(
      resolveModelEffort(modelId, 'not-supported'),
    );
    expect(getManagedOutboundEffort(modelId, undefined, 'not-supported')).toBe(
      resolveModelEffort(modelId, 'not-supported'),
    );
  });
});
