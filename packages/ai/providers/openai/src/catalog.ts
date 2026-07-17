/**
 * OpenAI model catalog.
 *
 * Canonical membership, metadata, and ordering come from
 * `@agiworkforce/model-registry`; `@agiworkforce/types` projects that data
 * into the provider-adapter catalog shape.
 *
 * The OpenAI API does expose `/v1/models`, but it's noisy and includes
 * deprecated/internal SKUs. The discovery flow in `index.ts` merges the
 * live list with this curated catalog (taking the curated entries as
 * authoritative for capabilities/cost).
 */

import { getProviderModelCatalog, type ModelInfo } from '@agiworkforce/types';

export const OPENAI_MODEL_CATALOG: readonly ModelInfo[] = getProviderModelCatalog('openai');
