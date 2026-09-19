import { describe, expect, it } from 'vitest';
import { getAutoRoutingProfiles, getModelsForTierAndSurface } from '@agiworkforce/types';
import { getScheduleModelOptions, normalizeEligibleScheduleModel } from './schedule-models';

const MODEL_TYPES = ['chat', 'code', 'reasoning', 'multimodal'] as const;

describe('schedule model eligibility', () => {
  it.each(['free', 'basic', 'pro', 'max', 'enterprise'])(
    'derives %s options from canonical managed routing and plan access',
    (tier) => {
      expect(getScheduleModelOptions(tier)).toEqual([
        ...getAutoRoutingProfiles().map((profile) => ({
          value: profile.id,
          label: profile.label,
        })),
        ...getModelsForTierAndSurface(tier, 'web/cloud-chat', {
          modelTypes: [...MODEL_TYPES],
        }).map((model) => ({ value: model.id, label: model.name })),
      ]);
    },
  );

  it('keeps an ineligible stored selection readable without making it selectable again', () => {
    const maxOnly = getModelsForTierAndSurface('max', 'web/cloud-chat', {
      modelTypes: [...MODEL_TYPES],
    }).find(
      (candidate) =>
        !getModelsForTierAndSurface('free', 'web/cloud-chat', {
          modelTypes: [...MODEL_TYPES],
        }).some((freeModel) => freeModel.id === candidate.id),
    );
    expect(maxOnly).toBeDefined();

    expect(getScheduleModelOptions('free', maxOnly!.id)).toContainEqual({
      value: maxOnly!.id,
      label: `${maxOnly!.name} (unavailable on current plan)`,
      disabled: true,
    });
    expect(normalizeEligibleScheduleModel(maxOnly!.id, 'free')).toBeNull();
    expect(normalizeEligibleScheduleModel(maxOnly!.id, 'max')).toBe(maxOnly!.id);
  });
});
