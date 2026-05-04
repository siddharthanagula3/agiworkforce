/**
 * Google Gemini model catalog.
 *
 * Hardcoded list of current generation flagship + fast models. The
 * `:listModels` endpoint can dynamically discover what the API key has
 * access to, but it's noisy (returns deprecated + internal SKUs); we keep
 * a curated default list and let the catalog endpoint optionally do
 * discovery.
 */

import type { ModelInfo } from '@agiworkforce/types';

export const GOOGLE_MODEL_CATALOG: readonly ModelInfo[] = [
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    provider: 'google',
    contextWindow: 2_000_000,
    maxOutputTokens: 64_000,
    capabilities: { streaming: true, tools: true, vision: true, thinking: true, json: true },
    inputCostPerMillion: 1.25,
    outputCostPerMillion: 5.0,
  },
  {
    id: 'gemini-3.1-flash',
    name: 'Gemini 3.1 Flash',
    provider: 'google',
    contextWindow: 1_000_000,
    maxOutputTokens: 32_000,
    capabilities: { streaming: true, tools: true, vision: true, thinking: true, json: true },
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.6,
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    provider: 'google',
    contextWindow: 1_000_000,
    maxOutputTokens: 8_192,
    capabilities: { streaming: true, tools: true, vision: true, thinking: false, json: true },
    inputCostPerMillion: 0.075,
    outputCostPerMillion: 0.3,
  },
];

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
    const url = `${baseUrl}/v1beta/models?key=${encodeURIComponent(params.apiKey)}`;
    res = await fetchFn(url, {
      method: 'GET',
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
