/**
 * OpenRouter model catalog.
 *
 * Source of truth: `packages/types/src/models.json`. Filtered by
 * `provider === 'open_router'` (the canonical `Provider` union value —
 * `models.json` aliases both `open_router` and `openrouter`).
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

export const OPENROUTER_MODEL_CATALOG: readonly ModelInfo[] = Object.values(catalog.models)
  .filter((m) => m.provider === 'open_router')
  .map(toModelInfo);
