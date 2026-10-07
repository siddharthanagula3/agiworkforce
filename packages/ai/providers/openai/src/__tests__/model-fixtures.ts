import { getModelsForProvider, requireProviderDefaultModel } from '@agiworkforce/types';

export const OPENAI_DEFAULT_MODEL_ID = requireProviderDefaultModel('openai');

export const OPENAI_NON_TEXT_MODEL_IDS = getModelsForProvider('openai')
  .filter((model) => model.modelType !== 'chat' && model.modelType !== 'reasoning')
  .map((model) => model.id);

if (OPENAI_NON_TEXT_MODEL_IDS.length === 0) {
  throw new Error('The canonical OpenAI non-text fixtures must exist');
}

export const OPENAI_REASONING_MODEL_ID = getModelsForProvider('openai').find(
  (model) => model.modelType === 'reasoning',
)?.id;

if (!OPENAI_REASONING_MODEL_ID) {
  throw new Error('The canonical OpenAI reasoning-model fixture must exist');
}

const NO_REASONING_EFFORT = 'none';

const samplingRejectingModels = getModelsForProvider('openai').filter(
  (model) => model.reasoning?.rejectsSamplingParameters === true,
);

export const OPENAI_ALWAYS_REASONING_MODEL_ID = samplingRejectingModels.find(
  (model) => !model.reasoning?.supportedEfforts?.includes(NO_REASONING_EFFORT),
)?.id;

export const OPENAI_OPTIONAL_REASONING_MODEL_ID = samplingRejectingModels.find((model) =>
  model.reasoning?.supportedEfforts?.includes(NO_REASONING_EFFORT),
)?.id;

export const OPENAI_SAMPLING_ACCEPTING_MODEL_ID = getModelsForProvider('openai').find(
  (model) => model.modelType === 'reasoning' && model.reasoning?.rejectsSamplingParameters !== true,
)?.id;

if (
  !OPENAI_ALWAYS_REASONING_MODEL_ID ||
  !OPENAI_OPTIONAL_REASONING_MODEL_ID ||
  !OPENAI_SAMPLING_ACCEPTING_MODEL_ID
) {
  throw new Error('The canonical OpenAI sampling-parameter fixtures must exist');
}
