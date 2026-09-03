import { getModelsForProvider } from '@agiworkforce/types';

const anthropicPremiumModel = getModelsForProvider('anthropic').find(
  (model) =>
    model.reasoning?.thinkingDefault === 'adaptive' &&
    model.reasoning.rejectsSamplingParameters === true,
);

if (!anthropicPremiumModel) {
  throw new Error('The canonical Anthropic premium reasoning fixture must exist');
}

export const VERCEL_GATEWAY_ANTHROPIC_MODEL = `anthropic/${anthropicPremiumModel.id}`;
