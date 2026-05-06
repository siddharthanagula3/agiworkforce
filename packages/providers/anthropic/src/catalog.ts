/**
 * Anthropic model catalog.
 *
 * The single source of truth for model data is
 * `packages/types/src/models.json`. This module derives the
 * `ANTHROPIC_MODEL_CATALOG` array at module load by filtering that JSON
 * by `provider === 'anthropic'`. Adding a new Anthropic model requires
 * editing models.json only — this file does NOT need updating.
 *
 * (The Anthropic API does not expose a `/v1/models` discovery endpoint,
 * so the JSON catalog is also the runtime fallback for `adapter.catalog()`.)
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

export const ANTHROPIC_MODEL_CATALOG: readonly ModelInfo[] = Object.values(catalog.models)
  .filter((m) => m.provider === 'anthropic')
  .map(toModelInfo);
