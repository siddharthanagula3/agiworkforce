/**
 * ZhipuAI (GLM / BigModel) model catalog.
 *
 * Source of truth: `@agiworkforce/model-registry`, projected through the
 * shared provider-catalog adapter in `@agiworkforce/types`.
 */

import { getProviderModelCatalog, type ModelInfo } from '@agiworkforce/types';

export const ZHIPU_MODEL_CATALOG: readonly ModelInfo[] = getProviderModelCatalog('zhipu');
