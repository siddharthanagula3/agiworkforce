import { describe, expect, it } from 'vitest';
import { getProviderOfferings } from '@agiworkforce/types';
import { AVAILABLE_MODELS } from '@shared/stores/model-store';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { freeQuotaSelection } from './free-quota-selection';
import { regenerateModelOptions } from './regenerate-model-options';

const freeModel = AVAILABLE_MODELS.find((model) => FREE_TRIAL_MODELS.includes(model.id));
const paidModel = AVAILABLE_MODELS.find(
  (model) => !FREE_TRIAL_MODELS.includes(model.id) && !freeQuotaSelection(model.id),
);
const freeChatOffering = Object.entries(getProviderOfferings()).find(
  ([id]) => freeQuotaSelection(id)?.category === 'chat',
);
const freeMediaOffering = Object.entries(getProviderOfferings()).find(
  ([id]) => freeQuotaSelection(id)?.category === 'image' || freeQuotaSelection(id)?.category === 'video',
);

describe('regeneration model options', () => {
  it('does not offer paid chat models to Free accounts', () => {
    expect(freeModel).toBeDefined();
    expect(paidModel).toBeDefined();
    const options = regenerateModelOptions([freeModel!, paidModel!], true);

    expect(options).toEqual([{ id: freeModel!.id, name: freeModel!.name }]);
  });

  it('preserves paid account choices', () => {
    expect(freeModel).toBeDefined();
    expect(paidModel).toBeDefined();
    const options = regenerateModelOptions([freeModel!, paidModel!], false);

    expect(options).toEqual([
      { id: freeModel!.id, name: freeModel!.name },
      { id: paidModel!.id, name: paidModel!.name },
    ]);
  });

  it('accepts free-quota chat offerings but never media offerings or retired ids', () => {
    expect(freeChatOffering).toBeDefined();
    expect(freeMediaOffering).toBeDefined();
    const options = regenerateModelOptions(
      [
        { id: freeChatOffering![0], name: freeChatOffering![1].displayName },
        { id: freeMediaOffering![0], name: freeMediaOffering![1].displayName },
        { id: 'fixture-retired-model', name: 'Retired model' },
      ],
      true,
    );

    expect(options).toEqual([
      { id: freeChatOffering![0], name: freeChatOffering![1].displayName },
    ]);
  });
});
