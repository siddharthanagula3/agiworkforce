/**
 * OpenAI model catalog.
 *
 * The single source of truth for model data is
 * `packages/types/src/models.json`. This module derives the
 * `OPENAI_MODEL_CATALOG` array at module load by filtering that JSON by
 * `provider === 'openai'`. Adding a new OpenAI model requires editing
 * models.json only — this file does NOT need updating.
 *
 * The OpenAI API does expose `/v1/models`, but it's noisy and includes
 * deprecated/internal SKUs. The discovery flow in `index.ts` merges the
 * live list with this curated catalog (taking the curated entries as
 * authoritative for capabilities/cost).
 */

import { modelsCatalogJson, type ModelInfo, type ModelMetadata } from '@agiworkforce/types';

interface ModelsCatalogShape {
  models: Record<string, ModelMetadata>;
}

function toModelInfo(meta: ModelMetadata): ModelInfo {
  return {
    id: meta.id,
    ...(meta.name !== undefined ? { name: meta.name } : {}),
    provider: meta.provider,
    ...(meta.contextWindow !== undefined ? { contextWindow: meta.contextWindow } : {}),
    ...(meta.maxOutputTokens !== undefined ? { maxOutputTokens: meta.maxOutputTokens } : {}),
    ...(meta.capabilities ? { capabilities: meta.capabilities } : {}),
    ...(meta.inputCost !== undefined ? { inputCostPerMillion: meta.inputCost } : {}),
    ...(meta.outputCost !== undefined ? { outputCostPerMillion: meta.outputCost } : {}),
  };
}

const catalog = modelsCatalogJson as unknown as ModelsCatalogShape;

export const OPENAI_MODEL_CATALOG: readonly ModelInfo[] = Object.values(catalog.models)
  .filter((m) => m.provider === 'openai')
  .map(toModelInfo);
