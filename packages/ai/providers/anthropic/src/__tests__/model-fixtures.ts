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

const betweenToolsModel = getModelsForProvider('anthropic').find(
  (model) => model.reasoning?.disabledThinkingType === 'between_tools',
);

if (!betweenToolsModel) {
  throw new Error('An Anthropic model that turns thinking off with between_tools must exist');
}

export const ANTHROPIC_BETWEEN_TOOLS_MODEL_ID = betweenToolsModel.id;

const disabledThinkingCeilingModel = getModelsForProvider('anthropic').find(
  (model) =>
    model.reasoning?.maxEffortWhenThinkingDisabled !== undefined &&
    model.reasoning.disabledThinkingType === undefined,
);

if (!disabledThinkingCeilingModel) {
  throw new Error('An Anthropic model that caps effort while thinking is disabled must exist');
}

export const ANTHROPIC_DISABLED_THINKING_CEILING_MODEL_ID = disabledThinkingCeilingModel.id;
