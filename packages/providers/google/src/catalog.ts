/**
 * Google Gemini model catalog.
 *
 * The single source of truth for model data is
 * `packages/types/src/models.json`. This module derives the
 * `GOOGLE_MODEL_CATALOG` array at module load by filtering that JSON by
 * `provider === 'google'`. Adding a new Gemini model requires editing
 * models.json only — this file does NOT need updating.
 *
 * The `:listModels` endpoint can dynamically discover what the API key
 * has access to, but it's noisy (returns deprecated + internal SKUs);
 * `fetchGoogleCatalog` below merges the live list with this curated
 * default (curated entries take precedence for capabilities/cost).
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

export const GOOGLE_MODEL_CATALOG: readonly ModelInfo[] = Object.values(catalog.models)
  .filter((m) => m.provider === 'google')
  .map(toModelInfo);

interface ListModelsResponse {
  models?: Array<{
    name?: string;
    displayName?: string;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
    supportedGenerationMethods?: string[];
  }>;
}

/**
 * Optional dynamic discovery via `:listModels`. Returns the curated
 * catalog merged with any `gemini-*` ids reachable from the API key. On
 * any error, falls back to the curated list.
 */
export async function fetchGoogleCatalog(params: {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}): Promise<ModelInfo[]> {
  const baseUrl = (params.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(
    /\/+$/,
    '',
  );
  const fetchFn = params.fetch ?? fetch;
  let res: Response;
  try {
    // Header auth: never put the API key in the URL query string (keys
    // leak via access logs / browser history / proxies, even over HTTPS).
    const url = `${baseUrl}/v1beta/models`;
    res = await fetchFn(url, {
      method: 'GET',
      headers: { 'x-goog-api-key': params.apiKey },
      ...(params.signal ? { signal: params.signal } : {}),
    });
  } catch {
    return [...GOOGLE_MODEL_CATALOG];
  }
  if (!res.ok) {
    return [...GOOGLE_MODEL_CATALOG];
  }
  const json = (await res.json()) as ListModelsResponse;
  const known = new Set(GOOGLE_MODEL_CATALOG.map((m) => m.id));
  const out: ModelInfo[] = [...GOOGLE_MODEL_CATALOG];
  for (const m of json.models ?? []) {
    if (!m.name) continue;
    const id = m.name.replace(/^models\//, '');
    if (!id.startsWith('gemini-')) continue;
    if (known.has(id)) continue;
    if (m.supportedGenerationMethods && !m.supportedGenerationMethods.includes('generateContent')) {
      continue;
    }
    out.push({
      id,
      ...(m.displayName ? { name: m.displayName } : {}),
      provider: 'google',
      ...(m.inputTokenLimit !== undefined ? { contextWindow: m.inputTokenLimit } : {}),
      ...(m.outputTokenLimit !== undefined ? { maxOutputTokens: m.outputTokenLimit } : {}),
      capabilities: { streaming: true, tools: true, vision: true, json: true },
    });
  }
  return out;
}
