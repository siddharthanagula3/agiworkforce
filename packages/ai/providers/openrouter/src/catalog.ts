/**
 * OpenRouter model catalog.
 *
 * Source of truth: `@agiworkforce/model-registry`, projected through the
 * shared provider-catalog adapter using the canonical `open_router` provider.
 */

import { getProviderModelCatalog, type ModelInfo } from '@agiworkforce/types';

export const OPENROUTER_MODEL_CATALOG: readonly ModelInfo[] =
  getProviderModelCatalog('open_router');
