import {
  getAllowedModelsForTier,
  getDefaultModelFor,
  getModelMetadataById,
} from '@agiworkforce/types';

export const FREE_TRIAL_MODEL = getDefaultModelFor('free', 'chat');

export const FREE_TRIAL_MODELS: readonly string[] = getAllowedModelsForTier('economy').filter(
  (modelId) => getModelMetadataById(modelId)?.tierPolicy?.minTier === 'free',
);
