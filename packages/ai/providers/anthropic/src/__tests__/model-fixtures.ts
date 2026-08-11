import { getModelsForProvider, requireProviderDefaultModel } from '@agiworkforce/types';

export const ANTHROPIC_DEFAULT_MODEL_ID = requireProviderDefaultModel('anthropic');

const premiumModel = getModelsForProvider('anthropic').find(
  (model) =>
    model.reasoning?.thinkingDefault === 'adaptive' &&
    model.reasoning.rejectsSamplingParameters === true,
);

if (!premiumModel) {
  throw new Error('The canonical Anthropic premium reasoning fixture must exist');
}

export const ANTHROPIC_PREMIUM_MODEL_ID = premiumModel.id;
