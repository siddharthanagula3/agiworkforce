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
